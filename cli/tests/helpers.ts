import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface FixtureFile {
  path: string;
  content: string;
}

export function makeTempDir(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "schemark-test-"));
  return {
    root,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

export function writeFixture(root: string, files: FixtureFile[]): void {
  for (const f of files) {
    const full = join(root, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content, "utf8");
  }
}

export function writeJson(root: string, relPath: string, value: unknown): void {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(value, null, 2), "utf8");
}

export const ROOT_CONFIG = {
  $schema: "https://schemark.dev/schemark.schema.json",
  strict: true,
  directories: {
    milestone: {
      pattern: "^(?<start>\\d{8})-(?<end>\\d{8})-(?<name>.+)$",
      type: "milestone",
      start: { type: "string", format: "date", value: "${start}" },
      end: { type: "string", format: "date", value: "${end}" },
      name: "${start}-${name}",
      files: {
        meeting: {
          pattern: "^meeting-(?<date>\\d{8})-(?<title>.+)\\.md$",
          date: { type: "string", format: "date", value: "${date}" },
          name: "meeting-${title}",
          frontmatter: {
            properties: {
              attendees: { type: "array", items: { type: "string" } },
              duration: { type: "integer", minimum: 0 },
            },
            required: ["attendees"],
          },
        },
        design: {
          pattern: "^design-(?<title>.+)\\.md$",
          name: "${title}",
          frontmatter: {
            properties: {
              author: { type: "string" },
              status: { type: "string", enum: ["draft", "review", "approved"] },
            },
            required: ["author", "status"],
          },
        },
      },
    },
  },
};
