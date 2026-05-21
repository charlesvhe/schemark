import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runValid } from "../src/commands/valid.js";
import { ROOT_CONFIG, makeTempDir, writeFixture, writeJson } from "./helpers.js";

describe("runValid", () => {
  let root: string;
  let cleanup: () => void;

  beforeEach(() => {
    const t = makeTempDir();
    root = t.root;
    cleanup = t.cleanup;
  });

  afterEach(() => cleanup());

  it("合法目录树退出码为 0 并打印 No errors found", () => {
    writeJson(root, "schemark.json", ROOT_CONFIG);
    writeFixture(root, [
      {
        path: "20260401-20260430-项目启动/meeting-20260415-站会.md",
        content: "---\nattendees: [\"张三\"]\nduration: 10\n---\n",
      },
    ]);
    const r = runValid(root);
    expect(r.exitCode).toBe(0);
    expect(r.output).toBe("No errors found");
  });

  it("有错误时退出码为 1", () => {
    writeJson(root, "schemark.json", ROOT_CONFIG);
    writeFixture(root, [{ path: "unknown-dir/x.md", content: "---\n---\n" }]);
    const r = runValid(root);
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain("error(s) found");
  });

  it("--json 输出合法 JSON 数组", () => {
    writeJson(root, "schemark.json", ROOT_CONFIG);
    writeFixture(root, [{ path: "stray.md", content: "---\n---\n" }]);
    const r = runValid(root, { json: true });
    expect(r.exitCode).toBe(1);
    const parsed = JSON.parse(r.output) as Array<{ path: string; type: string; message: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty("path");
    expect(parsed[0]).toHaveProperty("type");
    expect(parsed[0]).toHaveProperty("message");
  });

  it("根目录缺少 schemark.json 报错", () => {
    const r = runValid(root);
    expect(r.exitCode).toBe(1);
    expect(r.output.toLowerCase()).toContain("schemark.json");
  });

  it("required:true 缺失被报告", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: { readme: { pattern: "^readme\\.md$", required: true } },
    });
    const r = runValid(root, { json: true });
    expect(r.exitCode).toBe(1);
    const parsed = JSON.parse(r.output) as Array<{ type: string }>;
    expect(parsed.some((e) => e.type === "missing-required-rule")).toBe(true);
  });

  it("路径 typeKey 重名被识别为 duplicate-typekey", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      directories: {
        sprint: {
          pattern: "^s$",
          files: { sprint: { pattern: "^x\\.md$" } },
        },
      },
    });
    writeFixture(root, [{ path: "s/x.md", content: "---\n---\n" }]);
    const r = runValid(root, { json: true });
    expect(r.exitCode).toBe(1);
    const parsed = JSON.parse(r.output) as Array<{ type: string }>;
    expect(parsed.some((e) => e.type === "duplicate-typekey")).toBe(true);
  });

  it("body 缺章节 → missing-required-section,exitCode 1", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: {
        bug: {
          pattern: "^B\\d{4}-.+\\.md$",
          body: { "## 重现步骤": "", "## 修复细节": "" },
        },
      },
    });
    writeFixture(root, [{ path: "B0001-x.md", content: "---\n---\n\n## 重现步骤\n" }]);
    const r = runValid(root, { json: true });
    expect(r.exitCode).toBe(1);
    const parsed = JSON.parse(r.output) as Array<{ type: string; message: string }>;
    const hit = parsed.find((e) => e.type === "missing-required-section");
    expect(hit).toBeDefined();
    expect(hit!.message).toContain("## 修复细节");
  });
});
