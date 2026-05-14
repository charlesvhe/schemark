---
assignee: 王浩
status: 进行中
priority: 高
hours: 40
tags:
  - 后端
  - 订单
depends-on:
  - T0006
---

# 订单创建与查询 API

## 接口

- POST /api/orders 创建订单（幂等键）
- GET /api/orders/:id 查询详情
- GET /api/orders 列表（分页、状态过滤）
- POST /api/orders/:id/close 关闭订单

## 关键点

- 创建订单使用 `Idempotency-Key` 头去重
- 查询场景下索引：`(user_id, status, created_at)`
