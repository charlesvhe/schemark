## 1. 准备：依赖与构建

- [x] 1.1 在 `cli/package.json` 的 `devDependencies` 中加入 `vue` 与 `element-plus`，运行 `npm install` 锁定版本
- [x] 1.2 在 `cli/package.json` 的 `files` 字段补充 `dist/static/**`，确保发布的 tarball 包含静态资源
- [x] 1.3 在 `cli/tsup.config.ts` 中加入 `onSuccess` 钩子或对应脚本，构建后将 `cli/static/` 拷到 `dist/static/`，并将 `node_modules/vue/dist/vue.global.prod.js`、`node_modules/element-plus/dist/index.full.min.js`、`node_modules/element-plus/dist/index.css` 拷到 `dist/static/vendor/`
- [x] 1.4 运行 `npm run build`，验证 `cli/dist/static/index.html`、`cli/dist/static/app.js`、`cli/dist/static/vendor/{vue.global.prod.js,index.full.min.js,index.css}` 均存在

## 2. 核心拉平逻辑

- [x] 2.1 新增 `cli/src/flatten.ts`，实现 `flattenRow(row: Record<string, unknown>): Record<string, string | number | boolean>`，规则按 `specs/web-view/spec.md` 的 "meta 数据按 1 层拉平规则展示为列"
- [x] 2.2 新增 `cli/tests/flatten.test.ts`，覆盖：顶层标量、顶层对象展开、子属性数组 stringify、子属性对象 stringify、空对象不贡献列、null/undefined 跳过
- [x] 2.3 运行 `npm run test:run -- flatten`，确认全部用例通过

## 3. 服务端：HTTP server 与 API

- [x] 3.1 新增 `cli/src/commands/web.ts`，导出 `runWeb(dir: string, options: { port: number }): Promise<{ stop: () => void }>`，使用 `node:http` 起服务，固定监听 `127.0.0.1`
- [x] 3.2 实现静态资源路由：`GET /` → `dist/static/index.html`、`GET /app.js` → `dist/static/app.js`、`GET /vendor/*` → `dist/static/vendor/*`；MIME 白名单（html/js/css/ico），所有路径必须落在 `dist/static/` 内，否则 404
- [x] 3.3 实现 `GET /api/meta`：调用 `runMeta(dir)`，响应 `{ files: result.files, skipped: result.skipped }`，整体异常时 500
- [x] 3.4 实现 `POST /api/open`：解析 JSON body 取 `path`，用 `path.resolve(dir, path)` + `path.relative(dir, resolved)` 校验是否在 `dir` 内且文件存在；按平台 spawn `open` / `xdg-open` / `cmd /c start`，命令成功 200 `{ ok: true }`，校验失败 400 `{ error: "invalid path" }`，spawn 失败 500 `{ error }`
- [x] 3.5 启动成功时 stdout 输出 `Schemark web on http://localhost:<port>`，端口占用时进程以非 0 退出码终止并提示用 `-p` 指定端口

## 4. CLI 接线

- [x] 4.1 在 `cli/src/cli.ts` 中注册 `web` 子命令：`schemark web [dir] [-p, --port <port>]`，`dir` 默认 `.`，端口默认 6789
- [x] 4.2 在 `cli/src/index.ts` 中导出 `runWeb`（与 `runMeta` / `runValid` 同级）
- [x] 4.3 验证 `schemark --help` 列出 web 子命令，`schemark web --help` 显示参数与默认值

## 5. 前端：HTML 与应用代码

- [x] 5.1 新增 `cli/static/index.html`：引入 `/vendor/index.css`、`/vendor/vue.global.prod.js`、`/vendor/index.full.min.js`、`/app.js`，含 `<div id="app">` 挂载点
- [x] 5.2 新增 `cli/static/app.js`：fetch `/api/meta`、按拉平规则展开（与 `cli/src/flatten.ts` 行为一致）、计算 `allColumns` / `hasDataColumns` / `selectedColumns`
- [x] 5.3 在 `app.js` 中渲染 `<el-select multiple>`（选项 = allColumns，初值 = hasDataColumns）+ `<el-table>`（列 = selectedColumns）
- [x] 5.4 在 `app.js` 中为 `path` 列覆写 cell slot 为可点击元素，点击触发 `POST /api/open`，成功用 `ElMessage.success`，失败用 `ElMessage.error`
- [x] 5.5 在 `app.js` 中实现 skipped 面板：当 `skipped.length > 0` 时显示 `<el-alert type="warning">` + 简表（path/type/message），否则隐藏

## 6. 端到端联调

- [ ] 6.1 `cd example && node ../cli/bin/schemark.mjs web -p 6789`，浏览器访问 `http://localhost:6789`，确认表格出现示例所有 sprint/task/bug/overview 行
- [ ] 6.2 校验默认隐藏全空列；下拉勾选一个原本全空的列后表格立刻新增该列
- [ ] 6.3 校验 `frontmatter_tags`、`frontmatter_ref-task` 等数组列以 JSON 字符串显示
- [ ] 6.4 点击某行 path，确认系统默认应用打开对应 md（macOS 至少通过）
- [ ] 6.5 在 `example/` 中临时构造一个 frontmatter 校验失败的文件，确认 skipped 面板出现且显示 path/type/message；恢复测试文件
- [ ] 6.6 关闭外网（或浏览器 DevTools 模拟离线）刷新页面，确认 Vue / Element Plus / CSS 仍能加载，表格正常
- [ ] 6.7 用 `curl -X POST http://localhost:6789/api/open -d '{"path":"../../../etc/passwd"}'` 校验 400 响应
- [ ] 6.8 端口占用场景：先起一个监听 6789 的进程，再运行 `schemark web`，确认进程退出码非 0 且 stderr 提示用 `-p` 换端口

## 7. 回归现有命令

- [ ] 7.1 运行 `cd example && node ../cli/bin/schemark.mjs valid`，确认输出 `No errors found`，退出码 0
- [ ] 7.2 运行 `cd example && node ../cli/bin/schemark.mjs meta`，与新增前的输出 diff 为空
- [ ] 7.3 运行 `cd cli && npm run test:run`，全部既有测试 + 新增 flatten 测试通过

## 8. 文档

- [ ] 8.1 在仓库根 `README.md` 增加 "Web 视图" 段落，说明 `schemark web [dir] [-p <port>]` 的用法、默认端口、离线特性
- [ ] 8.2 在 `cli/package.json` 的 `description` 中视情况补一句关于 web 视图的说明（保持一行）
