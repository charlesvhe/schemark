## Why

Schemark 规范目前只有文档和元 schema，缺乏配套工具，用户无法实际使用它来验证目录结构和提取元信息。需要实现一个命令行工具，让规范落地可用。

## What Changes

- 在 `cli/` 目录新增 Node.js CLI 工具（TypeScript 实现）
- 提供 `schemark valid` 命令：校验目录树是否符合 schemark 规范（目录命名、文件命名、frontmatter 字段）
- 提供 `schemark meta` 命令：扫描整个目录树，输出每个 Markdown 文件的派生 meta JSON

## Capabilities

### New Capabilities

- `cli-valid`: `schemark valid` 命令，遍历目录树，校验所有 `schemark.json` 配置有效性、目录/文件命名合规性、frontmatter 字段合规性，输出错误和警告
- `cli-meta`: `schemark meta` 命令，遍历目录树，对每个匹配的 Markdown 文件派生完整 meta 对象，以 JSON 格式输出

### Modified Capabilities

## Impact

- `cli/` 目录：新增完整 TypeScript 项目（`src/`、`package.json`、`tsconfig.json`、`tsup.config.ts`）
- 依赖：`gray-matter`（frontmatter 解析）、`ajv`（JSON Schema 校验）、`commander`（CLI 框架）
- 不修改 `schemark.schema.json` 和 `README.md`
