# Schemark

**用 JSON Schema 约束 Markdown 文档仓库的目录结构、文件命名与 Frontmatter,并从路径、文件名中通过模板插值派生元信息。**

> 命名由来:**Sche**ma + Mark**down** = **Schemark**。

> ⚠️ **Schema v2 重写中**:本文档对应的 `schemark.schema.json` 已升级为 v2(模板插值、删除 namespace、frontmatter 改用标准 JSON Schema)。`cli/` 下的实现仍按 v1 工作,代码迁移作为后续任务跟进。

---

## 核心思想

每个目录可以放一份 `schemark.json`,用它声明:

1. **本目录下允许哪些子目录** — 用正则匹配目录名,从命名中提取捕获组
2. **子目录的内部结构** — 可以在 `directories.<key>` 内嵌套定义 `directories` / `files`,预先声明孙子辈结构
3. **本目录下允许哪些文件** — 用正则匹配文件名,从命名中提取捕获组
4. **派生哪些 meta 字段** — 在规则对象上直接写字段名,通过 `${captureGroupName}` 模板插值组合捕获组得到字段值
5. **从 Frontmatter 提取哪些字段** — 通过 `frontmatter` 写一段标准 JSON Schema(Draft 2020-12 子集),约束 MD 文件的 YAML 块

**逐层覆盖规则**:

- 父级 `schemark.json` 可以预定义子目录的内部结构(通过嵌套 `directories` / `files`)
- 如果子目录实际存在自己的 `schemark.json`,则**完全覆盖**父级的预定义
- 如果子目录没有 `schemark.json`,则继承父级的嵌套定义

**"完全覆盖"的含义**:

子目录的 `schemark.json` 独立声明该目录下的 `directories` 和 `files`,父级嵌套定义中同层级的所有规则**整体作废**,不做字段级合并。例如父级预定义了 `meeting` 和 `design` 两种文件类型,子级只声明了 `retrospective`,则该子目录下 `meeting` 和 `design` 均不再合法——子级配置是完整的、自洽的规则集,而非父级的补丁。

这样设计的理由:局部合并会使"哪条规则生效"取决于父子两份文件的同时阅读,难以推断;完全覆盖使每个目录的有效规则只需读该目录(或最近祖先)的一份 `schemark.json` 即可确定,降低心智负担,也消除了合并语义的歧义(如同名 typeKey 冲突时以谁为准)。

最终,每个 Markdown 文件都能获得一份**从路径派生的 meta + 从 Frontmatter 提取的字段**,形成完整的文档元数据。派生结果是**运行时产物**,不会被写回 MD 文件本身。

---

## 快速示例

### 目录结构

```
docs/
├── schemark.json                              ← 根配置
├── 20260401-20260430-项目启动/
│   ├── schemark.json                          ← 项目启动里程碑配置(可选)
│   ├── meeting-20260415-站会纪要.md
│   ├── design-用户登录模块.md
│   └── adr-001-选择数据库.md
└── 20260501-20260531-第一次迭代/
    └── ...
```

### 根配置:`docs/schemark.json`

```json
{
  "$schema": "https://schemark.dev/schemark.schema.json",
  "strict": true,
  "directories": {
    "milestone": {
      "pattern": "^(?<start>\\d{8})-(?<end>\\d{8})-(?<name>.+)$",
      "type": "milestone",
      "start": { "type": "string", "format": "date", "value": "${start}" },
      "end":   { "type": "string", "format": "date", "value": "${end}" },
      "name":  "${start}-${name}",
      "files": {
        "meeting": {
          "pattern": "^meeting-(?<date>\\d{8})-(?<title>.+)\\.md$",
          "date": { "type": "string", "format": "date", "value": "${date}" },
          "name": "meeting-${title}",
          "frontmatter": {
            "properties": {
              "attendees": { "type": "array", "items": { "type": "string" } },
              "tags":      { "type": "array", "items": { "type": "string" } },
              "duration":  { "type": "integer", "minimum": 0 }
            },
            "required": ["attendees"]
          }
        }
      }
    }
  }
}
```

**关键点解读:**

- `directories.milestone` 中,**保留键**只有 `pattern` / `required` / `directories` / `files`;其余 `type` / `start` / `end` / `name` 都是**派生 meta 字段**。
- `pattern` 中的命名捕获组 `(?<start>...)` / `(?<end>...)` / `(?<name>...)` 通过 `${start}` / `${end}` / `${name}` 在字段值里被引用。
- `"type": "milestone"` 不含 `${...}`,是字面常量,直接作为 `milestone.type` 输出。
- `"start": { ..., "value": "${start}" }` 是**对象形式**:模板插值后,工具按 `type: "string", format: "date"` 把 `"20260401"` 归一化为 `"2026-04-01"`,并用整段 JSON Schema 校验。
- `"name": "${start}-${name}"` 是**字符串模板**:把两个捕获组拼接,得到形如 `"20260401-项目启动"` 的字符串,不做类型转换,也不做额外校验。
- `files.meeting.frontmatter` 是**标准 JSON Schema**(`type: "object"` 隐含),用 `properties` / `required` 声明 YAML frontmatter 中的字段,对工具透明地交给 JSON Schema 校验器。

### 子级覆盖:`docs/20260401-20260430-项目启动/schemark.json`

如果某个里程碑目录需要**覆盖**父级的预定义,可以创建自己的 `schemark.json`:

```json
{
  "$schema": "https://schemark.dev/schemark.schema.json",
  "strict": true,
  "files": {
    "meeting": {
      "pattern": "^meeting-(?<date>\\d{8})-(?<title>.+)\\.md$",
      "date": { "type": "string", "format": "date", "value": "${date}" },
      "name": "meeting-${title}",
      "frontmatter": {
        "properties": {
          "attendees": { "type": "array", "items": { "type": "string" } },
          "duration":  { "type": "integer", "minimum": 0 },
          "location":  { "type": "string" }
        },
        "required": ["attendees", "location"]
      }
    },
    "retrospective": {
      "pattern": "^retro-(?<date>\\d{8})\\.md$",
      "date": { "type": "string", "format": "date", "value": "${date}" },
      "frontmatter": {
        "properties": {
          "participants": { "type": "array", "items": { "type": "string" } },
          "action-items": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}
```

**效果:**

- 完全覆盖父级 `directories.milestone.files` 的预定义。
- 这个里程碑目录下只允许 `meeting-*.md`(但 frontmatter 必填字段不同)和 `retro-*.md`,不再允许其它。

### 派生的 meta

文件 `docs/20260401-20260430-项目启动/meeting-20260415-站会纪要.md` 被解析后:

假设文件的 Frontmatter 为:

```yaml
---
attendees: ["张三", "李四"]
tags: ["daily"]
duration: 30
---
```

派生结果:

```json
{
  "path": "docs/20260401-20260430-项目启动/meeting-20260415-站会纪要.md",
  "type": "milestone",
  "start": "2026-04-01",
  "end": "2026-04-30",
  "date": "2026-04-15",
  "name": "meeting-站会纪要",
  "frontmatter": {
    "attendees": ["张三", "李四"],
    "tags": ["daily"],
    "duration": 30
  }
}
```

**关键点:**

- 命中的每条规则把其 meta 字段**直接拉平到顶层**,不再按 typeKey 分组
- 父子规则字段名相同时,**深层(子级)规则覆盖浅层(父级)规则**(此处 `meeting.name` 覆盖 `milestone.name`,故 `name = "meeting-站会纪要"`)
- `frontmatter` 是固定保留键,与拉平后的字段平级,其内部结构**不**参与拉平
- 字段值由 `${...}` 模板插值得到,然后按字段声明做类型转换与校验

---

## 字段说明

### `schemark.json` 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `$schema` | string | 否 | 指向元 schema,启用 IDE 补全 |
| `strict` | boolean | 否(默认 `true`) | 是否禁止未声明的子条目 |
| `directories` | object | 否 | 子目录规则集合,key 为 typeKey(kebab-case) |
| `files` | object | 否 | 子文件规则集合,key 为 typeKey(kebab-case) |

### 规则对象的"保留键"

规则对象上有几个键被工具特殊解释,**其余任意 key 都被视为派生 meta 字段定义**。

| 键 | 适用 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `pattern` | dir / file | string | **是** | JS 风格正则,可含命名捕获组 |
| `required` | dir / file | boolean | 否(默认 `false`) | `true` 表示父目录下至少存在一个匹配项 |
| `directories` | 仅 dir | object | 否 | 嵌套预定义子目录规则;子目录有自己的 `schemark.json` 时被完全覆盖 |
| `files` | 仅 dir | object | 否 | 嵌套预定义子文件规则;同上 |
| `frontmatter` | 仅 file | object | 否 | 标准 JSON Schema(`type: "object"` 隐含),约束 MD 的 YAML 块 |

### typeKey

`directories` / `files` 下的 key 称为 typeKey,要求:

- kebab-case:`^[a-z][a-z0-9-]*$`
- 不能为字面 `frontmatter`(避免与派生输出键冲突)
- **解析路径上必须唯一**:从根 `schemark.json` 经过命中的每一层 `directories` / `files`,最后到命中的文件规则,这条链上出现的所有 typeKey 不能重复。重复 = 工具报错。这样每个 typeKey 在派生 meta 中都有确定的归属。

### meta 字段的两种值形式

#### 形式 A:字符串(常量或模板)

```json
"type": "milestone",
"name": "${start}-${name}"
```

- 不含 `${...}` → 字面常量,原样输出
- 含 `${...}` → 模板,插值后得到字符串,**不做类型转换、不做额外校验**

#### 形式 B:对象(JSON Schema + value 模板)

```json
"start": {
  "type": "string",
  "format": "date",
  "value": "${start}"
}
```

- `value`(必填):模板字符串
- 其它键为标准 JSON Schema 关键字(`type` / `format` / `enum` / `pattern` / `minimum` / `maximum` / `minLength` / `maxLength` / `description` 等)
- 工具流程:模板插值 → 按 `type`/`format` 类型转换 → 用整个对象做 JSON Schema 校验

### `frontmatter` 字段

`frontmatter` 直接是一段 JSON Schema,描述 MD 文件 YAML frontmatter 这个**对象**本身。`type: "object"` 隐含,用户不写。

```json
"frontmatter": {
  "properties": {
    "attendees": { "type": "array", "items": { "type": "string" } },
    "duration":  { "type": "integer", "minimum": 0 },
    "status":    { "type": "string", "enum": ["draft", "review", "approved"] }
  },
  "required": ["attendees"],
  "additionalProperties": false
}
```

支持的 JSON Schema 关键字包括但不限于:`properties` / `required` / `additionalProperties` / `oneOf` / `anyOf` / `allOf` / `description`,以及标准 JSON Schema Draft 2020-12 的全部其它关键字。其它标准 JSON Schema 关键字工具应原样转交给底层校验器,不做特殊处理。

---

## 核心规则

### 1. 模板插值 `${captureGroupName}`

- 仅引用**本规则 `pattern` 中的命名捕获组**,不能跨规则引用父规则的捕获组
- 字面 `$` 用 `$$` 转义
- 字符串形式与对象形式的 `value` 都支持模板

### 2. 类型转换表(仅形式 B)

捕获组得到的中间值永远是字符串。工具在 JSON Schema 校验之前按 `type`/`format` 做下列**确定性转换**:

| 声明 | 转换方式 |
|---|---|
| `string`(默认) | 原样保留 |
| `string` + `format: "date"` | 识别 `YYYYMMDD`(8 位数字)与 `YYYY-MM-DD`,均归一化为 `YYYY-MM-DD`;其它格式不做猜测,需要用户自行用 `pattern` 约束 |
| `string` + 其它 `format` | 原样保留,交给 JSON Schema 的 format 校验 |
| `integer` / `number` | 用 `Number()` 解析;无法解析或得到 `NaN` 时报错。**前导零会被丢弃**(`"007"` → `7`),如需保留请用 `string` + `pattern` |
| `boolean` | `"true"` → `true`,`"false"` → `false`,其它字符串报错 |
| `array` / `object` / `null` | **不允许**用于 meta 字段(模板结果天然是字符串)——若声明则视为配置错误 |

**Frontmatter 字段不做模板插值,也不做类型转换**:YAML 解析器已经给出原生类型,工具直接把解析结果交给 JSON Schema 校验。

### 3. 派生 meta 输出结构

输出对象顶层固定包含 `path`(文件相对路径)和 `frontmatter`(YAML 解析结果),其余字段由命中的规则**直接拉平到顶层**:

- 从根到文件,解析路径上命中的每条规则(目录规则 + 文件规则)的 meta 字段**全部合并到同一层**
- 父子规则字段名相同时,**深层(子级)规则静默覆盖浅层(父级)规则**
- `frontmatter` 不参与拉平,始终作为独立对象保留
- 若 meta 字段的值本身是对象(形式 B),该对象内部**不**递归拉平,只拉平一层

不再使用 `namespace`,不再自动注入 `type`。如果你想让消费者通过 `type` 字段判断节点类型,自己在规则里写 `"type": "<typeKey>"` 即可。

### 4. `required: true` 的语义

- 写在规则上(`directories.<key>` 或 `files.<key>`),表示**父目录下必须至少存在一个匹配该 `pattern` 的子条目**
- 不要求每一个潜在的"可枚举值"都存在(那由 `pattern` 自身决定可枚举性)
- 默认 `false`

注意:`frontmatter` 内部也可以有 `required`(标准 JSON Schema 用法),那是约束 YAML 块里的字段;与规则级的 `required` 是两件事。

### 5. `strict` 模式

- `strict: true`(默认):未被规则匹配的子条目 = 非法
- `strict: false`:未匹配条目合法,但不参与 meta 派生
- **不跨文件继承**:每个 `schemark.json` 的 `strict` 仅作用于其所在目录的直接子条目;父子目录的 `schemark.json` 之间互不传播

### 6. 同一目录下多规则的匹配优先级

`directories` / `files` 下的多个规则被视为**互斥分类**,而不是优先级链。

- 若一个目录名 / 文件名同时被多条规则的 `pattern` 匹配,工具应**报错**(歧义),提示用户收紧某条 `pattern`
- 不允许通过对象 key 字典序或 `pattern` 长度做"自动消歧"——这会让两份独立实现给出不同结果

### 7. 完全覆盖

子目录的 `schemark.json` 完全覆盖父级嵌套预定义,不做字段级合并。详见前文"逐层覆盖规则"。

---

## 完整示例:嵌套预定义

```
docs/
├── schemark.json                              ← 根配置,预定义所有结构
└── 20260401-20260430-项目启动/
    ├── (无 schemark.json,继承父级预定义)
    ├── sprint-001/
    │   └── task-T001-登录页面.md
    └── meeting-20260415-站会.md
```

```json
{
  "$schema": "https://schemark.dev/schemark.schema.json",
  "strict": true,
  "directories": {
    "milestone": {
      "pattern": "^(?<start>\\d{8})-(?<end>\\d{8})-(?<name>.+)$",
      "type": "milestone",
      "start": { "type": "string", "format": "date", "value": "${start}" },
      "end":   { "type": "string", "format": "date", "value": "${end}" },
      "name":  "${name}",
      "directories": {
        "sprint": {
          "pattern": "^sprint-(?<number>\\d{3})$",
          "type": "sprint",
          "number": { "type": "string", "pattern": "^\\d{3}$", "value": "${number}" },
          "files": {
            "task": {
              "pattern": "^task-(?<id>T\\d{3})-(?<title>.+)\\.md$",
              "id":    { "type": "string", "pattern": "^T\\d{3}$", "value": "${id}" },
              "title": "${title}",
              "frontmatter": {
                "properties": {
                  "assignee": { "type": "string" },
                  "status":   { "type": "string", "enum": ["todo", "doing", "done"] },
                  "priority": { "type": "integer", "minimum": 1, "maximum": 5 }
                },
                "required": ["assignee", "status"]
              }
            }
          }
        }
      },
      "files": {
        "meeting": {
          "pattern": "^meeting-(?<date>\\d{8})-(?<title>.+)\\.md$",
          "date":  { "type": "string", "format": "date", "value": "${date}" },
          "title": "${title}",
          "frontmatter": {
            "properties": {
              "attendees": { "type": "array", "items": { "type": "string" } },
              "duration":  { "type": "integer", "minimum": 0 }
            }
          }
        }
      }
    }
  }
}
```

**派生结果**:

文件 `docs/20260401-20260430-项目启动/sprint-001/task-T001-登录页面.md`:

```json
{
  "type": "sprint",
  "start": "2026-04-01",
  "end": "2026-04-30",
  "name": "项目启动",
  "number": "001",
  "id": "T001",
  "title": "登录页面",
  "frontmatter": { "assignee": "张三", "status": "doing", "priority": 2 }
}
```

注意:
- `milestone` 和 `sprint` 都声明了 `type`,深层的 `sprint.type = "sprint"` 覆盖了浅层的 `milestone.type = "milestone"`
- `task` 规则没有写 `"type": "task"`,因此派生输出里也没有额外的 `type` 覆盖——最终 `type` 来自 `sprint`
- `frontmatter` 不参与拉平,始终作为独立对象保留

---

## 元 Schema

`schemark.schema.json` 是用于校验 `schemark.json` 自身的 JSON Schema(Draft 2020-12),其 `$id` 为 `https://schemark.dev/schemark.schema.json`。

**推荐用法:把 `schemark.schema.json` 放到文档根目录,用相对路径引用**

```json
{
  "$schema": "./schemark.schema.json"
}
```

子目录下的 `schemark.json` 相应改成 `"../schemark.schema.json"`(根据深度调整 `..` 数量)。

VSCode / JetBrains 的 YAML/JSON 插件会自动提供补全与即时校验。

---

## 设计原则

1. **声明式优于命令式**:用配置描述"应该是什么样",而非"怎么做"
2. **就近原则**:每层目录只管自己的直接子级,支持嵌套预定义与覆盖
3. **路径即元数据**:文件路径本身编码了结构化信息,通过命名捕获组 + 模板插值提取出来
4. **标准优于方言**:Frontmatter 用标准 JSON Schema,meta 字段也尽量复用 JSON Schema 关键字,不发明新语法
5. **纯函数派生**:给定路径 + 配置,meta 结果确定,无副作用

---

## License

MIT
