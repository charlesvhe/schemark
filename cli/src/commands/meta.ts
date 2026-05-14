import { writeFileSync } from "node:fs";
import { resolveDirectoryTree, type ResolveError, type ResolvedFile } from "../resolver.js";

export interface MetaOptions {
  output?: string;
  strict?: boolean;
}

export interface MetaResult {
  files: ResolvedFile[];
  skipped: ResolveError[];
  exitCode: number;
  stdout: string;
  stderr: string;
}

const SKIP_TYPES: ReadonlySet<ResolveError["type"]> = new Set([
  "conversion",
  "template-undefined-capture",
  "template-syntax",
  "meta-validation",
]);

export function runMeta(dir: string, options: MetaOptions = {}): MetaResult {
  const result = resolveDirectoryTree(dir);
  const skipped: ResolveError[] = [];
  const fatal: ResolveError[] = [];
  for (const err of result.errors) {
    if (SKIP_TYPES.has(err.type)) {
      skipped.push(err);
    } else {
      fatal.push(err);
    }
  }

  const json = JSON.stringify(result.files, null, 2);
  let stdoutText: string;
  if (options.output) {
    writeFileSync(options.output, `${json}\n`);
    stdoutText = `Wrote ${result.files.length} entry(ies) to ${options.output}`;
  } else {
    stdoutText = json;
  }

  const stderrLines: string[] = [];
  for (const err of [...fatal, ...skipped]) {
    stderrLines.push(`${err.path}: [${err.type}] ${err.message}`);
  }

  let exitCode = 0;
  if (fatal.length > 0) exitCode = 1;
  if (options.strict && skipped.length > 0) exitCode = 1;

  return {
    files: result.files,
    skipped,
    exitCode,
    stdout: stdoutText,
    stderr: stderrLines.join("\n"),
  };
}
