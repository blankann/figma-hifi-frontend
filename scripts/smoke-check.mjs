#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  buildAssets,
  chooseSections,
  loadMetadata,
  normalizeNodeIdForPath as normalizeContractNodeIdForPath,
  pickTargetNode,
} from "./figma-build-contract.mjs";
import {
  buildExportPlan,
  normalizeNodeIdForPath as normalizeAssetNodeIdForPath,
} from "./figma-export-assets.mjs";
import {
  createProfileReport,
  normalizeNodeIdForPath as normalizeDiffNodeIdForPath,
  renderSummary,
  resolveProfileConfigs,
} from "./figma-pixel-diff.mjs";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const fixturesDir = path.join(rootDir, "fixtures");

async function readText(relativePath) {
  return fs.readFile(path.join(rootDir, relativePath), "utf8");
}

async function checkContractFixture() {
  const tree = await loadMetadata(path.join(fixturesDir, "metadata-valid.json"), "1:2");
  const target = pickTargetNode(tree, "1:2");
  const sections = chooseSections(target);
  const collect = (node) => [node, ...node.children.flatMap(collect)];
  const assets = buildAssets(collect(target));

  assert.ok(sections.length >= 3, "expected non-empty sections");
  assert.ok(assets.some((asset) => asset.type === "bitmap-asset"), "expected bitmap asset");
  assert.ok(assets.some((asset) => asset.type === "svg-asset"), "expected svg asset");
  assert.ok(!assets.some((asset) => /营销|保障|趋势|gradient/i.test(asset.figmaNode || "")), "DOM-expressible UI should not be auto-classified as bitmap asset");
  return { sections: sections.length, assets: assets.length };
}

async function checkContractFailureFixture() {
  const tree = await loadMetadata(path.join(fixturesDir, "metadata-no-bounds.json"), "9:9");
  const target = pickTargetNode(tree, "9:9");
  await assert.rejects(
    async () => chooseSections(target),
    /usable bounds/,
  );
}

async function checkExportPlanFixture() {
  const assets = JSON.parse(await fs.readFile(path.join(fixturesDir, "assets-index.json"), "utf8"));
  const plan = buildExportPlan(assets, "/tmp/figma-assets");
  assert.equal(plan.length, 2, "expected only image/svg assets to be exported");
  assert.ok(plan.every((item) => item.outputPath.includes("/tmp/figma-assets/")), "expected output path in export dir");
  return plan.map((item) => path.basename(item.outputPath));
}

async function checkGuardrailDocs() {
  const skill = await readText("SKILL.md");
  const implementation = await readText("reference-implementation-strategy.md");
  const pixelDiff = await readText("reference-pixel-diff.md");

  for (const term of [
    "禁止把完整 Figma frame 或整页截图作为最终页面主体",
    "raw/get_design_context.tsx` 必须保存 MCP `get_design_context` 的原始直出代码",
    "没有 JSX/HTML/CSS 结构",
    "禁止把可 DOM 表达的卡片、图表、营销块、表格、标签、说明模块图片化",
    "design.png` 与 `local.png` hash 完全相同",
    "local.png` 必须来自目标 URL 的真实浏览器截图",
  ]) {
    assert.ok(skill.includes(term), `SKILL.md missing guardrail: ${term}`);
  }

  for (const term of [
    "full-frame-image",
    "该分类为禁止项",
    "每个主要 section 都必须标注",
    "translated-dom",
    "bitmap-asset",
    "可 DOM 表达的 UI 必须转译为 DOM",
    "禁止把完整 Figma frame、整页截图或完整页面 PNG 作为最终页面主体",
  ]) {
    assert.ok(implementation.includes(term), `reference-implementation-strategy.md missing guardrail: ${term}`);
  }

  for (const term of [
    "local.png` 必须由脚本访问 `--url` 后通过浏览器截图生成",
    "如果 `design.png` 与 `local.png` hash 完全相同",
    "失败报告模板",
    "local.png 非浏览器截图",
  ]) {
    assert.ok(pixelDiff.includes(term), `reference-pixel-diff.md missing guardrail: ${term}`);
  }
}

function looksLikeCompleteDesignContextRaw(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.length < 400) return false;
  if (/figmaNode\s*:|keyAssets\s*:/.test(trimmed) && !/[<][A-Za-z][\s>]/.test(trimmed)) return false;
  return /className=|style=\{\{|<[A-Za-z][\s>]|function\s+\w+|export\s+default|const\s+\w+\s*=\s*\(/.test(trimmed)
    && /width|height|font|background|color|absolute|relative|px|#[0-9a-f]{3,8}/i.test(trimmed);
}

function checkRawCompletenessHeuristic() {
  const summaryOnly = `export const figmaNode = { id: "1:2", name: "Demo" };\nexport const keyAssets = ["a.png"];\n`;
  const mcpLike = `
export default function Demo() {
  return (
    <div className="relative bg-[#fff] w-[375px] h-[812px]" style={{ width: 375, height: 812 }}>
      <div className="absolute left-[16px] top-[20px] text-[16px] font-medium text-[#1f1f1f]">Title</div>
      <div style={{ position: "absolute", width: 343, height: 120, background: "#F8F8F8", color: "#333" }} />
      <div className="absolute left-[24px] top-[168px] w-[327px] h-[44px] rounded-[8px] bg-[#FFF4E8] text-[#9A4A00]">
        <span style={{ fontSize: 14, lineHeight: "22px", fontFamily: "PingFang SC" }}>Description</span>
      </div>
    </div>
  );
}
`;

  assert.equal(looksLikeCompleteDesignContextRaw(summaryOnly), false, "summary-only get_design_context raw must fail");
  assert.equal(looksLikeCompleteDesignContextRaw(mcpLike), true, "MCP-like JSX/CSS raw should pass");
}

function checkProfileSemantics() {
  const { preset, activeProfile, profiles } = resolveProfileConfigs({ preset: "both" });
  assert.equal(preset, "both");
  assert.equal(activeProfile, "practical");

  const baseSection = {
    name: "hero",
    diffPath: "/tmp/hero-diff.png",
    diffPixels: 1,
    totalPixels: 100,
    diffRatio: 0.01,
  };
  const strictReport = createProfileReport(
    profiles.strict,
    { diffPixels: 1, totalPixels: 100, diffRatio: 0.01 },
    [baseSection],
    "/tmp/diff-strict.png",
  );
  const practicalReport = createProfileReport(
    profiles.practical,
    { diffPixels: 1, totalPixels: 100, diffRatio: 0.01 },
    [baseSection],
    "/tmp/diff-practical.png",
  );

  assert.equal(strictReport.diff.passed, false, "strict should fail at 1%");
  assert.equal(practicalReport.diff.passed, true, "practical should pass at 1%");

  const summary = renderSummary({
    fileKey: "demo",
    nodeId: "1:2",
    compareMode: "design-bounds",
    preset,
    activeProfile,
    scale: 2,
    width: 10,
    height: 10,
    sectionsSource: "fixtures/sections.json",
    design: { path: "/tmp/design.png" },
    local: { path: "/tmp/local.png" },
    diff: { path: "/tmp/diff.png" },
    profiles: {
      strict: strictReport,
      practical: practicalReport,
    },
  });

  assert.match(summary, /Profile: strict/);
  assert.match(summary, /Profile: practical/);
}

function checkNodeIdPathNormalization() {
  for (const normalize of [
    normalizeContractNodeIdForPath,
    normalizeAssetNodeIdForPath,
    normalizeDiffNodeIdForPath,
  ]) {
    assert.equal(normalize("50:929"), "node-50-929");
    assert.equal(normalize("50-929"), "node-50-929");
  }
}

async function main() {
  const contract = await checkContractFixture();
  await checkContractFailureFixture();
  const exportPlan = await checkExportPlanFixture();
  await checkGuardrailDocs();
  checkProfileSemantics();
  checkNodeIdPathNormalization();
  checkRawCompletenessHeuristic();

  console.log(JSON.stringify({
    ok: true,
    checks: [
      `contract fixture generated ${contract.sections} sections and ${contract.assets} assets`,
      "contract failure fixture rejects missing bounds",
      `export plan fixture kept ${exportPlan.join(", ")}`,
      "anti-full-frame, raw integrity, and DOM translation guardrails documented",
      "strict/practical profile semantics verified",
      "node id path normalization verified",
      "get_design_context raw completeness heuristic verified",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
});
