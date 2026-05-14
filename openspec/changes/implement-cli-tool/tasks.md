## 1. 项目基础设置

- [x] 1.1 在 `cli/src/` 创建目录结构（`commands/`、各模块文件占位）
- [x] 1.2 安装依赖（`npm install`）并验证 TypeScript 编译通过

## 2. 核心模块：validator（JSON Schema 校验）

- [x] 2.1 实现 `validator.ts`：封装 Ajv（启用 `ajv-formats`），提供 `validateSchema(schema, data)` 函数
- [x] 2.2 实现用元 schema 校验 `schemark.json` 自身的函数 `validateSchemarkConfig(config)`

## 3. 核心模块：converter（类型与值转换）

- [x] 3.1 实现 `converter.ts`：按规则 7 的转换矩阵，将捕获组字符串值转换为目标类型
- [x] 3.2 处理 `string + format: "date"` 的 YYYYMMDD → YYYY-MM-DD 归一化
- [x] 3.3 对 `array`/`object`/`null` 类型的捕获组声明报配置错误

## 4. 核心模块：loader（配置加载与继承）

- [x] 4.1 实现 `loader.ts`：读取指定目录的 `schemark.json`，返回解析后的配置对象
- [x] 4.2 实现有效配置解析：给定父级有效配置和子目录名，计算子目录的有效配置（继承 or 覆盖）
- [x] 4.3 对每个 `pattern` 执行 `new RegExp(pattern)` 编译检查，失败则报配置错误

## 5. 核心模块：resolver（目录树遍历与 meta 派生）

- [x] 5.1 实现 `resolver.ts`：递归遍历目录树，维护继承链栈，对每个条目找到有效配置
- [x] 5.2 实现歧义检测：目录名/文件名命中多条 pattern 时抛出歧义错误
- [x] 5.3 实现 meta 派生：从匹配的 `directories` 和 `files` 规则提取命名捕获组，调用 `converter`，按 namespace 组装
- [x] 5.4 实现 namespace 冲突检测（规则 3）
- [x] 5.5 实现文件 type 自动注入（规则 5）
- [x] 5.6 实现 frontmatter 提取：用 `gray-matter` 解析 YAML，按 `frontmatter.fields` 提取字段

## 6. 命令实现：valid

- [x] 6.1 实现 `commands/valid.ts`：调用 `loader` 校验所有 `schemark.json` 配置合法性
- [x] 6.2 调用 `resolver` 收集命名违规错误（未匹配目录/文件、目录与文件歧义）
- [x] 6.3 调用 `validator` 校验 frontmatter 字段，收集字段缺失（含空字符串）和类型错误
- [x] 6.4 实现 `--json` 输出标志；无错误退出码 0，有错误退出码 1

## 7. 命令实现：meta

- [x] 7.1 实现 `commands/meta.ts`：调用 `resolver` 收集所有匹配文件的派生 meta
- [x] 7.2 实现 `--output <file>` 标志，将 JSON 写入文件
- [x] 7.3 转换失败或 meta.required 缺失时输出错误到 stderr，跳过该文件
- [x] 7.4 实现 `--strict` 标志，有跳过文件时退出码为 1

## 8. CLI 入口

- [x] 8.1 实现 `cli.ts`：用 `commander` 注册 `valid`、`meta` 两个子命令
- [x] 8.2 在 `cli/bin/schemark.mjs` 创建可执行入口（或确认 tsup 输出路径正确）
- [x] 8.3 验证 `schemark --help` 输出两个子命令

## 9. 公共 API 导出

- [x] 9.1 实现 `index.ts`：导出 `loader`、`resolver`、`validator`、`converter` 的核心函数，供库使用

## 10. 测试

- [x] 10.1 为 `converter` 编写单元测试（含日期归一化、类型错误、整数转换）
- [x] 10.2 为 `resolver` 编写集成测试（使用临时目录，覆盖继承、覆盖、歧义场景）
- [x] 10.3 为 `valid` 命令编写端到端测试（使用 README 中的示例目录结构）
- [x] 10.4 为 `meta` 命令编写端到端测试，验证派生结果与 README 示例一致
