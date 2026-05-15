import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveDirectoryTree } from "../src/resolver.js";
import { ROOT_CONFIG, makeTempDir, writeFixture, writeJson } from "./helpers.js";

describe("resolveDirectoryTree", () => {
  let root: string;
  let cleanup: () => void;

  beforeEach(() => {
    const t = makeTempDir();
    root = t.root;
    cleanup = t.cleanup;
  });

  afterEach(() => cleanup());

  it("派生 v2 平铺结构(模板插值 + 对象形式日期归一化)", () => {
    writeJson(root, "schemark.json", ROOT_CONFIG);
    writeFixture(root, [
      {
        path: "20260401-20260430-项目启动/meeting-20260415-站会纪要.md",
        content:
          "---\nattendees: [\"张三\", \"李四\"]\ntags: [\"daily\"]\nduration: 30\n---\n# meeting\n",
      },
    ]);

    const r = resolveDirectoryTree(root);
    expect(r.errors).toEqual([]);
    expect(r.files).toHaveLength(1);
    const f = r.files[0]!;
    expect(f.path).toBe("20260401-20260430-项目启动/meeting-20260415-站会纪要.md");
    expect(f.type).toBe("milestone");
    expect(f.start).toBe("2026-04-01");
    expect(f.end).toBe("2026-04-30");
    expect(f.name).toBe("meeting-站会纪要");
    expect(f.date).toBe("2026-04-15");
    expect(f.frontmatter).toEqual({ attendees: ["张三", "李四"], tags: ["daily"], duration: 30 });
    expect((f as Record<string, unknown>).meta).toBeUndefined();
  });

  it("子级 schemark.json 完全覆盖父级嵌套定义", () => {
    writeJson(root, "schemark.json", ROOT_CONFIG);
    writeJson(root, "20260401-20260430-项目启动/schemark.json", {
      strict: true,
      files: {
        retrospective: {
          pattern: "^retro-(?<date>\\d{8})\\.md$",
          date: { type: "string", format: "date", value: "${date}" },
        },
      },
    });
    writeFixture(root, [
      {
        path: "20260401-20260430-项目启动/retro-20260430.md",
        content: "---\n---\n# retro\n",
      },
      {
        path: "20260401-20260430-项目启动/meeting-20260415-站会.md",
        content: "---\n---\n# meeting\n",
      },
    ]);

    const r = resolveDirectoryTree(root);
    expect(r.files).toHaveLength(1);
    expect(r.files[0]!.date).toBe("2026-04-30");
    expect(r.errors.some((e) => e.type === "unmatched-file")).toBe(true);
  });

  it("子级缺失 schemark.json 时继承父级嵌套定义", () => {
    writeJson(root, "schemark.json", ROOT_CONFIG);
    writeFixture(root, [
      {
        path: "20260501-20260531-第二里程碑/design-用户登录.md",
        content: "---\nauthor: Alice\nstatus: review\n---\n# d\n",
      },
    ]);

    const r = resolveDirectoryTree(root);
    expect(r.errors).toEqual([]);
    expect(r.files[0]!.name).toBe("用户登录");
  });

  it("文件名同时命中多条规则时报歧义错误", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: {
        a: { pattern: "^foo-.+\\.md$" },
        b: { pattern: "^foo-bar\\.md$" },
      },
    });
    writeFixture(root, [{ path: "foo-bar.md", content: "---\n---\n" }]);
    const r = resolveDirectoryTree(root);
    expect(r.files).toHaveLength(0);
    expect(r.errors.some((e) => e.type === "ambiguous-match")).toBe(true);
  });

  it("strict=true 时未匹配文件报错", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: { a: { pattern: "^known\\.md$" } },
    });
    writeFixture(root, [{ path: "stray.md", content: "---\n---\n" }]);
    const r = resolveDirectoryTree(root);
    expect(r.errors.some((e) => e.type === "unmatched-file")).toBe(true);
  });

  it("strict=false 时未匹配文件不报错", () => {
    writeJson(root, "schemark.json", {
      strict: false,
      files: { a: { pattern: "^known\\.md$" } },
    });
    writeFixture(root, [{ path: "stray.md", content: "---\n---\n" }]);
    const r = resolveDirectoryTree(root);
    expect(r.errors).toEqual([]);
    expect(r.files).toHaveLength(0);
  });

  it("frontmatter 必填字段缺失报错", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: {
        x: {
          pattern: "^x\\.md$",
          frontmatter: { properties: { author: { type: "string" } }, required: ["author"] },
        },
      },
    });
    writeFixture(root, [{ path: "x.md", content: "---\n---\n" }]);
    const r = resolveDirectoryTree(root);
    expect(r.errors.some((e) => e.type === "missing-required-frontmatter")).toBe(true);
  });

  it("frontmatter 字段类型不匹配 schema 报错", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: {
        x: {
          pattern: "^x\\.md$",
          frontmatter: {
            properties: {
              status: { type: "string", enum: ["a", "b"] },
            },
          },
        },
      },
    });
    writeFixture(root, [{ path: "x.md", content: "---\nstatus: bogus\n---\n" }]);
    const r = resolveDirectoryTree(root);
    expect(r.errors.some((e) => e.type === "frontmatter-validation")).toBe(true);
  });

  it("元 schema 校验失败的 schemark.json 报 config-invalid", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: { x: { /* missing pattern */ } as unknown as { pattern: string } },
    });
    const r = resolveDirectoryTree(root);
    expect(r.errors.some((e) => e.type === "config-invalid")).toBe(true);
  });

  it("非法正则表达式报 config-invalid 或 config-error", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: { x: { pattern: "[invalid" } },
    });
    const r = resolveDirectoryTree(root);
    expect(r.errors.some((e) => e.type === "config-error" || e.type === "config-invalid")).toBe(
      true,
    );
  });

  it("frontmatter 中无引号的日期保留为字符串(YAML 1.2 JSON_SCHEMA)", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: {
        x: {
          pattern: "^x\\.md$",
          frontmatter: {
            properties: { "found-at": { type: "string", format: "date" } },
            required: ["found-at"],
          },
        },
      },
    });
    writeFixture(root, [{ path: "x.md", content: "---\nfound-at: 2026-04-15\n---\n" }]);
    const r = resolveDirectoryTree(root);
    expect(r.errors).toEqual([]);
    expect(r.files[0]!.frontmatter["found-at"]).toBe("2026-04-15");
  });

  it("路径上 typeKey 重复直接报 duplicate-typekey", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      directories: {
        sprint: {
          pattern: "^s$",
          files: {
            sprint: { pattern: "^x\\.md$" },
          },
        },
      },
    });
    writeFixture(root, [{ path: "s/x.md", content: "---\n---\n" }]);
    const r = resolveDirectoryTree(root);
    expect(r.errors.some((e) => e.type === "duplicate-typekey")).toBe(true);
  });

  it("required:true 的子目录缺失时报 missing-required-rule", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      directories: {
        ms: {
          pattern: "^ms-.+$",
          required: true,
        },
      },
    });
    const r = resolveDirectoryTree(root);
    expect(r.errors.some((e) => e.type === "missing-required-rule")).toBe(true);
  });

  it("required:true 的子文件缺失时报 missing-required-rule", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: {
        readme: {
          pattern: "^readme\\.md$",
          required: true,
        },
      },
    });
    const r = resolveDirectoryTree(root);
    expect(r.errors.some((e) => e.type === "missing-required-rule")).toBe(true);
  });

  it("required:true 有匹配项时不报错", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: {
        readme: { pattern: "^readme\\.md$", required: true },
      },
    });
    writeFixture(root, [{ path: "readme.md", content: "---\n---\n" }]);
    const r = resolveDirectoryTree(root);
    expect(r.errors).toEqual([]);
  });

  it("模板引用未定义捕获组时报 template-undefined-capture", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: {
        x: {
          pattern: "^x\\.md$",
          name: "${missing}",
        },
      },
    });
    writeFixture(root, [{ path: "x.md", content: "---\n---\n" }]);
    const r = resolveDirectoryTree(root);
    expect(r.errors.some((e) => e.type === "template-undefined-capture")).toBe(true);
    expect(r.files).toHaveLength(1);
    expect(r.files[0]!.path).toBe("x.md");
    expect(r.files[0]!.schemark).toContain("missing");
  });

  it("对象形式 enum 校验失败时报 meta-validation", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: {
        x: {
          pattern: "^x-(?<kind>.+)\\.md$",
          kind: { type: "string", enum: ["a", "b"], value: "${kind}" },
        },
      },
    });
    writeFixture(root, [{ path: "x-c.md", content: "---\n---\n" }]);
    const r = resolveDirectoryTree(root);
    expect(r.errors.some((e) => e.type === "meta-validation")).toBe(true);
  });

  it("字面常量字段(不含 ${})原样输出", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      files: {
        x: {
          pattern: "^x\\.md$",
          type: "x-file",
          tag: "constant-tag",
        },
      },
    });
    writeFixture(root, [{ path: "x.md", content: "---\n---\n" }]);
    const r = resolveDirectoryTree(root);
    expect(r.errors).toEqual([]);
    expect(r.files[0]!.type).toBe("x-file");
    expect(r.files[0]!.tag).toBe("constant-tag");
  });
});
