## ADDED Requirements

### Requirement: 扫描目录树派生完整 meta
`schemark meta [dir]` 命令 SHALL 遍历目录树，对每个被规则匹配的 Markdown 文件，依照 README 规范派生完整 meta 对象（路径来源的 meta + frontmatter 字段），以 JSON 数组格式输出到 stdout。

#### Scenario: 正常扫描输出
- **WHEN** 用户在含有 `schemark.json` 的目录运行 `schemark meta`
- **THEN** stdout 输出 JSON 数组，每个元素包含 `path`（相对路径）、`meta`（命名空间树）、`frontmatter`（提取的字段）

#### Scenario: 无匹配文件时输出空数组
- **WHEN** 目录中没有被规则匹配的 Markdown 文件
- **THEN** stdout 输出 `[]`

### Requirement: meta 中自动注入 type 字段（仅文件）
派生时，`meta.<namespace>.type` SHALL 自动设为匹配的 `typeKey`，默认 namespace 为 `file`。

#### Scenario: type 自动注入
- **WHEN** 文件匹配 `files.meeting` 且 meta namespace 为 `file`
- **THEN** 派生结果中 `meta.file.type === "meeting"`

### Requirement: 按规则 7 做类型与值转换
派生 meta 前，`schemark meta` SHALL 对捕获组值按 `meta.fields` 中声明的 `type` 和 `format` 进行转换，转换失败时输出错误到 stderr 并跳过该文件。

#### Scenario: YYYYMMDD 日期归一化
- **WHEN** 捕获组值为 `"20260415"` 且字段声明 `type: "string", format: "date"`
- **THEN** 派生结果中该字段值为 `"2026-04-15"`

#### Scenario: 非法类型转换跳过文件
- **WHEN** 捕获组值无法转换为声明的 `type`（如 `type: "integer"` 但值为 `"abc"`）
- **THEN** 将错误输出到 stderr，该文件不出现在 JSON 输出数组中，命令以退出码 0 完成

#### Scenario: --strict 模式下转换失败退出码为 1
- **WHEN** 存在转换失败的文件且用户传入 `--strict` 标志
- **THEN** 命令以退出码 1 退出

### Requirement: meta.required 捕获组必填校验
`schemark meta` SHALL 在派生 meta 时检查 `meta.required` 中声明的捕获组，若命中后值为空字符串，SHALL 视为缺失并报错。

#### Scenario: 必填捕获组值为空字符串
- **WHEN** pattern 命中但某个在 `meta.required` 中声明的捕获组值为空字符串
- **THEN** 将"missing required capture group: <field>"错误输出到 stderr，该文件不出现在 JSON 输出数组中

### Requirement: 支持写入文件
`schemark meta --output <file>` SHALL 将 JSON 输出写入指定文件而不是 stdout。

#### Scenario: 写入输出文件
- **WHEN** 用户传入 `--output result.json`
- **THEN** JSON 数组写入 `result.json`，stdout 打印成功消息

### Requirement: 检测 namespace 冲突
当路径上多条规则的 meta 字段产生 namespace 键名冲突时，`schemark meta` SHALL 报错，而不是隐式覆盖。

#### Scenario: 无 namespace 的多条规则键名冲突
- **WHEN** 多条目录/文件规则都没有声明 namespace，且捕获组键名相同
- **THEN** 报告 namespace 冲突错误，不输出该文件的 meta
