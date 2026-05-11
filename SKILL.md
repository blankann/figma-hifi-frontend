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
- `get_design_context` 的原始代码是实现输入：必须完整保存、逐 section 消化，再转译为目标项目技术栈；不能直接复制为最终实现。

## Quick Start

最小成功路径：

1. 解析 Figma URL，得到 `fileKey`、`nodeId`。
2. 识别目标项目技术栈与样式体系。
3. 获取并缓存 raw Figma 数据，完整保存 MCP 原始代码。
4. 运行 `scripts/figma-build-contract.mjs` 生成合同产物。
5. 按 “MCP 原始代码 -> 设计合同 -> 项目技术栈转译 -> pixel diff” 顺序实现。
6. 需要高保真验收时，运行 `scripts/figma-pixel-diff.mjs`。
7. 依据 section diff 收敛，最多自动修正 2 轮。
8. 最终回复只依据可验证证据，不做口头宣称。

## Required Artifacts

Figma 产物默认落点：

```text
docs/hifi/figma/<fileKey>/node-<node-id>/
```

示例：`docs/hifi/figma/F73HLQHKaCfL0QRYdJSev0/node-50-929/`。

`node-id` 目录必须用 `node-50-929` 形式；`50:929`、`50-929` 输入都归一到同一路径，禁止同时生成 `50_929` / `50-929` / `node-50_929`。

raw 层至少应落盘：

- `raw/get_metadata.xml`
- `raw/get_design_context.tsx`
- `raw/get_screenshot.json`
- `raw/variables.json`，如已读取变量

`raw/get_design_context.tsx` 必须保存 MCP `get_design_context` 的原始直出代码。若响应过长，可拆成 `raw/get_design_context.part-*.tsx`，但主文件必须保留分片索引、获取时间和完整性说明；禁止只写摘要、节点信息、少量 asset URL 或后补说明来冒充 raw 输出。

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
- `local.png` 必须来自目标 URL 的真实浏览器截图；不能复制 `design.png`、Figma 导出图或任意静态基线图来代替。
- `design.png` 与 `local.png` hash 完全相同且报告无法证明 `local.png` 来自浏览器截图时，验收失败。
- `--band-diff` 仅用于诊断，不能作为最终验收依据。

## Hard Gates

以下门禁是阻塞规则，不是建议。任一门禁失败时必须停止当前阶段，先报告缺失产物和下一步修复动作，不能继续实现或宣称完成。

### Fetch Gate

- 缓存根默认是当前项目内 `docs/hifi/figma/`，除非用户明确指定 `FIGMA_HIFI_CACHE_ROOT` 或 `--cache-root`。
- 每个 Figma 节点必须使用 `docs/hifi/figma/<fileKey>/node-<node-id>/` 作为单一产物目录。
- `get_design_context` 的直出代码必须保存为 `raw/get_design_context.tsx`。
- `raw/get_design_context.tsx` 必须是原始直出或分片索引；若文件明显过短、只包含 `figmaNode` / `keyAssets` 摘要对象、只列 asset URL、没有 JSX/HTML/CSS 结构，停止并重新获取 raw。
- `get_design_context` 直出代码是实现输入和合同输入；最终实现必须把其中的 DOM、层级、尺寸、字体、颜色和资源引用转译为目标项目技术栈和样式体系，不得直接复制 Tailwind 或引入项目外框架。
- 若 raw 数据无法获取或无法落盘，停止，不进入合同生成。

### Contract Gate

- 进入任何项目代码实现前，必须存在 `summaries/layout-contract.md`。
- `summaries/sections.json` 必须存在且非空；空数组等同失败。
- `summaries/assets-index.json` 必须存在；真实位图、照片、业务图片和 SVG 没有识别策略时，先补合同或资源索引。
- 合同必须为每个主要 section 标注实现策略：`translated-dom`、`semantic-dom`、`component-dom`、`svg-asset`、`bitmap-asset`、`data-bound` 或 `ignore`。
- 禁止把完整 frame / 整页截图标为最终实现策略；整页截图只可作为设计基线或临时诊断材料。
- `layout-contract.md` 若大量关键尺寸、分区或资源仍为 `TBD`，停止补 raw/metadata，不直接编码。

### Diff Gate

- 宣称“1:1 / 高保真完成 / 像素级完成”前，必须有 `screenshots/design.png`、`screenshots/local.png`、`summaries/pixel-diff-report.json`。
- `pixel-diff-report.json.sections` 必须非空；没有 section diff 时只能说“诊断完成”，不能说“高保真完成”。
- `screenshots/local.png` 必须由 Playwright、Browser 或等价浏览器截图工具访问目标 URL 后生成；若浏览器截图失败，停止并报告失败原因。
- 禁止用 `cp design.png local.png`、同图下载、截图 Figma 画布等方式生成 `local.png`。若 `design.png` 与 `local.png` hash 相同且没有浏览器截图证据，Diff Gate 失败。
- `practical` 未通过或报告 `passed=false` 时，只能说明未通过的 section、原因和下一步，不得包装为完成。
- `--band-diff` 的结果只能辅助诊断，不能作为最终验收证据。

## Workflow

### 1. Fetch

- 先判断是否强制刷新缓存。
- 未强制刷新时优先读取已有缓存。
- 缓存缺失时，再调用 MCP / REST 获取数据。
- MCP `get_metadata`、`get_design_context`、`get_screenshot` 的原始产物必须保存到 `raw/`。
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
- 检查 `assets-index.json` 是否覆盖真实位图、照片、业务图片和 SVG

### 3. Implementation

实现策略只允许来自 MCP 原始代码、合同和项目事实：

- MCP 返回的 HTML/DOM/CSS/Tailwind/inline style：先提取层级、尺寸、字体、颜色、资源引用，再转译为项目技术栈。
- 文本、布局、按钮、卡片、表格、标签、营销块、图表、趋势图、说明模块：默认 `translated-dom` / DOM / 项目组件。
- 图标、简单 vector：优先 SVG。
- Figma 原本就是 bitmap/photo/imageRef 或真实业务图片承载的节点：才允许 `bitmap-asset` / data-bound image。
- 业务数据：使用稳定 fixture 或真实数据绑定。
- 标注层、隐藏层、实验层：忽略。

禁止把完整 Figma frame 或整页截图作为最终页面主体（例如页面只渲染 `<img src="/assets/.../design.png">`）。禁止把可 DOM 表达的卡片、图表、营销块、表格、标签、说明模块图片化；若使用 `bitmap-asset`，合同必须说明原始位图来源或业务图片来源。

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
3. 回到 MCP 原始 DOM，逐层修正 section 内部细节
4. SVG / bitmap 原始资源的尺寸、裁切和对齐
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
- 一轮修复后高 diff 仍然明显：回到 MCP 原始代码和 section 合同，逐项修正层级、尺寸、字体、颜色、资源引用；不得用图片化替代可 DOM 表达区域。
- 整页截图只能用于 `design.png` 基线或临时诊断，不得作为生产 DOM 的替代品。

## Failure Conditions

遇到以下情况必须停止并明确说明：

- 无法识别目标项目技术栈
- 缺少可用 metadata 或目标节点 bounds
- `sections.json` 为空
- 缺少 `FIGMA_TOKEN` 且需要 REST 导图或资源导出
- 缺少 Playwright 或本地页面无法稳定截图
- `local.png` 不是浏览器截图，或与 `design.png` hash 相同且无截图证据
- `get_design_context` raw 缺失、被摘要替代、没有 JSX/HTML/CSS 结构或分片索引不完整
- 报告里没有可验证的 section 级结果

## Evidence

最终回复必须说明：

- 使用的 Skill：`figma-hifi-frontend`
- Figma 数据来源：缓存 / 新拉取 / 强制刷新
- 是否进行了像素验收，使用了哪些 preset
- 关键产物路径：`layout-contract.md`、`design.png`、`local.png`、`pixel-diff-report.json`
- 最高差异 section、`bitmap-asset` / SVG 区域、未收敛原因、残余风险
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
