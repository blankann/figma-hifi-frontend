# 六层工作流落点

## 1. 数据获取层

落点：

- `SKILL.md`：定义 Figma URL 解析、MCP 与 REST 的职责边界、缓存规则。
- `reference-pixel-diff.md`：说明 REST 图像导出如何作为 `design.png` 基线。
- `scripts/figma-pixel-diff.mjs`：通过 Figma REST API 导出可落盘设计图。

职责：

- MCP 获取结构、metadata、variables 和设计上下文。
- REST API 获取可落盘视觉基线。
- 所有 raw、summaries、screenshots、assets 都进入缓存目录。

## 2. 设计合同层

落点：

- `scripts/figma-build-contract.mjs`
- `reference-contract-generation.md`
- `SKILL.md` 的“设计合同”章节和硬规则。

职责：

- 从 metadata/raw 生成 `node-index.json`。
- 生成相对目标节点的 `sections.json`。
- 生成 `assets-index.json` 初判。
- 生成 `layout-contract.md` 和 `manifest-patch.json`。

## 3. 实现策略层

落点：

- `reference-implementation-strategy.md`
- `SKILL.md` 的“实现策略”章节。
- `scripts/figma-export-assets.mjs`

职责：

- 将节点归类为 `semantic-dom`、`component-dom`、`svg-asset`、`image-asset`、`data-bound`、`ignore`。
- 决定 DOM、组件、SVG、图片化、fixture 或忽略策略。
- 记录复杂静态视觉可图片化的判断。
- 根据 `assets-index.json` 导出真实 PNG/SVG 资源，避免占位图或近似重画污染 diff。

## 4. 自动截图层

落点：

- `scripts/figma-pixel-diff.mjs`
- `reference-pixel-diff.md`

职责：

- 使用目标项目的 `@playwright/test` 截取本地页面。
- 正确处理 Figma device px 与 Playwright CSS px。
- 支持 `design-bounds`、`full-page`、`viewport`。
- 隐藏调试浮层，等待字体和页面稳定。

## 5. Pixel Diff 层

落点：

- `scripts/figma-pixel-diff.mjs`
- `reference-pixel-diff.md`
- `SKILL.md` 的“视觉验收”章节。

职责：

- 生成 `design.png`、`local.png`、`diff.png`。
- 生成 `pixel-diff-report.json` 和 `pixel-diff-summary.md`。
- 默认读取 `summaries/sections.json` 生成分区 diff。
- section 缺失时失败；显式 `--band-diff` 时生成横向 band 诊断。
- 支持 strict diff 和 practical diff。

## 6. 自动收敛层

落点：

- `SKILL.md` 的“收敛规则”章节。
- `reference-implementation-strategy.md` 的“收敛循环”。
- `reference-pixel-diff.md` 的“分区 diff”。

职责：

- 先修页面尺寸、背景、安全区、全局字体。
- 再修 section 位置、尺寸、padding、gap。
- 简单 DOM 优先修；高 diff 的复杂静态区块切换为 image/SVG asset。
- 最多自动修正两轮，仍未收敛时报告残余差异。

## 后续可选增强

- 拆出 `scripts/figma-export.mjs`，专门负责 REST 导出和图片资源下载。
- 增加 `scripts/figma-assets-download.mjs`，批量处理 SVG、PNG、WebP 和资源命名。
- 增加 metadata 质量检测，提示 canvas/page 节点、缺 bounds、section 过少等问题。
- 增加 practical diff 默认命令模板，和 strict diff 形成双报告。
