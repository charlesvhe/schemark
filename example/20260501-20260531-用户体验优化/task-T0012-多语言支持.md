---
assignee: 孙八
status: todo
priority: low
estimated-hours: 40
tags: [frontend, i18n]
depends-on: [T0010, T0011]
---

# 中英双语支持

## 范围

- 引入 i18next + 资源加载方案
- 抽离全部硬编码文案
- 切换组件 + 持久化用户选择

## 不在此次范围

- 后端错误消息的多语言(下迭代)
- 时区/数字格式本地化

## 验收

- 切换后无白屏抖动
- 默认语言遵循浏览器 Accept-Language
