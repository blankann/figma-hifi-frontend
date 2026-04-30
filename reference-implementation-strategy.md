# 实现策略参考

## 目的

为 Figma 可见节点选择最合适的实现方式，在保证高保真的同时符合目标项目技术栈和维护成本。

## 节点分类

编码前先分类可见节点：

- `semantic-dom`：文本、普通布局、简单卡片、按钮、标签。
- `component-dom`：重复卡片、tabs、表单控件、导航、交互控件。
- `svg-asset`：图标、logo、vector group、简单装饰形状。
- `image-asset`：复杂静态图、无交互图表、营销卡、多层渐变、截图式设计。
- `data-bound`：商品图、头像、列表数据、价格等应来自接口或 fixture 的业务内容。
- `ignore`：隐藏层、画布外实验层、设计标注、重复状态层。

分类结果必须记录在 `assets-index.json` 或 `layout-contract.md` 中。

## 决策规则

- 需要可访问、可选择、动态更新或交互的内容，用 DOM/CSS。
- 图标、logo、简单 vector 优先导出 SVG 或内联 SVG。
- 难以用 CSS 稳定复刻的复杂静态视觉，优先图片化。
- 车图、头像、成交记录缩略图、复杂营销卡、保障卡、复杂渐变、截图式区域和静态趋势图，默认图片化或 SVG 化；除非用户明确要求动态编辑。
- 接口不稳定、权限复杂或数据会影响视觉时，使用 fixture 稳定渲染。
- 复用项目组件不能破坏 Figma 的关键尺寸、层级、图标语义或交互路径。
- 一轮 DOM 修正后 section diff 仍高于阈值的静态区块，必须切换为 asset，不继续手搓近似 CSS。

## 常见选择

| Figma 内容 | 推荐策略 | 说明 |
|---|---|---|
| Header / navbar | `semantic-dom` | 处理安全区、路由或 Native 返回 |
| 文本卡片 | `semantic-dom` | 精确还原字号、行高、padding、圆角 |
| 重复列表项 | `component-dom` + fixture | 固定 item 数量，保证 diff 稳定 |
| Button / tab / input | 项目组件或 DOM 包装 | 只有尺寸一致时才复用项目组件 |
| Icon | `svg-asset` | 单色图标优先 `currentColor` |
| 静态图表 | 默认 `image-asset` | 只有动态数据需求明确时才 DOM/SVG 实现 |
| 营销 banner / 保障卡 | `image-asset` 或 hybrid | 需要国际化/可访问时保留文本 DOM |
| 商品图 / 头像 / 成交缩略图 | `data-bound` + fixture 或 `image-asset` | 高保真验收时使用稳定本地资源，不用占位图 |
| 复杂渐变装饰 | `image-asset` | 避免脆弱的 CSS 近似 |

## 必须图片化的场景

以下情况默认不做纯 DOM 复刻：

- Figma 节点包含 image fill、bitmap、截图、照片、车辆图、头像。
- 多层插画、人物/汽车合成、复杂阴影、复杂渐变、蒙版或图层混合。
- 静态图表、曲线、坐标轴、气泡标注，只用于展示而非运行时数据编辑。
- 营销卡、服务保障卡、模式介绍卡等视觉优先区域。
- section diff 连续一轮修正后仍明显高于阈值，且差异来自静态视觉。

执行顺序：

1. 在 `assets-index.json` 中确认节点策略、目标文件和 bounds。
2. 调用 `scripts/figma-export-assets.mjs` 导出 PNG/SVG。
3. 代码中按 Figma bounds 固定尺寸、位置、圆角和裁切方式。
4. 文本需要可访问或可国际化时用 hybrid：背景/插画图片化，关键文本保留 DOM。

## 收敛循环

1. 先对齐页面尺寸、背景、安全区、全局字体。
2. 再对齐 section top、height、padding、gap。
3. 先修简单 DOM 区块，再修复杂图片区块。
4. 静态区块一轮修正后仍高 diff，切换为 image/SVG asset。
5. practical diff 连续两轮改善不明显时停止。

收敛报告必须以 section diff 排序为依据。没有 section diff 时，只能报告“未完成验收”，不能把全局 diff 当作通过证据。

## 最终报告

最终说明需要区分：

- 精确 DOM 实现区域。
- asset 图片化或 SVG 化区域。
- 数据绑定或 fixture 区域。
- 明确忽略的节点。
- 最高差异 section 和对应 diff 图片。
- 残余差异原因，例如字体渲染、浏览器抗锯齿、动态数据、Figma 与浏览器渲染差异。
