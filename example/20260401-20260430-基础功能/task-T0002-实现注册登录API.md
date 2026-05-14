---
assignee: 王五
status: done
priority: high
estimated-hours: 24
actual-hours: 28
tags: [backend, api, auth]
depends-on: [T0001]
---

# 实现注册与登录 API

## 接口

- `POST /api/auth/register` — 创建账户
- `POST /api/auth/login` — 颁发 access + refresh token
- `POST /api/auth/refresh` — 刷新 token

## 安全要点

- 密码使用 bcrypt cost=12
- access token TTL = 15 分钟
- refresh token 存储于 httpOnly cookie

## 验收

- 单元测试覆盖率 ≥ 80%
- 错误响应统一为 `{ code, message }` 结构
