---
assignee: 陈思雨
status: 完成
priority: 中
hours: 24
tags:
  - 后端
  - 权限
depends-on:
  - T0001
  - T0002
---

# 实现 RBAC 权限校验中间件

## 目标

提供基于角色与权限码的统一鉴权中间件，支持装饰器与路由级配置两种用法。

## 实现要点

- 中间件读取 JWT 中的 `roles` 字段
- 与 `role_permissions` 缓存比对（Redis，TTL 5 分钟）
- 提供 `@requires("order:write")` 风格装饰器

## 验收标准

- 单元测试覆盖率 ≥ 90%
- 压测：1k QPS 下 P99 < 20ms
