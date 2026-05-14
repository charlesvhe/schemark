import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";
import {
  compilePatterns,
  configToEffective,
  EffectiveConfig,
  FileRule,
  findConfigInDir,
  inheritFromParent,
  loadConfigFromFile,
  type DirectoryRule,
  type SchemarkConfig,
} from "./loader.js";
import { compileSchema, formatAjvErrors, validateSchemarkConfig } from "./validator.js";
import { convertCaptureValue, ConversionError } from "./converter.js";

export interface ResolveError {
  path: string;
  type:
    | "config-invalid"
    | "config-error"
    | "unmatched-directory"
    | "unmatched-file"
    | "ambiguous-match"
    | "missing-required-capture"
    | "missing-required-frontmatter"
    | "frontmatter-validation"
    | "conversion"
    | "namespace-conflict";
  message: string;
}

export interface ResolvedFile {
  path: string;
  meta: Record<string, unknown>;
  frontmatter: Record<string, unknown>;
}

export interface ResolveResult {
  files: ResolvedFile[];
  errors: ResolveError[];
}

interface MatchedDirectory {
  typeKey: string;
  rule: DirectoryRule;
  captures: Record<string, string>;
}

interface MatchedFile {
  typeKey: string;
  rule: FileRule;
  captures: Record<string, string>;
}

interface DirContext {
  effective: EffectiveConfig;
  accumulatedMeta: Record<string, unknown>;
  parentMatch: MatchedDirectory | undefined;
}

export function resolveDirectoryTree(rootDir: string): ResolveResult {
  const result: ResolveResult = { files: [], errors: [] };

  const rootConfigPath = findConfigInDir(rootDir);
  if (!rootConfigPath) {
    result.errors.push({
      path: rootDir,
      type: "config-error",
      message: "根目录缺少 schemark.json",
    });
    return result;
  }

  const rootEffective = loadAndValidateConfig(rootConfigPath, result.errors);
  if (!rootEffective) return result;

  walk(
    rootDir,
    rootDir,
    {
      effective: rootEffective,
      accumulatedMeta: {},
      parentMatch: undefined,
    },
    result,
  );

  return result;
}

function loadAndValidateConfig(
  configPath: string,
  errors: ResolveError[],
): EffectiveConfig | undefined {
  let config: SchemarkConfig;
  try {
    config = loadConfigFromFile(configPath);
  } catch (e) {
    errors.push({ path: configPath, type: "config-error", message: (e as Error).message });
    return undefined;
  }
  const schemaIssues = validateSchemarkConfig(config);
  if (schemaIssues.length > 0) {
    for (const issue of schemaIssues) {
      errors.push({
        path: configPath,
        type: "config-invalid",
        message: `${issue.path}: ${issue.message}`,
      });
    }
    return undefined;
  }
  try {
    compilePatterns(config, configPath);
  } catch (e) {
    errors.push({ path: configPath, type: "config-error", message: (e as Error).message });
    return undefined;
  }
  return configToEffective(config, configPath);
}

function walk(rootDir: string, dir: string, ctx: DirContext, result: ResolveResult): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (e) {
    result.errors.push({
      path: relative(rootDir, dir) || ".",
      type: "config-error",
      message: `读取目录失败: ${(e as Error).message}`,
    });
    return;
  }

  for (const entry of entries) {
    if (entry === "schemark.json") continue;
    const full = join(dir, entry);
    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      handleDirectory(rootDir, full, entry, ctx, result);
    } else if (s.isFile()) {
      handleFile(rootDir, full, entry, ctx, result);
    }
  }
}

function handleDirectory(
  rootDir: string,
  fullPath: string,
  name: string,
  ctx: DirContext,
  result: ResolveResult,
): void {
  const rel = relative(rootDir, fullPath);
  const matches = matchRules(name, ctx.effective.directories);

  if (matches.length === 0) {
    if (ctx.effective.strict) {
      result.errors.push({
        path: rel,
        type: "unmatched-directory",
        message: `目录名 "${name}" 未匹配任何 directories.pattern`,
      });
    }
    return;
  }
  if (matches.length > 1) {
    result.errors.push({
      path: rel,
      type: "ambiguous-match",
      message: `目录名 "${name}" 同时匹配多条规则: ${matches.map((m) => m.typeKey).join(", ")}`,
    });
    return;
  }

  const matched = matches[0]!;
  const dirRule = matched.rule as DirectoryRule;

  let metaForThisDir: Record<string, unknown>;
  try {
    metaForThisDir = buildMetaFromCaptures(
      matched.captures,
      dirRule.meta,
      matched.typeKey,
      false,
      rel,
    );
  } catch (e) {
    pushDeriveError(e, rel, result);
    return;
  }

  const merged = mergeMeta(ctx.accumulatedMeta, metaForThisDir, rel, result);
  if (!merged) return;

  const childConfigPath = findConfigInDir(fullPath);
  let childEffective: EffectiveConfig;
  if (childConfigPath) {
    const loaded = loadAndValidateConfig(childConfigPath, result.errors);
    if (!loaded) return;
    childEffective = loaded;
  } else {
    childEffective = inheritFromParent(dirRule, rel);
  }

  walk(
    rootDir,
    fullPath,
    {
      effective: childEffective,
      accumulatedMeta: merged,
      parentMatch: matched,
    },
    result,
  );
}

function handleFile(
  rootDir: string,
  fullPath: string,
  name: string,
  ctx: DirContext,
  result: ResolveResult,
): void {
  if (!name.endsWith(".md")) return;
  const rel = relative(rootDir, fullPath);
  const matches = matchRules(name, ctx.effective.files);

  if (matches.length === 0) {
    if (ctx.effective.strict) {
      result.errors.push({
        path: rel,
        type: "unmatched-file",
        message: `文件名 "${name}" 未匹配任何 files.pattern`,
      });
    }
    return;
  }
  if (matches.length > 1) {
    result.errors.push({
      path: rel,
      type: "ambiguous-match",
      message: `文件名 "${name}" 同时匹配多条规则: ${matches.map((m) => m.typeKey).join(", ")}`,
    });
    return;
  }

  const matched = matches[0]!;
  const fileRule = matched.rule as FileRule;

  let fileMeta: Record<string, unknown>;
  try {
    fileMeta = buildMetaFromCaptures(matched.captures, fileRule.meta, matched.typeKey, true, rel);
  } catch (e) {
    pushDeriveError(e, rel, result);
    return;
  }

  const meta = mergeMeta(ctx.accumulatedMeta, fileMeta, rel, result);
  if (!meta) return;

  const fm = extractFrontmatter(fullPath, fileRule, rel, result);
  if (fm === undefined) return;

  result.files.push({ path: rel, meta, frontmatter: fm });
}

function matchRules<R extends { pattern: string }>(
  name: string,
  rules: Record<string, R>,
): Array<{ typeKey: string; rule: R; captures: Record<string, string> }> {
  const out: Array<{ typeKey: string; rule: R; captures: Record<string, string> }> = [];
  for (const [typeKey, rule] of Object.entries(rules)) {
    const re = new RegExp(rule.pattern);
    const m = re.exec(name);
    if (m) {
      out.push({ typeKey, rule, captures: m.groups ?? {} });
    }
  }
  return out;
}

function buildMetaFromCaptures(
  captures: Record<string, string>,
  spec: { namespace?: string; fields?: Record<string, unknown>; required?: string[] } | undefined,
  typeKey: string,
  isFile: boolean,
  pathForError: string,
): Record<string, unknown> {
  const namespace = spec?.namespace;
  const fields = (spec?.fields ?? {}) as Record<string, { type?: string; format?: string }>;
  const required = spec?.required ?? [];

  for (const r of required) {
    const v = captures[r];
    if (v === undefined || v === "") {
      throw new MissingRequiredCaptureError(r, pathForError);
    }
  }

  const inner: Record<string, unknown> = {};
  if (isFile) {
    inner.type = typeKey;
  }
  for (const [field, def] of Object.entries(fields)) {
    if (field === "type") continue;
    const raw = captures[field];
    if (raw === undefined) continue;
    inner[field] = convertCaptureValue(field, raw, def);
  }
  for (const [field, raw] of Object.entries(captures)) {
    if (field in inner) continue;
    if (field === "type") continue;
    inner[field] = raw;
  }

  if (namespace) {
    return { [namespace]: inner };
  }
  if (isFile) {
    return { file: inner };
  }
  return inner;
}

class MissingRequiredCaptureError extends Error {
  constructor(public field: string, public pathForError: string) {
    super(`必填捕获组 "${field}" 缺失或为空`);
    this.name = "MissingRequiredCaptureError";
  }
}

function pushDeriveError(e: unknown, rel: string, result: ResolveResult): void {
  if (e instanceof MissingRequiredCaptureError) {
    result.errors.push({
      path: rel,
      type: "missing-required-capture",
      message: e.message,
    });
    return;
  }
  if (e instanceof ConversionError) {
    result.errors.push({ path: rel, type: "conversion", message: `${e.field}: ${e.message}` });
    return;
  }
  result.errors.push({ path: rel, type: "conversion", message: (e as Error).message });
}

function mergeMeta(
  base: Record<string, unknown>,
  addition: Record<string, unknown>,
  pathForError: string,
  result: ResolveResult,
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(addition)) {
    if (k in out) {
      const existing = out[k];
      if (
        isPlainObject(existing) &&
        isPlainObject(v) &&
        !hasKeyConflict(existing as Record<string, unknown>, v as Record<string, unknown>)
      ) {
        out[k] = { ...(existing as object), ...(v as object) };
        continue;
      }
      result.errors.push({
        path: pathForError,
        type: "namespace-conflict",
        message: `meta 键 "${k}" 冲突，无法合并`,
      });
      return undefined;
    }
    out[k] = v;
  }
  return out;
}

function isPlainObject(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasKeyConflict(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  for (const k of Object.keys(b)) {
    if (k in a) return true;
  }
  return false;
}

function extractFrontmatter(
  fullPath: string,
  rule: FileRule,
  rel: string,
  result: ResolveResult,
): Record<string, unknown> | undefined {
  const fmSpec = rule.frontmatter;
  if (!fmSpec) return {};

  let parsedData: Record<string, unknown> = {};
  try {
    const raw = readFileSync(fullPath, "utf8");
    const parsed = matter(raw, {
      engines: {
        yaml: (s: string) => yaml.load(s, { schema: yaml.JSON_SCHEMA }) as object,
      },
    });
    parsedData = (parsed.data ?? {}) as Record<string, unknown>;
  } catch (e) {
    result.errors.push({
      path: rel,
      type: "frontmatter-validation",
      message: `读取/解析 frontmatter 失败: ${(e as Error).message}`,
    });
    return undefined;
  }

  let hasError = false;

  const requiredList = fmSpec.required ?? [];
  for (const reqField of requiredList) {
    const v = parsedData[reqField];
    if (v === undefined || v === null || v === "") {
      result.errors.push({
        path: rel,
        type: "missing-required-frontmatter",
        message: `missing required frontmatter field: ${reqField}`,
      });
      hasError = true;
    }
  }

  const fields = fmSpec.fields ?? {};
  const extracted: Record<string, unknown> = {};
  for (const [k, schema] of Object.entries(fields)) {
    if (!(k in parsedData)) continue;
    extracted[k] = parsedData[k];
    try {
      const validate = compileSchema(schema);
      const ok = validate(parsedData[k]);
      if (!ok) {
        const issues = formatAjvErrors(validate.errors);
        for (const issue of issues) {
          result.errors.push({
            path: rel,
            type: "frontmatter-validation",
            message: `${k}${issue.path}: ${issue.message}`,
          });
        }
        hasError = true;
      }
    } catch (e) {
      result.errors.push({
        path: rel,
        type: "frontmatter-validation",
        message: `${k}: schema 编译失败 ${(e as Error).message}`,
      });
      hasError = true;
    }
  }

  if (hasError) return undefined;
  return extracted;
}
