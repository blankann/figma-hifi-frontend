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
  --metadata ~/.cache/figma-mcp/F73HLQHKaCfL0QRYdJSev0/50_929/raw/get_metadata.xml \
  --cache-root ~/.cache/figma-mcp \
  --figma-url "https://www.figma.com/design/..." \
  --target-name "估价结果"
```

参数真值以 `node scripts/figma-build-contract.mjs --help` 为准。

## 输出契约

输出目录：

```text
<cache>/<fileKey>/<nodeId>/
  summaries/
    node-index.json
    sections.json
    assets-index.json
    layout-contract.md
    manifest-patch.json
```

字段约束：

- `node-index.json`：扁平节点索引
- `sections.json`：必须非空，坐标单位为 CSS px
- `assets-index.json`：静态资源策略初判
- `layout-contract.md`：供实现阶段直接消费
- `manifest-patch.json`：写回任务 manifest 的建议字段

## 失败条件

以下情况视为失败，不应静默降级：

- 缺少 metadata 文件
- 目标节点没有 usable bounds
- `sections.json` 为空
- 没有可见且有 bounds 的分区节点

## 使用建议

- `layout-contract.md` 出现大量 `TBD` 时，先补 metadata，不直接编码
- `assets-index.json` 是策略初判，不等于最终实现
- 合同层成功是进入编码阶段的前提，不是可选步骤
