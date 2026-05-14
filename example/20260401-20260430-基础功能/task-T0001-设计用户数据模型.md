---
assignee: 李四
status: done
priority: high
estimated-hours: 16
actual-hours: 18
tags: [backend, db]
---

# 设计用户数据模型

## 背景

需要承载注册、登录、角色权限三类核心场景，字段设计需兼顾扩展性。

## 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| email | string | 唯一索引 |
| password_hash | string | bcrypt |
| role | enum | user / admin |
| created_at | timestamp | 创建时间 |

## 验收

- 迁移脚本可幂等执行
- 索引覆盖 email 唯一约束
