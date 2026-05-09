#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  buildAssets,
  chooseSections,
  loadMetadata,
  pickTargetNode,
} from "./figma-build-contract.mjs";
import { buildExportPlan } from "./figma-export-assets.mjs";
import {
  createProfileReport,
  renderSummary,
  resolveProfileConfigs,
} from "./figma-pixel-diff.mjs";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const fixturesDir = path.join(rootDir, "fixtures");

async function checkContractFixture() {
  const tree = await loadMetadata(path.join(fixturesDir, "metadata-valid.json"), "1:2");
  const target = pickTargetNode(tree, "1:2");
  const sections = chooseSections(target);
  const collect = (node) => [node, ...node.children.flatMap(collect)];
  const assets = buildAssets(collect(target));

  assert.ok(sections.length >= 3, "expected non-empty sections");
  assert.ok(assets.some((asset) => asset.type === "image-asset"), "expected image asset");
  assert.ok(assets.some((asset) => asset.type === "svg-asset"), "expected svg asset");
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

async function main() {
  const contract = await checkContractFixture();
  await checkContractFailureFixture();
  const exportPlan = await checkExportPlanFixture();
  checkProfileSemantics();

  console.log(JSON.stringify({
    ok: true,
    checks: [
      `contract fixture generated ${contract.sections} sections and ${contract.assets} assets`,
      "contract failure fixture rejects missing bounds",
      `export plan fixture kept ${exportPlan.join(", ")}`,
      "strict/practical profile semantics verified",
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
