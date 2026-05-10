# Pixel Diff 参考

## 目的

`scripts/figma-pixel-diff.mjs` 自动生成：

- `design.png`
- `local.png`
- diff 图
- `pixel-diff-report.json`
- `pixel-diff-summary.md`

## 命令

```bash
node scripts/figma-pixel-diff.mjs \
  --file-key F73HLQHKaCfL0QRYdJSev0 \
  --node-id 50:929 \
  --url "http://localhost:3000/v2/priceToolResult?clue_id=demo&mock=1" \
  --cache-root docs/hifi/figma \
  --viewport-width 375 \
  --compare-mode design-bounds \
  --preset both \
  --scale 2
```

参数真值以 `node scripts/figma-pixel-diff.mjs --help` 为准。

## 输入契约

必需条件：

- `FIGMA_TOKEN`
- `--file-key`
- `--node-id`
- `--url`
- `docs/hifi/figma/<fileKey>/node-<node-id>/summaries/sections.json` 存在且非空，或显式传 `--sections-json`

分区 diff：

- 默认读取 `summaries/sections.json`
- 也可显式传 `--sections-json`
- `sections.json` 坐标默认按 CSS px 解释

## Preset 语义

脚本支持三种模式：

- `--preset strict`
- `--preset practical`
- `--preset both`

默认行为：

- 未显式传阈值时，默认 `both`
- 如果使用 legacy `--threshold` / `--max-diff-ratio`，则兼容为单一 `practical`

语义约束：

- `strict`：用于定位问题，阈值更严格
- `practical`：用于是否可验收的判断
- `both`：同时输出两组结果，主报告的顶层 `diff` / `sections` 默认对齐 `practical`

## 报告契约

`pixel-diff-report.json` 的关键字段：

- `preset`
- `activeProfile`
- `diff`
- `sections`
- `sectionsSource`
- `profiles.strict`
- `profiles.practical`

说明：

- 顶层 `diff` / `sections` 是当前激活视角
- `profiles.*` 才是完整的 profile 级结果
- 文档和后续自动化应优先消费 `profiles`

## 输出产物

```text
docs/hifi/figma/<fileKey>/node-<node-id>/
  screenshots/
    design.png
    local.png
    diff.png
    diff-strict.png
    diff-practical.png
    sections/
      strict/
      practical/
  summaries/
    pixel-diff-report.json
    pixel-diff-summary.md
```

当只跑单 preset 时：

- `diff.png` 就是该 preset 的主 diff
- `diff-strict.png` / `diff-practical.png` 不一定同时存在

## 分区 diff 与 band fallback

验收规则：

- 有 section diff 才能做正式验收
- `pixel-diff-report.json.sections` 为空时，不能宣称通过
- 缺少 `screenshots/design.png` 或 `screenshots/local.png` 时，不能宣称完成视觉验收
- 顶层 `diff.passed=false` 或 active profile 未通过时，最终回复只能说“诊断完成”或“未通过验收”，不能说“高保真完成”
- `--band-diff` 只允许做诊断性 fallback

诊断规则：

- section 缺失且显式传 `--band-diff` 时，允许生成 band diff
- band diff 只能帮助定位大致区域，不能替代真实 section 合同

## 常见失败

- 缺少 `FIGMA_TOKEN`
- Figma API 无法导出设计图
- 本地 URL 无法稳定加载
- 缺少 Playwright
- `sections.json` 缺失或为空
- 在 `--preset both` 下又传 legacy 阈值覆盖

## 验收建议

- 报告结果时同时说明 `strict` 与 `practical`
- 修复顺序看 `worstSections`
- 先解决结构偏移，再处理细节视觉差异
