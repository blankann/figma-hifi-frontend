# Pixel Diff 参考

## 目的

使用 `scripts/figma-pixel-diff.mjs` 自动生成 Figma 设计基线、本地页面截图、像素差分图和 JSON/Markdown 报告，不要求用户手动导出图片。

## 命令

```bash
node ~/.agents/skills/figma-hifi-frontend/scripts/figma-pixel-diff.mjs \
  --file-key F73HLQHKaCfL0QRYdJSev0 \
  --node-id 50:929 \
  --url http://localhost:3000/v2/valuationResult \
  --cache-root ~/.cache/figma-mcp \
  --viewport-width 375 \
  --compare-mode design-bounds \
  --scale 2
```

## 必填输入

- `FIGMA_TOKEN`：可读取目标 Figma 文件的 personal access token。
- `--file-key`：Figma 文件 key，来自 `/design/:fileKey/`。
- `--node-id`：Figma 节点 id，支持 `50:929` 和 `50-929`。
- `--url`：需要 Playwright 截图的本地页面 URL。

## 可选输入

- `--cache-root`：默认 `~/.cache/figma-mcp`。
- `--viewport-width`：默认 `375`。
- `--viewport-height`：CSS px；默认使用导出的设计图高度除以 `--scale`，再回退到 `812`。
- `--scale`：Figma 导出倍率和浏览器 `deviceScaleFactor`，默认 `2`。
- `--compare-mode`：`design-bounds`、`full-page` 或 `viewport`，默认 `design-bounds`。
- `--threshold`：pixelmatch 阈值，默认 `0.1`。
- `--max-diff-ratio`：通过阈值，默认 `0.02`。
- `--background`：透明区域或短图补底色，默认 `#f5f6f7`。
- `--hide-selector`：截图前隐藏的 CSS selector，可重复传入。默认包含常见 VConsole selector。
- `--sections-json`：区块 bounds JSON；缺省时脚本自动查找 `<cache>/<fileKey>/<nodeId>/summaries/sections.json`。
- `--section-unit`：`css` 或 `pixel`，默认 `css`。
- `--band-diff`：仅诊断使用。section 缺失或为空时，显式生成横向 band diff fallback。
- `--band-height`：band fallback 的 CSS px 高度，默认 `125`。
- `--wait-ms`：截图前额外等待时间，默认 `500`。

## 对齐模式

- `design-bounds`：只比较 Figma 导出图范围。默认用于高保真验收，避免本地多余空白污染 diff。
- `full-page`：比较本地完整页面高度。用于诊断多余内容、滚动高度或页面截断。
- `viewport`：只比较一个视口。用于首屏检查。

注意：Figma REST 导出的图片尺寸是 device px，Playwright viewport 使用 CSS px。脚本会用 `designImage.height / scale` 创建浏览器 viewport。

## 输出产物

示例输出目录：

```text
~/.cache/figma-mcp/F73HLQHKaCfL0QRYdJSev0/50_929/
  screenshots/
    design.png
    local.png
    diff.png
    sections/
      <section-name>-diff.png
  summaries/
    pixel-diff-report.json
    pixel-diff-summary.md
```

报告字段包括：

- `width`
- `height`
- `diffPixels`
- `totalPixels`
- `diffRatio`
- `threshold`
- `maxDiffRatio`
- `passed`
- 传入 `--sections-json` 时的 section 级 diff 条目

## 分区 diff

高保真验收必须有分区 diff。`pixel-diff-report.json.sections` 为空时，验收无效；先运行合同生成脚本得到 `sections.json`，或在诊断坏数据时显式加 `--band-diff`。

`sections.json` 示例，坐标单位为 CSS px：

```json
[
  { "name": "header", "x": 0, "y": 0, "width": 375, "height": 94 },
  { "name": "hero", "x": 0, "y": 94, "width": 375, "height": 58 }
]
```

运行方式：

```bash
node ~/.agents/skills/figma-hifi-frontend/scripts/figma-pixel-diff.mjs \
  --file-key <file-key> \
  --node-id <node-id> \
  --url <local-url> \
  --sections-json ./sections.json \
  --section-unit css
```

`sections.json` 可由 `scripts/figma-build-contract.mjs` 从 metadata 生成。分区 diff 用于决定修复顺序，避免一个复杂区块污染整页总分。

脚本会在 summary 中输出：

- `sectionsSource`：实际使用的 section 文件或 band fallback。
- `Worst Sections`：按 diffRatio 降序排列的高差异区域。
- `Sections`：完整分区 diff 列表。

如果没有可用 section 且未传 `--band-diff`，脚本必须失败，不写出看似通过的验收报告。

## 依赖策略

- 脚本优先从目标项目加载 `@playwright/test`。
- `pixelmatch` 和 `pngjs` 安装在本 Skill 目录。
- 不要把通用 pixel diff 依赖加入业务项目，除非业务项目明确需要自己的 npm script。

## 失败处理

- 缺少 `FIGMA_TOKEN`：停止并要求用户配置能读取 Figma 文件的 token。
- Figma API 未返回图片 URL：检查 `fileKey`、`nodeId` 和 token 权限。
- 本地 URL 加载失败：启动开发服务器后重跑。
- 目标项目缺少 Playwright：安装浏览器自动化依赖，或使用项目已有截图方案。
- `sections.json` 缺失或为空：先运行 `figma-build-contract.mjs`；若 metadata 不足，重新请求目标 frame/child metadata；仅临时诊断时加 `--band-diff`。
- diff 很大：先看 `pixel-diff-summary.md` 的 Worst Sections，再根据设计合同修正。
- 本地截图高度是设计图两倍：检查 `--scale`，不要把 device px 高度传给 `--viewport-height`。

## 资源导出

静态高差异区块应先检查 `assets-index.json`，再调用：

```bash
node ~/.agents/skills/figma-hifi-frontend/scripts/figma-export-assets.mjs \
  --file-key <file-key> \
  --node-id <node-id> \
  --cache-root ~/.cache/figma-mcp \
  --scale 2
```

输出：

- `assets/*`：导出的 PNG/SVG。
- `assets/exported-assets.json`：导出 manifest，包含成功和失败节点。

缺少 `FIGMA_TOKEN`、权限不足或 Figma API 未返回资源 URL 时停止；不要用占位图替代真实资源来通过验收。
