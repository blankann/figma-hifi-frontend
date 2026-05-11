#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const usage = `用法：
  figma-export-assets.mjs --file-key <key> --node-id <id> [选项]

必填：
  --file-key <key>        Figma 文件 key
  --node-id <id>          Figma 节点 id，例如 50:929 或 50-929
  FIGMA_TOKEN             可读取该 Figma 文件的 personal access token

选项：
  --cache-root <path>     默认：$FIGMA_HIFI_CACHE_ROOT；否则 docs/hifi/figma
  --assets-index <path>   默认：<cache>/<fileKey>/node-<node-id>/summaries/assets-index.json
  --out-dir <path>        默认：<cache>/<fileKey>/node-<node-id>/assets
  --scale <n>             PNG 导出倍率。默认：2
  --help                  显示帮助
`;

function parseArgs(argv) {
  const args = {
    cacheRoot: resolveDefaultCacheRoot(),
    scale: 2,
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
      case "--cache-root":
        args.cacheRoot = take();
        break;
      case "--assets-index":
        args.assetsIndex = take();
        break;
      case "--out-dir":
        args.outDir = take();
        break;
      case "--scale":
        args.scale = Number(take());
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
  if (!process.env.FIGMA_TOKEN) missing.push("FIGMA_TOKEN");
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

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      "X-Figma-Token": token,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Figma API failed: ${response.status} ${response.statusText}\n${body}`);
  }

  return response.json();
}

async function downloadFile(url, outPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Asset download failed: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outPath, buffer);
}

function assetFormat(asset) {
  return asset.type === "svg-asset" ? "svg" : "png";
}

function defaultFilename(asset) {
  const extension = assetFormat(asset);
  const base = String(asset.figmaNode || asset.nodeId || "asset")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "asset";
  const id = String(asset.nodeId || "").replace(/[^a-zA-Z0-9_-]+/g, "_");

  return `${base}-${id}.${extension}`;
}

function resolveAssetPath(asset, outDir) {
  const targetFile = asset.targetFile || defaultFilename(asset);
  const basename = path.basename(targetFile);
  return path.join(outDir, basename);
}

function buildExportPlan(assets, outDir) {
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error("assets-index has no exportable assets");
  }

  const typedAssets = assets.filter((asset) => ["bitmap-asset", "svg-asset"].includes(asset?.type));
  if (typedAssets.length === 0) {
    throw new Error("assets-index contains no bitmap-asset/svg-asset entries");
  }

  const missingNodeIds = typedAssets.filter((asset) => !asset?.nodeId);
  if (missingNodeIds.length > 0) {
    throw new Error(`assets-index has exportable entries without nodeId: ${missingNodeIds.map((asset) => asset.figmaNode || asset.targetFile || asset.type).join(", ")}`);
  }

  return typedAssets.map((asset) => ({
    ...asset,
    format: assetFormat(asset),
    outputPath: resolveAssetPath(asset, outDir),
  }));
}

async function exportAsset(args, asset, outPath) {
  const format = assetFormat(asset);
  const query = new URLSearchParams({
    ids: asset.nodeId,
    format,
  });

  if (format === "png") {
    query.set("scale", String(args.scale));
  }

  const apiUrl = `https://api.figma.com/v1/images/${args.fileKey}?${query.toString()}`;
  const json = await fetchJson(apiUrl, process.env.FIGMA_TOKEN);
  const imageUrl = json?.images?.[asset.nodeId];

  if (!imageUrl) {
    throw new Error(`Figma API did not return an asset URL for node ${asset.nodeId}`);
  }

  await downloadFile(imageUrl, outPath);

  return {
    ...asset,
    format,
    outputPath: outPath,
    apiUrl,
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
  const baseDir = path.join(cacheRoot, args.fileKey, nodeIdForPath(args.nodeId));
  const assetsIndexPath = path.resolve(expandHome(args.assetsIndex || path.join(baseDir, "summaries", "assets-index.json")));
  const outDir = path.resolve(expandHome(args.outDir || path.join(baseDir, "assets")));
  const manifestPath = path.join(outDir, "exported-assets.json");

  await fs.mkdir(outDir, { recursive: true });

  const assets = JSON.parse(await fs.readFile(assetsIndexPath, "utf8"));
  const exportable = buildExportPlan(assets, outDir);

  const exported = [];
  const failed = [];

  for (const asset of exportable) {
    try {
      exported.push(await exportAsset(args, asset, asset.outputPath));
    } catch (error) {
      failed.push({
        figmaNode: asset.figmaNode,
        nodeId: asset.nodeId,
        type: asset.type,
        error: error.message,
      });
    }
  }

  const manifest = {
    fileKey: args.fileKey,
    nodeId: args.nodeId,
    assetsIndex: assetsIndexPath,
    outDir,
    scale: args.scale,
    exported,
    failed,
    generatedAt: new Date().toISOString(),
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  if (failed.length > 0) {
    throw new Error(`Exported ${exported.length} assets, failed ${failed.length}. See ${manifestPath}`);
  }

  console.log(JSON.stringify({
    ok: true,
    exported: exported.length,
    manifest: manifestPath,
    outDir,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
      hint: error.message.includes("FIGMA_TOKEN")
        ? "Set FIGMA_TOKEN with read access to the Figma file, then rerun the script."
        : undefined,
    }, null, 2));
    process.exitCode = 1;
  });
}

export {
  assetFormat,
  buildExportPlan,
  defaultFilename,
  normalizeNodeIdForPath,
  resolveAssetPath,
};
