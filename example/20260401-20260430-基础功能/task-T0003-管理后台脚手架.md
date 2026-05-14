---
assignee: 赵六
status: done
priority: medium
estimated-hours: 32
actual-hours: 30
tags: [frontend, admin]
depends-on: [T0002]
---

# 管理后台脚手架

## 范围

- 路由框架(React Router)
- 鉴权守卫与 401 拦截
- 用户列表 + 详情页
- 全局 Layout(侧边栏 + 顶栏)

## 不在此次范围

- 角色权限编辑(下迭代)
- 审计日志(下迭代)

## 验收

- 管理员可登录并查看用户列表
- 非管理员访问后台路径自动跳转登录
