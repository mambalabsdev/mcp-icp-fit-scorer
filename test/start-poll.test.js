import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

// Tool name to the immutable actor id it must start. Arguments are built from
// each tool's own required inputs unless ARGS overrides them.
const TOOLS = {
  "score_icp_fit": "W161DT8W4kW55dMFh",
  "list_icp_templates": null
};
const ARGS = {};

// Speak MCP over stdio to the built server: initialize, then each request in
// turn. The fake Apify API in mock-fetch.mjs is preloaded, so nothing leaves
// the machine.
function session(requests, { env = {}, log } = {}) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, MAMBA_MCP_POLL_INTERVAL_MS: "5", ...env };
    if (log) childEnv.MOCK_LOG = log;
    if (!("APIFY_TOKEN" in env)) delete childEnv.APIFY_TOKEN;
    const child = spawn(
      process.execPath,
      ["--import", join(here, "mock-fetch.mjs"), join(repo, "build", "index.js")],
      { stdio: ["pipe", "pipe", "pipe"], env: childEnv },
    );
    const results = new Map();
    let out = "";
    let err = "";
    const want = requests.length;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out. stderr: ${err}`));
    }, 60000);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
      const lines = out.split("\n");
      out = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (typeof msg.id === "number" && msg.id >= 2) {
          results.set(msg.id, msg.result ?? msg.error);
          if (results.size === want) {
            clearTimeout(timer);
            child.kill();
            resolve(requests.map((_, i) => results.get(i + 2)));
          }
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      err += chunk.toString();
    });
    child.on("error", reject);
    const send = (m) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
    send({
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "wrapper-test", version: "0.0.0" } },
    });
    send({ method: "notifications/initialized" });
    requests.forEach((r, i) => send({ id: i + 2, ...r }));
  });
}

function sample(schema) {
  if (schema.enum) return schema.enum[0];
  switch (schema.type) {
    case "array":
      return [sample(schema.items ?? { type: "string" })];
    case "number":
    case "integer":
      return schema.minimum ?? 1;
    case "boolean":
      return true;
    case "object":
      return {};
    default:
      return "example.com";
  }
}

function argsFor(tool) {
  const out = {};
  for (const key of tool.inputSchema.required ?? []) out[key] = sample(tool.inputSchema.properties[key]);
  return { ...out, ...(ARGS[tool.name] ?? {}) };
}

test("tools/list serves every tool with no APIFY_TOKEN set", async () => {
  const [list] = await session([{ method: "tools/list", params: {} }]);
  assert.deepEqual(list.tools.map((t) => t.name).sort(), Object.keys(TOOLS).sort());
});

test("every tool starts the run, polls it, and returns the dataset", async () => {
  const [list] = await session([{ method: "tools/list", params: {} }]);
  for (const tool of list.tools.filter((t) => TOOLS[t.name])) {
    const log = join(mkdtempSync(join(tmpdir(), "mcp-sp-")), "fetch.log");
    const [res] = await session(
      [{ method: "tools/call", params: { name: tool.name, arguments: argsFor(tool) } }],
      { env: { APIFY_TOKEN: "test-token" }, log },
    );
    assert.ok(!res.isError, `${tool.name}: ${JSON.stringify(res)}`);
    assert.deepEqual(JSON.parse(res.content[0].text), [{ row_status: "ok", error_reason: null, mock: true }]);
    const calls = readFileSync(log, "utf8");
    assert.ok(calls.includes(`POST https://api.apify.com/v2/acts/${TOOLS[tool.name]}/runs?`), `${tool.name} did not start ${TOOLS[tool.name]}: ${calls}`);
    assert.ok(calls.includes("GET https://api.apify.com/v2/actor-runs/mockRun1"), `${tool.name} did not poll`);
    assert.ok(calls.includes("GET https://api.apify.com/v2/datasets/mockDs1/items"), `${tool.name} did not read the dataset`);
    assert.ok(!calls.includes("run-sync"), `${tool.name} called run-sync`);
  }
});

test("a run that does not succeed is an error that names the run", async () => {
  const [list] = await session([{ method: "tools/list", params: {} }]);
  const tool = list.tools.find((t) => TOOLS[t.name]);
  const [res] = await session(
    [{ method: "tools/call", params: { name: tool.name, arguments: argsFor(tool) } }],
    { env: { APIFY_TOKEN: "test-token", MOCK_RUN_FINAL: "FAILED" } },
  );
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /mockRun1/);
  assert.match(res.content[0].text, /FAILED/);
});

test("source never calls the run-sync endpoint", () => {
  const src = readFileSync(join(repo, "src", "index.ts"), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  assert.ok(!src.includes("run-sync-get-dataset-items"));
});

test("list_icp_templates answers locally with the six live templates and no token", async () => {
  const [res] = await session([{ method: "tools/call", params: { name: "list_icp_templates", arguments: {} } }]);
  assert.ok(!res.isError);
  const body = JSON.parse(res.content[0].text);
  assert.deepEqual(body.templates, ["full_signal", "saas_outbound", "b2b_services", "fintech", "smb_local", "enterprise"]);
});
