#!/usr/bin/env node

import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, "..");

const usage = `用法：
  figma-pixel-diff.mjs --file-key <key> --node-id <id> --url <local-url> [选项]

必填：
  --file-key <key>        Figma 文件 key
  --node-id <id>          Figma 节点 id，例如 50:929 或 50-929
  --url <url>             本地页面 URL
  FIGMA_TOKEN             可读取该 Figma 文件的 personal access token

选项：
  --cache-root <path>     默认：~/.cache/figma-mcp
  --viewport-width <px>   默认：375
  --viewport-height <px>  CSS px。默认：design image height / scale，再回退 812
  --scale <n>             Figma 导出倍率和浏览器 deviceScaleFactor。默认：2
  --compare-mode <mode>   design-bounds | full-page | viewport。默认：design-bounds
  --threshold <n>         pixelmatch 阈值。默认：0.1
  --max-diff-ratio <n>    通过阈值。默认：0.02
  --background <hex>      透明或短图补底色。默认：#f5f6f7
  --hide-selector <css>   截图前隐藏的 CSS selector，可重复传入
  --sections-json <path>  分区 bounds JSON；默认自动读取 summaries/sections.json
  --section-unit <unit>   css | pixel。默认：css
  --band-diff             section 缺失时显式启用横向 band fallback
  --band-height <px>      band fallback 高度，CSS px。默认：125
  --wait-ms <ms>          截图前额外等待时间。默认：500
  --help                  显示帮助
`;

function parseArgs(argv) {
  const args = {
    cacheRoot: "~/.cache/figma-mcp",
    viewportWidth: 375,
    viewportHeight: undefined,
    scale: 2,
    compareMode: "design-bounds",
    threshold: 0.1,
    maxDiffRatio: 0.02,
    background: "#f5f6f7",
    hideSelector: [".vc-switch", ".vc-panel", ".vconsole", "#__vconsole"],
    sectionsJson: undefined,
    sectionUnit: "css",
    bandDiff: false,
    bandHeight: 125,
    waitMs: 500,
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
      case "--url":
        args.url = take();
        break;
      case "--cache-root":
        args.cacheRoot = take();
        break;
      case "--viewport-width":
        args.viewportWidth = Number(take());
        break;
      case "--viewport-height":
        args.viewportHeight = Number(take());
        break;
      case "--scale":
        args.scale = Number(take());
        break;
      case "--compare-mode":
        args.compareMode = take();
        break;
      case "--threshold":
        args.threshold = Number(take());
        break;
      case "--max-diff-ratio":
        args.maxDiffRatio = Number(take());
        break;
      case "--background":
        args.background = take();
        break;
      case "--hide-selector":
        args.hideSelector.push(take());
        break;
      case "--sections-json":
        args.sectionsJson = take();
        break;
      case "--section-unit":
        args.sectionUnit = take();
        break;
      case "--band-diff":
        args.bandDiff = true;
        break;
      case "--band-height":
        args.bandHeight = Number(take());
        break;
      case "--wait-ms":
        args.waitMs = Number(take());
        break;
      default:
        throw new Error(`Unknown argument: ${key}`);
    }
  }

  return args;
}

function normalizeNodeId(nodeId) {
  return String(nodeId).replace("-", ":");
}

function nodeIdForPath(nodeId) {
  return normalizeNodeId(nodeId).replace(":", "_");
}

function expandHome(inputPath) {
  if (!inputPath || inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/")) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

function assertRequired(args) {
  if (args.help) return;
  const missing = [];
  if (!args.fileKey) missing.push("--file-key");
  if (!args.nodeId) missing.push("--node-id");
  if (!args.url) missing.push("--url");
  if (!process.env.FIGMA_TOKEN) missing.push("FIGMA_TOKEN");
  if (missing.length > 0) {
    throw new Error(`Missing required input: ${missing.join(", ")}`);
  }
  if (!["design-bounds", "full-page", "viewport"].includes(args.compareMode)) {
    throw new Error("--compare-mode must be one of: design-bounds, full-page, viewport");
  }
  if (!["css", "pixel"].includes(args.sectionUnit)) {
    throw new Error("--section-unit must be one of: css, pixel");
  }
}

async function loadDependency(name, projectRoot) {
  const candidates = [projectRoot, skillRoot, process.cwd()].filter(Boolean);
  const errors = [];

  for (const base of candidates) {
    try {
      const requireFromBase = createRequire(path.join(base, "noop.js"));
      const resolved = requireFromBase.resolve(name);

      try {
        return requireFromBase(name);
      } catch (error) {
        if (error?.code === "ERR_REQUIRE_ESM") {
          return await import(pathToFileURL(resolved).href);
        }
        throw error;
      }
    } catch (error) {
      errors.push(`${base}: ${error.message}`);
    }
  }

  throw new Error(
    `Cannot load dependency "${name}". Install it in the skill or target project.\n${errors.join("\n")}`,
  );
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
    throw new Error(`Image download failed: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outPath, buffer);
}

async function exportFigmaImage(args, outPath) {
  const query = new URLSearchParams({
    ids: args.nodeId,
    format: "png",
    scale: String(args.scale),
  });
  const apiUrl = `https://api.figma.com/v1/images/${args.fileKey}?${query.toString()}`;
  const json = await fetchJson(apiUrl, process.env.FIGMA_TOKEN);
  const imageUrl = json?.images?.[args.nodeId];

  if (!imageUrl) {
    throw new Error(`Figma API did not return an image URL for node ${args.nodeId}`);
  }

  await downloadFile(imageUrl, outPath);

  return {
    apiUrl,
    imageUrl,
  };
}

async function screenshotLocalPage(args, outPath, projectRoot, designHeight) {
  const playwrightModule = await loadDependency("@playwright/test", projectRoot);
  const chromium = playwrightModule.chromium;
  const viewportHeight = args.viewportHeight || Math.ceil((designHeight || 0) / args.scale) || 812;
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport: {
        width: args.viewportWidth,
        height: viewportHeight,
      },
      deviceScaleFactor: args.scale,
      isMobile: true,
    });

    await page.goto(args.url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts?.ready).catch(() => undefined);

    if (args.hideSelector.length > 0) {
      const selectors = args.hideSelector.join(",");
      await page.addStyleTag({
        content: `${selectors}{display:none!important;visibility:hidden!important;opacity:0!important;}`,
      });
    }

    if (args.waitMs > 0) {
      await page.waitForTimeout(args.waitMs);
    }

    await page.screenshot({ path: outPath, fullPage: args.compareMode !== "viewport" });
  } finally {
    await browser.close();
  }
}

function parseHexColor(hex) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    a: 255,
  };
}

function createCanvas(PNG, width, height, background) {
  const image = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (width * y + x) << 2;
      image.data[idx] = background.r;
      image.data[idx + 1] = background.g;
      image.data[idx + 2] = background.b;
      image.data[idx + 3] = background.a;
    }
  }

  return image;
}

function compositeImage(PNG, source, width, height, background) {
  const canvas = createCanvas(PNG, width, height, background);
  const copyWidth = Math.min(source.width, width);
  const copyHeight = Math.min(source.height, height);

  for (let y = 0; y < copyHeight; y += 1) {
    for (let x = 0; x < copyWidth; x += 1) {
      const sourceIdx = (source.width * y + x) << 2;
      const targetIdx = (width * y + x) << 2;
      const alpha = source.data[sourceIdx + 3] / 255;

      canvas.data[targetIdx] = Math.round(source.data[sourceIdx] * alpha + canvas.data[targetIdx] * (1 - alpha));
      canvas.data[targetIdx + 1] = Math.round(source.data[sourceIdx + 1] * alpha + canvas.data[targetIdx + 1] * (1 - alpha));
      canvas.data[targetIdx + 2] = Math.round(source.data[sourceIdx + 2] * alpha + canvas.data[targetIdx + 2] * (1 - alpha));
      canvas.data[targetIdx + 3] = 255;
    }
  }

  return canvas;
}

function cropImage(PNG, source, rect, background) {
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const crop = createCanvas(PNG, width, height, background);
  const sourceX = Math.max(0, Math.round(rect.x));
  const sourceY = Math.max(0, Math.round(rect.y));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = sourceX + x;
      const sy = sourceY + y;
      if (sx >= source.width || sy >= source.height) continue;

      const sourceIdx = (source.width * sy + sx) << 2;
      const targetIdx = (width * y + x) << 2;
      const alpha = source.data[sourceIdx + 3] / 255;

      crop.data[targetIdx] = Math.round(source.data[sourceIdx] * alpha + crop.data[targetIdx] * (1 - alpha));
      crop.data[targetIdx + 1] = Math.round(source.data[sourceIdx + 1] * alpha + crop.data[targetIdx + 1] * (1 - alpha));
      crop.data[targetIdx + 2] = Math.round(source.data[sourceIdx + 2] * alpha + crop.data[targetIdx + 2] * (1 - alpha));
      crop.data[targetIdx + 3] = 255;
    }
  }

  return crop;
}

async function readPng(PNG, filePath) {
  const buffer = await fs.readFile(filePath);
  return PNG.sync.read(buffer);
}

async function writePng(PNG, filePath, image) {
  await fs.writeFile(filePath, PNG.sync.write(image));
}

function getCompareSize(args, design, local) {
  if (args.compareMode === "design-bounds") {
    return {
      width: design.width,
      height: design.height,
    };
  }

  if (args.compareMode === "viewport") {
    return {
      width: Math.min(design.width, local.width),
      height: Math.min(design.height, local.height),
    };
  }

  return {
    width: Math.max(design.width, local.width),
    height: Math.max(design.height, local.height),
  };
}

function normalizeSection(section, scale, unit) {
  const factor = unit === "css" ? scale : 1;
  return {
    name: section.name || section.id || `section-${section.y || 0}`,
    x: Math.round((section.x || 0) * factor),
    y: Math.round((section.y || 0) * factor),
    width: Math.round((section.width || section.w || 1) * factor),
    height: Math.round((section.height || section.h || 1) * factor),
  };
}

async function loadSections(args) {
  if (!args.sectionsJson) return [];
  const sectionsPath = path.resolve(expandHome(args.sectionsJson));
  const raw = await fs.readFile(sectionsPath, "utf8");
  const parsed = JSON.parse(raw);
  const sections = Array.isArray(parsed) ? parsed : parsed.sections;

  if (!Array.isArray(sections)) {
    throw new Error("--sections-json must be an array or an object with a sections array");
  }

  const normalized = sections.map((section) => normalizeSection(section, args.scale, args.sectionUnit))
    .filter((section) => section.width > 0 && section.height > 0);

  if (normalized.length === 0) {
    throw new Error(`sections-json is empty or has no usable bounds: ${sectionsPath}`);
  }

  return normalized;
}

async function findDefaultSectionsJson(paths) {
  const candidate = path.join(path.dirname(paths.report), "sections.json");
  try {
    await fs.access(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}

function buildBandSections(width, height, scale, bandHeightCss) {
  const bandHeight = Math.max(1, Math.round((bandHeightCss || 125) * scale));
  const sections = [];

  for (let y = 0; y < height; y += bandHeight) {
    const sectionHeight = Math.min(bandHeight, height - y);
    sections.push({
      name: `band-${Math.round(y / scale)}-${Math.round((y + sectionHeight) / scale)}`,
      x: 0,
      y,
      width,
      height: sectionHeight,
      source: "band-fallback",
    });
  }

  return sections;
}

function diffImages(pixelmatch, PNG, designImage, localImage, width, height, args) {
  const background = parseHexColor(args.background);
  const designCanvas = compositeImage(PNG, designImage, width, height, background);
  const localCanvas = compositeImage(PNG, localImage, width, height, background);
  const diff = createCanvas(PNG, width, height, background);
  const diffPixels = pixelmatch(
    designCanvas.data,
    localCanvas.data,
    diff.data,
    width,
    height,
    {
      threshold: args.threshold,
      includeAA: false,
    },
  );
  const totalPixels = width * height;

  return {
    diff,
    diffPixels,
    totalPixels,
    diffRatio: totalPixels === 0 ? 0 : diffPixels / totalPixels,
  };
}

async function runPixelDiff(args, paths, projectRoot) {
  const pixelmatchModule = await loadDependency("pixelmatch", projectRoot);
  const pngjsModule = await loadDependency("pngjs", projectRoot);
  const pixelmatch = pixelmatchModule.default || pixelmatchModule;
  const PNG = pngjsModule.PNG || pngjsModule.default?.PNG;

  if (!PNG) {
    throw new Error("Cannot find PNG export from pngjs");
  }

  const design = await readPng(PNG, paths.design);
  const local = await readPng(PNG, paths.local);
  const background = parseHexColor(args.background);
  const { width, height } = getCompareSize(args, design, local);
  const result = diffImages(pixelmatch, PNG, design, local, width, height, args);
  if (!args.sectionsJson) {
    args.sectionsJson = await findDefaultSectionsJson(paths);
  }
  let sections = [];
  let sectionsSource = args.sectionsJson || "";
  let sectionsError;

  try {
    sections = await loadSections(args);
  } catch (error) {
    sectionsError = error;
    if (!args.bandDiff) throw error;
  }

  if (sections.length === 0 && args.bandDiff) {
    sections = buildBandSections(width, height, args.scale, args.bandHeight);
    sectionsSource = `band-fallback:${args.bandHeight}${sectionsError ? `; ${sectionsError.message}` : ""}`;
  }

  if (sections.length === 0) {
    throw new Error(
      "No section diff input found. Generate summaries/sections.json with figma-build-contract.mjs, pass --sections-json, or explicitly rerun with --band-diff for diagnostic fallback.",
    );
  }
  const sectionReports = [];

  await fs.mkdir(paths.sectionsDir, { recursive: true });

  for (const section of sections) {
    const designSection = cropImage(PNG, design, section, background);
    const localSection = cropImage(PNG, local, section, background);
    const sectionResult = diffImages(
      pixelmatch,
      PNG,
      designSection,
      localSection,
      section.width,
      section.height,
      args,
    );
    const safeName = section.name.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "section";
    const sectionDiffPath = path.join(paths.sectionsDir, `${safeName}-diff.png`);

    await writePng(PNG, sectionDiffPath, sectionResult.diff);
    sectionReports.push({
      ...section,
      diffPath: sectionDiffPath,
      diffPixels: sectionResult.diffPixels,
      totalPixels: sectionResult.totalPixels,
      diffRatio: sectionResult.diffRatio,
      passed: sectionResult.diffRatio <= args.maxDiffRatio,
    });
  }

  const report = {
    fileKey: args.fileKey,
    nodeId: args.nodeId,
    url: args.url,
    compareMode: args.compareMode,
    scale: args.scale,
    width,
    height,
    design: {
      path: paths.design,
      width: design.width,
      height: design.height,
    },
    local: {
      path: paths.local,
      width: local.width,
      height: local.height,
    },
    diff: {
      path: paths.diff,
      diffPixels: result.diffPixels,
      totalPixels: result.totalPixels,
      diffRatio: result.diffRatio,
      threshold: args.threshold,
      maxDiffRatio: args.maxDiffRatio,
      passed: result.diffRatio <= args.maxDiffRatio,
    },
    sections: sectionReports,
    sectionsSource,
    worstSections: [...sectionReports]
      .sort((a, b) => b.diffRatio - a.diffRatio)
      .slice(0, 10)
      .map((section) => ({
        name: section.name,
        diffRatio: section.diffRatio,
        diffPixels: section.diffPixels,
        totalPixels: section.totalPixels,
        diffPath: section.diffPath,
      })),
    generatedAt: new Date().toISOString(),
  };

  await writePng(PNG, paths.diff, result.diff);
  await fs.writeFile(paths.report, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(paths.summary, renderSummary(report));

  return report;
}

function renderSummary(report) {
  const lines = [
    "# Pixel Diff Summary",
    "",
    `- fileKey: \`${report.fileKey}\``,
    `- nodeId: \`${report.nodeId}\``,
    `- compareMode: \`${report.compareMode}\``,
    `- scale: \`${report.scale}\``,
    `- size: \`${report.width}x${report.height}\``,
    `- diffPixels: \`${report.diff.diffPixels}\``,
    `- totalPixels: \`${report.diff.totalPixels}\``,
    `- diffRatio: \`${(report.diff.diffRatio * 100).toFixed(4)}%\``,
    `- threshold: \`${report.diff.threshold}\``,
    `- maxDiffRatio: \`${report.diff.maxDiffRatio}\``,
    `- passed: \`${report.diff.passed}\``,
    `- sectionsSource: \`${report.sectionsSource || "none"}\``,
    "",
    "## Artifacts",
    "",
    `- design: \`${report.design.path}\``,
    `- local: \`${report.local.path}\``,
    `- diff: \`${report.diff.path}\``,
  ];

  if (report.sections.length > 0) {
    lines.push("", "## Worst Sections", "");
    for (const section of report.worstSections || []) {
      lines.push(`- ${section.name}: ${(section.diffRatio * 100).toFixed(4)}% (${section.diffPixels}/${section.totalPixels}) -> \`${section.diffPath}\``);
    }

    lines.push("", "## Sections", "");
    for (const section of [...report.sections].sort((a, b) => b.diffRatio - a.diffRatio)) {
      lines.push(`- ${section.name}: ${(section.diffRatio * 100).toFixed(4)}% (${section.diffPixels}/${section.totalPixels}) -> \`${section.diffPath}\``);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage);
    return;
  }

  assertRequired(args);

  const projectRoot = process.cwd();
  const cacheRoot = path.resolve(expandHome(args.cacheRoot));
  const nodePath = nodeIdForPath(args.nodeId);
  const baseDir = path.join(cacheRoot, args.fileKey, nodePath);
  const screenshotsDir = path.join(baseDir, "screenshots");
  const summariesDir = path.join(baseDir, "summaries");
  const paths = {
    design: path.join(screenshotsDir, "design.png"),
    local: path.join(screenshotsDir, "local.png"),
    diff: path.join(screenshotsDir, "diff.png"),
    sectionsDir: path.join(screenshotsDir, "sections"),
    report: path.join(summariesDir, "pixel-diff-report.json"),
    summary: path.join(summariesDir, "pixel-diff-summary.md"),
  };

  await fs.mkdir(screenshotsDir, { recursive: true });
  await fs.mkdir(summariesDir, { recursive: true });

  const exportInfo = await exportFigmaImage(args, paths.design);
  const { PNG } = await loadDependency("pngjs", projectRoot);
  const designImage = await readPng(PNG, paths.design);

  await screenshotLocalPage(args, paths.local, projectRoot, designImage.height);
  const report = await runPixelDiff(args, paths, projectRoot);

  console.log(JSON.stringify({
    ok: true,
    export: {
      apiUrl: exportInfo.apiUrl,
    },
    artifacts: paths,
    diff: report.diff,
  }, null, 2));
}

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
