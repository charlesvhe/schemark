import { Command } from "commander";
import { resolve } from "node:path";
import { runValid } from "./commands/valid.js";
import { runMeta } from "./commands/meta.js";
import { runWeb } from "./commands/web.js";

export function buildCli(): Command {
  const program = new Command();
  program
    .name("schemark")
    .description("Schemark CLI: validate and derive meta from schemark-managed Markdown trees");

  program
    .command("valid")
    .description("Validate a directory tree against its schemark.json (auto-discovers config up to 3 parent levels)")
    .argument("[dir]", "Root directory to validate", ".")
    .option("--json", "Output errors as a JSON array")
    .action((dir: string, opts: { json?: boolean }) => {
      const target = resolve(process.cwd(), dir);
      const result = runValid(target, { json: opts.json });
      if (result.errors.length === 0 && opts.json) {
        process.stdout.write(`${result.output}\n`);
      } else {
        process.stdout.write(`${result.output}\n`);
      }
      process.exit(result.exitCode);
    });

  program
    .command("meta")
    .description("Scan a directory tree and emit derived meta JSON (auto-discovers schemark.json up to 3 parent levels)")
    .argument("[dir]", "Root directory to scan", ".")
    .option("-o, --output <file>", "Write JSON output to a file instead of stdout")
    .option("--strict", "Exit with code 1 when any file is skipped due to conversion/required errors")
    .action((dir: string, opts: { output?: string; strict?: boolean }) => {
      const target = resolve(process.cwd(), dir);
      const result = runMeta(target, { output: opts.output, strict: opts.strict });
      if (result.stdout) process.stdout.write(`${result.stdout}\n`);
      if (result.stderr) process.stderr.write(`${result.stderr}\n`);
      process.exit(result.exitCode);
    });

  program
    .command("web")
    .description("Start a local web server that renders schemark meta as a table")
    .argument("[dir]", "Root directory to scan", ".")
    .option("-p, --port <port>", "Port to listen on", "6789")
    .action(async (dir: string, opts: { port: string }) => {
      const target = resolve(process.cwd(), dir);
      const port = Number.parseInt(opts.port, 10);
      if (!Number.isFinite(port) || port <= 0 || port > 65535) {
        process.stderr.write(`无效端口: ${opts.port}\n`);
        process.exit(1);
      }
      try {
        await runWeb(target, { port });
      } catch {
        process.exit(1);
      }
    });

  return program;
}

export function main(argv: string[]): void {
  buildCli().parse(argv);
}
