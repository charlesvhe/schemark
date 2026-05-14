import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

let metaSchemaCache: unknown | undefined;

function loadMetaSchema(): unknown {
  if (metaSchemaCache) return metaSchemaCache;
  const candidates = [
    resolve(here, "../../schemark.schema.json"),
    resolve(here, "../schemark.schema.json"),
    resolve(here, "../../../schemark.schema.json"),
  ];
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, "utf8");
      metaSchemaCache = JSON.parse(raw);
      return metaSchemaCache;
    } catch {
      continue;
    }
  }
  throw new Error("schemark.schema.json not found relative to validator module");
}

function buildAjv(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export function formatAjvErrors(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  if (!errors) return [];
  return errors.map((e) => ({
    path: e.instancePath || "/",
    message: `${e.message ?? "validation failed"}${
      e.params && Object.keys(e.params).length > 0 ? ` (${JSON.stringify(e.params)})` : ""
    }`,
  }));
}

export function validateSchema(schema: unknown, data: unknown): ValidationIssue[] {
  const ajv = buildAjv();
  const validate = ajv.compile(schema as object) as ValidateFunction;
  const ok = validate(data);
  if (ok) return [];
  return formatAjvErrors(validate.errors);
}

export function validateSchemarkConfig(config: unknown): ValidationIssue[] {
  return validateSchema(loadMetaSchema(), config);
}

export function compileSchema(schema: unknown): ValidateFunction {
  const ajv = buildAjv();
  return ajv.compile(schema as object) as ValidateFunction;
}
