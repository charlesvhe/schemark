# Schemark

**用 JSON Schema 约束 Markdown 文档仓库的目录结构、文件命名与 Frontmatter,并从路径、文件名中自动派生元信息。**

> 命名由来:**Sche**ma + Mark**down** = **Schemark**。

---

## 核心思想

每个目录可以放一份 `schemark.json`,用它声明:

1. **本目录下允许哪些子目录** — 用正则匹配目录名,从命名中提取元信息(如里程碑起止日期)
2. **子目录的内部结构** — 可以在 `directories.<key>` 内嵌套定义 `directories` / `files`,预先声明孙子辈结构
3. **本目录下允许哪些文件** — 用正则匹配文件名,从命名中提取元信息(如任务 ID、日期)
4. **从 Frontmatter 提取哪些字段** — 通过 `frontmatter.fields` 声明要提取的字段及其 JSON Schema 约束

**逐层覆盖规则**:

- 父级 `schemark.json` 可以预定义子目录的内部结构(通过嵌套 `directories` / `files`)
- 如果子目录实际存在自己的 `schemark.json`,则**完全覆盖**父级的预定义
- 如果子目录没有 `schemark.json`,则继承父级的嵌套定义

**"完全覆盖"的含义**:

子目录的 `schemark.json` 独立声明该目录下的 `directories` 和 `files`，父级嵌套定义中同层级的所有规则**整体作废**，不做字段级合并。例如父级预定义了 `meeting` 和 `design` 两种文件类型，子级只声明了 `retrospective`，则该子目录下 `meeting` 和 `design` 均不再合法——子级配置是完整的、自洽的规则集，而非父级的补丁。

这样设计的理由：局部合并会使"哪条规则生效"取决于父子两份文件的同时阅读，难以推断；完全覆盖使每个目录的有效规则只需读该目录（或最近祖先）的一份 `schemark.json` 即可确定，降低心智负担，也消除了合并语义的歧义（如同名 typeKey 冲突时以谁为准）。

最终,每个 Markdown 文件都能获得一份**从路径派生的 meta + 从 Frontmatter 提取的字段**,形成完整的文档元数据。派生结果是**运行时产物**,不会被写回 MD 文件本身。

---

## 快速示例

### 目录结构

```
docs/
├── schemark.json                              ← 根配置
├── 20260401-20260430-项目启动/
│   ├── schemark.json                          ← 项目启动里程碑配置
│   ├── meeting-20260415-站会纪要.md
│   ├── design-用户登录模块.md
│   └── adr-001-选择数据库.md
└── 20260501-20260531-第一次迭代/
    ├── schemark.json                          ←  第一次迭代里程碑配置
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
      "meta": {
        "namespace": "milestone",
        "fields": {
          "start": { "type": "string", "format": "date" },
          "end": { "type": "string", "format": "date" },
          "name": { "type": "string" }
        }
      },
      "files": {
        "meeting": {
          "pattern": "^meeting-(?<date>\\d{8})-(?<title>.+)\\.md$",
          "frontmatter": {
            "fields": {
              "attendees": { "type": "array", "items": { "type": "string" } },
              "tags": { "type": "array", "items": { "type": "string" } },
              "duration": { "type": "integer", "minimum": 0 }
            }
          },
          "meta": {
            "namespace": "file",
            "fields": {
              "date": { "type": "string", "format": "date" },
              "title": { "type": "string" }
            }
          }
        },
        "design": {
          "pattern": "^design-(?<title>.+)\\.md$",
          "frontmatter": {
            "fields": {
              "author": { "type": "string" },
              "reviewers": { "type": "array", "items": { "type": "string" } },
              "status": { "type": "string", "enum": ["draft", "review", "approved"] }
            }
          },
          "meta": {
            "namespace": "file",
            "fields": {
              "title": { "type": "string" }
            }
          }
        },
        "adr": {
          "pattern": "^adr-(?<number>\\d{3})-(?<title>.+)\\.md$",
          "frontmatter": {
            "fields": {
              "status": { "type": "string", "enum": ["proposed", "accepted", "deprecated", "superseded"] },
              "deciders": { "type": "array", "items": { "type": "string" } },
              "date": { "type": "string", "format": "date" }
            }
          },
          "meta": {
            "namespace": "file",
            "fields": {
              "number": { "type": "string", "pattern": "^\\d{3}$" },
              "title": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```

**解释:**

- `directories.milestone.pattern`:匹配形如 `20260401-20260430-项目启动` 的目录名
- 正则中的**命名捕获组** `(?<start>...)` / `(?<end>...)` / `(?<name>...)` 会被提取
- `meta.namespace: "milestone"`:这些字段挂载到 `meta.milestone.*` 下
- `meta.fields.start`:使用 JSON Schema 定义,`type: "string", format: "date"` 表示标准日期格式 `"2026-04-01"`
- **嵌套 `files`**:预定义里程碑目录下允许的文件类型。如果子目录有自己的 `schemark.json`,这些预定义会被覆盖
- **`frontmatter.fields`**:使用完整的 JSON Schema 定义每个字段的类型、格式、枚举值等约束

### 里程碑配置(可选):`docs/20260401-20260430-项目启动/schemark.json`

如果某个里程碑目录需要**覆盖**父级的预定义,可以创建自己的 `schemark.json`:

```json
{
  "$schema": "https://schemark.dev/schemark.schema.json",
  "strict": true,
  "files": {
    "meeting": {
      "pattern": "^meeting-(?<date>\\d{8})-(?<title>.+)\\.md$",
      "frontmatter": {
        "fields": {
          "attendees": { "type": "array", "items": { "type": "string" } },
          "tags": { "type": "array", "items": { "type": "string" } },
          "duration": { "type": "integer", "minimum": 0 },
          "location": { "type": "string" }
        }
      },
      "meta": {
        "namespace": "file",
        "fields": {
          "date": { "type": "string", "format": "date" },
          "title": { "type": "string" }
        }
      }
    },
    "retrospective": {
      "pattern": "^retro-(?<date>\\d{8})\\.md$",
      "frontmatter": {
        "fields": {
          "participants": { "type": "array", "items": { "type": "string" } },
          "action-items": { "type": "array", "items": { "type": "string" } }
        }
      },
      "meta": {
        "namespace": "file",
        "fields": {
          "date": { "type": "string", "format": "date" }
        }
      }
    }
  }
}
```

**解释:**

- 这个配置**完全覆盖**了父级 `docs/schemark.json` 中 `directories.milestone.files` 的预定义
- 只保留了 `meeting` 类型(但提取了不同的 frontmatter 字段),并新增了 `retrospective` 类型
- `design` 和 `adr` 类型在这个里程碑下不再允许(因为被覆盖了)

**如果不创建子级 `schemark.json`**:

- 里程碑目录会继承父级的 `files` 定义(meeting / design / adr 三种类型)
- 所有里程碑目录共享同一套规则

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
  "meta": {
    "milestone": {
      "start": "2026-04-01",
      "end": "2026-04-30",
      "name": "项目启动"
    },
    "file": {
      "type": "meeting",
      "date": "2026-04-15",
      "title": "站会纪要"
    }
  },
  "frontmatter": {
    "attendees": ["张三", "李四"],
    "tags": ["daily"],
    "duration": 30
  }
}
```

**关键点:**

- `milestone.*` 来自父目录名 `20260401-20260430-项目启动`
- `file.*` 来自文件名 `meeting-20260415-站会纪要.md`
- `frontmatter` 包含从 MD 文件 YAML 块中提取的字段(根据 `files.meeting.frontmatter.fields` 声明)
- 三者合并,形成完整的文档元数据

---

## 字段说明

### `schemark.json` 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `$schema` | string | 否 | 指向元 schema,启用 IDE 补全 |
| `strict` | boolean | 否(默认 `true`) | 是否禁止未声明的子条目 |
| `directories` | object | 否 | 子目录规则集合,key 为类型名(kebab-case) |
| `files` | object | 否 | 子文件规则集合,key 为类型名(kebab-case) |

### `directories.<typeKey>` 字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `pattern` | string | **是** | JS 风格正则,匹配目录名 |
| `meta` | object | 否 | 元信息提取规则 |
| `directories` | object | 否 | **嵌套定义**:预定义该目录下的子目录规则,会被子级 `schemark.json` 覆盖 |
| `files` | object | 否 | **嵌套定义**:预定义该目录下的文件规则,会被子级 `schemark.json` 覆盖 |

### `files.<typeKey>` 字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `pattern` | string | **是** | JS 风格正则,匹配文件名 |
| `frontmatter` | object | 否 | Frontmatter 字段提取规则,格式与 `meta` 一致 |
| `meta` | object | 否 | 元信息提取规则 |

### `meta` 字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `namespace` | string | 否 | 捕获组挂载点,省略时平铺到 meta 根 |
| `fields` | object | 否 | key 为**正则命名捕获组名**(须满足 JS 标识符规则 `^[A-Za-z_$][A-Za-z0-9_$]*$`,且不得为 `type`),value 为 JSON Schema 定义 |
| `required` | string[] | 否 | 必须命中的捕获组名列表;若命中后值为空字符串,也视为缺失 |

### `frontmatter` 字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `fields` | object | 否 | key 为 frontmatter 字段名,value 为 JSON Schema 定义 |
| `required` | string[] | 否 | YAML 块中必须出现的字段名列表 |

### `fields` 下的 JSON Schema 定义

每个字段支持标准 JSON Schema 属性:

```json
"fields": {
  "date": {
    "type": "string",
    "format": "date",
    "description": "会议日期"
  },
  "priority": {
    "type": "integer",
    "minimum": 1,
    "maximum": 5
  },
  "status": {
    "type": "string",
    "enum": ["todo", "doing", "done"]
  },
  "tags": {
    "type": "array",
    "items": { "type": "string" },
    "minItems": 1
  }
}
```

支持的 JSON Schema 属性包括但不限于:
- `type`: `"string"`, `"integer"`, `"number"`, `"boolean"`, `"array"`, `"object"`
- `format`: `"date"`, `"date-time"`, `"email"`, `"uri"` 等
- `enum`: 枚举值列表
- `minimum`, `maximum`: 数值范围
- `minLength`, `maxLength`: 字符串长度
- `pattern`: 正则表达式
- `items`: 数组元素类型
- `minItems`, `maxItems`: 数组长度
- `description`: 字段说明
- `oneOf` / `anyOf` / `allOf`: 组合校验
- 其它标准 JSON Schema 关键字工具应原样转交给底层校验器,不做特殊处理

---

## 核心规则

### 1. 逐层覆盖,支持嵌套预定义

- 父级 `schemark.json` 可以在 `directories.<key>` 内**嵌套定义** `directories` / `files`,预先声明子孙结构
- 如果子目录实际存在自己的 `schemark.json` 文件,则**完全覆盖**父级的嵌套定义——子级的 `directories` / `files` 整体替换，不做字段级合并
- 如果子目录没有 `schemark.json`,则继承父级的嵌套定义

**示例**:

```json
{
  "directories": {
    "milestone": {
      "pattern": "^(?<start>\\d{8})-(?<end>\\d{8})-(?<name>.+)$",
      "files": {                               // ← 预定义:里程碑下允许的文件
        "meeting": { "pattern": "^meeting-.+\\.md$" }
      }
    }
  }
}
```

### 2. 命名捕获组 = meta 字段

正则中的 `(?<fieldName>...)` 会自动成为 meta 的字段:

```json
"pattern": "^meeting-(?<date>\\d{8})-(?<title>.+)\\.md$"
```

匹配 `meeting-20260415-站会纪要.md` 后:

```json
{ "date": "20260415", "title": "站会纪要" }
```

### 3. `namespace` 决定挂载位置

- 有 `namespace`:捕获组挂到 `meta.<namespace>.*` 下
- 无 `namespace`:捕获组平铺到 `meta` 根
- **同名键冲突**:如果路径上有多条规则都没有 `namespace`,或多个 namespace 之间存在键名冲突,工具应**报错**而不是隐式覆盖

### 4. 日期格式使用标准 JSON Schema

所有日期字段使用 `format: "date"`,值为标准格式 `"2026-04-15"`:

```json
"fields": {
  "date": { "type": "string", "format": "date" }
}
```

**注意**:
- 文件名中的日期捕获组(如 `20260415`)由工具按下文"7. 类型与值转换规则"转换为 `"2026-04-15"` 后再校验
- Frontmatter 中的日期可以直接写 `2026-04-15`(无需引号)——工具使用 YAML JSON_SCHEMA 解析,不会将日期自动转为 Date 对象

### 5. 自动注入 `type`(仅文件)

- 文件匹配 `files.<typeKey>` 后,自动得到 `meta.<namespace>.type = "<typeKey>"`,默认 `namespace` 为 `"file"`
- **目录不会自动注入 `type`**——目录通过 `namespace` 自我标识(如 `meta.milestone.*` 已经表明这是 milestone 目录)
- 当 `namespace` 与 `typeKey` 同名(例如 namespace 为 `"task"`,typeKey 也为 `"task"`)时,`meta.task.type = "task"` 看似冗余,但仍由工具显式注入,以便下游消费者一致地通过 `type` 字段判断节点类型

### 6. `strict` 模式

- `strict: true`(默认):未被规则匹配的子条目 = 非法
- `strict: false`:未匹配条目合法,但不参与 meta 派生
- **不跨文件继承**:每个 `schemark.json` 的 `strict` 仅作用于其所在目录的直接子条目;父子目录的 `schemark.json` 之间互不传播。父级的嵌套预定义被子级 `schemark.json` 覆盖时,`strict` 也跟着用子级自己的取值(子级未声明则用 schema 默认值 `true`)

### 7. 类型与值转换规则

捕获组得到的值**永远是字符串**。工具在用 `meta.fields` 的 JSON Schema 校验之前,按字段声明的 `type` 做下列**确定性转换**:

| 声明 `type` | 转换方式 |
|---|---|
| `"string"`(默认) | 原样保留 |
| `"integer"` / `"number"` | 用 `Number()` 解析;无法解析或得到 `NaN` 时报错。**前导零会被丢弃**(`"007"` → `7`),如需保留请用 `"string"` + `pattern` |
| `"boolean"` | `"true"` → `true`,`"false"` → `false`,其它字符串报错 |
| `"string"` + `format: "date"` | 工具识别 `YYYYMMDD`(8 位数字)与 `YYYY-MM-DD` 两种紧凑/标准格式,均归一化为 `YYYY-MM-DD`;其它格式不做猜测,需要用户自行用 `pattern` 约束 |
| `"string"` + 其它 `format` | 原样保留,交给 JSON Schema 的 format 校验 |
| `"array"` / `"object"` / `"null"` | **不允许**用于捕获组字段(捕获组天然是字符串)——若声明则视为配置错误 |

**Frontmatter 字段不做转换**:YAML 解析器已经给出原生类型,工具直接把解析结果交给 JSON Schema 校验。

### 8. 同一目录下多规则的匹配优先级

`directories` / `files` 下的多个规则被视为**互斥分类**,而不是优先级链。

- 若一个目录名 / 文件名同时被多条规则的 `pattern` 匹配,工具应**报错**(歧义),提示用户收紧某条 `pattern`
- 不允许通过对象 key 字典序或 `pattern` 长度做"自动消歧"——这会让两份独立实现给出不同结果

### 9. JSON Schema 校验

`meta.fields` 和 `frontmatter.fields` 中的 JSON Schema 定义用于:
- **提取**:声明要提取哪些字段
- **校验**:提取后的值必须符合 JSON Schema 约束
- **文档**:为字段提供类型和说明

---

## 完整示例:嵌套预定义 + 覆盖

### 场景 1:使用嵌套预定义(无子级 schemark.json)

```
docs/
├── schemark.json                              ← 根配置,预定义所有结构
└── 20260401-20260430-项目启动/
    ├── (无 schemark.json,继承父级预定义)
    ├── sprint-001/
    │   └── task-T001-登录页面.md
    └── meeting-20260415-站会.md
```

#### `docs/schemark.json`

```json
{
  "$schema": "https://schemark.dev/schemark.schema.json",
  "strict": true,
  "directories": {
    "milestone": {
      "pattern": "^(?<start>\\d{8})-(?<end>\\d{8})-(?<name>.+)$",
      "meta": {
        "namespace": "milestone",
        "fields": {
          "start": { "type": "string", "format": "date" },
          "end": { "type": "string", "format": "date" },
          "name": { "type": "string" }
        }
      },
      "directories": {
        "sprint": {
          "pattern": "^sprint-(?<number>\\d{3})$",
          "meta": {
            "namespace": "sprint",
            "fields": {
              "number": { "type": "string", "pattern": "^\\d{3}$" }
            }
          },
          "files": {
            "task": {
              "pattern": "^task-(?<id>T\\d{3})-(?<title>.+)\\.md$",
              "frontmatter": {
                "fields": {
                  "assignee": { "type": "string" },
                  "status": { "type": "string", "enum": ["todo", "doing", "done"] },
                  "priority": { "type": "integer", "minimum": 1, "maximum": 5 }
                }
              },
              "meta": {
                "namespace": "task",
                "fields": {
                  "id": { "type": "string", "pattern": "^T\\d{3}$" },
                  "title": { "type": "string" }
                }
              }
            }
          }
        }
      },
      "files": {
        "meeting": {
          "pattern": "^meeting-(?<date>\\d{8})-(?<title>.+)\\.md$",
          "frontmatter": {
            "fields": {
              "attendees": { "type": "array", "items": { "type": "string" } },
              "duration": { "type": "integer", "minimum": 0 }
            }
          },
          "meta": {
            "namespace": "file",
            "fields": {
              "date": { "type": "string", "format": "date" },
              "title": { "type": "string" }
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
  "meta": {
    "milestone": { "start": "2026-04-01", "end": "2026-04-30", "name": "项目启动" },
    "sprint": { "number": "001" },
    "task": { "type": "task", "id": "T001", "title": "登录页面" }
  }
}
```

---

### 场景 2:子级覆盖父级预定义

```
docs/
├── schemark.json                              ← 根配置
└── 20260401-20260430-项目启动/
    ├── schemark.json                          ← 覆盖父级预定义
    └── design-用户登录.md
```

#### `docs/schemark.json`(同上)

#### `docs/20260401-20260430-项目启动/schemark.json`

```json
{
  "$schema": "https://schemark.dev/schemark.schema.json",
  "strict": true,
  "files": {
    "design": {
      "pattern": "^design-(?<title>.+)\\.md$",
      "frontmatter": {
        "fields": {
          "author": { "type": "string" },
          "reviewers": { "type": "array", "items": { "type": "string" } },
          "status": { "type": "string", "enum": ["draft", "review", "approved"] }
        }
      },
      "meta": {
        "namespace": "file",
        "fields": {
          "title": { "type": "string" }
        }
      }
    }
  }
}
```

**效果**:

- 父级预定义的 `directories.sprint` 和 `files.meeting` **被完全覆盖**
- 这个里程碑下只允许 `design-*.md` 文件,不允许 sprint 子目录和 meeting 文件

**派生结果**:

文件 `docs/20260401-20260430-项目启动/design-用户登录.md`:

```json
{
  "meta": {
    "milestone": { "start": "2026-04-01", "end": "2026-04-30", "name": "项目启动" },
    "file": { "type": "design", "title": "用户登录" }
  }
}
```

---

## 元 Schema

`schemark.schema.json` 是用于校验 `schemark.json` 自身的 JSON Schema(Draft 2020-12),其 `$id` 为 `https://schemark.dev/schemark.schema.json`。

**推荐用法 A:直接引用远程 URL**

```json
{
  "$schema": "https://schemark.dev/schemark.schema.json",
  ...
}
```

**推荐用法 B:把 `schemark.schema.json` 放到仓库根,用相对路径引用**

```json
{
  "$schema": "./schemark.schema.json",
  ...
}
```

子目录下的 `schemark.json` 相应改成 `"../schemark.schema.json"`(根据深度调整 `..` 数量)。

VSCode / JetBrains 的 YAML/JSON 插件会自动提供补全与即时校验。

---

## 设计原则

1. **声明式优于命令式**:用配置描述"应该是什么样",而非"怎么做"
2. **就近原则**:每层目录只管自己的直接子级,支持嵌套预定义与覆盖
3. **路径即元数据**:文件路径本身编码了结构化信息,通过正则提取出来
4. **标准优于方言**:使用标准 JSON Schema 定义字段约束,不发明新语法
5. **纯函数派生**:给定路径 + 配置,meta 结果确定,无副作用

---

## License

MIT
