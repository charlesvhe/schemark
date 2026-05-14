## ADDED Requirements

### Requirement: web 子命令存在并可启动本地服务器

CLI SHALL 提供 `schemark web [dir] [-p, --port <port>]` 子命令，启动一个 HTTP 服务器，仅监听 `127.0.0.1`。`dir` 默认 `.`，端口默认 6789。

#### Scenario: 默认参数启动

- **WHEN** 用户在工作目录执行 `schemark web`
- **THEN** CLI 在 `127.0.0.1:6789` 启动 HTTP 服务器，并向 stdout 输出形如 `Schemark web on http://localhost:6789` 的提示

#### Scenario: 通过 -p 指定端口

- **WHEN** 用户执行 `schemark web example -p 8080`
- **THEN** CLI 在 `127.0.0.1:8080` 启动服务器，扫描根设为 `example`

#### Scenario: 端口被占用

- **WHEN** 端口已被其他进程占用
- **THEN** CLI 进程以非 0 退出码终止，stderr 输出包含端口与建议（"换用 -p 指定其他端口"）

#### Scenario: 不绑定外部网络

- **WHEN** `schemark web` 已启动
- **THEN** 仅 `127.0.0.1` / `localhost` 上的客户端能连接成功；CLI 不接受 `--host` 选项

### Requirement: GET /api/meta 返回 meta 与 skipped

服务器 SHALL 提供 `GET /api/meta`，返回当前 `dir` 的 `runMeta` 结果（不向磁盘写文件）。响应体为 JSON，结构为 `{ files: ResolvedFile[], skipped: SkippedItem[] }`，其中 `SkippedItem` 至少包含 `path`、`type`、`message` 字段。

#### Scenario: 正常解析

- **WHEN** 客户端请求 `GET /api/meta`，且目录树解析无错误
- **THEN** 响应 200，`files` 是与 `schemark meta` 相同结构的数组，`skipped` 为空数组

#### Scenario: 部分文件解析失败

- **WHEN** 部分文件因 `conversion` / `template-undefined-capture` / `template-syntax` / `meta-validation` 等原因被跳过
- **THEN** 响应 200，`files` 仅包含成功解析项，`skipped` 列出失败项及其 `type`、`message`

#### Scenario: runMeta 抛出异常

- **WHEN** 调用 `runMeta` 整体失败（如根目录不存在）
- **THEN** 响应 500，body 为 `{ error: <描述> }`

### Requirement: POST /api/open 在系统默认应用中打开源 md

服务器 SHALL 提供 `POST /api/open`，请求体 JSON `{ path: string }`，path 是相对 `dir` 的路径。服务器 MUST 在解析为绝对路径后校验仍然落在 `dir` 内，若校验失败或文件不存在则拒绝。校验通过后用系统默认应用打开（macOS `open`、Linux `xdg-open`、Windows `cmd /c start`）。

#### Scenario: 打开仓库内已存在的 md 文件

- **WHEN** 客户端 POST `/api/open`，body 为 `{ "path": "20260101-.../T0001-...md" }`，文件存在
- **THEN** 服务器 spawn 系统打开命令，响应 200 `{ ok: true }`

#### Scenario: path 越界

- **WHEN** body path 为 `"../../etc/passwd"` 或解析后落在 `dir` 之外
- **THEN** 响应 400 `{ error: "invalid path" }`，不调用任何 spawn

#### Scenario: 文件不存在

- **WHEN** path 落在 `dir` 内但文件不存在
- **THEN** 响应 400 `{ error: "invalid path" }`

#### Scenario: 系统命令失败

- **WHEN** spawn 系统命令的退出码非 0
- **THEN** 响应 500 `{ error: <stderr 摘要> }`

### Requirement: 静态资源离线可用

服务器 SHALL 在 `GET /`、`GET /app.js`、`GET /vendor/*` 等路径下提供完全离线可用的静态资源（HTML / JS / CSS）；这些资源必须在发布的 npm tarball 中存在，运行时不通过网络从 CDN 加载。

#### Scenario: 断网状态下访问首页

- **WHEN** 主机断开外网，客户端访问 `http://localhost:6789/`
- **THEN** 页面、Vue、Element Plus 与样式全部加载成功，表格能渲染

#### Scenario: 静态文件路径越界

- **WHEN** 客户端请求 `GET /vendor/../../../../../etc/passwd`
- **THEN** 响应 404，不返回任何 `dist/static/` 之外的文件

### Requirement: 现有 valid / meta 命令不受影响

新增 `web` 子命令 MUST NOT 改变 `schemark valid` 与 `schemark meta` 的输入参数、退出码、输出内容。

#### Scenario: meta 命令回归

- **WHEN** 在新增 `web` 后执行 `schemark meta example`
- **THEN** stdout JSON 与新增前的 baseline 完全一致

#### Scenario: valid 命令回归

- **WHEN** 执行 `schemark valid example`
- **THEN** 退出码与输出内容与新增前一致
