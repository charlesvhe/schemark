# Schemark 示例数据集

本目录是 [`schemark.json`](./schemark.json) 配置的配套样例，覆盖以下场景：

## Sprint

| 目录 | 状态 | 备注 |
| ---- | ---- | ---- |
| [20260101-20260131-账户体系建设](./20260101-20260131-账户体系建设/overview.md) | 完成 | 全部 task 完结，bug 全部修复 |
| [20260201-20260228-支付与订单](./20260201-20260228-支付与订单/overview.md) | 进行中 | 含阻塞级 bug、被取消的 bug |
| [20260301-20260331-数据分析平台](./20260301-20260331-数据分析平台/overview.md) | 取消 | 含最少必填字段示例、跨 sprint 依赖 |

## 覆盖到的 schema 场景

- `task.status`：进行中 / 完成 / 取消
- `task.priority`：高 / 中 / 低
- `task.hours`：填写、为 0、缺省
- `task.tags`：填写、缺省
- `task.depends-on`：单依赖、多依赖、跨 sprint 依赖
- `bug.critical`：阻塞 / 高 / 中 / 低
- `bug.status`：进行中 / 完成 / 取消
- `bug.fixed-at`：已修复时填写、未修复缺省
- `bug.assignee`：填写、缺省
- `bug.ref-task`：单任务、多任务、缺省
- 仅必填字段（最小化）：`Sprint 3` 中 `B0011`、`T0014`
