#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const usage = `用法：
  figma-build-contract.mjs --file-key <key> --node-id <id> --metadata <path> [选项]

必填：
  --file-key <key>        Figma 文件 key
  --node-id <id>          Figma 节点 id，例如 50:929 或 50-929
  --metadata <path>       元数据文件。支持：提取后的节点 JSON、Figma REST JSON、MCP metadata XML

选项：
  --cache-root <path>     默认：$FIGMA_HIFI_CACHE_ROOT；否则 docs/hifi/figma
  --out-dir <path>        覆盖输出节点目录
  --figma-url <url>       原始 Figma 链接
  --target-name <name>    目标节点名称兜底值
  --design-width <px>     metadata 缺少 bounds 时的设计宽度兜底值
  --design-height <px>    metadata 缺少 bounds 时的设计高度兜底值
  --help                  显示帮助
`;

function parseArgs(argv) {
  const args = {
    cacheRoot: resolveDefaultCacheRoot(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];

    if (key === "--help" || key === "-h") {
      args.help = true;
      continue;
    }

    const take = () => {
      if (next == null || next.startsWith("--")) {
        throw new Error(`Missing value for ${key}`);
      }
      i += 1;
      return next;
    };

    switch (key) {
      case "--file-key":
        args.fileKey = take();
        break;
      case "--node-id":
        args.nodeId = normalizeNodeId(take());
        break;
      case "--metadata":
        args.metadata = take();
        break;
      case "--cache-root":
        args.cacheRoot = take();
        break;
      case "--out-dir":
        args.outDir = take();
        break;
      case "--figma-url":
        args.figmaUrl = take();
        break;
      case "--target-name":
        args.targetName = take();
        break;
      case "--design-width":
        args.designWidth = Number(take());
        break;
      case "--design-height":
        args.designHeight = Number(take());
        break;
      default:
        throw new Error(`Unknown argument: ${key}`);
    }
  }

  return args;
}

function assertRequired(args) {
  if (args.help) return;
  const missing = [];
  if (!args.fileKey) missing.push("--file-key");
  if (!args.nodeId) missing.push("--node-id");
  if (!args.metadata) missing.push("--metadata");
  if (missing.length > 0) {
    throw new Error(`Missing required input: ${missing.join(", ")}`);
  }
}

function normalizeNodeId(nodeId) {
  return String(nodeId).trim().replace(/-/g, ":");
}

function normalizeNodeIdForPath(nodeId) {
  return `node-${normalizeNodeId(nodeId).replace(/:/g, "-")}`;
}

function nodeIdForPath(nodeId) {
  return normalizeNodeIdForPath(nodeId);
}

function resolveDefaultCacheRoot() {
  if (process.env.FIGMA_HIFI_CACHE_ROOT) return process.env.FIGMA_HIFI_CACHE_ROOT;
  return "docs/hifi/figma";
}

function expandHome(inputPath) {
  if (!inputPath || inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/")) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

function toNumber(value) {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function rectFromObject(node) {
  const box = node.absoluteBoundingBox || node.absoluteRenderBounds || node.bounds || node.boundingBox || node;
  const x = toNumber(box.x ?? box.left);
  const y = toNumber(box.y ?? box.top);
  const width = toNumber(box.width ?? box.w);
  const height = toNumber(box.height ?? box.h);

  if ([x, y, width, height].some((value) => value == null)) return undefined;

  return { x, y, width, height };
}

function pickText(input) {
  return input.characters || input.text || input.value || input.content || "";
}

function pickStyle(input = {}) {
  const style = input.style || {};
  const effects = input.effects || input.shadows || [];
  const fills = input.fills || input.backgroundColor || input.fill || [];
  const strokes = input.strokes || input.stroke || [];
  const radius = input.cornerRadius ?? input.borderRadius ?? input.radius;

  return {
    fontFamily: style.fontFamily || input.fontFamily,
    fontWeight: style.fontWeight || input.fontWeight,
    fontSize: toNumber(style.fontSize ?? input.fontSize),
    lineHeightPx: toNumber(style.lineHeightPx ?? input.lineHeightPx ?? style.lineHeight),
    letterSpacing: toNumber(style.letterSpacing ?? input.letterSpacing),
    fills,
    strokes,
    radius: toNumber(radius),
    effects,
    imageRef: findImageRef(input),
  };
}

function findImageRef(input = {}) {
  const candidates = [
    input.imageRef,
    input.imageHash,
    ...(Array.isArray(input.fills) ? input.fills.map((fill) => fill?.imageRef || fill?.imageHash) : []),
  ].filter(Boolean);

  return candidates[0];
}

function compactStyle(style = {}) {
  const output = {};

  for (const [key, value] of Object.entries(style)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    output[key] = value;
  }

  return output;
}

function normalizeNode(input, depth = 0, parentId = null) {
  const id = input.id || input.nodeId || input.guid || input.dataNodeId;
  const rect = rectFromObject(input);
  const children = Array.isArray(input.children)
    ? input.children.map((child) => normalizeNode(child, depth + 1, id)).filter(Boolean)
    : [];

  if (!id && !input.name && children.length === 0) return undefined;

  return {
    id: id || `${parentId || "node"}-${depth}-${children.length}`,
    name: input.name || input.dataName || input.type || "Unnamed",
    type: input.type || input.nodeType || input.tagName || "UNKNOWN",
    parentId,
    depth,
    visible: input.visible !== false,
    bounds: rect,
    text: pickText(input),
    style: compactStyle(pickStyle(input)),
    children,
  };
}

function flattenTree(node, output = []) {
  output.push({
    id: node.id,
    name: node.name,
    type: node.type,
    parentId: node.parentId,
    depth: node.depth,
    visible: node.visible,
    bounds: node.bounds,
    text: node.text || "",
    style: node.style || {},
    childCount: node.children.length,
  });

  for (const child of node.children) {
    flattenTree(child, output);
  }

  return output;
}

function parseJsonMetadata(text, targetNodeId) {
  const json = JSON.parse(text);
  const candidate =
    json.nodes?.[targetNodeId]?.document ||
    json.document ||
    json.node ||
    json;

  return normalizeNode(candidate);
}

function detectMetadataSource(text, targetNodeId) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const json = JSON.parse(trimmed);
    if (json.nodes?.[targetNodeId]?.document) return "figma-rest-json";
    if (json.document) return "figma-rest-json";
    return "node-json";
  }
  return "mcp-metadata-xml";
}

function decodeXml(value = "") {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttributes(raw) {
  const attrs = {};
  const attrRegex = /([:\w-]+)\s*=\s*"([^"]*)"/g;
  let match;

  while ((match = attrRegex.exec(raw))) {
    attrs[match[1]] = decodeXml(match[2]);
  }

  return attrs;
}

function parseXmlMetadata(text) {
  const root = {
    id: "root",
    name: "root",
    type: "ROOT",
    children: [],
  };
  const stack = [root];
  const tagRegex = /<\s*(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)\s*>/g;
  let match;

  while ((match = tagRegex.exec(text))) {
    const [, closing, tagName, rawAttrs, selfClosing] = match;

    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    if (tagName.startsWith("?") || tagName.startsWith("!")) continue;

    const attrs = parseAttributes(rawAttrs);
    const node = normalizeNode({
      id: attrs.id || attrs.nodeId || attrs["node-id"],
      name: attrs.name || attrs.dataName || tagName,
      type: attrs.type || tagName,
      x: attrs.x,
      y: attrs.y,
      width: attrs.width,
      height: attrs.height,
      visible: attrs.visible === "false" ? false : undefined,
      characters: attrs.characters || attrs.text || attrs.value || "",
      fontFamily: attrs.fontFamily || attrs["font-family"],
      fontWeight: attrs.fontWeight || attrs["font-weight"],
      fontSize: attrs.fontSize || attrs["font-size"],
      lineHeightPx: attrs.lineHeightPx || attrs["line-height"],
      letterSpacing: attrs.letterSpacing || attrs["letter-spacing"],
      fill: attrs.fill || attrs.color || attrs.background || attrs["background-color"],
      stroke: attrs.stroke || attrs.border,
      cornerRadius: attrs.cornerRadius || attrs.radius || attrs["border-radius"],
      imageRef: attrs.imageRef || attrs.imageHash || attrs["image-ref"],
    }, stack.length - 1, stack.at(-1).id);

    if (!node) continue;
    const parent = stack.at(-1);

    if (node.bounds && parent?.bounds) {
      node.bounds = {
        ...node.bounds,
        x: parent.bounds.x + node.bounds.x,
        y: parent.bounds.y + node.bounds.y,
      };
    }

    parent.children.push(node);
    if (!selfClosing) stack.push(node);
  }

  return root.children.length === 1 ? root.children[0] : normalizeNode(root);
}

async function loadMetadata(filePath, targetNodeId) {
  const text = await fs.readFile(path.resolve(expandHome(filePath)), "utf8");
  const trimmed = text.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJsonMetadata(trimmed, targetNodeId);
  }

  return parseXmlMetadata(trimmed);
}

function hasUsableBounds(node) {
  return node?.bounds?.width > 0 && node?.bounds?.height > 0;
}

function pickTargetNode(tree, targetNodeId) {
  const nodes = flattenTree(tree);
  const found = nodes.find((node) => normalizeNodeId(node.id) === targetNodeId);
  if (!found) return tree;

  function find(node) {
    if (normalizeNodeId(node.id) === targetNodeId) return node;
    for (const child of node.children) {
      const result = find(child);
      if (result) return result;
    }
    return undefined;
  }

  return find(tree) || tree;
}

function chooseSections(target) {
  if (!hasUsableBounds(target)) {
    throw new Error(`Target node ${target.id || target.name || "unknown"} has no usable bounds; cannot generate sections.json`);
  }

  const directChildren = target.children
    .filter((child) => child.visible && hasUsableBounds(child))
    .sort((a, b) => (a.bounds.y - b.bounds.y) || (a.bounds.x - b.bounds.x));
  const expandedChildren = [];

  for (const child of directChildren) {
    const childArea = child.bounds.width * child.bounds.height;
    const targetArea = (target.bounds?.width || 0) * (target.bounds?.height || 0);
    const grandChildren = child.children
      .filter((grandChild) => grandChild.visible && hasUsableBounds(grandChild))
      .sort((a, b) => (a.bounds.y - b.bounds.y) || (a.bounds.x - b.bounds.x));
    const isLargeWrapper = targetArea > 0 && childArea / targetArea > 0.65 && grandChildren.length >= 3;

    if (isLargeWrapper) {
      expandedChildren.push(...grandChildren);
    } else {
      expandedChildren.push(child);
    }
  }

  const source = expandedChildren.length > 0
    ? expandedChildren.sort((a, b) => (a.bounds.y - b.bounds.y) || (a.bounds.x - b.bounds.x))
    : [target].filter(hasUsableBounds);
  const originX = target.bounds?.x || 0;
  const originY = target.bounds?.y || 0;

  const sections = source.map((node, index) => ({
    id: node.id,
    name: node.name || `section-${index + 1}`,
    x: Math.max(0, node.bounds.x - originX),
    y: Math.max(0, node.bounds.y - originY),
    width: node.bounds.width,
    height: node.bounds.height,
    absoluteBounds: node.bounds,
    type: node.type,
  }));

  if (sections.length === 0) {
    throw new Error("No visible bounded sections found; request child metadata or choose a frame node with usable bounds");
  }

  return sections;
}

function classifyAsset(node) {
  const name = `${node.name || ""} ${node.type || ""}`.toLowerCase();
  const hasImageRef = Boolean(node.style?.imageRef);
  const hasImageFill = Array.isArray(node.style?.fills)
    && node.style.fills.some((fill) => /IMAGE/i.test(fill?.type || ""));

  if (hasImageRef || hasImageFill) return "bitmap-asset";
  if (/image|png|jpg|jpeg|webp|bitmap|avatar|photo|picture|车辆|车图|头像|图片|照片|截图|截屏/.test(name)) return "bitmap-asset";
  if (/vector|svg|icon|line\/|union|boolean|star|logo|arrow|chevron|back|返回|图标/.test(name)) return "svg-asset";

  return undefined;
}

function slugifyAssetName(name, id, type) {
  const base = String(name || id || "asset")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "asset";
  const suffix = String(id || "").replace(/[^a-zA-Z0-9_-]+/g, "_");
  const extension = type === "svg-asset" ? "svg" : "png";

  return `${base}-${suffix}.${extension}`;
}

function buildAssets(flatNodes) {
  return flatNodes
    .map((node) => {
      const strategy = classifyAsset(node);
      if (!strategy) return undefined;

      return {
        figmaNode: node.name,
        nodeId: node.id,
        type: strategy,
        targetFile: `assets/${slugifyAssetName(node.name, node.id, strategy)}`,
        usage: inferAssetUsage(node),
        handling: strategy === "svg-asset" ? "Export as SVG or inline SVG" : "Export only when source is bitmap/photo/imageRef/business image",
        codeReference: "",
        suggestedUse: strategy === "svg-asset" ? "Use as icon/SVG with fixed box matching Figma bounds" : "Use img/background only for the original bitmap source; translate adjacent UI/text as DOM",
        bounds: node.bounds,
        sourceReason: strategy === "bitmap-asset" ? (node.style?.imageRef ? "imageRef" : "bitmap/photo/image naming or image fill") : "vector/icon naming",
        notes: node.style?.imageRef ? `imageRef=${node.style.imageRef}` : "",
      };
    })
    .filter(Boolean);
}

function inferAssetUsage(node) {
  const name = `${node.name || ""}`.toLowerCase();
  if (/车|vehicle|car/.test(name)) return "vehicle/record imagery";
  if (/头像|avatar/.test(name)) return "avatar";
  if (/icon|图标|arrow|chevron|back|返回/.test(name)) return "icon";
  return "bitmap or vector source asset";
}

function formatBounds(bounds) {
  if (!bounds) return "TBD";
  return `${Math.round(bounds.width)}x${Math.round(bounds.height)} @ (${Math.round(bounds.x)}, ${Math.round(bounds.y)})`;
}

function formatStyle(style = {}) {
  const parts = [];
  if (style.fontFamily) parts.push(`font=${style.fontFamily}`);
  if (style.fontWeight) parts.push(`weight=${style.fontWeight}`);
  if (style.fontSize) parts.push(`size=${style.fontSize}`);
  if (style.lineHeightPx) parts.push(`line=${style.lineHeightPx}`);
  if (style.radius != null) parts.push(`radius=${style.radius}`);
  if (style.imageRef) parts.push(`imageRef=${style.imageRef}`);
  if (Array.isArray(style.fills) && style.fills.length > 0) parts.push(`fills=${summarizePaints(style.fills)}`);
  if (style.fills && !Array.isArray(style.fills)) parts.push(`fill=${String(style.fills)}`);
  if (Array.isArray(style.effects) && style.effects.length > 0) parts.push(`effects=${style.effects.length}`);
  return parts.join("; ") || "TBD";
}

function summarizePaints(paints) {
  return paints
    .slice(0, 3)
    .map((paint) => paint?.type || paint?.color || "paint")
    .join(",");
}

function renderLayoutContract({ args, target, sections, assets }) {
  const bounds = target.bounds || {};
  const designWidth = args.designWidth || bounds.width || "";
  const designHeight = args.designHeight || bounds.height || "";

  const visibleRows = sections.map((section) => (
    `| ${section.name} | TBD | pending | ${section.type}; ${Math.round(section.x)},${Math.round(section.y)} ${Math.round(section.width)}x${Math.round(section.height)} |`
  ));
  const layoutRows = sections.map((section) => (
    `| ${section.name} | ${Math.round(section.width)}x${Math.round(section.height)} @ (${Math.round(section.x)}, ${Math.round(section.y)}) | TBD | TBD | TBD | TBD | TBD | TBD | TBD |`
  ));
  const assetRows = assets.map((asset) => (
    `| ${asset.figmaNode} | ${asset.type} | ${asset.usage || "TBD"} | ${asset.targetFile} | ${asset.handling} | ${asset.suggestedUse} | ${formatBounds(asset.bounds)} | ${asset.notes || ""} |`
  ));
  const textNodes = flattenTree(target)
    .filter((node) => node.visible && node.text)
    .slice(0, 80);
  const textRows = textNodes.map((node) => (
    `| ${node.name} | ${String(node.text).replace(/\s+/g, " ").slice(0, 80)} | ${formatBounds(node.bounds)} | ${formatStyle(node.style)} |`
  ));
  const styleNodes = flattenTree(target)
    .filter((node) => node.visible && Object.keys(node.style || {}).length > 0)
    .slice(0, 120);
  const styleRows = styleNodes.map((node) => (
    `| ${node.name} | ${node.type} | ${formatBounds(node.bounds)} | ${formatStyle(node.style)} |`
  ));

  return `## Figma 实现合同

- Figma 链接：${args.figmaUrl || ""}
- fileKey：${args.fileKey}
- nodeId：${args.nodeId}
- 目标节点类型 / 名称：${target.type} / ${args.targetName || target.name}
- 实现范围：${args.targetName || target.name}
- 设计稿宽度：${designWidth}
- 设计稿高度：${designHeight}
- 运行时视口规则：以设计宽度为基准，按目标项目移动端/桌面端规则适配
- 尺寸换算规则：Figma bounds 为 CSS px；REST 导出 PNG 为 device px，按 scale 换算
- 设计截图基线：screenshots/design.png
- 资源处理策略：见 summaries/assets-index.json
- Figma 数据来源：metadata/raw 自动生成
- 缓存根目录：${args.cacheRoot}
- manifest 路径：manifest.json
- layout-contract 路径：summaries/layout-contract.md

## 可见节点覆盖表

| Figma 节点 | 代码位置 | 是否已实现 | 备注 |
|---|---|---|---|
${visibleRows.length > 0 ? visibleRows.join("\n") : "| TBD | TBD | pending | 未从 metadata 解析到可用 bounds |"}

## 关键布局参数

| 区域 | 尺寸 | padding | gap | radius | font | color | border | shadow |
|---|---|---|---|---|---|---|---|---|
${layoutRows.length > 0 ? layoutRows.join("\n") : "| TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |"}

## 资源清单

| Figma 节点 | 类型 | 用途 | 目标文件 | 处理方式 | 建议使用方式 | bounds | 备注 |
|---|---|---|---|---|---|---|---|
${assetRows.length > 0 ? assetRows.join("\n") : "| TBD | TBD | TBD | TBD | TBD | TBD | TBD | 未自动识别出资源节点 |"}

## 文本节点

| Figma 节点 | 文本 | bounds | 样式线索 |
|---|---|---|---|
${textRows.length > 0 ? textRows.join("\n") : "| TBD | TBD | TBD | metadata 未提供文本节点 |"}

## 样式线索

| Figma 节点 | 类型 | bounds | 样式线索 |
|---|---|---|---|
${styleRows.length > 0 ? styleRows.join("\n") : "| TBD | TBD | TBD | metadata 未提供样式字段 |"}
`;
}

function buildNodeIndex(target) {
  return {
    root: {
      id: target.id,
      name: target.name,
      type: target.type,
      bounds: target.bounds,
    },
    nodes: flattenTree(target),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage);
    return;
  }

  assertRequired(args);

  const cacheRoot = path.resolve(expandHome(args.cacheRoot));
  const nodeDir = args.outDir
    ? path.resolve(expandHome(args.outDir))
    : path.join(cacheRoot, args.fileKey, nodeIdForPath(args.nodeId));
  const summariesDir = path.join(nodeDir, "summaries");
  const rawDir = path.join(nodeDir, "raw");
  const metadataPath = path.resolve(expandHome(args.metadata));
  const metadataRaw = await fs.readFile(metadataPath, "utf8");
  const metadataSource = detectMetadataSource(metadataRaw, args.nodeId);

  await fs.mkdir(summariesDir, { recursive: true });
  await fs.mkdir(rawDir, { recursive: true });

  const tree = await loadMetadata(metadataPath, args.nodeId);
  const target = pickTargetNode(tree, args.nodeId);
  const nodeIndex = buildNodeIndex(target);
  const sections = chooseSections(target);
  const assets = buildAssets(nodeIndex.nodes);
  const layoutContract = renderLayoutContract({ args, target, sections, assets });
  const manifestPatch = {
    figmaUrl: args.figmaUrl || "",
    fileKey: args.fileKey,
    nodeId: args.nodeId,
    targetName: args.targetName || target.name,
    targetType: target.type,
    metadataSource,
    designWidth: args.designWidth || target.bounds?.width,
    designHeight: args.designHeight || target.bounds?.height,
    updatedAt: new Date().toISOString(),
    summaries: {
      nodeIndex: "summaries/node-index.json",
      layoutContract: "summaries/layout-contract.md",
      assetsIndex: "summaries/assets-index.json",
      sections: "summaries/sections.json",
    },
  };

  await fs.writeFile(path.join(summariesDir, "node-index.json"), `${JSON.stringify(nodeIndex, null, 2)}\n`);
  await fs.writeFile(path.join(summariesDir, "sections.json"), `${JSON.stringify(sections, null, 2)}\n`);
  await fs.writeFile(path.join(summariesDir, "assets-index.json"), `${JSON.stringify(assets, null, 2)}\n`);
  await fs.writeFile(path.join(summariesDir, "layout-contract.md"), layoutContract);
  await fs.writeFile(path.join(summariesDir, "manifest-patch.json"), `${JSON.stringify(manifestPatch, null, 2)}\n`);

  console.log(JSON.stringify({
    ok: true,
    target: {
      id: target.id,
      name: target.name,
      type: target.type,
      bounds: target.bounds,
    },
    metadataSource,
    artifacts: {
      nodeIndex: path.join(summariesDir, "node-index.json"),
      sections: path.join(summariesDir, "sections.json"),
      assetsIndex: path.join(summariesDir, "assets-index.json"),
      layoutContract: path.join(summariesDir, "layout-contract.md"),
      manifestPatch: path.join(summariesDir, "manifest-patch.json"),
    },
    counts: {
      nodes: nodeIndex.nodes.length,
      sections: sections.length,
      assets: assets.length,
    },
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
    }, null, 2));
    process.exitCode = 1;
  });
}

export {
  buildAssets,
  chooseSections,
  detectMetadataSource,
  loadMetadata,
  normalizeNodeIdForPath,
  pickTargetNode,
};
