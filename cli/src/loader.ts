import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RESERVED_DIR_KEYS = new Set(["pattern", "required", "directories", "files"]);
const RESERVED_FILE_KEYS = new Set(["pattern", "required", "frontmatter"]);

export interface MetaFieldObject {
  value: string;
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  description?: string;
  default?: unknown;
  const?: unknown;
  oneOf?: unknown[];
  anyOf?: unknown[];
  allOf?: unknown[];
  [k: string]: unknown;
}

export type MetaFieldValue = string | number | boolean | null | MetaFieldObject;

export interface DirectoryRule {
  pattern: string;
  required?: boolean;
  directories?: Record<string, DirectoryRule>;
  files?: Record<string, FileRule>;
  [metaField: string]: unknown;
}

export interface FileRule {
  pattern: string;
  required?: boolean;
  frontmatter?: Record<string, unknown>;
  [metaField: string]: unknown;
}

export interface SchemarkConfig {
  $schema?: string;
  strict?: boolean;
  directories?: Record<string, DirectoryRule>;
  files?: Record<string, FileRule>;
}

export class ConfigError extends Error {
  constructor(public configPath: string, message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfigFromFile(filePath: string): SchemarkConfig {
  const raw = readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new ConfigError(filePath, `JSON 解析失败: ${(e as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ConfigError(filePath, "schemark.json 顶层必须是对象");
  }
  try {
    parsed = derefLocalRefs(parsed as Record<string, unknown>);
  } catch (e) {
    throw new ConfigError(filePath, (e as Error).message);
  }
  return parsed as SchemarkConfig;
}

function derefLocalRefs(root: Record<string, unknown>): Record<string, unknown> {
  const defs = (root.$defs ?? {}) as Record<string, unknown>;

  function resolve(ref: string, visiting: Set<string>): unknown {
    const prefix = "#/$defs/";
    if (!ref.startsWith(prefix)) throw new Error(`$ref "${ref}" 仅支持本地 #/$defs/ 引用`);
    const key = ref.slice(prefix.length);
    if (!(key in defs)) throw new Error(`$ref "${ref}" 未找到对应的 $defs 定义`);
    if (visiting.has(key)) throw new Error(`$ref 循环引用: ${[...visiting, key].join(" → ")}`);
    visiting.add(key);
    const resolved = walk(defs[key], new Set(visiting));
    visiting.delete(key);
    return resolved;
  }

  function walk(node: unknown, visiting: Set<string>): unknown {
    if (typeof node !== "object" || node === null) return node;
    if (Array.isArray(node)) return node.map((item) => walk(item, visiting));
    const obj = node as Record<string, unknown>;
    if (typeof obj.$ref === "string") {
      const base = resolve(obj.$ref, new Set(visiting)) as Record<string, unknown>;
      const { $ref: _, ...rest } = obj;
      const resolved = walk(rest, visiting) as Record<string, unknown>;
      return { ...base, ...resolved };
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = walk(v, visiting);
    }
    return out;
  }

  const result = walk(root, new Set()) as Record<string, unknown>;
  delete result.$defs;
  return result;
}

export function findConfigInDir(dir: string): string | undefined {
  const candidate = join(dir, "schemark.json");
  return existsSync(candidate) ? candidate : undefined;
}

export function validateConfigInvariants(config: SchemarkConfig, source: string): void {
  walkRules(config.directories, source, "directories", true, []);
  walkRules(config.files, source, "files", false, []);
}

function walkRules(
  rules: Record<string, DirectoryRule | FileRule> | undefined,
  source: string,
  path: string,
  isDir: boolean,
  ancestorTypeKeys: string[],
): void {
  if (!rules) return;
  for (const [typeKey, rule] of Object.entries(rules)) {
    if (ancestorTypeKeys.includes(typeKey)) {
      throw new ConfigError(
        source,
        `${path}.${typeKey}: 解析路径上 typeKey "${typeKey}" 重复(祖先链: ${ancestorTypeKeys.join(" → ")})`,
      );
    }
    if (typeof rule.pattern !== "string") {
      throw new ConfigError(source, `${path}.${typeKey}.pattern 缺失或非字符串`);
    }
    try {
      new RegExp(rule.pattern);
    } catch (e) {
      throw new ConfigError(
        source,
        `${path}.${typeKey}.pattern 不是合法的正则表达式: ${(e as Error).message}`,
      );
    }
    const reservedKeys = isDir ? RESERVED_DIR_KEYS : RESERVED_FILE_KEYS;
    for (const [k, v] of Object.entries(rule)) {
      if (reservedKeys.has(k)) continue;
      validateMetaFieldValue(v, source, `${path}.${typeKey}.${k}`);
    }
    const childAncestors = [...ancestorTypeKeys, typeKey];
    if (isDir) {
      const dirRule = rule as DirectoryRule;
      walkRules(dirRule.directories, source, `${path}.${typeKey}.directories`, true, childAncestors);
      walkRules(dirRule.files, source, `${path}.${typeKey}.files`, false, childAncestors);
    }
  }
}

function validateMetaFieldValue(v: unknown, source: string, fieldPath: string): void {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) return;
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new ConfigError(source, `${fieldPath}: meta 字段值必须是字符串、数字、布尔、null 或对象`);
  }
  const obj = v as Record<string, unknown>;
  if (typeof obj.value !== "string") {
    throw new ConfigError(source, `${fieldPath}.value 必填,且必须是字符串模板`);
  }
}

export interface EffectiveConfig {
  strict: boolean;
  directories: Record<string, DirectoryRule>;
  files: Record<string, FileRule>;
  source: string;
}

export function configToEffective(config: SchemarkConfig, source: string): EffectiveConfig {
  return {
    strict: config.strict ?? true,
    directories: config.directories ?? {},
    files: config.files ?? {},
    source,
  };
}

export function inheritFromParent(
  parentMatched: DirectoryRule | undefined,
  dirPath: string,
): EffectiveConfig {
  return {
    strict: true,
    directories: parentMatched?.directories ?? {},
    files: parentMatched?.files ?? {},
    source: `<inherited at ${dirPath}>`,
  };
}

export function getMetaFieldEntries(
  rule: DirectoryRule | FileRule,
  isDir: boolean,
): Array<[string, MetaFieldValue]> {
  const reserved = isDir ? RESERVED_DIR_KEYS : RESERVED_FILE_KEYS;
  const out: Array<[string, MetaFieldValue]> = [];
  for (const [k, v] of Object.entries(rule)) {
    if (reserved.has(k)) continue;
    out.push([k, v as MetaFieldValue]);
  }
  return out;
}
