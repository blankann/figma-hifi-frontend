# 六层工作流落点

本文件只说明“每一层落在哪些文件、负责什么”，不重复脚本参数。

## 单一事实源

- 流程规则：看 `SKILL.md`
- 命令参数：看脚本 `--help`
- 输入输出契约：看本文件和对应 reference
- 自动化验证：优先 `npm run validate`，只跑 smoke 时用 `npm run smoke`

## 缓存与产物目录

Figma 产物默认放在当前项目内：

```text
docs/hifi/figma/<fileKey>/node-<node-id>/
```

示例：

```text
docs/hifi/figma/F73HLQHKaCfL0QRYdJSev0/node-50-929/
```

目录必须按需创建。`node-id` 路径名统一用 `node-50-929` 形式；输入 `50:929` 或 `50-929` 都必须落到同一目录，禁止生成 `50_929`。

标准结构：

```text
docs/hifi/figma/
  F73HLQHKaCfL0QRYdJSev0/
    node-50-929/
      raw/
        get_metadata.xml
        get_design_context.tsx
        get_screenshot.json
        variables.json
      summaries/
        node-index.json
        sections.json
        assets-index.json
        layout-contract.md
        manifest-patch.json
        pixel-diff-report.json
        pixel-diff-summary.md
      assets/
        images/
        svg/
      screenshots/
        design.png
        local.png
        diff.png
        diff-strict.png
        diff-practical.png
        sections/
```

执行期间这些文件必须落盘，不能只保存在会话、临时 URL 或用户级缓存。是否提交大图、diff 图、导出资源由项目 PR 策略决定；但合同文件和验收摘要应优先保留在项目内，方便复盘。

## 1. 数据获取层

落点：

- `SKILL.md`
- `reference-pixel-diff.md`
- 缓存目录下的 `raw/`、`screenshots/design.png`

职责：

- 解析 Figma URL，得到 `fileKey`、`nodeId`
- 获取 MCP 结构、metadata、variables、设计上下文
- 通过 Figma REST API 导出可落盘设计图

## 2. 设计合同层

落点：

- `scripts/figma-build-contract.mjs`
- `reference-contract-generation.md`
- 缓存目录下的 `summaries/`

职责：

- 输出 `node-index.json`
- 输出非空 `sections.json`
- 输出 `assets-index.json`
- 输出 `layout-contract.md`
- 输出 `manifest-patch.json`

## 3. 实现策略层

落点：

- `reference-implementation-strategy.md`
- `scripts/figma-export-assets.mjs`

职责：

- 把节点分成 DOM、组件、SVG、图片、数据绑定、忽略
- 决定哪些区域必须图片化
- 生成可导出的资源计划

## 4. 自动截图层

落点：

- `scripts/figma-pixel-diff.mjs`

职责：

- 使用目标项目的 Playwright 截取 `local.png`
- 处理 CSS px / device px 换算
- 隐藏调试浮层并等待页面稳定

## 5. Pixel Diff 层

落点：

- `scripts/figma-pixel-diff.mjs`
- `reference-pixel-diff.md`

职责：

- 生成 `diff.png`
- 在 `both` 模式下额外生成 `diff-strict.png`、`diff-practical.png`
- 生成 `pixel-diff-report.json`
- 生成 `pixel-diff-summary.md`
- 生成 section 级 diff 图

## 6. 自动收敛层

落点：

- `SKILL.md`
- `reference-implementation-strategy.md`
- `reference-pixel-diff.md`

职责：

- 以 section diff 为主排序修复
- 复杂静态视觉优先切换 asset
- 最多自动修正两轮
- 无 section 证据时，只能报告“诊断完成”，不能报告“验收通过”
