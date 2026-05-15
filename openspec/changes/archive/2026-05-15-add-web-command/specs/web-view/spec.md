## ADDED Requirements

### Requirement: meta 数据按"1 层拉平"规则展示为列

前端 SHALL 把 `/api/meta` 返回的每个 `files` 元素拉平为一行表格记录。拉平规则：

- 顶层标量值：列名 = key（不前缀）。
- 顶层对象值：展开 1 层为 `${key}_${subkey}` 列。
- 子属性值若为 数组 或 对象（非 null），列值 MUST 为 `JSON.stringify(value)`。
- 顶层对象为 `{}` 时不贡献任何列。
- 值为 `null` 或 `undefined` 时不贡献列（保持稀疏）。
- 不引入推导列（如 `kind`），严格按 meta 输出拉平。

#### Scenario: 顶层标量保留为单列

- **WHEN** 行数据有 `path: "a/b.md"`
- **THEN** 拉平后含列 `path = "a/b.md"`

#### Scenario: 顶层对象按 1 层展开

- **WHEN** 行数据有 `sprint: { type: "sprint", name: "S1" }`
- **THEN** 拉平后含 `sprint_type = "sprint"`、`sprint_name = "S1"`

#### Scenario: 子属性为数组时 JSON.stringify

- **WHEN** 行数据有 `frontmatter: { tags: ["a", "b"] }`
- **THEN** 拉平后含 `frontmatter_tags = '["a","b"]'`（字符串字面量含双引号与方括号）

#### Scenario: 子属性为对象时 JSON.stringify

- **WHEN** 行数据有 `frontmatter: { meta: { author: "x" } }`
- **THEN** 拉平后含 `frontmatter_meta = '{"author":"x"}'`，不再向下展开

#### Scenario: 顶层对象为空不贡献列

- **WHEN** 行数据有 `overview: {}` 或 `frontmatter: {}`
- **THEN** 拉平结果不包含任何 `overview_*` / `frontmatter_*` 列

#### Scenario: null / undefined 值跳过

- **WHEN** 行数据有 `frontmatter: { tags: null, owner: "x" }`
- **THEN** 拉平结果含 `frontmatter_owner = "x"`，不含 `frontmatter_tags`

### Requirement: 单张联合表 + 列可见性下拉

前端 SHALL 用单张 `<el-table>` 展示所有拉平后的行；列集合 = 所有行键的并集，按出现顺序去重。页面 MUST 提供一个 `<el-select multiple>` 下拉，选项为全部列；初值为"至少有一行非空值"的列子集（即默认隐藏全空列）。`el-table` 渲染列与 `el-select` 当前值联动。

#### Scenario: 默认隐藏全空列

- **WHEN** 某列在所有行中都没有值
- **THEN** 该列不在 `el-select` 的初始勾选中，也不出现在表格中；但仍出现在下拉选项中可手动勾选

#### Scenario: 用户取消勾选某列

- **WHEN** 用户在下拉中取消勾选 `frontmatter_tags`
- **THEN** 表格立即不再渲染该列

#### Scenario: 用户勾选一个原本全空的列

- **WHEN** 用户在下拉中勾选一个全空列
- **THEN** 表格新增该列，所有行该列单元格为空

### Requirement: skipped 文件单独面板展示

前端 SHALL 当 `/api/meta` 返回的 `skipped` 数组非空时显示一个独立面板，含每个 skipped 项的 `path`、`type`、`message`。面板与主表分离。`skipped` 为空时面板隐藏。

#### Scenario: 有 skipped 项

- **WHEN** `/api/meta` 返回 `skipped: [{ path: "x.md", type: "meta-validation", message: "..." }]`
- **THEN** 页面顶部出现警告样式面板，可展开查看 path / type / message

#### Scenario: 无 skipped 项

- **WHEN** `/api/meta` 返回 `skipped: []`
- **THEN** 页面不渲染 skipped 面板

### Requirement: path 列点击打开源 md

前端 SHALL 把表格中 `path` 列单元格渲染为可点击元素（链接样式）。点击 MUST 触发 `POST /api/open`，body 为 `{ path: <该行 path 值> }`。后端响应 200 时显示成功反馈（`ElMessage.success`），4xx / 5xx 显示失败反馈（`ElMessage.error`，含错误信息）。

#### Scenario: 点击成功

- **WHEN** 用户点击某行 path 单元格，且后端返回 200
- **THEN** 页面顶部出现 success 提示，系统默认应用打开对应 md 文件

#### Scenario: 点击失败（路径校验失败 / 命令出错）

- **WHEN** 后端返回 4xx 或 5xx
- **THEN** 页面顶部出现 error 提示，提示文本包含后端返回的 `error` 字段

### Requirement: 离线渲染

前端页面与依赖（Vue、Element Plus、CSS）MUST 由本地服务器同源提供，断网状态下渲染必须正常。

#### Scenario: 断网首次访问

- **WHEN** 主机断网，浏览器首次访问 `http://localhost:6789/`
- **THEN** 表格、下拉、面板均能正常渲染（无 CDN 请求）
