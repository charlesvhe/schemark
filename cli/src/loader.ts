import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface MetaSpec {
  namespace?: string;
  fields?: Record<string, FieldSpec>;
  required?: string[];
}

export interface FrontmatterSpec {
  fields?: Record<string, unknown>;
  required?: string[];
}

export interface FieldSpec {
  type?: string | string[];
  format?: string;
  pattern?: string;
  enum?: unknown[];
  [k: string]: unknown;
}

export interface DirectoryRule {
  pattern: string;
  meta?: MetaSpec;
  directories?: Record<string, DirectoryRule>;
  files?: Record<string, FileRule>;
}

export interface FileRule {
  pattern: string;
  meta?: MetaSpec;
  frontmatter?: FrontmatterSpec;
}

export interface SchemarkConfig {
  $schema?: string;
  strict?: boolean;
  directories?: Record<string, DirectoryRule>;
  files?: Record<string, FileRule>;
}

export interface LoadedConfig {
  config: SchemarkConfig;
  source: string;
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
  return parsed as SchemarkConfig;
}

export function findConfigInDir(dir: string): string | undefined {
  const candidate = join(dir, "schemark.json");
  return existsSync(candidate) ? candidate : undefined;
}

export function compilePatterns(config: SchemarkConfig, source: string): void {
  walk(config.directories, source, "directories");
  walk(config.files, source, "files");
}

function walk(
  rules: Record<string, DirectoryRule | FileRule> | undefined,
  source: string,
  path: string,
): void {
  if (!rules) return;
  for (const [key, rule] of Object.entries(rules)) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(rule.pattern);
    } catch (e) {
      throw new ConfigError(
        source,
        `${path}.${key}.pattern 不是合法的正则表达式: ${(e as Error).message}`,
      );
    }
    if ("directories" in rule && rule.directories) {
      walk(rule.directories, source, `${path}.${key}.directories`);
    }
    if ("files" in rule && rule.files) {
      walk(rule.files, source, `${path}.${key}.files`);
    }
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
