## Context

Schemark 是一个用 JSON Schema 约束 Markdown 文档仓库目录结构的规范。目前只有 `schemark.schema.json`（元 schema）和 `README.md`（规范文档），`cli/` 目录已有骨架（`package.json`、`tsconfig.json`、`tsup.config.ts`），但没有任何实现代码。

依赖已预置：`ajv` + `ajv-formats`（JSON Schema 校验）、`commander`（CLI 框架）、`gray-matter`（frontmatter 解析）、`vitest`（测试）、`tsup`（构建）。

## Goals / Non-Goals

**Goals:**
- 实现 `schemark valid`：遍历目录树校验命名合规性和 frontmatter 字段合规性，输出人类可读错误
- 实现 `schemark meta`：遍历目录树，输出每个匹配 Markdown 文件的派生 meta JSON
- 所有命令遵循 README.md 规范中的全部核心规则（逐层覆盖、类型转换、strict 模式、歧义报错等）

**Non-Goals:**
- `schemark init`、`schemark scaffold`、`schemark extract` 命令（后续另立变更实现）
- 发布到 npm
- 修改 `schemark.schema.json`

## Decisions

### D1：模块划分

```
cli/src/
  cli.ts          # commander 入口，注册子命令
  index.ts        # 公共 API 导出（供库使用）
  loader.ts       # 加载并解析 schemark.json，计算有效配置（含继承链）
  resolver.ts     # 目录树遍历，匹配规则、派生 meta
  validator.ts    # JSON Schema 校验（封装 Ajv）
  converter.ts    # 类型与值转换（规则 7）
  commands/
    valid.ts
    meta.ts
```

**为何这样划分**：`loader` 负责"读配置+继承"，`resolver` 负责"遍历+匹配+提取"，两者职责清晰，`valid` 和 `meta` 都复用 `resolver`，仅后处理不同（valid 收集错误，meta 收集 JSON）。

### D2：schemark.json 加载与继承

遍历目录树时，维护一个"继承链栈"：
- 进入目录时，若存在 `schemark.json`，加载为当前配置（完全覆盖父级预定义）
- 若不存在 `schemark.json`，从父级匹配到的 `directoryRule.directories` / `directoryRule.files` 继承
- 结果是每层目录都有一份"有效配置"（effective config），不修改原始文件

**为何不递归合并**：README 明确"完全覆盖"，合并会引入歧义。

### D3：歧义检测（规则 8）

匹配目录名/文件名时，对所有 `pattern` 依次测试，收集所有命中者。若命中数 > 1，直接抛出错误，列出冲突的 typeKey，要求用户收紧 pattern。

### D4：日期归一化（规则 7）

在 `converter.ts` 中，对 `type: "string", format: "date"` 的捕获组值：
- 8 位纯数字 `YYYYMMDD` → `YYYY-MM-DD`
- 已是 `YYYY-MM-DD` → 原样
- 其它 → 报错

### D5：valid 输出格式

每条错误输出为 `<path>: <message>`，最后汇总 `N error(s) found`。无错误时打印"No errors found"并以退出码 0 退出；有错误时退出码为 1。`--json` 标志改为输出 JSON 数组。

### D6：meta 输出格式

`schemark meta <dir>` 输出 JSON 数组，每个元素为：
```json
{ "path": "relative/path.md", "meta": {...}, "frontmatter": {...} }
```
`--output <file>` 可写入文件。

单文件出现转换失败或 meta.required 缺失时，错误输出到 stderr，该文件从结果数组中跳过，命令默认以退出码 0 完成。传入 `--strict` 时，任何跳过行为都导致退出码 1。

## Risks / Trade-offs

- [Ajv 对 `format` 默认不校验] → 需要 `ajv-formats` 并在实例化时启用 `formats: "full"`
- [gray-matter 对非标准 YAML 可能宽松解析] → frontmatter 解析结果直接交给 Ajv 校验，类型不对由 Ajv 报错
- [正则命名捕获组跨 JS 引擎差异] → 仅支持 Node.js 18+（已在 `package.json` 的 `engines` 中声明），无需兼容性垫片
- [深层嵌套目录的继承链构建复杂] → 用递归函数 + 显式参数传递"有效配置"，避免全局状态
