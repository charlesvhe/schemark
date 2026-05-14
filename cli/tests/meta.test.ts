import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMeta } from "../src/commands/meta.js";
import { ROOT_CONFIG, makeTempDir, writeFixture, writeJson } from "./helpers.js";

describe("runMeta", () => {
  let root: string;
  let cleanup: () => void;

  beforeEach(() => {
    const t = makeTempDir();
    root = t.root;
    cleanup = t.cleanup;
  });

  afterEach(() => cleanup());

  it("产出 README 示例对应的派生 meta", () => {
    writeJson(root, "schemark.json", ROOT_CONFIG);
    writeFixture(root, [
      {
        path: "20260401-20260430-项目启动/meeting-20260415-站会纪要.md",
        content:
          "---\nattendees: [\"张三\", \"李四\"]\ntags: [\"daily\"]\nduration: 30\n---\n# meeting\n",
      },
    ]);
    const r = runMeta(root);
    expect(r.exitCode).toBe(0);
    expect(r.files).toHaveLength(1);
    expect(r.files[0]!.meta).toEqual({
      milestone: { start: "2026-04-01", end: "2026-04-30", name: "项目启动" },
      file: { type: "meeting", date: "2026-04-15", title: "站会纪要" },
    });
    expect(r.files[0]!.frontmatter).toEqual({ attendees: ["张三", "李四"], duration: 30 });
  });

  it("--output 将 JSON 写入文件", () => {
    writeJson(root, "schemark.json", ROOT_CONFIG);
    writeFixture(root, [
      {
        path: "20260501-20260531-第二期/design-x.md",
        content: "---\nauthor: A\nstatus: draft\n---\n",
      },
    ]);
    const outFile = join(root, "out.json");
    const r = runMeta(root, { output: outFile });
    expect(r.exitCode).toBe(0);
    expect(existsSync(outFile)).toBe(true);
    const parsed = JSON.parse(readFileSync(outFile, "utf8")) as unknown[];
    expect(parsed).toHaveLength(1);
  });

  it("默认不因为转换失败导致退出码 1，但会写 stderr 并跳过文件", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: {
        x: {
          pattern: "^x-(?<n>.+)\\.md$",
          meta: { fields: { n: { type: "integer" } } },
        },
      },
    });
    writeFixture(root, [{ path: "x-abc.md", content: "---\n---\n" }]);
    const r = runMeta(root);
    expect(r.exitCode).toBe(0);
    expect(r.files).toHaveLength(0);
    expect(r.stderr).toContain("conversion");
  });

  it("--strict 模式下转换失败导致退出码 1", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: {
        x: {
          pattern: "^x-(?<n>.+)\\.md$",
          meta: { fields: { n: { type: "integer" } } },
        },
      },
    });
    writeFixture(root, [{ path: "x-abc.md", content: "---\n---\n" }]);
    const r = runMeta(root, { strict: true });
    expect(r.exitCode).toBe(1);
  });

  it("空目录输出空 JSON 数组", () => {
    writeJson(root, "schemark.json", { strict: false, files: {} });
    const r = runMeta(root);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });
});
