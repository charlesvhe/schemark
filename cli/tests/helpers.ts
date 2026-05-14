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
      meta: {
        namespace: "milestone",
        fields: {
          start: { type: "string", format: "date" },
          end: { type: "string", format: "date" },
          name: { type: "string" },
        },
      },
      files: {
        meeting: {
          pattern: "^meeting-(?<date>\\d{8})-(?<title>.+)\\.md$",
          frontmatter: {
            fields: {
              attendees: { type: "array", items: { type: "string" } },
              duration: { type: "integer", minimum: 0 },
            },
          },
          meta: {
            namespace: "file",
            fields: {
              date: { type: "string", format: "date" },
              title: { type: "string" },
            },
          },
        },
        design: {
          pattern: "^design-(?<title>.+)\\.md$",
          frontmatter: {
            fields: {
              author: { type: "string" },
              status: { type: "string", enum: ["draft", "review", "approved"] },
            },
          },
          meta: {
            namespace: "file",
            fields: { title: { type: "string" } },
          },
        },
      },
    },
  },
};
