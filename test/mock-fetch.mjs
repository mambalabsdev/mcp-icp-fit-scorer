// Preloaded with `node --import` by test/start-poll.test.js. Replaces fetch with
// a fake Apify API so the start and poll path runs end to end with no network
// and no token. Every requested URL is appended to MOCK_LOG.
import { appendFileSync } from "node:fs";

const FINAL = process.env.MOCK_RUN_FINAL || "SUCCEEDED";
const LOG = process.env.MOCK_LOG;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = (init.method || "GET").toUpperCase();
  if (LOG) appendFileSync(LOG, `${method} ${u}\n`);
  if (u.includes("run-sync")) return json(408, { error: { message: "run-sync must not be called" } });
  if (method === "POST" && /\/v2\/acts\/[^/]+\/runs\?/.test(u)) {
    return json(201, { data: { id: "mockRun1", status: "RUNNING", defaultDatasetId: "mockDs1" } });
  }
  if (method === "GET" && u.includes("/v2/actor-runs/mockRun1")) {
    return json(200, { data: { id: "mockRun1", status: FINAL, defaultDatasetId: "mockDs1" } });
  }
  if (method === "GET" && u.includes("/v2/datasets/mockDs1/items")) {
    return json(200, [{ row_status: "ok", error_reason: null, mock: true }]);
  }
  return json(500, { error: { message: `unexpected mock request ${method} ${u}` } });
};
