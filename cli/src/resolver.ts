import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";
import {
  configToEffective,
  EffectiveConfig,
  FileRule,
  findConfigInDir,
  findConfigUpwards,
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
    | "missing-required-section"
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

export interface ResolveSubtreeOptions {
  maxUpwards?: number;
}

export function resolveSubtree(
  targetDir: string,
  options: ResolveSubtreeOptions = {},
): ResolveResult {
  const result: ResolveResult = { files: [], errors: [] };
  const target = resolve(targetDir);
  const maxUpwards = options.maxUpwards ?? 3;

  let targetStat: ReturnType<typeof statSync>;
  try {
    targetStat = statSync(target);
  } catch (e) {
    result.errors.push({
      path: target,
      type: "config-error",
      message: `读取目标路径失败: ${(e as Error).message}`,
    });
    return result;
  }
  if (!targetStat.isDirectory()) {
    result.errors.push({
      path: target,
      type: "config-error",
      message: "仅支持子文件夹作为入参",
    });
    return result;
  }

  const found = findConfigUpwards(target, maxUpwards);
  if (!found) {
    result.errors.push({
      path: target,
      type: "config-error",
      message: `未在 ${target} 及向上 ${maxUpwards} 层内找到 schemark.json`,
    });
    return result;
  }

  const rootDir = found.configDir;
  const rootEffective = loadAndValidateConfig(found.configPath, result.errors);
  if (!rootEffective) return result;

  const rel = relative(rootDir, target);
  const segments = rel === "" ? [] : rel.split(sep);

  if (segments.length === 0) {
    walk(
      rootDir,
      rootDir,
      { effective: rootEffective, accumulatedGroups: {}, parentMatch: undefined },
      result,
    );
    return result;
  }

  let cwd = rootDir;
  let ctx: DirContext = {
    effective: rootEffective,
    accumulatedGroups: {},
    parentMatch: undefined,
  };
  for (const name of segments) {
    const next = join(cwd, name);
    const r = matchAndEnter(rootDir, next, name, ctx, result);
    if (!r.ok) return result;
    ctx = r.childCtx;
    cwd = next;
  }
  walk(rootDir, target, ctx, result);
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
  const r = matchAndEnter(rootDir, fullPath, name, ctx, result);
  if (r.ok) {
    walk(rootDir, fullPath, r.childCtx, result);
    return r.matchedTypeKey;
  }
  return r.matchedTypeKey;
}

type EnterDirResult =
  | { ok: true; matchedTypeKey: string; childCtx: DirContext }
  | { ok: false; matchedTypeKey?: string };

function matchAndEnter(
  rootDir: string,
  fullPath: string,
  name: string,
  ctx: DirContext,
  result: ResolveResult,
): EnterDirResult {
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
    return { ok: false };
  }
  if (matches.length > 1) {
    result.errors.push({
      path: rel,
      type: "ambiguous-match",
      message: `目录名 "${name}" 同时匹配多条规则: ${matches.map((m) => m.typeKey).join(", ")}`,
    });
    return { ok: false };
  }

  const matched = matches[0]!;
  const dirRule = matched.rule as DirectoryRule;

  let metaForThisDir: Record<string, unknown> | undefined;
  try {
    metaForThisDir = deriveMetaFields(dirRule, true, matched.captures, rel);
  } catch (e) {
    pushDeriveError(e, rel, result);
    return { ok: false, matchedTypeKey: matched.typeKey };
  }

  if (matched.typeKey in ctx.accumulatedGroups) {
    result.errors.push({
      path: rel,
      type: "duplicate-typekey",
      message: `运行时 typeKey 冲突: "${matched.typeKey}" 在解析路径上重复`,
    });
    return { ok: false, matchedTypeKey: matched.typeKey };
  }
  const nextGroups: Record<string, Record<string, unknown>> = {
    ...ctx.accumulatedGroups,
    [matched.typeKey]: metaForThisDir,
  };

  const childConfigPath = findConfigInDir(fullPath);
  let childEffective: EffectiveConfig;
  if (childConfigPath) {
    const loaded = loadAndValidateConfig(childConfigPath, result.errors);
    if (!loaded) return { ok: false, matchedTypeKey: matched.typeKey };
    childEffective = loaded;
  } else {
    childEffective = inheritFromParent(dirRule, rel);
  }

  return {
    ok: true,
    matchedTypeKey: matched.typeKey,
    childCtx: {
      effective: childEffective,
      accumulatedGroups: nextGroups,
      parentMatch: matched,
    },
  };
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
    result.files.push({ path: rel, frontmatter: {}, schemark: deriveErrorMessage(e) });
    return matched.typeKey;
  }

  if (matched.typeKey in ctx.accumulatedGroups) {
    const msg = `运行时 typeKey 冲突: "${matched.typeKey}" 在解析路径上重复`;
    result.errors.push({ path: rel, type: "duplicate-typekey", message: msg });
    result.files.push({ path: rel, frontmatter: {}, schemark: msg });
    return matched.typeKey;
  }

  const parsed = readMarkdown(fullPath, rel, result);
  if (parsed === undefined) {
    const fmErr = result.errors.filter((e) => e.path === rel).pop();
    result.files.push({ path: rel, frontmatter: {}, schemark: fmErr?.message ?? "读取 markdown 失败" });
    return matched.typeKey;
  }

  const fm = validateFrontmatter(parsed.data, fileRule, rel, result);
  const bodyOk = validateBody(parsed.content, fileRule, rel, result);
  if (fm === undefined || !bodyOk) {
    const lastErr = result.errors.filter((e) => e.path === rel).pop();
    result.files.push({ path: rel, frontmatter: fm ?? {}, schemark: lastErr?.message ?? "校验失败" });
    return matched.typeKey;
  }

  const out: ResolvedFile = { path: rel, frontmatter: fm };
  for (const v of Object.values(ctx.accumulatedGroups)) {
    const group = v as Record<string, unknown>;
    for (const [field, val] of Object.entries(group)) {
      out[field] = val;
    }
  }
  for (const [field, val] of Object.entries(fileMeta)) {
    out[field] = val;
  }
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
  if (typeof value !== "object" || value === null) {
    return value;
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

function deriveErrorMessage(e: unknown): string {
  if (e instanceof TemplateError) return `${e.field}: ${e.message}`;
  if (e instanceof ConversionError) return `${e.field}: ${e.message}`;
  if (e instanceof MetaValidationError) return `${e.field}: ${e.message}`;
  return (e as Error).message;
}

interface ParsedMarkdown {
  data: Record<string, unknown>;
  content: string;
}

function readMarkdown(
  fullPath: string,
  rel: string,
  result: ResolveResult,
): ParsedMarkdown | undefined {
  try {
    const raw = readFileSync(fullPath, "utf8");
    const parsed = matter(raw, {
      engines: {
        yaml: (s: string) => yaml.load(s, { schema: yaml.JSON_SCHEMA }) as object,
      },
    });
    return {
      data: (parsed.data ?? {}) as Record<string, unknown>,
      content: parsed.content ?? "",
    };
  } catch (e) {
    result.errors.push({
      path: rel,
      type: "frontmatter-validation",
      message: `读取/解析 markdown 失败: ${(e as Error).message}`,
    });
    return undefined;
  }
}

function validateFrontmatter(
  data: Record<string, unknown>,
  rule: FileRule,
  rel: string,
  result: ResolveResult,
): Record<string, unknown> | undefined {
  const fmSpec = rule.frontmatter;
  if (!fmSpec) return data;

  const fullSchema: Record<string, unknown> = { type: "object", ...fmSpec };
  try {
    const validate = compileSchema(fullSchema);
    const ok = validate(data);
    if (ok) return data;
    const issues = formatAjvErrors(validate.errors);
    for (const issue of issues) {
      const isRequired = issue.message.includes("must have required property");
      result.errors.push({
        path: rel,
        type: isRequired ? "missing-required-frontmatter" : "frontmatter-validation",
        message: `${issue.path}: ${issue.message}`,
      });
    }
    return undefined;
  } catch (e) {
    result.errors.push({
      path: rel,
      type: "frontmatter-validation",
      message: `frontmatter schema 编译失败: ${(e as Error).message}`,
    });
    return undefined;
  }
}

function validateBody(
  content: string,
  rule: FileRule,
  rel: string,
  result: ResolveResult,
): boolean {
  const bodySpec = rule.body;
  if (!bodySpec) return true;
  const headings = parseHeadings(content);
  let ok = true;
  for (const declared of Object.keys(bodySpec)) {
    const m = /^(#{1,6}) (.+)$/.exec(declared);
    if (!m) continue;
    const level = m[1]!.length;
    const text = m[2]!.trim();
    const hit = headings.some((h) => h.level === level && h.text === text);
    if (!hit) {
      ok = false;
      result.errors.push({
        path: rel,
        type: "missing-required-section",
        message: `body: 缺少章节 "${declared}"`,
      });
    }
  }
  return ok;
}

function parseHeadings(content: string): Array<{ level: number; text: string }> {
  const out: Array<{ level: number; text: string }> = [];
  const lines = content.split(/\r?\n/);
  let fence: string | undefined;
  for (const line of lines) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]![0]!;
      if (fence === undefined) {
        fence = marker;
      } else if (fence === marker) {
        fence = undefined;
      }
      continue;
    }
    if (fence !== undefined) continue;
    const h = /^(#{1,6}) +(.+?)\s*$/.exec(line);
    if (!h) continue;
    let text = h[2]!;
    text = text.replace(/\s+#+\s*$/, "").trim();
    if (text.length === 0) continue;
    out.push({ level: h[1]!.length, text });
  }
  return out;
}
