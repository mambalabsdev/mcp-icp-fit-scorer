// Added by the fleet audit of 2026-10-16. Checks three things against the built
// server: every version file carries the package version, every tool that starts
// a paid Apify run is not marked read only, and an optional max_charge_usd
// reaches the actor input only when the caller sets it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const LOCAL_TOOLS = new Set(["list_icp_templates"]);
const ARGS = {};
const readJson = (p) => JSON.parse(readFileSync(join(repo, p), "utf8"));

function session(requests, { env = {}, log } = {}) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, MAMBA_MCP_POLL_INTERVAL_MS: "5", ...env };
    if (log) childEnv.FLEET_MOCK_LOG = log;
    if (!("APIFY_TOKEN" in env)) delete childEnv.APIFY_TOKEN;
    const child = spawn(
      process.execPath,
      ["--import", join(here, "fleet-audit-mock.mjs"), join(repo, "build", "index.js")],
      { stdio: ["pipe", "pipe", "pipe"], env: childEnv },
    );
    const results = new Map();
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out. stderr: ${err}`));
    }, 60000);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
      const lines = out.split("\n");
      out = lines.pop();
      for (const line of lines) {
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (typeof msg.id === "number" && msg.id >= 2) {
          results.set(msg.id, msg.result ?? msg.error);
          if (results.size === requests.length) {
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
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fleet-audit-test", version: "0.0.0" } },
    });
    send({ method: "notifications/initialized" });
    requests.forEach((r, i) => send({ id: i + 2, ...r }));
  });
}

function sample(schema = {}) {
  if (schema.enum) return schema.enum[0];
  if (schema.anyOf) return sample(schema.anyOf[0]);
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

// Required inputs, plus one identifier where the tool takes one, so a tool that
// needs "at least one of" still reaches the run start.
function argsFor(tool) {
  const props = tool.inputSchema.properties ?? {};
  const out = {};
  for (const key of tool.inputSchema.required ?? []) out[key] = sample(props[key]);
  for (const key of ["company_domain", "domain"]) {
    if (props[key] && !(key in out)) {
      out[key] = "example.com";
      break;
    }
  }
  // A tool that refuses to start without the caller's own third party token.
  if (props.metaAccessToken && !("metaAccessToken" in out)) out.metaAccessToken = "test-token";
  return { ...out, ...(ARGS[tool.name] ?? {}) };
}

test("every version file carries the package.json version", () => {
  const v = readJson("package.json").version;
  assert.equal(readJson(".cursor-plugin/plugin.json").version, v, ".cursor-plugin/plugin.json");
  assert.equal(readJson("manifest.json").version, v, "manifest.json");
  const server = readJson("server.json");
  assert.equal(server.version, v, "server.json version");
  for (const p of server.packages ?? []) assert.equal(p.version, v, "server.json packages[].version");
  if (existsSync(join(repo, "package-lock.json"))) assert.equal(readJson("package-lock.json").version, v, "package-lock.json");
});

test("a tool that starts a paid Apify run is not marked read only", async () => {
  const [list] = await session([{ method: "tools/list", params: {} }]);
  for (const tool of list.tools) {
    if (LOCAL_TOOLS.has(tool.name)) continue;
    assert.equal(tool.annotations?.readOnlyHint, false, tool.name);
  }
});

test("max_charge_usd reaches the actor input only when set", async () => {
  const [list] = await session([{ method: "tools/list", params: {} }]);
  const capped = list.tools.filter((t) => t.inputSchema.properties?.max_charge_usd);
  for (const tool of capped) {
    // Send the cap in the type the tool declares, then look for that exact value.
    const cap = tool.inputSchema.properties.max_charge_usd.type === "string" ? "2.5" : 2.5;
    for (const [extra, expect] of [[{ max_charge_usd: cap }, true], [{}, false]]) {
      const log = join(mkdtempSync(join(tmpdir(), "mcp-mc-")), "fetch.log");
      const [res] = await session(
        [{ method: "tools/call", params: { name: tool.name, arguments: { ...argsFor(tool), ...extra } } }],
        { env: { APIFY_TOKEN: "test-token" }, log },
      );
      assert.ok(!res.isError, `${tool.name}: ${JSON.stringify(res)}`);
      const body = readFileSync(log, "utf8").split("\n").find((l) => l.startsWith("BODY ")) ?? "";
      assert.equal(body.includes(`"max_charge_usd":${JSON.stringify(cap)}`), expect, `${tool.name} body: ${body}`);
      if (!expect) assert.ok(!body.includes("max_charge_usd"), `${tool.name} sent max_charge_usd unasked`);
    }
  }
});
