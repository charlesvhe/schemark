---
assignee: 钱七
status: review
priority: medium
estimated-hours: 8
actual-hours: 7
tags: [frontend, security]
---

# 密码强度可视化提示

## 方案

引入 zxcvbn 库,输入框下方实时显示 0~4 级强度条与改进建议。

## 验收

- 输入响应延迟 < 50ms
- 强度 < 2 时禁用提交按钮
- 与服务端强度策略一致
