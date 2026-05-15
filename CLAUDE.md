## Language Rules

- All LLM explanations and generated requirement documents MUST be written in Chinese.
- Technical specifications, code, API definitions, and identifiers MAY remain in English.

---

## File Writing Rules (Large Files)

When encountering "Error writing file" in Claude Code, it's typically caused by writing too much content in a single Write/Edit operation. **MANDATORY handling:**

- **NEVER exceed 200 lines** in a single Write or Edit tool call
- **For files > 200 lines**: MUST use Write for first ≤200 lines, then use Edit to append remaining content in chunks of ≤200 lines each
- **When generating large files**: AI MUST split output into multiple tool calls automatically, each ≤200 lines
- **This is a hard constraint** — violating this rule will cause write failures and waste tokens

---

## Surgical Changes Rule

**Touch only what the task requires. Every changed line must trace directly to the user's request.**

- **DO** remove imports, variables, or functions that YOUR changes made unused.
- **DO NOT** remove pre-existing dead code unless explicitly asked.
- **DO NOT** "improve" adjacent code, comments, or formatting that you didn't break.
- **MUST** match existing style, even if you'd write it differently.

**Violation test**: If a changed line cannot be traced to the user's request, revert it.

---

## CLI 本地编译与安装

项目 CLI 位于 `cli/` 目录,基于 Node.js (>=18) + tsup 构建。

```bash
cd cli
npm run build      # tsup 编译,输出到 dist/
npm link           # 全局安装 schemark 命令
```

安装后可用命令:

```
schemark valid [dir]          # 校验目录树是否符合 schemark.json
schemark meta [dir]           # 派生 meta JSON(出错文件输出 path + schemark 错误信息)
schemark web [dir]            # 启动本地 Web 查看器
```

测试: `npm run test:run` (vitest)

---
