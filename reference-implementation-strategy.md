# 实现策略参考

## 目标

把 Figma MCP 原始实现转译成目标项目当前技术栈，而不是用截图或大块图片绕过还原。

## 核心顺序

1. 先保存 MCP `get_design_context` 原始 HTML/DOM/CSS/Tailwind/inline style。
2. 再生成 section 合同和资源索引。
3. 逐 section 从 MCP 原始结构提取层级、尺寸、字体、颜色、资源引用。
4. 转译为项目既有框架、组件和样式体系。
5. 用 section diff 反向定位问题，再回到 MCP 原始结构修正。

## 节点分类

- `translated-dom`：从 MCP 原始 DOM / 样式转译出的页面结构。默认用于卡片、营销块、图表、趋势图、表格、标签、说明模块等可 DOM 表达 UI。
- `semantic-dom`：文本、普通布局、简单卡片、按钮、标签。
- `component-dom`：重复卡片、tabs、表单控件、导航、交互控件。
- `svg-asset`：图标、logo、简单 vector。
- `bitmap-asset`：Figma 原本就是 bitmap/photo/imageRef/远程图片，或明确由真实业务图片承载的节点。
- `data-bound`：车辆图、头像、价格、列表数据等业务内容。
- `ignore`：隐藏层、设计标注、重复状态层、实验层。
- `full-frame-image`：完整 frame / 整页截图。该分类为禁止项，只允许临时诊断或设计基线，不允许作为最终页面实现。

分类结果必须落到 `layout-contract.md` 或 `assets-index.json`。
每个主要 section 都必须标注一个允许分类：`translated-dom`、`semantic-dom`、`component-dom`、`svg-asset`、`bitmap-asset`、`data-bound`、`ignore`。
如果识别出 `full-frame-image`，必须停止实现并重新拆分 section。

## Section 合同字段

每个主要 section 至少写清：

- MCP 节点 ID 和 Figma 名称。
- 实现分类。
- DOM 节点映射：Figma 层名 -> 项目组件/HTML class。
- 关键尺寸：x、y、width、height、padding、gap、radius。
- 关键样式：字体、字号、字重、行高、颜色、背景、边框、阴影。
- 资产来源：SVG、bitmap、业务图片 URL 或 fixture 字段。
- 忽略节点和忽略原因。

## 决策规则

- 可 DOM 表达的 UI 必须转译为 DOM / 项目组件，不得图片化。
- MCP 返回 Tailwind 或 inline style 时，只提取设计事实，不新增 Tailwind 或项目外框架。
- 简单图标和矢量，优先 SVG。
- 只有原始位图、照片、imageRef、远程图片或业务图片节点可用 `bitmap-asset`。
- 复用项目组件时，不得破坏 Figma 的关键尺寸和层级。
- 高 diff section 的第一反应是回到 MCP 原始 DOM 和合同查漏，不是切图片。
- 禁止把完整 Figma frame、整页截图或完整页面 PNG 作为最终页面主体。

## 强制决策表

| Figma 区域类型 | 默认实现 | 可例外条件 | 验收关注 |
|---|---|---|---|
| 正文、价格、列表字段、按钮文案 | translated-dom / DOM / 项目组件 | 无 | 字体、行高、颜色、换行和截断 |
| 简单卡片、表格、标签、分隔线 | translated-dom + 项目样式 | 无 | padding、gap、radius、border |
| 营销卡、保障卡、模式介绍、说明模块 | translated-dom | 背景中独立存在原始 bitmap/photo 时只导出背景位图 | 层级、文案、装饰、相邻 DOM 对齐 |
| 静态图表、趋势曲线、评分星标组合 | translated-dom / SVG | 原始图表是 imageRef 或远程图片 | 坐标、曲线、标签、线宽、颜色 |
| 图标、logo、单色 vector | SVG asset | 项目已有完全一致图标可复用 | 视口盒子、颜色、对齐 |
| 照片、车辆图、头像、截图式业务图 | bitmap-asset / data-bound image | 真实接口图片替换 | object-fit、裁剪、圆角 |
| 表单、tabs、弹窗、导航等交互控件 | component-dom | Figma 样式与组件差距过大时定制皮肤 | 可用性和视觉一致性 |
| 隐藏层、标注层、重复状态层 | ignore | 当前状态正是目标状态 | 合同中显式说明忽略原因 |
| 完整 frame / 整页截图 | 禁止 | 仅可作为 design baseline 或临时诊断 | 不得进入最终页面主体 |

## 图片使用例外

`bitmap-asset` 只表示原始位图来源，不表示“复杂 UI 可以截图交付”。

允许：

- Figma 节点存在 `imageRef`。
- 节点名称或 metadata 明确是 photo、bitmap、车辆图、头像、业务截图。
- 远程 URL 或接口字段就是该视觉内容的真实来源。

不允许：

- 为了降低 diff，把卡片、营销块、趋势图、说明区、表格、标签整体截图。
- 将多个可编辑文本和装饰合并导出为一张区域图。
- 用完整页面 PNG 或完整 frame 截图作为页面主体。

## 资源导出

`scripts/figma-export-assets.mjs` 只导出：

- `bitmap-asset`
- `svg-asset`

其余节点类型不在导出范围内。

`assets-index.json` 的最小有效字段建议为：

- `nodeId`
- `type`
- `targetFile`
- `sourceReason`

## 收敛顺序

1. 全局尺寸、背景、安全区、字体
2. section top、height、padding、gap
3. 对照 MCP 原始 DOM 修正 section 内部层级
4. SVG / bitmap 原始资源的尺寸、裁切和对齐
5. 重新执行 diff

## 报告要求

最终说明至少区分：

- 哪些区域来自 MCP 原始 DOM 转译
- 哪些区域使用项目组件
- 哪些区域使用 SVG 或 `bitmap-asset`
- 哪些区域依赖 fixture / 数据绑定
- 哪些节点被显式忽略
- 是否出现并排除了 `full-frame-image`
