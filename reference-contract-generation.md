# 设计合同生成参考

## 目的

`scripts/figma-build-contract.mjs` 在编码前把 Figma metadata 转成可执行合同。

## 支持的输入

`--metadata` 支持三类输入：

- 提取后的节点 JSON
- Figma REST JSON
- MCP metadata XML

脚本会在输出里标记 `metadataSource`，用于记录实际来源。

## 命令

```bash
node scripts/figma-build-contract.mjs \
  --file-key F73HLQHKaCfL0QRYdJSev0 \
  --node-id 50:929 \
  --metadata docs/hifi/figma/F73HLQHKaCfL0QRYdJSev0/node-50-929/raw/get_metadata.xml \
  --cache-root docs/hifi/figma \
  --out-dir docs/hifi/figma/F73HLQHKaCfL0QRYdJSev0/node-50-929 \
  --figma-url "https://www.figma.com/design/..." \
  --target-name "估价结果"
```

参数真值以 `node scripts/figma-build-contract.mjs --help` 为准。

默认缓存根是 `docs/hifi/figma`。如需覆盖，只能使用 `--cache-root` 或 `FIGMA_HIFI_CACHE_ROOT`，但仍应保持 `<fileKey>/node-<node-id>/` 结构。

## 输出契约

输出目录：

```text
docs/hifi/figma/<fileKey>/node-<node-id>/
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
```

字段约束：

- `node-index.json`：扁平节点索引
- `sections.json`：必须存在且非空，坐标单位为 CSS px
- `assets-index.json`：真实位图、照片、业务图片和 SVG 资源策略初判
- `layout-contract.md`：供实现阶段直接消费
- `manifest-patch.json`：写回任务 manifest 的建议字段
- `raw/get_design_context.tsx`：Figma MCP 直出 HTML/DOM/CSS 结构，是设计合同和项目技术栈转译的输入；不得用摘要替代，也不得直接复制到项目实现

## 失败条件

以下情况视为失败，不应静默降级：

- 缺少 metadata 文件
- 目标节点没有 usable bounds
- `sections.json` 为空
- 没有可见且有 bounds 的分区节点

## 使用建议

- `layout-contract.md` 出现大量 `TBD` 时，先补 metadata，不直接编码
- `sections.json` 缺失或为空时，必须停止，不能进入实现阶段
- `assets-index.json` 是策略初判，不等于最终实现
- 合同层成功是进入编码阶段的前提，不是可选步骤
