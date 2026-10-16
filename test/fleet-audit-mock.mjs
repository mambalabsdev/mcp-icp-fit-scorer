// Preloaded with `node --import` by test/fleet-audit.test.js. A fake Apify API
// that records every request and every request body to FLEET_MOCK_LOG.
import { appendFileSync } from "node:fs";

const LOG = process.env.FLEET_MOCK_LOG;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = (init.method || "GET").toUpperCase();
  if (LOG) appendFileSync(LOG, `${method} ${u}\n`);
  if (LOG && init.body) appendFileSync(LOG, `BODY ${init.body}\n`);
  if (method === "POST" && /\/v2\/acts\/[^/]+\/runs\?/.test(u)) {
    return json(201, { data: { id: "mockRun1", status: "RUNNING", defaultDatasetId: "mockDs1" } });
  }
  if (method === "GET" && u.includes("/v2/actor-runs/mockRun1")) {
    return json(200, { data: { id: "mockRun1", status: "SUCCEEDED", defaultDatasetId: "mockDs1" } });
  }
  if (method === "GET" && u.includes("/v2/datasets/mockDs1/items")) {
    return json(200, [{ row_status: "ok", error_reason: null, mock: true }]);
  }
  return json(500, { error: { message: `unexpected mock request ${method} ${u}` } });
};
