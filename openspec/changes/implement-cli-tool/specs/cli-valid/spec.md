## ADDED Requirements

### Requirement: 校验 schemark.json 配置合法性
`schemark valid [dir]` 命令 SHALL 遍历目录树，对每个找到的 `schemark.json` 用元 schema 进行 JSON Schema 校验，报告配置文件本身的错误。

#### Scenario: 合法配置无错误
- **WHEN** 目录下所有 `schemark.json` 均符合元 schema
- **THEN** 工具打印"No errors found"并以退出码 0 退出

#### Scenario: 配置文件格式非法
- **WHEN** 某 `schemark.json` 不符合元 schema（如缺少必填字段、类型错误）
- **THEN** 工具输出该文件路径和具体错误信息，以退出码 1 退出

### Requirement: 校验目录命名合规性
在 strict 模式下，`schemark valid` SHALL 检查每个受 schemark 管理目录的直接子目录，报告未被任何 `directories.<typeKey>.pattern` 匹配的子目录。

#### Scenario: 未匹配子目录报错
- **WHEN** 某子目录名称不匹配任何已声明 pattern，且当前目录的有效配置 strict 为 true
- **THEN** 输出该目录路径和"unmatched directory"错误

#### Scenario: strict 为 false 时忽略未匹配
- **WHEN** 有效配置的 strict 为 false
- **THEN** 未匹配子目录不报错，工具继续遍历

### Requirement: 校验文件命名合规性
在 strict 模式下，`schemark valid` SHALL 检查每个受 schemark 管理目录的直接子文件，报告未被任何 `files.<typeKey>.pattern` 匹配的 Markdown 文件（非 Markdown 文件忽略）。

#### Scenario: 未匹配 Markdown 文件报错
- **WHEN** 某 `.md` 文件名称不匹配任何已声明 pattern，且有效配置 strict 为 true
- **THEN** 输出该文件路径和"unmatched file"错误

### Requirement: 校验 frontmatter 字段合规性
`schemark valid` SHALL 对每个匹配文件读取其 YAML frontmatter，按对应 `files.<typeKey>.frontmatter.fields` 进行 JSON Schema 校验，并检查 `required` 字段是否存在。

#### Scenario: frontmatter 字段缺失
- **WHEN** `frontmatter.required` 中声明的字段在 YAML 块中不存在
- **THEN** 输出该文件路径和"missing required frontmatter field: <field>"错误

#### Scenario: frontmatter 必填字段值为空字符串
- **WHEN** `frontmatter.required` 中声明的字段在 YAML 块中存在但值为空字符串
- **THEN** 输出该文件路径和"missing required frontmatter field: <field>"错误（空字符串等同于缺失）

#### Scenario: frontmatter 字段类型错误
- **WHEN** frontmatter 字段值不符合对应 JSON Schema 约束
- **THEN** 输出该文件路径和 JSON Schema 校验错误详情

### Requirement: 检测 pattern 歧义
`schemark valid` SHALL 在扫描过程中检测同一目录下多条 pattern 同时匹配同一条目（目录或文件）的情况并报错。

#### Scenario: 文件名同时匹配多条规则
- **WHEN** 某文件名同时被 `files` 下两条或以上 pattern 匹配
- **THEN** 输出该文件路径和"ambiguous match"错误，列出冲突的 typeKey

#### Scenario: 目录名同时匹配多条规则
- **WHEN** 某子目录名同时被 `directories` 下两条或以上 pattern 匹配
- **THEN** 输出该目录路径和"ambiguous match"错误，列出冲突的 typeKey

### Requirement: 支持 JSON 格式输出
`schemark valid --json` SHALL 将所有错误以 JSON 数组格式输出到 stdout，每条错误包含 `path`、`message`、`type` 字段。

#### Scenario: JSON 输出格式正确
- **WHEN** 用户传入 `--json` 标志
- **THEN** stdout 输出合法 JSON 数组，每个元素含 path、message、type 字段
