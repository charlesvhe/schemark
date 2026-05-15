---
reporter: 安全-周凯
assignee: 王浩
critical: 高
status: 完成
fixed-at: 2026-01-18
tags:
  - 安全
  - 性能
ref-task:
  - T0002
---

# bcrypt cost 设置过低

## 现象

安全评审发现 bcrypt cost 仅为 8，低于公司安全基线（≥ 12）。

## 修复

- 调整为 cost = 12
- 登录时若检测到旧 cost，自动重哈希
