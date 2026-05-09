---
name: figma-hifi-frontend
description: 将 Figma 设计稿高保真还原为目标项目当前技术栈的前端代码。适用于 Figma MCP 读稿、稿转代码、像素级还原、截图对比、pixel diff、移动端或桌面端页面实现。必须先识别项目技术栈与样式体系，再按项目既有规范实现；不得预设 React、Tailwind 或任何特定框架。
---

# Figma Hifi Frontend

将这个 skill 当成一个“可执行协议”，不是泛化建议集。

## When To Use

以下场景必须使用本 Skill：

- Figma URL / `fileKey` / `nodeId`
- 稿转代码、设计稿实现、高保真还原
- pixel diff、截图对比、视觉验收
- 资源导出、设计合同、分区 diff

以下场景不应强行使用：

- 没有 Figma 输入的普通页面搭建
- 纯交互逻辑开发或接口联调优先任务
- 只做低保真结构草搭
- 用户明确不需要视觉验收或设计一致性

## Inputs

开始前先确认：

- Figma 输入：URL、`fileKey`、`nodeId`
- 目标项目事实：框架、语言、样式体系、路由和目录约定
- 是否强制刷新缓存
- 是否要求高保真 / 像素级 / 截图对比
- 是否需要导出真实 PNG/SVG 资源

硬规则：

- `clientLanguages`、`clientFrameworks` 必须来自项目事实，不得猜测。
- 不得因为 Figma 返回 Tailwind 片段就新增 Tailwind 或其他框架依赖。
- `get_design_context` 只作设计表达参考，不能直接复制为最终实现。

## Quick Start

最小成功路径：

1. 解析 Figma URL，得到 `fileKey`、`nodeId`。
2. 识别目标项目技术栈与样式体系。
3. 获取并缓存 raw Figma 数据。
4. 运行 `scripts/figma-build-contract.mjs` 生成合同产物。
5. 根据合同决定 DOM、组件、SVG、图片化、fixture 或忽略策略。
6. 需要高保真验收时，运行 `scripts/figma-pixel-diff.mjs`。
7. 依据 section diff 收敛，最多自动修正 2 轮。
8. 最终回复只依据可验证证据，不做口头宣称。

## Required Artifacts

开始编码前至少应具备：

- `summaries/layout-contract.md`
- 非空 `summaries/sections.json`
- `summaries/assets-index.json`

宣称完成 pixel diff 前至少应具备：

- `screenshots/design.png`
- `screenshots/local.png`
- `summaries/pixel-diff-report.json`
- `summaries/pixel-diff-summary.md`

高保真验收必须满足：

- 有 section diff；若 `pixel-diff-report.json.sections` 为空，则验收无效。
- 没有 REST 导出的 `design.png`，不能宣称完成视觉对比。
- `--band-diff` 仅用于诊断，不能作为最终验收依据。

## Workflow

### 1. Fetch

- 先判断是否强制刷新缓存。
- 未强制刷新时优先读取已有缓存。
- 缓存缺失时，再调用 MCP / REST 获取数据。
- 需要真实视觉基线时，必须拿到可落盘 `design.png`。

缓存结构、命令参数和目录示例见：

- `reference-workflow-layers.md`
- `reference-contract-generation.md`
- `reference-pixel-diff.md`

### 2. Contract

先生成设计合同，再开始实现。

- 运行 `scripts/figma-build-contract.mjs`
- 检查 `sections.json` 非空
- 检查 `layout-contract.md` 不是大量 `TBD`
- 检查 `assets-index.json` 是否覆盖复杂静态视觉

### 3. Implementation

实现策略只允许来自合同和项目事实：

- 文本、简单布局、按钮、卡片：优先 DOM / 组件
- 图标、简单 vector：优先 SVG
- 复杂渐变、营销卡、静态图表、照片、截图式区域：优先图片化
- 业务数据：使用稳定 fixture 或真实数据绑定
- 标注层、隐藏层、实验层：忽略

详细判定表见 `reference-implementation-strategy.md`。

### 4. Diff

用户要求“像素级 / 1:1 / 截图对比 / 高保真”时，默认必须跑 pixel diff。

`scripts/figma-pixel-diff.mjs` 支持两种语义：

- `strict`：定位问题
- `practical`：做验收判断

默认行为：

- 未显式传阈值时，默认输出 `strict + practical`
- 传 legacy `--threshold` / `--max-diff-ratio` 时，兼容到单一 `practical` 模式

### 5. Converge

修复顺序固定为：

1. 页面尺寸、背景、安全区、字体
2. section 的 top、height、padding、gap
3. 简单 DOM 区块内部细节
4. 高 diff 的复杂静态区块切换为图片或 SVG
5. 重新运行 section diff

停止条件：

- `practical` 通过
- 连续两轮改善不足
- 差异主要来自字体、抗锯齿、动态数据、Figma 与浏览器渲染差异

## Decision Rules

- 用户只说“实现页面”但没要求高保真：仍先走合同层，pixel diff 按需启用。
- 用户明确要像素级或 1:1：pixel diff 默认必跑。
- 没有 section diff、没有设计基线、没有可验证证据：禁止说“高保真完成”。
- 整页 diff 只作总览；收敛优先看 section diff。
- 一轮修复后高 diff 仍来自复杂静态视觉：切换 asset，不继续手搓近似 CSS。

## Failure Conditions

遇到以下情况必须停止并明确说明：

- 无法识别目标项目技术栈
- 缺少可用 metadata 或目标节点 bounds
- `sections.json` 为空
- 缺少 `FIGMA_TOKEN` 且需要 REST 导图或资源导出
- 缺少 Playwright 或本地页面无法稳定截图
- 报告里没有可验证的 section 级结果

## Evidence

最终回复必须说明：

- 使用的 Skill：`figma-hifi-frontend`
- Figma 数据来源：缓存 / 新拉取 / 强制刷新
- 是否进行了像素验收，使用了哪些 preset
- 关键产物路径：`layout-contract.md`、`design.png`、`local.png`、`pixel-diff-report.json`
- 最高差异 section、已图片化区域、未收敛原因、残余风险
- 实际执行的验证命令

## Source Of Truth

单一事实源原则：

- CLI 参数、报告字段、产物路径，以脚本真实实现为准
- `SKILL.md` 只描述流程、规则和停止条件
- 详细参数和数据契约看 reference 文件
- reference 不得描述脚本未实现的能力

## Maintenance

推荐维护入口：

- `npm run validate`：本地主验证链路，包含静态契约校验和 smoke 检查
- `npm run smoke`：只运行 fixture 和 profile 语义检查

外部工具链说明：

- `skill-creator` 的 `quick_validate.py` 只作为可选兼容检查
- 该外部脚本依赖 `PyYAML`
- 没有 `PyYAML` 时，不影响本仓库的日常维护和发布前校验

## References

- `reference-workflow-layers.md`：六层流水线与缓存落点
- `reference-contract-generation.md`：合同脚本契约与失败条件
- `reference-implementation-strategy.md`：节点分类和实现策略
- `reference-pixel-diff.md`：pixel diff 参数、preset、报告契约与诊断边界
- `scripts/smoke-check.mjs`：最小 smoke checklist
- `scripts/validate-skill.mjs`：本地主验证入口
