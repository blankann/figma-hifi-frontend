#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ALLOWED_FRONTMATTER_KEYS = new Set(["name", "description", "license", "allowed-tools", "metadata"]);
const MAX_SKILL_NAME_LENGTH = 64;
const REQUIRED_HELP_TERMS = [
  {
    file: "SKILL.md",
    terms: [
      "strict",
      "practical",
      "sections.json",
      "band-diff",
      "docs/hifi/figma",
      "Hard Gates",
      "整页截图作为最终页面主体",
      "MCP `get_design_context` 的原始直出代码",
      "没有 JSX/HTML/CSS 结构",
      "禁止把可 DOM 表达",
      "hash 完全相同",
    ],
  },
  {
    file: "reference-pixel-diff.md",
    terms: [
      "--preset",
      "strict",
      "practical",
      "band-diff",
      "sectionsSource",
      "docs/hifi/figma",
      "浏览器截图",
      "hash 完全相同",
      "失败报告模板",
    ],
  },
  {
    file: "reference-implementation-strategy.md",
    terms: [
      "full-frame-image",
      "该分类为禁止项",
      "每个主要 section 都必须标注",
      "translated-dom",
      "bitmap-asset",
      "可 DOM 表达的 UI 必须转译为 DOM",
      "完整页面 PNG",
    ],
  },
];

async function readText(relativePath) {
  return fs.readFile(path.join(rootDir, relativePath), "utf8");
}

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error("No YAML frontmatter found");
  }
  return match[1];
}

function splitKeyValue(line) {
  const index = line.indexOf(":");
  if (index === -1) return undefined;
  return {
    key: line.slice(0, index).trim(),
    value: line.slice(index + 1).trim(),
  };
}

function parseScalar(raw) {
  if (raw === "") return "";
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function parseSimpleYamlMap(text) {
  const root = {};
  const stack = [{ indent: -1, container: root }];

  for (const rawLine of text.split("\n")) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;
    const indent = rawLine.match(/^ */)[0].length;
    const line = rawLine.trimEnd();

    while (stack.length > 1 && indent <= stack.at(-1).indent) {
      stack.pop();
    }

    const current = stack.at(-1).container;
    const trimmed = line.trim();

    if (trimmed.startsWith("- ")) {
      if (!Array.isArray(current)) {
        throw new Error(`Invalid list item placement: ${trimmed}`);
      }
      current.push(parseScalar(trimmed.slice(2).trim()));
      continue;
    }

    const entry = splitKeyValue(trimmed);
    if (!entry?.key) {
      throw new Error(`Invalid YAML line: ${trimmed}`);
    }

    if (entry.value === "") {
      const nextContainer = {};
      current[entry.key] = nextContainer;
      stack.push({ indent, container: nextContainer });
    } else if (entry.value === "[]") {
      current[entry.key] = [];
    } else {
      current[entry.key] = parseScalar(entry.value);
    }
  }

  return root;
}

function parseFrontmatter(frontmatterText) {
  const parsed = {};
  const topLevelKeys = [];
  let currentKey;
  let currentLines = [];

  const flush = () => {
    if (!currentKey) return;
    const body = currentLines.join("\n").trimEnd();
    if (body === "") {
      parsed[currentKey] = "";
    } else if (body.includes("\n") || body.startsWith("- ") || body.includes(":\n")) {
      parsed[currentKey] = parseSimpleYamlMap(body);
    } else {
      parsed[currentKey] = parseScalar(body);
    }
  };

  for (const line of frontmatterText.split("\n")) {
    if (!line.trim()) continue;
    if (/^\S/.test(line)) {
      flush();
      const entry = splitKeyValue(line);
      if (!entry?.key) {
        throw new Error(`Invalid frontmatter line: ${line}`);
      }
      currentKey = entry.key;
      topLevelKeys.push(currentKey);
      currentLines = [entry.value];
    } else if (!currentKey) {
      throw new Error(`Invalid indented frontmatter line: ${line}`);
    } else {
      currentLines.push(line.slice(2));
    }
  }
  flush();

  return { parsed, topLevelKeys };
}

async function validateFrontmatter() {
  const content = await readText("SKILL.md");
  const frontmatterText = extractFrontmatter(content);
  const { parsed, topLevelKeys } = parseFrontmatter(frontmatterText);

  for (const key of topLevelKeys) {
    assert.ok(ALLOWED_FRONTMATTER_KEYS.has(key), `Unexpected key in SKILL.md frontmatter: ${key}`);
  }

  assert.equal(typeof parsed.name, "string", "Frontmatter name must be a string");
  assert.equal(typeof parsed.description, "string", "Frontmatter description must be a string");
  assert.match(parsed.name, /^[a-z0-9-]+$/, "Frontmatter name must be hyphen-case");
  assert.ok(!parsed.name.startsWith("-") && !parsed.name.endsWith("-") && !parsed.name.includes("--"), "Frontmatter name cannot start/end with hyphen or contain consecutive hyphens");
  assert.ok(parsed.name.length <= MAX_SKILL_NAME_LENGTH, `Frontmatter name must be <= ${MAX_SKILL_NAME_LENGTH} characters`);
  assert.ok(!/[<>]/.test(parsed.description), "Frontmatter description cannot contain angle brackets");
  assert.ok(parsed.description.length <= 1024, "Frontmatter description must be <= 1024 characters");

  return {
    name: parsed.name,
    descriptionLength: parsed.description.length,
  };
}

function parseFlatYamlSections(text) {
  const sections = new Map();
  let currentSection;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^\S/.test(line)) {
      const entry = splitKeyValue(line);
      if (entry && entry.value === "") {
        currentSection = entry.key;
        sections.set(currentSection, new Map());
      }
      continue;
    }
    if (!currentSection) continue;
    const entry = splitKeyValue(line.trim());
    if (entry) {
      sections.get(currentSection).set(entry.key, parseScalar(entry.value));
    }
  }

  return sections;
}

async function validateOpenAiYaml() {
  const relativePath = "agents/openai.yaml";
  const text = await readText(relativePath);
  const sections = parseFlatYamlSections(text);
  const interfaceSection = sections.get("interface");

  assert.ok(interfaceSection, "agents/openai.yaml must contain interface section");
  assert.equal(typeof interfaceSection.get("display_name"), "string", "agents/openai.yaml must contain interface.display_name");
  assert.equal(typeof interfaceSection.get("short_description"), "string", "agents/openai.yaml must contain interface.short_description");

  const policySection = sections.get("policy");
  if (policySection?.has("allow_implicit_invocation")) {
    assert.equal(typeof policySection.get("allow_implicit_invocation"), "boolean", "policy.allow_implicit_invocation must be boolean");
  }

  return {
    displayName: interfaceSection.get("display_name"),
    shortDescription: interfaceSection.get("short_description"),
  };
}

async function validateTerminology() {
  for (const target of REQUIRED_HELP_TERMS) {
    const text = await readText(target.file);
    for (const term of target.terms) {
      assert.ok(text.includes(term), `${target.file} is missing required term: ${term}`);
    }
  }

  const { stdout: pixelDiffHelp } = await execFileAsync("node", ["scripts/figma-pixel-diff.mjs", "--help"], { cwd: rootDir });
  for (const term of ["--preset", "strict", "practical", "--band-diff", "--sections-json", "docs/hifi/figma"]) {
    assert.ok(pixelDiffHelp.includes(term), `figma-pixel-diff help is missing term: ${term}`);
  }

  const { stdout: contractHelp } = await execFileAsync("node", ["scripts/figma-build-contract.mjs", "--help"], { cwd: rootDir });
  for (const term of ["提取后的节点 JSON", "Figma REST JSON", "MCP metadata XML", "docs/hifi/figma"]) {
    assert.ok(contractHelp.includes(term), `figma-build-contract help is missing term: ${term}`);
  }
}

async function runSmokeCheck() {
  const { stdout } = await execFileAsync("node", ["scripts/smoke-check.mjs"], { cwd: rootDir });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.ok, true, "smoke-check must return ok=true");
  return parsed.checks;
}

async function main() {
  const frontmatter = await validateFrontmatter();
  const openaiYaml = await validateOpenAiYaml();
  await validateTerminology();
  const smokeChecks = await runSmokeCheck();

  console.log(JSON.stringify({
    ok: true,
    checks: [
      `frontmatter valid for ${frontmatter.name}`,
      `openai.yaml valid for ${openaiYaml.displayName}`,
      "terminology and help output are aligned",
      ...smokeChecks,
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
