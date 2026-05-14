import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";
import {
  configToEffective,
  EffectiveConfig,
  FileRule,
  findConfigInDir,
  getMetaFieldEntries,
  inheritFromParent,
  loadConfigFromFile,
  validateConfigInvariants,
  type DirectoryRule,
  type MetaFieldObject,
  type MetaFieldValue,
  type SchemarkConfig,
} from "./loader.js";
import { compileSchema, formatAjvErrors, validateSchema, validateSchemarkConfig } from "./validator.js";
import { convertCaptureValue, ConversionError } from "./converter.js";
import { renderTemplate, TemplateError } from "./template.js";

export interface ResolveError {
  path: string;
  type:
    | "config-invalid"
    | "config-error"
    | "unmatched-directory"
    | "unmatched-file"
    | "ambiguous-match"
    | "duplicate-typekey"
    | "missing-required-rule"
    | "missing-required-frontmatter"
    | "frontmatter-validation"
    | "conversion"
    | "template-undefined-capture"
    | "template-syntax"
    | "meta-validation";
  message: string;
}

export interface ResolvedFile {
  path: string;
  frontmatter: Record<string, unknown>;
  [typeKeyOrReserved: string]: unknown;
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
  accumulatedGroups: Record<string, Record<string, unknown>>;
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
      accumulatedGroups: {},
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
    validateConfigInvariants(config, configPath);
  } catch (e) {
    const msg = (e as Error).message;
    const type: ResolveError["type"] = msg.includes("typeKey") ? "duplicate-typekey" : "config-error";
    errors.push({ path: configPath, type, message: msg });
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

  const matchedDirTypeKeys = new Set<string>();
  const matchedFileTypeKeys = new Set<string>();

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
      const matchedKey = handleDirectory(rootDir, full, entry, ctx, result);
      if (matchedKey) matchedDirTypeKeys.add(matchedKey);
    } else if (s.isFile()) {
      const matchedKey = handleFile(rootDir, full, entry, ctx, result);
      if (matchedKey) matchedFileTypeKeys.add(matchedKey);
    }
  }

  enforceRequiredRules(rootDir, dir, ctx, matchedDirTypeKeys, matchedFileTypeKeys, result);
}

function enforceRequiredRules(
  rootDir: string,
  dir: string,
  ctx: DirContext,
  matchedDirTypeKeys: Set<string>,
  matchedFileTypeKeys: Set<string>,
  result: ResolveResult,
): void {
  const rel = relative(rootDir, dir) || ".";
  for (const [typeKey, rule] of Object.entries(ctx.effective.directories)) {
    if (rule.required === true && !matchedDirTypeKeys.has(typeKey)) {
      result.errors.push({
        path: rel,
        type: "missing-required-rule",
        message: `directories.${typeKey} 标记 required: true,但 ${rel} 下没有任何匹配项`,
      });
    }
  }
  for (const [typeKey, rule] of Object.entries(ctx.effective.files)) {
    if (rule.required === true && !matchedFileTypeKeys.has(typeKey)) {
      result.errors.push({
        path: rel,
        type: "missing-required-rule",
        message: `files.${typeKey} 标记 required: true,但 ${rel} 下没有任何匹配项`,
      });
    }
  }
}

function handleDirectory(
  rootDir: string,
  fullPath: string,
  name: string,
  ctx: DirContext,
  result: ResolveResult,
): string | undefined {
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
    return undefined;
  }
  if (matches.length > 1) {
    result.errors.push({
      path: rel,
      type: "ambiguous-match",
      message: `目录名 "${name}" 同时匹配多条规则: ${matches.map((m) => m.typeKey).join(", ")}`,
    });
    return undefined;
  }

  const matched = matches[0]!;
  const dirRule = matched.rule as DirectoryRule;

  let metaForThisDir: Record<string, unknown> | undefined;
  try {
    metaForThisDir = deriveMetaFields(dirRule, true, matched.captures, rel);
  } catch (e) {
    pushDeriveError(e, rel, result);
    return matched.typeKey;
  }

  if (matched.typeKey in ctx.accumulatedGroups) {
    result.errors.push({
      path: rel,
      type: "duplicate-typekey",
      message: `运行时 typeKey 冲突: "${matched.typeKey}" 在解析路径上重复`,
    });
    return matched.typeKey;
  }
  const nextGroups: Record<string, Record<string, unknown>> = {
    ...ctx.accumulatedGroups,
    [matched.typeKey]: metaForThisDir,
  };

  const childConfigPath = findConfigInDir(fullPath);
  let childEffective: EffectiveConfig;
  if (childConfigPath) {
    const loaded = loadAndValidateConfig(childConfigPath, result.errors);
    if (!loaded) return matched.typeKey;
    childEffective = loaded;
  } else {
    childEffective = inheritFromParent(dirRule, rel);
  }

  walk(
    rootDir,
    fullPath,
    {
      effective: childEffective,
      accumulatedGroups: nextGroups,
      parentMatch: matched,
    },
    result,
  );
  return matched.typeKey;
}

function handleFile(
  rootDir: string,
  fullPath: string,
  name: string,
  ctx: DirContext,
  result: ResolveResult,
): string | undefined {
  if (!name.endsWith(".md")) return undefined;
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
    return undefined;
  }
  if (matches.length > 1) {
    result.errors.push({
      path: rel,
      type: "ambiguous-match",
      message: `文件名 "${name}" 同时匹配多条规则: ${matches.map((m) => m.typeKey).join(", ")}`,
    });
    return undefined;
  }

  const matched = matches[0]!;
  const fileRule = matched.rule as FileRule;

  let fileMeta: Record<string, unknown>;
  try {
    fileMeta = deriveMetaFields(fileRule, false, matched.captures, rel);
  } catch (e) {
    pushDeriveError(e, rel, result);
    return matched.typeKey;
  }

  if (matched.typeKey in ctx.accumulatedGroups) {
    result.errors.push({
      path: rel,
      type: "duplicate-typekey",
      message: `运行时 typeKey 冲突: "${matched.typeKey}" 在解析路径上重复`,
    });
    return matched.typeKey;
  }

  const fm = extractFrontmatter(fullPath, fileRule, rel, result);
  if (fm === undefined) return matched.typeKey;

  const out: ResolvedFile = { path: rel, frontmatter: fm };
  for (const [k, v] of Object.entries(ctx.accumulatedGroups)) {
    out[k] = v;
  }
  out[matched.typeKey] = fileMeta;
  result.files.push(out);
  return matched.typeKey;
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

function deriveMetaFields(
  rule: DirectoryRule | FileRule,
  isDir: boolean,
  captures: Record<string, string>,
  pathForError: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, value] of getMetaFieldEntries(rule, isDir)) {
    out[field] = computeMetaField(field, value, captures, pathForError);
  }
  return out;
}

function computeMetaField(
  field: string,
  value: MetaFieldValue,
  captures: Record<string, string>,
  pathForError: string,
): unknown {
  if (typeof value === "string") {
    return renderTemplate(field, value, captures);
  }
  const obj = value as MetaFieldObject;
  const { value: tpl, ...schemaPart } = obj;
  const rendered = renderTemplate(field, tpl, captures);
  const converted = convertCaptureValue(field, rendered, schemaPart);
  const issues = validateSchema(schemaPart, converted);
  if (issues.length > 0) {
    throw new MetaValidationError(field, issues.map((i) => i.message).join("; "));
  }
  return converted;
}

class MetaValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = "MetaValidationError";
  }
}

function pushDeriveError(e: unknown, rel: string, result: ResolveResult): void {
  if (e instanceof TemplateError) {
    const type: ResolveError["type"] =
      e.reason === "undefined-capture" ? "template-undefined-capture" : "template-syntax";
    result.errors.push({ path: rel, type, message: `${e.field}: ${e.message}` });
    return;
  }
  if (e instanceof ConversionError) {
    result.errors.push({ path: rel, type: "conversion", message: `${e.field}: ${e.message}` });
    return;
  }
  if (e instanceof MetaValidationError) {
    result.errors.push({ path: rel, type: "meta-validation", message: `${e.field}: ${e.message}` });
    return;
  }
  result.errors.push({ path: rel, type: "conversion", message: (e as Error).message });
}

function extractFrontmatter(
  fullPath: string,
  rule: FileRule,
  rel: string,
  result: ResolveResult,
): Record<string, unknown> | undefined {
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

  const fmSpec = rule.frontmatter;
  if (!fmSpec) return parsedData;

  const fullSchema: Record<string, unknown> = { type: "object", ...fmSpec };
  try {
    const validate = compileSchema(fullSchema);
    const ok = validate(parsedData);
    if (!ok) {
      const issues = formatAjvErrors(validate.errors);
      let hasMissing = false;
      for (const issue of issues) {
        const isRequired = issue.message.includes("must have required property");
        result.errors.push({
          path: rel,
          type: isRequired ? "missing-required-frontmatter" : "frontmatter-validation",
          message: `${issue.path}: ${issue.message}`,
        });
        if (isRequired) hasMissing = true;
      }
      if (hasMissing && issues.length === issues.filter((i) => i.message.includes("must have required property")).length) {
        return undefined;
      }
      return undefined;
    }
  } catch (e) {
    result.errors.push({
      path: rel,
      type: "frontmatter-validation",
      message: `frontmatter schema 编译失败: ${(e as Error).message}`,
    });
    return undefined;
  }

  return parsedData;
}
