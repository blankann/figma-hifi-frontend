# 设计合同生成参考

## 目的

使用 `scripts/figma-build-contract.mjs` 在编码前把 Figma metadata 转换为可执行的设计合同产物。

脚本接受 MCP metadata XML、Figma REST JSON 或提取后的节点 JSON。脚本本身不请求 Figma；必须先通过 MCP 或 REST 工具获取 metadata，并保存到 raw 文件后再运行。

## 命令

```bash
node ~/.agents/skills/figma-hifi-frontend/scripts/figma-build-contract.mjs \
  --file-key F73HLQHKaCfL0QRYdJSev0 \
  --node-id 50:929 \
  --metadata ~/.cache/figma-mcp/F73HLQHKaCfL0QRYdJSev0/50_929/raw/get_metadata.xml \
  --cache-root ~/.cache/figma-mcp \
  --figma-url "https://www.figma.com/design/..." \
  --target-name "估价结果"
```

## 必填输入

- `--file-key`：Figma 文件 key。
- `--node-id`：Figma 节点 id，支持 `50:929` 和 `50-929`。
- `--metadata`：已保存的 metadata 文件，支持 XML 和 JSON。

## 可选输入

- `--cache-root`：默认 `~/.cache/figma-mcp`。
- `--out-dir`：覆盖输出节点目录。
- `--figma-url`：原始 Figma 链接，用于写入合同。
- `--target-name`：目标节点名称兜底值。
- `--design-width`：metadata 缺少 bounds 时的设计宽度兜底值。
- `--design-height`：metadata 缺少 bounds 时的设计高度兜底值。

## 输出产物

示例输出目录：

```text
~/.cache/figma-mcp/F73HLQHKaCfL0QRYdJSev0/50_929/
  summaries/
    node-index.json
    sections.json
    assets-index.json
    layout-contract.md
    manifest-patch.json
```

产物职责：

- `node-index.json`：扁平节点索引，包含 id、名称、类型、父节点、深度、可见性、bounds 和子节点数量。
- `sections.json`：目标节点下一级可见区块，按 y/x 排序，坐标相对目标节点原点，可直接传给 `figma-pixel-diff.mjs --sections-json`。
- `assets-index.json`：图片、vector、图表、营销卡等资源策略的初判，包含 `targetFile`、bounds 和建议使用方式。
- `layout-contract.md`：面向实现的设计合同，包含覆盖表、关键布局表、资源清单、文本节点和样式线索。
- `manifest-patch.json`：建议合并进任务 manifest 的字段。

## 生成策略

脚本只生成保守的一版合同初稿：

- 不编造缺失的尺寸、颜色、阴影或交互。
- bounds 缺失时，合同中保留 `TBD`。
- 资源分类结合节点名称、类型、imageRef、paint/effect 线索初判，必须再结合截图和设计上下文确认。
- `sections.json` 默认使用 CSS px，适合分区 diff。
- 目标节点没有 usable bounds 时直接失败；不能静默生成空 `sections.json`。
- 子节点无法形成分区时，允许使用目标节点自身作为单一 section；如果目标也无 bounds，则停止。

## 合同字段标准

`layout-contract.md` 至少应提供：

- 目标尺寸、缓存路径、设计基线路径和换算规则。
- 可见节点覆盖表：节点名、代码位置、实现状态、bounds。
- 关键布局参数：section 尺寸和位置，缺失字段保留 `TBD`。
- 资源清单：节点、策略、目标文件、导出方式、建议使用方式和 bounds。
- 文本节点：文本内容、bounds、字体/字号/行高等样式线索。
- 样式线索：fill、stroke、radius、effect、imageRef 等 metadata 中存在的信息。

大量 `TBD` 表示 metadata 不足，需重新拉取更完整的 Figma 数据；不要直接进入编码。

## 失败处理

- 缺少 metadata：先获取并保存 Figma metadata。
- `sections.json` 为空：视为失败。metadata 没有可用 bounds 时，检查 raw 或改为请求目标 frame/子节点 metadata。
- 目标节点错误：确认 `--node-id` 是否指向真实 frame/section，而不是 canvas/page。
- 未识别资源：简单页面可以没有资源节点，不要强制补资源。
