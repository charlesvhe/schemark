import { resolveSubtree, type ResolveError } from "../resolver.js";

export interface ValidOptions {
  json?: boolean;
}

export interface ValidResult {
  errors: ResolveError[];
  exitCode: number;
  output: string;
}

export function runValid(dir: string, options: ValidOptions = {}): ValidResult {
  const result = resolveSubtree(dir);
  const errors = result.errors;
  const exitCode = errors.length > 0 ? 1 : 0;

  if (options.json) {
    return {
      errors,
      exitCode,
      output: JSON.stringify(errors, null, 2),
    };
  }

  if (errors.length === 0) {
    return { errors, exitCode, output: "No errors found" };
  }

  const lines = errors.map((e) => `${e.path}: [${e.type}] ${e.message}`);
  lines.push("");
  lines.push(`${errors.length} error(s) found`);
  return { errors, exitCode, output: lines.join("\n") };
}
