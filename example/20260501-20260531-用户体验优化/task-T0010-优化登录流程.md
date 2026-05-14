---
assignee: 赵六
status: doing
priority: high
estimated-hours: 20
tags: [frontend, ux]
---

# 优化首次登录流程

## 现状

新用户注册后需要再次手动登录,流失约 8%。

## 方案

注册成功直接颁发 token 并跳转首页,首屏弹出"完善个人资料"引导。

## 验收

- 注册→首页中无登录页停顿
- 引导可跳过且 24 小时内不重复弹出
