import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// One run timeout for every Mamba Labs wrapper, 1800 s, set 2026-10-05. The
// value lives in one named constant, every run start sends it, and the
// wrapper's wait is derived from it so the run's own TIMED-OUT status is what
// ends the call.
const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(repo, "src", "index.ts"), "utf8");
const built = readFileSync(join(repo, "build", "index.js"), "utf8");

test("the run timeout is one named constant set to 1800", () => {
  assert.equal(src.match(/const ACTOR_RUN_TIMEOUT_SECS = (\d+);/g)?.length, 1);
  assert.match(src, /const ACTOR_RUN_TIMEOUT_SECS = 1800;/);
  assert.match(built, /ACTOR_RUN_TIMEOUT_SECS = 1800;/);
});

test("every run start sends the constant as the timeout", () => {
  const starts = src.match(/api\.apify\.com\/v2\/acts\/\$\{[^}]+\}\/runs[^`]*`/g) ?? [];
  assert.ok(starts.length > 0);
  const runQuery = src.match(/const RUN_QUERY = `([^`]*)`/)?.[1] ?? "";
  for (const s of starts) {
    const q = s.includes("${RUN_QUERY}") ? runQuery : s;
    assert.match(q, /timeout=\$\{ACTOR_RUN_TIMEOUT_SECS\}/, s);
  }
});

test("the wrapper waits for the run timeout plus two minutes", () => {
  assert.match(src, /const WRAPPER_WAIT_MS = \(ACTOR_RUN_TIMEOUT_SECS \+ 120\) \* 1000;/);
});
