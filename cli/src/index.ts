export {
  loadConfigFromFile,
  findConfigInDir,
  findConfigUpwards,
  validateConfigInvariants,
  configToEffective,
  inheritFromParent,
  getMetaFieldEntries,
  ConfigError,
  type SchemarkConfig,
  type DirectoryRule,
  type FileRule,
  type EffectiveConfig,
  type MetaFieldValue,
  type MetaFieldObject,
  type ConfigUpwardsResult,
} from "./loader.js";

export {
  resolveDirectoryTree,
  resolveSubtree,
  type ResolveError,
  type ResolvedFile,
  type ResolveResult,
  type ResolveSubtreeOptions,
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
  type ConvertSchemaPart,
} from "./converter.js";

export {
  renderTemplate,
  TemplateError,
} from "./template.js";

export { runValid, type ValidOptions, type ValidResult } from "./commands/valid.js";
export { runMeta, type MetaOptions, type MetaResult } from "./commands/meta.js";
export { runWeb, type WebOptions } from "./commands/web.js";
export { flattenRow, type FlatRow } from "./flatten.js";
