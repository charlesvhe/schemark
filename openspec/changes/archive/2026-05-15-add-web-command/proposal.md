## Why

`schemark meta` 当前只能输出 JSON，要在多个文件之间快速浏览、对比 sprint / task / bug 元数据需要肉眼读 JSON 或自己写脚本。引入一个本地 web 视图，把 meta 输出渲染成可筛选、可点击的表格，能显著降低查阅成本，也便于在评审、对账等场景里直接打开源 md。

## What Changes

- 新增 `schemark web [dir]` 子命令，启动本地 HTTP 服务器（默认端口 6789，可通过 `-p` 覆盖），仅监听 `localhost`。
- 服务端提供 `/api/meta` 端点，复用现有 `runMeta(dir)` 逻辑（不写文件），把 `files` 与 `skipped` 一并返回。
- 服务端提供 `/api/open` 端点，根据相对路径用系统默认应用打开源 md 文件，路径必须落在 `dir` 内，否则拒绝。
- 静态资源（HTML / 前端 JS / Vue / Element Plus UMD / CSS）随 CLI 一起发布，运行时离线可用。
- 前端使用 Vue 3 + Element Plus，单张联合表展示 meta 数据；列由所有行键的并集构成；默认隐藏全空列；下拉框支持手动勾选展示哪些列。
- 拉平规则：仅向下展开 1 层；顶层标量列名 = key；顶层对象展开为 `${key}_${subkey}` 列；数组或嵌套对象用 `JSON.stringify` 转字符串；空对象与 `null`/`undefined` 不贡献列。
- skipped 文件单独面板展示（含 path / type / message）。
- path 列单元格可点击，点击后请求 `/api/open` 在系统默认应用中打开源 md。
- 现有 `valid` / `meta` 命令行为不变。

## Capabilities

### New Capabilities
- `cli-web`：`schemark web` 子命令的命令行入口、本地 HTTP 服务器、`/api/meta` 与 `/api/open` 端点契约。
- `web-view`：浏览器端的渲染契约，包括拉平规则、列可见性、单张联合表、skipped 面板、path 列点击行为。

### Modified Capabilities
（无）

## Impact

- 新增源码：`cli/src/commands/web.ts`、`cli/src/flatten.ts`、`cli/static/index.html`、`cli/static/app.js`、`cli/static/vendor/*`。
- 修改 `cli/src/cli.ts`：注册 `web` 子命令。
- 修改 `cli/package.json`：新增 `vue`、`element-plus` 作为 devDependencies；`files` 字段补充 `dist/static/**`。
- 修改 `cli/tsup.config.ts`：构建时把 `cli/static/` 拷到 `dist/static/`，并将 `node_modules` 内的 Vue / Element Plus UMD 与 CSS 文件拷到 `dist/static/vendor/`。
- 发布 tarball 体积增加约 1.5MB（Vue + Element Plus UMD/CSS）。
- README 增加 `web` 命令使用说明。
- 不引入新的运行时依赖；服务端仅使用 Node `node:http`、`node:fs`、`node:path`、`node:child_process` 等标准库。
