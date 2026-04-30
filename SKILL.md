---
name: figma-hifi-frontend
description: 将 Figma 设计稿高保真还原为目标项目当前技术栈的前端代码。适用于 Figma MCP 读稿、稿转代码、像素级还原、截图对比、pixel diff、移动端或桌面端页面实现。必须先识别项目技术栈与样式体系，再按项目既有规范实现；不得预设 React、Tailwind 或任何特定框架。
---

# Figma 高保真前端还原

## 适用场景

只要任务涉及 Figma URL、Figma MCP、设计稿实现、高保真还原、截图对比、pixel diff、设计 token、静态资源提取，就必须使用本 Skill。

## 一次性高保真流水线

处理任意 Figma 链接时，按六层流水线执行：

1. 数据获取层：解析 `fileKey`、`nodeId`，识别项目技术栈；用 MCP 获取结构、metadata、variables、设计上下文；用 Figma REST API 获取可落盘 `design.png`。
2. 设计合同层：保存 raw 后调用 `scripts/figma-build-contract.mjs`，生成非空 `node-index.json`、`sections.json`、`layout-contract.md`、`assets-index.json`、`manifest-patch.json`。
3. 实现策略层：按节点复杂度选择 DOM / SVG / 图片化 / 数据绑定 / 忽略策略，复杂静态资源调用 `scripts/figma-export-assets.mjs` 导出，详见 `reference-implementation-strategy.md`。
4. 自动截图层：本地运行页面，使用 Playwright 截取稳定的 `local.png`，隐藏调试浮层并等待字体和图片加载。
5. Pixel Diff 层：调用 `scripts/figma-pixel-diff.mjs` 生成 `diff.png`、分区 diff、`pixel-diff-report.json` 和 `pixel-diff-summary.md`。
6. 自动收敛层：根据 section diff 有序修正，最多自动迭代 2 轮；仍未收敛时停止并报告残余差异。

硬规则：

- 没有可落盘 REST 设计图，不宣称完成 pixel diff。
- 没有 `layout-contract.md`、非空 `sections.json`、`assets-index.json`、`screenshots/design.png`，不开始编码。
- `get_design_context` 返回的代码只作设计表达参考，不能直接复制成最终实现。
- 复杂静态视觉允许图片化，不为了“纯 DOM”牺牲高保真。
- 整页 diff 只作总览，收敛优先看 section diff。
- strict diff 用于定位，practical diff 用于验收。
- `pixel-diff-report.json` 里 `sections` 为空时，不宣称完成验收；先重建合同或显式使用 `--band-diff` 做诊断。
- diff 超过阈值时，不宣称“高保真完成”，必须报告最高差异 section 和下一轮修复策略。

六层能力的文件落点见 `reference-workflow-layers.md`。

## 数据获取与缓存

优先从 Figma URL 解析：

- `fileKey`：`/design/:fileKey/`
- `nodeId`：`node-id=1-2`，调用工具时规范化为 `1:2`

读取顺序：

1. 判断是否强制刷新。触发词包括：`强制请求`、`不使用缓存`、`忽略缓存`、`重新拉取 Figma`、`force refresh`、`no cache`。
2. 未强制刷新时，先检查 `<cache-root>/<fileKey>/<nodeId>/manifest.json` 和 raw/summaries。
3. 缓存缺失时调用 MCP：`get_design_context`、必要时 `get_metadata`、`get_variable_defs`、`get_screenshot`、`search_design_system`。
4. 保存 raw 后立即生成或更新 summaries；`sections.json` 为空视为合同失败。
5. 需要 pixel diff 时，使用 Figma REST API 导出可落盘 `screenshots/design.png`。
6. 需要真实图片/SVG 时，根据 `assets-index.json` 调用资源导出脚本。

推荐缓存结构：

```text
<cache-root>/<fileKey>/<nodeId-normalized>/
  manifest.json
  raw/
    get_design_context.json
    get_metadata.xml
    get_variable_defs.json
  summaries/
    node-index.json
    sections.json
    layout-contract.md
    tokens.json
    assets-index.json
    pixel-diff-report.json
    pixel-diff-summary.md
  screenshots/
    design.png
    local.png
    diff.png
    sections/
  assets/
    exported-assets.json
```

首次需要缓存且没有已配置缓存根目录时，向用户选择：项目内共享 `docs/references/figma/cache/`、项目内本地 `.figma-cache/`、用户目录 `~/.cache/figma-mcp/` 或自定义路径。

## 目标项目适配

编码前必须识别目标项目：

- 框架：React / Vue / Next / Nuxt / 原生 H5 / 小程序 / 其他
- 语言：TypeScript / JavaScript / Vue SFC / HTML / CSS / SCSS / Less 等
- 样式体系：SCSS、CSS Modules、Tailwind、Less、styled-components、组件库主题、全局 CSS 等
- 路由、状态、资源、构建和目录约定

Figma MCP 调用里的 `clientLanguages`、`clientFrameworks` 必须来自项目事实；不确定时填 `unknown`。未经用户明确同意，不得因为 MCP 返回 Tailwind 片段就新增 Tailwind 或其他框架依赖。

## 设计合同

实现前必须有 `summaries/layout-contract.md`。如果已有 metadata/raw，优先执行：

```bash
node ~/.agents/skills/figma-hifi-frontend/scripts/figma-build-contract.mjs \
  --file-key <figma-file-key> \
  --node-id <figma-node-id> \
  --metadata <metadata-xml-or-json> \
  --cache-root <figma-cache-root> \
  --figma-url <figma-url>
```

合同生成工具的完整说明见 `reference-contract-generation.md`。

生成后必须检查：

- `summaries/sections.json` 非空，坐标单位为 CSS px。
- `summaries/assets-index.json` 覆盖车图、头像、趋势图、营销卡、复杂保障卡等静态视觉节点。
- `summaries/layout-contract.md` 包含关键布局、资源清单、文本节点和样式线索；大量 `TBD` 时先补 raw/metadata，不直接编码。

## 实现策略

实现策略必须记录在 `layout-contract.md` 或 `assets-index.json` 中：

- `semantic-dom`：文本、普通布局、简单卡片、按钮。
- `component-dom`：重复卡片、tabs、表单、交互控件。
- `svg-asset`：icon、logo、简单 vector。
- `image-asset`：复杂静态图表、营销卡、多层渐变、截图式设计。
- `data-bound`：商品图、头像、价格、列表内容等业务数据。
- `ignore`：隐藏层、实验层、标注层、不可见节点。

车图、头像、营销卡、复杂图表、复杂渐变、截图式区域默认进入 asset 流程；只有文本、简单卡片、按钮、列表骨架优先 DOM。

导出资源默认命令：

```bash
node ~/.agents/skills/figma-hifi-frontend/scripts/figma-export-assets.mjs \
  --file-key <figma-file-key> \
  --node-id <figma-node-id> \
  --cache-root <figma-cache-root> \
  --scale 2
```

详细规则见 `reference-implementation-strategy.md`。

## 视觉验收

用户要求高保真、像素级、1:1、截图对比或 pixel diff 时，默认执行自动视觉验收；除非用户明确要求跳过。

默认命令：

```bash
node ~/.agents/skills/figma-hifi-frontend/scripts/figma-pixel-diff.mjs \
  --file-key <figma-file-key> \
  --node-id <figma-node-id> \
  --url <local-page-url> \
  --cache-root <figma-cache-root> \
  --viewport-width <design-width> \
  --compare-mode design-bounds \
  --sections-json <cache-root>/<file-key>/<node-id>/summaries/sections.json \
  --scale 2
```

脚本需要 `FIGMA_TOKEN`，且 token 必须能读取目标 Figma 文件。缺少 token 或权限不足时，明确说明无法自动获取设计基线，不要退回手动导出图片。

默认使用 `--compare-mode design-bounds`，避免本地页面额外空白污染 diff。诊断整页滚动高度时用 `full-page`，只看首屏时用 `viewport`。默认必须生成 section diff；脚本会自动查找 `summaries/sections.json`，也可以显式传入 `--sections-json`。只有诊断无法生成 section 的坏数据时，才显式传 `--band-diff` 生成横向 band fallback。

详细参数见 `reference-pixel-diff.md`。

## 收敛规则

按以下顺序修正：

1. 页面尺寸、背景、安全区、全局字体。
2. section top、height、padding、gap。
3. 简单 DOM 区块内部细节。
4. 高 diff 的复杂静态区块切换为 image/SVG asset。
5. 重新运行 section diff。

最多自动修正 2 轮。若 practical diff 通过、连续两轮改善不足，或差异来自字体渲染、动态数据、浏览器抗锯齿、Figma/browser 渲染差异，则停止并报告原因。

## 最终回复证据

最终回复必须说明：

- 使用的 Skill：`figma-hifi-frontend`
- Figma 数据来源：缓存 / 新拉取 / 强制刷新
- 关键产物路径：`manifest.json`、`layout-contract.md`、`design.png`、`local.png`、`diff.png`、`pixel-diff-report.json`
- 实际执行的验证命令
- 全局 diff 结果、最高差异 section、已修正内容、已图片化区域、未收敛原因、残余风险和下一步建议
