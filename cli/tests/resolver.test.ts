import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveDirectoryTree, resolveSubtree } from "../src/resolver.js";
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

  it("$ref 解引用：sprint 规则复用", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      $defs: {
        sprintRule: {
          pattern: "^(?<name>sprint-.+)$",
          "sprint-name": "${name}",
          archived: "false",
          files: {
            task: {
              pattern: "^(?<id>T\\d+)-(?<title>.+)\\.md$",
              type: "task",
              id: "${id}",
            },
          },
        },
      },
      directories: {
        current: { $ref: "#/$defs/sprintRule" },
        archive: {
          pattern: "^archive$",
          directories: {
            sprint: { $ref: "#/$defs/sprintRule", archived: "true" },
          },
        },
      },
    });
    writeFixture(root, [
      { path: "sprint-01/T0001-登录.md", content: "---\n---\n" },
      { path: "archive/sprint-02/T0002-注册.md", content: "---\n---\n" },
    ]);
    const r = resolveDirectoryTree(root);
    expect(r.errors).toEqual([]);
    expect(r.files).toHaveLength(2);
    const byName = Object.fromEntries(r.files.map((f) => [f["sprint-name"], f]));
    expect(byName["sprint-01"]!.archived).toBe("false");
    expect(byName["sprint-02"]!.archived).toBe("true");
    expect(r.files.every((f) => f.type === "task")).toBe(true);
  });

  it("$ref 指向不存在的 $defs 键时报 config-error", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      directories: {
        sprint: { $ref: "#/$defs/nonExistent" },
      },
    });
    const r = resolveDirectoryTree(root);
    expect(r.errors.some((e) => e.type === "config-error")).toBe(true);
  });

  it("$ref 循环引用时报 config-error", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      $defs: {
        a: { $ref: "#/$defs/b" },
        b: { $ref: "#/$defs/a" },
      },
      directories: {
        sprint: { $ref: "#/$defs/a" },
      },
    });
    const r = resolveDirectoryTree(root);
    expect(r.errors.some((e) => e.type === "config-error")).toBe(true);
  });

  describe("body 章节校验", () => {
    const bodyConfig = {
      strict: true,
      files: {
        bug: {
          pattern: "^B\\d{4}-.+\\.md$",
          body: {
            "## 重现步骤": "[操作步骤]\n",
            "## 修复细节": "<!-- 修复细节描述 -->\n",
          },
        },
      },
    };

    it("文件包含全部声明章节(顺序无关)→ 通过", () => {
      writeJson(root, "schemark.json", bodyConfig);
      writeFixture(root, [
        {
          path: "B0001-x.md",
          content:
            "---\n---\n\n# 标题\n\n## 修复细节\n\n内容\n\n## 重现步骤\n\n步骤\n\n## 额外章节\n",
        },
      ]);
      const r = resolveDirectoryTree(root);
      expect(r.errors).toEqual([]);
    });

    it("缺章节 → missing-required-section 且消息含章节名", () => {
      writeJson(root, "schemark.json", bodyConfig);
      writeFixture(root, [
        { path: "B0001-x.md", content: "---\n---\n\n## 重现步骤\n" },
      ]);
      const r = resolveDirectoryTree(root);
      const missing = r.errors.filter((e) => e.type === "missing-required-section");
      expect(missing).toHaveLength(1);
      expect(missing[0]!.message).toContain("## 修复细节");
    });

    it("层级不匹配视为缺失(声明 ## X,文件写 ### X)", () => {
      writeJson(root, "schemark.json", {
        strict: true,
        files: { bug: { pattern: "^B\\d{4}-.+\\.md$", body: { "## X": "" } } },
      });
      writeFixture(root, [{ path: "B0001-x.md", content: "---\n---\n\n### X\n" }]);
      const r = resolveDirectoryTree(root);
      expect(r.errors.some((e) => e.type === "missing-required-section")).toBe(true);
    });

    it("fenced code block 内的 ## 不算章节", () => {
      writeJson(root, "schemark.json", {
        strict: true,
        files: { bug: { pattern: "^B\\d{4}-.+\\.md$", body: { "## 现象": "" } } },
      });
      writeFixture(root, [
        {
          path: "B0001-x.md",
          content: "---\n---\n\n```\n## 现象\n```\n",
        },
      ]);
      const r = resolveDirectoryTree(root);
      expect(r.errors.some((e) => e.type === "missing-required-section")).toBe(true);
    });

    it("ATX 关闭符 `## 现象 ##` 与 `## 现象` 等价", () => {
      writeJson(root, "schemark.json", {
        strict: true,
        files: { bug: { pattern: "^B\\d{4}-.+\\.md$", body: { "## 现象": "" } } },
      });
      writeFixture(root, [
        { path: "B0001-x.md", content: "---\n---\n\n## 现象 ##\n" },
      ]);
      const r = resolveDirectoryTree(root);
      expect(r.errors).toEqual([]);
    });

    it("body key 非法格式(无空格) → config-error", () => {
      writeJson(root, "schemark.json", {
        strict: true,
        files: { bug: { pattern: "^B\\d{4}-.+\\.md$", body: { "##没空格": "" } } },
      });
      writeFixture(root, [{ path: "B0001-x.md", content: "---\n---\n" }]);
      const r = resolveDirectoryTree(root);
      expect(r.errors.some((e) => e.type === "config-invalid" || e.type === "config-error")).toBe(true);
    });
  });
});

describe("resolveSubtree", () => {
  let root: string;
  let cleanup: () => void;

  beforeEach(() => {
    const t = makeTempDir();
    root = t.root;
    cleanup = t.cleanup;
  });

  afterEach(() => cleanup());

  it("target = 配置根时,行为与 resolveDirectoryTree 完全一致", () => {
    writeJson(root, "schemark.json", ROOT_CONFIG);
    writeFixture(root, [
      {
        path: "20260401-20260430-项目启动/meeting-20260415-站会纪要.md",
        content:
          "---\nattendees: [\"张三\", \"李四\"]\ntags: [\"daily\"]\nduration: 30\n---\n",
      },
    ]);
    const a = resolveSubtree(root);
    const b = resolveDirectoryTree(root);
    expect(a).toEqual(b);
  });

  it("target 自身无配置,父级有 → 找到并只 walk 子树", () => {
    writeJson(root, "schemark.json", ROOT_CONFIG);
    writeFixture(root, [
      {
        path: "20260401-20260430-项目启动/meeting-20260415-站会纪要.md",
        content: "---\nattendees: [\"张三\"]\nduration: 10\n---\n",
      },
      {
        path: "20260501-20260531-第二期/design-x.md",
        content: "---\nauthor: A\nstatus: draft\n---\n",
      },
    ]);
    const sub = `${root}/20260401-20260430-项目启动`;
    const r = resolveSubtree(sub);
    expect(r.errors).toEqual([]);
    expect(r.files).toHaveLength(1);
    const f = r.files[0]!;
    expect(f.path).toBe("20260401-20260430-项目启动/meeting-20260415-站会纪要.md");
    expect(f.start).toBe("2026-04-01");
    expect(f.type).toBe("milestone");
  });

  it("子树的 ResolvedFile 字段与整树 walk 一致(等价对照)", () => {
    writeJson(root, "schemark.json", ROOT_CONFIG);
    writeFixture(root, [
      {
        path: "20260401-20260430-项目启动/meeting-20260415-站会纪要.md",
        content: "---\nattendees: [\"张三\"]\nduration: 10\n---\n",
      },
      {
        path: "20260501-20260531-第二期/design-x.md",
        content: "---\nauthor: A\nstatus: draft\n---\n",
      },
    ]);
    const full = resolveDirectoryTree(root);
    const sub = resolveSubtree(`${root}/20260401-20260430-项目启动`);
    const fromFull = full.files.find((f) =>
      f.path.startsWith("20260401-20260430-项目启动/"),
    );
    expect(sub.files).toHaveLength(1);
    expect(sub.files[0]).toEqual(fromFull);
  });

  it("超出向上层数(默认 3)时报 config-error", () => {
    writeJson(root, "schemark.json", { strict: false, files: {} });
    writeFixture(root, [{ path: "a/b/c/d/e/keep.txt", content: "x" }]);
    const r = resolveSubtree(`${root}/a/b/c/d/e`);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.type).toBe("config-error");
    expect(r.errors[0]!.message).toContain("未在");
    expect(r.errors[0]!.message).toContain("3 层");
  });

  it("maxUpwards=0 时只看自身", () => {
    writeJson(root, "schemark.json", { strict: false, files: {} });
    writeFixture(root, [{ path: "sub/keep.txt", content: "x" }]);
    const r = resolveSubtree(`${root}/sub`, { maxUpwards: 0 });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.type).toBe("config-error");
  });

  it("maxUpwards 可调:5 层之外仍可找到", () => {
    writeJson(root, "schemark.json", { strict: false, files: {} });
    writeFixture(root, [{ path: "a/b/c/d/keep.txt", content: "x" }]);
    const r = resolveSubtree(`${root}/a/b/c/d`, { maxUpwards: 5 });
    expect(r.errors).toEqual([]);
  });

  it("target 不存在 → config-error", () => {
    writeJson(root, "schemark.json", { strict: false, files: {} });
    const r = resolveSubtree(`${root}/missing`);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.type).toBe("config-error");
  });

  it("target 是文件 → config-error 提示仅支持子文件夹", () => {
    writeJson(root, "schemark.json", { strict: false, files: {} });
    writeFixture(root, [{ path: "a.md", content: "---\n---\n" }]);
    const r = resolveSubtree(`${root}/a.md`);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.type).toBe("config-error");
    expect(r.errors[0]!.message).toContain("子文件夹");
  });

  it("路径段未匹配且 strict=true → unmatched-directory,不再 walk", () => {
    writeJson(root, "schemark.json", ROOT_CONFIG);
    writeFixture(root, [
      {
        path: "garbage/meeting-20260415-x.md",
        content: "---\nattendees: [\"张三\"]\n---\n",
      },
    ]);
    const r = resolveSubtree(`${root}/garbage`);
    expect(r.files).toEqual([]);
    expect(r.errors.some((e) => e.type === "unmatched-directory")).toBe(true);
  });

  it("路径段未匹配且 strict=false → 不报错,也不 walk", () => {
    writeJson(root, "schemark.json", { ...ROOT_CONFIG, strict: false });
    writeFixture(root, [
      {
        path: "garbage/meeting-20260415-x.md",
        content: "---\nattendees: [\"张三\"]\n---\n",
      },
    ]);
    const r = resolveSubtree(`${root}/garbage`);
    expect(r.errors).toEqual([]);
    expect(r.files).toEqual([]);
  });

  it("路径段歧义 → ambiguous-match,不再 walk", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      directories: {
        a: { pattern: "^foo$" },
        b: { pattern: "^foo$" },
      },
    });
    writeFixture(root, [{ path: "foo/x.md", content: "---\n---\n" }]);
    const r = resolveSubtree(`${root}/foo`);
    expect(r.errors.some((e) => e.type === "ambiguous-match")).toBe(true);
    expect(r.files).toEqual([]);
  });

  it("路径段派生失败(meta-validation) → 报错,不 walk", () => {
    writeJson(root, "schemark.json", {
      strict: true,
      directories: {
        m: {
          pattern: "^x-(?<n>.+)$",
          n: { type: "integer", value: "${n}" },
          files: { f: { pattern: "^a\\.md$" } },
        },
      },
    });
    writeFixture(root, [{ path: "x-abc/a.md", content: "---\n---\n" }]);
    const r = resolveSubtree(`${root}/x-abc`);
    expect(r.errors.some((e) => e.type === "conversion")).toBe(true);
    expect(r.files).toEqual([]);
  });

  it("中间目录的 schemark.json 覆盖父级", () => {
    writeJson(root, "schemark.json", ROOT_CONFIG);
    writeJson(root, "20260401-20260430-项目启动/schemark.json", {
      strict: true,
      files: {
        retro: {
          pattern: "^retro-(?<date>\\d{8})\\.md$",
          date: { type: "string", format: "date", value: "${date}" },
        },
      },
    });
    writeFixture(root, [
      {
        path: "20260401-20260430-项目启动/retro-20260420.md",
        content: "---\n---\n",
      },
    ]);
    const r = resolveSubtree(`${root}/20260401-20260430-项目启动`);
    expect(r.errors).toEqual([]);
    expect(r.files).toHaveLength(1);
    const f = r.files[0]!;
    expect(f.date).toBe("2026-04-20");
  });

  it("子树外的兄弟错误不会被报告", () => {
    writeJson(root, "schemark.json", ROOT_CONFIG);
    writeFixture(root, [
      {
        path: "20260401-20260430-项目启动/meeting-20260415-x.md",
        content: "---\nattendees: [\"张三\"]\n---\n",
      },
      { path: "garbage-sibling/x.md", content: "---\n---\n" },
    ]);
    const r = resolveSubtree(`${root}/20260401-20260430-项目启动`);
    expect(r.errors).toEqual([]);
    expect(r.files.every((f) => f.path.startsWith("20260401-"))).toBe(true);
  });
});
