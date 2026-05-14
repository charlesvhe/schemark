## Context

`schemark` CLI 当前提供 `valid`（校验）与 `meta`（输出 meta JSON）两个命令，使用方需要自行写脚本或肉眼读 JSON 才能在多个 sprint / task / bug 文件之间做对比浏览。例子目录 `example/` 已经覆盖到 sprint × task × bug 等常见组合，把 meta 输出可视化能显著降低查阅成本。

现有约束：
- CLI 用 tsup 打包成纯 ESM，发布到 npm。`prepublishOnly` 会拷贝 `schemark.schema.json` 后执行 `npm run build`。
- 项目核心逻辑（loader / converter / resolver / validator）已稳定，新增功能应作为正交模块叠加，不修改既有命令行行为。
- 所有面向用户的文档、说明使用中文（项目 CLAUDE.md 要求）。
- 单文件写入 ≤ 200 行；超出时分块（项目 CLAUDE.md 要求）。

利益相关方：CLI 维护者、文档仓库使用者（产品 / 测试 / 项目经理）。

## Goals / Non-Goals

**Goals：**
- 一条命令 `schemark web` 启动本地 HTTP 服务，浏览器打开后能看到 meta 的可读表格视图。
- 默认隐藏全空列，下拉勾选可展开任意列。
- 数组与嵌套对象统一以 JSON 字符串展示，避免单元格渲染歧义。
- skipped（解析失败）的文件单独面板显示，方便定位坏数据。
- path 列点击即可在系统默认编辑器中打开源 md 文件。
- 完全离线可用：所有前端资源随 CLI 一起发布。
- 现有 `valid` / `meta` 命令零变更。

**Non-Goals：**
- 不做编辑能力；视图只读。
- 不做远程访问；服务固定监听 `localhost`，不提供 `--host` 选项。
- 不做认证 / 鉴权；进程级隔离即足够。
- 不做实时文件监听 / 自动刷新；用户手动刷新页面或重启服务。
- 不做按类型分 Tab；只做单张联合表（探索阶段已对齐）。
- 不引入推导列（如 `kind`），严格按 meta 输出拉平。
- 不引入运行时新依赖（Vue / Element Plus 仅作为 devDependency 以拷贝 UMD 文件）。

## Decisions

### 1. 命令行表面：仅 `[dir]` + `-p`，不暴露 `--host`

```
schemark web [dir] [-p, --port <port>]
```

- `dir` 默认 `.`，作为 meta 扫描根 + 静态文件 base。
- `-p` 默认 6789。
- **不提供** `--host`，固定 `127.0.0.1`。

理由：本工具是开发者本机调研用途，向 LAN 暴露需要明确的安全语义（防火墙、鉴权），不在本次范围内。固定 localhost 同时让 `/api/open`（调用系统 `open` / `xdg-open`）的安全模型变得简单：调用方只能是本机进程。

考虑过的替代方案：默认 localhost、`--host` 显式打开。否决理由是引入额外认知负担且当前没有实际需求。

### 2. 静态资源：本地 vendored UMD

将 `vue` 与 `element-plus` 加为 devDependencies，构建期把以下文件从 `node_modules` 拷到 `dist/static/vendor/`：

- `vue/dist/vue.global.prod.js`
- `element-plus/dist/index.full.min.js`（UMD 全量）
- `element-plus/dist/index.css`

`cli/static/` 内的 `index.html` 与 `app.js` 同步拷到 `dist/static/`。

理由：
- 运行时不引入 Vue / Element Plus 作为依赖（不污染用户工程的 `node_modules`）。
- UMD 通过 `<script>` 标签注入全局 `Vue` / `ElementPlus`，不需要前端构建链。
- 版本在 `cli/package.json` 中锁定，更新即 `npm update`。

考虑过的替代方案：
- **CDN（unpkg / jsdelivr）**：违反"必须能离线"。否决。
- **Vite + Element Plus 按需加载**：引入完整前端构建链，CLI 复杂度大幅上升，收益不匹配。否决。
- **手动 commit vendor 文件**：可行但版本维护差。否决。

### 3. 静态资源运行时定位

`commands/web.ts` 通过 `fileURLToPath(import.meta.url)` 推导 `dist/cli.mjs` 所在目录，再拼出 `dist/static/`。开发模式（`npm run dev` / `vitest`）下走 `cli/static/` 源目录，便于无构建迭代前端。

伪代码：

```typescript
const here = dirname(fileURLToPath(import.meta.url));
// dev: cli/src/commands/web.ts 编译输出在 dist/cli.mjs
// prod: dist/cli.mjs
const staticDir = existsSync(join(here, "static"))
  ? join(here, "static")
  : join(here, "..", "static"); // 兜底
```

实际实现以 `dist/static/` 为唯一权威路径，简化即可。开发期靠 `npm run build` 触发拷贝，无需双路径。

### 4. 服务端：纯 `node:http`，三类路由

```
GET  /                  → static/index.html
GET  /app.js            → static/app.js
GET  /vendor/*          → static/vendor/*
GET  /api/meta          → JSON: { files, skipped }
POST /api/open          → 打开源 md（body: { path }）
其他                    → 404
```

- 静态文件：白名单后缀（`.html`、`.js`、`.css`、`.ico`），按 URL path 直接拼到 `staticDir`，拒绝包含 `..` 的路径。
- `/api/meta`：调用 `runMeta(dir)`，仅取 `files` 与 `skipped`，扁平化由前端做（让后端 API 保持原始 schema）。
- `/api/open`：body 解析 `path`（相对 `dir`），`path.resolve(dir, path)` 后再用 `path.relative(dir, resolved)` 检查是否在 `dir` 内，否则 400。命中后用 `child_process.spawn`：
  - macOS：`open <file>`
  - Linux：`xdg-open <file>`
  - Windows：`cmd /c start "" <file>`

考虑过的替代方案：用第三方库 `open`。当前单文件 ~80 行实现可读且无依赖，否决。

### 5. 拉平规则在前端做

后端 `/api/meta` 透传 `files` 原始结构，前端 `app.js` 做拉平：

```
flattenRow(row):
  out = {}
  for k, v in row:
    if v 是 null/undefined: 跳过
    elif v 是 数组: out[k] = JSON.stringify(v)
    elif v 是 对象（非 null）:
      if 空对象: 跳过
      for sk, sv in v:
        if sv 是 null/undefined: 跳过
        elif sv 是 数组 或 对象（非 null）: out[`${k}_${sk}`] = JSON.stringify(sv)
        else: out[`${k}_${sk}`] = sv
    else: out[k] = v
  return out
```

理由：
- 后端 API 保留 schema 原貌，便于后续若需替换前端框架（如换成 React）不动后端契约。
- 前端展示规则集中在一处，方便迭代（比如未来要支持 `comma-join` 模式）。

但是核心拉平算法**也实现一份在 `cli/src/flatten.ts`** 并写单测：
- 这给未来可能的"导出为 CSV"或"在终端用 ASCII 表格输出"留一个共享逻辑入口。
- 若同步加 vitest 测试，也能保证规则有真实测试基线。
- 浏览器侧的 `app.js` 把同样的规则 ES5 化重写一份（不引入 esbuild），确保前后端语义一致。两者的行为以 `cli/src/flatten.ts` 为权威。

### 6. 列可见性的三层集合

```
allColumns         所有行键的并集（按出现顺序去重）
hasDataColumns     allColumns 中"至少有一行非空"的子集
selectedColumns    用户当前勾选；初值 = hasDataColumns
```

- `el-select multiple` 的选项 = `allColumns`，当前值 = `selectedColumns`。
- `el-table` 渲染列 = `selectedColumns`。
- 列顺序：按 `allColumns` 的天然顺序（`path` 在最前，`frontmatter_*`、`sprint_*`、`task_*`、`bug_*`、`overview_*` 依次）。

### 7. path 列的可点击

- 在 `el-table-column` 的 `prop="path"` 上覆写 slot，渲染为 `<a class="cell-link">{{ row.path }}</a>`。
- 点击触发 `POST /api/open`，body `{ path: row.path }`。
- 成功显示 `ElMessage.success`，失败 `ElMessage.error`。
- 不同环境无法保证打开成功（headless / WSL），错误信息透传后端 stderr。

### 8. skipped 面板

- 顶部用 `el-alert type="warning"` 显示 "有 N 个文件解析失败"，带"展开"按钮。
- 展开后是简表（path / type / message），无操作。
- 无 skipped 项时整个面板隐藏。

### 9. 错误响应格式

```
GET /api/meta:
  200 { files, skipped }                # 正常 / 部分失败都走 200
  500 { error: string }                 # runMeta 整体抛出（罕见）

POST /api/open:
  200 { ok: true }
  400 { error: "invalid path" }         # 缺 path / 不在 dir 内 / 不存在
  500 { error: <spawn 错误信息> }
```

## Risks / Trade-offs

- **发布体积膨胀 ~1.5MB**：Element Plus + Vue UMD 文件较大。可接受，CLI 工具非热路径，npm tarball ~1.5MB 仍属常见量级。
- **浏览器无构建工具，前端代码体验略差**：单文件 ES2020 + 全局 Vue/ElementPlus，调试可用 DevTools，但没有 HMR。本命令是只读视图，迭代频率低，可接受。
- **`/api/open` 安全边界**：仅 localhost 监听 + 严格 path 校验（必须落在 `dir` 内，且对应文件需存在）。没有鉴权，但本地工具默认假设进程内信任。Mitigation：明确文档化"勿在不可信环境运行"。
- **拉平逻辑前后端各一份**：维护成本是真实存在的。Mitigation：以 `cli/src/flatten.ts` 为权威 + 单测；前端实现保持极简（< 30 行），并加注释指向源头规则。
- **跨平台 open 行为差异**：macOS / Linux / Windows 各用不同 spawn 命令，需要平台分支。少量代码，但需在三类平台至少各做一次手测。当前迭代仅强制要求 macOS（开发机）通过；Linux/Windows 失败时 API 返回明确 stderr，不影响主体功能。
- **同时跑多个实例 / 端口冲突**：6789 被占用时启动失败，错误信息提示用户用 `-p` 换端口即可。无自动选端口逻辑。

## Migration Plan

无运行时数据迁移。发布步骤：

1. 在 `cli/` 安装新增 devDeps：`npm i -D vue element-plus`。
2. 提交 `cli/static/`、`cli/src/commands/web.ts`、`cli/src/flatten.ts`。
3. 调整 `cli/tsup.config.ts` 增加 vendor 拷贝逻辑。
4. 发布新版本 patch / minor（取决于发布节奏，命令本身是新增，无 BREAKING）。
5. 用户升级后 `schemark web` 可用。

回滚：发版后若发现严重问题，发布回退版本即可；命令是纯新增，不影响 `valid` / `meta`。

## Open Questions

- **是否需要 zh-cn locale**：当前主表只用 `el-select` + `el-table`，UI 文本由数据本身贡献，默认英文 locale 足够。如果后续加分页 / 日期选择再引入。
- **`/api/meta` 是否要支持参数化** 限定只看某个 sprint：v1 不做，靠前端筛选已足够。
- **是否在 Ctrl+C 退出时打印停止信息**：列入实现细节，命令侧打印 `Stopped.` 即可。
