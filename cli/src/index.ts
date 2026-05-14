export {
  loadConfigFromFile,
  findConfigInDir,
  compilePatterns,
  configToEffective,
  inheritFromParent,
  ConfigError,
  type SchemarkConfig,
  type DirectoryRule,
  type FileRule,
  type EffectiveConfig,
  type MetaSpec,
  type FrontmatterSpec,
} from "./loader.js";

export {
  resolveDirectoryTree,
  type ResolveError,
  type ResolvedFile,
  type ResolveResult,
} from "./resolver.js";

export {
  validateSchema,
  validateSchemarkConfig,
  compileSchema,
  type ValidationIssue,
} from "./validator.js";

export {
  convertCaptureValue,
  ConversionError,
  type FieldDef,
} from "./converter.js";

export { runValid, type ValidOptions, type ValidResult } from "./commands/valid.js";
export { runMeta, type MetaOptions, type MetaResult } from "./commands/meta.js";
