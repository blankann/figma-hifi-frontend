# 实现策略参考

## 目标

在保证高保真的前提下，选择最稳妥的实现方式，而不是默认追求“纯 DOM”。

## 节点分类

- `semantic-dom`：文本、普通布局、简单卡片、按钮、标签
- `component-dom`：重复卡片、tabs、表单控件、导航、交互控件
- `svg-asset`：图标、logo、简单 vector
- `image-asset`：复杂静态图、营销卡、复杂渐变、截图式视觉
- `data-bound`：商品图、头像、价格、列表数据等业务内容
- `ignore`：隐藏层、设计标注、重复状态层、实验层

分类结果必须落到 `layout-contract.md` 或 `assets-index.json`。

## 决策规则

- 需要可访问、可选择、可动态更新的内容，用 DOM / 组件
- 简单图标和矢量，优先 SVG
- 难以稳定复刻的复杂静态视觉，优先图片化
- 复用项目组件时，不得破坏 Figma 的关键尺寸和层级
- 一轮修正后仍高 diff 的静态区块，必须切换 asset

## 默认图片化区域

以下内容默认不做纯 DOM 复刻：

- 照片、车图、头像、截图、bitmap
- 多层渐变、复杂阴影、蒙版、混合模式
- 静态图表、趋势图、曲线、装饰插画
- 营销卡、保障卡、模式介绍卡等视觉优先区块

## 资源导出

`scripts/figma-export-assets.mjs` 只导出：

- `image-asset`
- `svg-asset`

其余节点类型不在导出范围内。

`assets-index.json` 的最小有效字段建议为：

- `nodeId`
- `type`
- `targetFile`

## 收敛顺序

1. 全局尺寸、背景、安全区、字体
2. section top、height、padding、gap
3. 简单 DOM 区域
4. 高 diff 静态区块切换 asset
5. 重新执行 diff

## 报告要求

最终说明至少区分：

- 哪些区域是 DOM / 组件
- 哪些区域被图片化或 SVG 化
- 哪些区域依赖 fixture / 数据绑定
- 哪些节点被显式忽略
