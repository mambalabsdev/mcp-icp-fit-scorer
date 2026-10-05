#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(here, "..", "package.json"), "utf8"),
) as { version: string; name: string };

// Distinctive UA so Apify run meta.userAgent marks MCP-originated runs.
const USER_AGENT = `mambalabs-mcp ${pkg.name}@${pkg.version}`;



type ToolResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

// How long the actor run itself is allowed to take, in seconds. Kept at the
// value this wrapper has always passed to the actor, so the change to start and
// poll changes how the wrapper waits, not how long the actor may run.
const ACTOR_RUN_TIMEOUT_SECS = 300;

// How long this wrapper waits for that run, in milliseconds. The actor's own
// timeout plus two minutes, so the run's own TIMED-OUT status is what the
// caller sees rather than the wrapper giving up first and reporting nothing.
const WRAPPER_WAIT_MS = (ACTOR_RUN_TIMEOUT_SECS + 120) * 1000;

// MAMBA_MCP_POLL_INTERVAL_MS exists for the test suite, which drives the poll
// loop against a mocked Apify API. Callers never need to set it.
const POLL_INTERVAL_MS = Number(process.env.MAMBA_MCP_POLL_INTERVAL_MS) || 3000;

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED", "ABORTING"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Shared caller. actorPath is the actor's immutable Apify actor ID (a stable key
// that survives Store renames). The /v2/acts/{id} endpoint accepts it directly,
// so a Store rename never breaks these calls.
//
// START AND POLL, NOT RUN-SYNC. Apify's synchronous endpoints carry a platform
// ceiling of 300 seconds on the HTTP wait itself and answer 408 past it whatever
// the timeout parameter says, so a long run read as a timeout while the actor
// went on to finish and bill. Starting the run, polling it to a terminal status
// and then reading the dataset waits exactly as long as the run takes, and a
// call that stops waiting returns the run id so the result is never lost.
//
// The token is read here rather than at module load, so the tool registers
// unconditionally and a server started without APIFY_TOKEN still advertises its
// capabilities instead of reporting none.
async function runActor(
  actorPath: string,
  actorLabel: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    return { isError: true, content: [{ type: "text", text: "APIFY_TOKEN is not set. Create a token at https://console.apify.com/account/integrations and set it as the APIFY_TOKEN environment variable." }] };
  }

  const headers = {
    Authorization: `Bearer ${APIFY_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };

  const httpError = async (response: Response): Promise<string> => {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = ` ${body.error.message}`;
    } catch {
      detail = "";
    }
    switch (response.status) {
      case 400:
        return `The ${actorLabel} run was rejected as invalid input.${detail}`;
      case 401:
        return "Invalid Apify token. Check your APIFY_TOKEN environment variable.";
      case 402:
        return "Insufficient Apify credits. Check your account balance at https://console.apify.com/billing";
      default:
        return `Apify request to ${actorLabel} failed with status ${response.status}.${detail}`;
    }
  };

  // 1. Start the run.
  let started: Response;
  try {
    started = await fetch(
      `https://api.apify.com/v2/acts/${actorPath}/runs?timeout=${ACTOR_RUN_TIMEOUT_SECS}`,
      { method: "POST", headers, body: JSON.stringify(input) },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `Could not reach the Apify API: ${message}` }] };
  }
  if (!started.ok) {
    return { isError: true, content: [{ type: "text", text: await httpError(started) }] };
  }

  let run: { id?: string; status?: string; defaultDatasetId?: string };
  try {
    run = ((await started.json()) as { data?: typeof run }).data ?? {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run start returned a response that could not be parsed: ${message}` }] };
  }
  const runId = run.id;
  if (!runId) {
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run start returned no run id, so there is nothing to wait for.` }] };
  }

  // 2. Poll to a terminal status.
  const deadline = Date.now() + WRAPPER_WAIT_MS;
  let status = run.status ?? "READY";
  let datasetId = run.defaultDatasetId;
  while (!TERMINAL.has(status)) {
    if (Date.now() >= deadline) {
      return {
        isError: true,
        content: [{ type: "text", text: `The ${actorLabel} run ${runId} was still ${status} after ${Math.round(WRAPPER_WAIT_MS / 1000)} seconds and this call stopped waiting. The run itself is still on Apify: read it at https://console.apify.com/actors/runs/${runId}` }],
      };
    }
    await sleep(POLL_INTERVAL_MS);
    let poll: Response;
    try {
      poll = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, { headers });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: "text", text: `Lost contact with the Apify API while waiting for ${actorLabel} run ${runId}: ${message}` }] };
    }
    if (!poll.ok) {
      return { isError: true, content: [{ type: "text", text: await httpError(poll) }] };
    }
    const body = (await poll.json()) as { data?: { status?: string; defaultDatasetId?: string } };
    status = body.data?.status ?? status;
    datasetId = body.data?.defaultDatasetId ?? datasetId;
  }

  // 3. A run that did not succeed is a failure the caller must see, never an
  // empty success. Surfacing it here is what keeps a crashed run from reading
  // as "no results found".
  if (status !== "SUCCEEDED") {
    return {
      isError: true,
      content: [{ type: "text", text: `The ${actorLabel} run did not succeed (run ID: ${runId}, status: ${status}).` }],
    };
  }
  if (!datasetId) {
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run ${runId} succeeded but reported no dataset, so there is nothing to return.` }] };
  }

  // 4. Read the dataset.
  let ds: Response;
  try {
    ds = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?format=json`, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `Could not read the ${actorLabel} dataset: ${message}` }] };
  }
  if (!ds.ok) {
    return { isError: true, content: [{ type: "text", text: await httpError(ds) }] };
  }

  let items: unknown;
  try {
    items = await ds.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run returned a response that could not be parsed: ${message}` }] };
  }

  if (!Array.isArray(items)) {
    const asObj = items as { error?: { type?: string; message?: string } };
    const detail = asObj?.error?.message
      ? `${asObj.error.message}`
      : JSON.stringify(items);
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run did not return a dataset. ${detail}` }] };
  }

  // Pass actor output through unchanged: the wrapper never reinterprets a
  // status field.
  return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
}

const server = new McpServer({
  name: "mamba-icp-fit-scorer",
  version: pkg.version,
});

// This tool exposes the single-company scoring surface. The actor also supports
// batch inputs (dataset_id, csv_url), a webhook, and ~18 manual signal-override
// fields; those are intentionally not surfaced here. Use fetch_signals to let the
// actor gather hiring and tech-stack signals on its own.
server.registerTool(
  "score_icp_fit",
  {
    title: "Score ICP Fit",
    description:
      "Score a company against your ideal customer profile (ICP) using weighted signals. Returns a 0 to 100 icp_score, an A to D icp_tier, and a per-signal breakdown as a flat, Clay-ready JSON row. Define your ICP with a prebuilt template, a JSON scoring_config, or a plain-English icp_description (which requires llm_api_key). Read-only; requires an APIFY_TOKEN and consumes Apify credits per call.",
    annotations: {
      title: "Score ICP Fit",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
    company_domain: z
      .string()
      .describe("The primary domain of the company to score. Example: clay.com"),
    company_name: z.string().optional().describe("Optional display name of the company."),
    template: z
      .enum(["full_signal", "saas_outbound", "b2b_services", "fintech", "smb_local", "enterprise"])
      .optional()
      .describe(
        "Name of a prebuilt scoring config, one of the six the actor ships: full_signal, saas_outbound, b2b_services, fintech, smb_local, enterprise. Alternative to scoring_config or icp_description. Call list_icp_templates to see them.",
      ),
    scoring_config: z
      .record(z.any())
      .optional()
      .describe(
        "JSON object of scoring weights. Alternative to template or icp_description.",
      ),
    icp_description: z
      .string()
      .optional()
      .describe(
        "Plain-English description of your target ICP. Requires llm_api_key. Alternative to template or scoring_config.",
      ),
    llm_api_key: z
      .string()
      .optional()
      .describe("Your OpenAI or Anthropic API key. Required only when using icp_description."),
    llm_provider: z
      .enum(["openai", "anthropic"])
      .optional()
      .describe("LLM provider to use with icp_description: openai or anthropic."),
    fetch_signals: z
      .boolean()
      .optional()
      .describe(
        "If true, the actor fetches hiring and tech-stack signals for the company automatically before scoring.",
      ),
    include_explanation: z
      .boolean()
      .optional()
      .describe(
        "If true, adds a score_explanation string to the output describing how the score was derived.",
      ),
    tier_thresholds: z.record(z.any())
      .optional()
      .describe(
        "Optional. Minimum score for each tier as { \"tier_a\": number, \"tier_b\": number, \"tier_c\": number }. Scores at or above tier_a are A, tier_b are B, tier_c are C, else D. Defaults to 80 / 60 / 40.",
      ),
    funded_within_days: z.number().int()
      .optional()
      .describe(
        "Optional. How recent a funding round must be to count for the recently_funded signal, in days. Defaults to 540 (18 months).",
      ),
    min_score_to_output: z.number().int()
      .optional()
      .describe(
        "If set, rows scoring below this threshold are skipped from output (not pushed to dataset). Skipped rows are logged only.",
      ),
    previous_score: z.number().int()
      .optional()
      .describe(
        "Previous ICP score for this company. If provided, output includes score_change and score_trend fields.",
      ),
    gtm_hiring_signal: z.string()
      .optional()
      .describe(
        "Whether the company is actively hiring for GTM/sales roles. Accepts a boolean-like string (\"true\"/\"false\"). Sent as a string for Clay compatibility and coerced to boolean at runtime.",
      ),
    gtm_role_count: z.string()
      .optional()
      .describe(
        "Number of open GTM/sales roles. Scores via the gtm_role_count_strong signal when at or above min_gtm_roles (default 2). Accepts a numeric string (e.g. \"8\"). Sent as a string for Clay compatibility and coerced to integer at runtime.",
      ),
    uses_hubspot: z.string()
      .optional()
      .describe(
        "Whether the company uses HubSpot. Accepts a boolean-like string (\"true\"/\"false\"). Sent as a string for Clay compatibility and coerced to boolean at runtime.",
      ),
    uses_salesforce: z.string()
      .optional()
      .describe(
        "Whether the company uses Salesforce. Accepts a boolean-like string (\"true\"/\"false\"). Sent as a string for Clay compatibility and coerced to boolean at runtime.",
      ),
    uses_clay: z.string()
      .optional()
      .describe(
        "Whether the company uses Clay. Accepts a boolean-like string (\"true\"/\"false\"). Sent as a string for Clay compatibility and coerced to boolean at runtime.",
      ),
    crm_detected: z.string()
      .optional()
      .describe(
        "Whether any CRM was detected. Accepts a boolean-like string (\"true\"/\"false\") or any non-empty CRM name (e.g. \"Salesforce\"). Sent as a string for Clay compatibility and coerced to boolean at runtime. Auto-derived from uses_hubspot/uses_salesforce if not set.",
      ),
    seq_tool_detected: z.string()
      .optional()
      .describe(
        "Whether a sales sequencing tool (Outreach, SalesLoft, Apollo, Lemlist) was detected. Accepts a boolean-like string (\"true\"/\"false\") or any non-empty tool name (e.g. \"Outreach\"). Sent as a string for Clay compatibility and coerced to boolean at runtime.",
      ),
    tech_stack: z.string()
      .optional()
      .describe(
        "Comma-separated list of technologies. Used to auto-detect CRM/sequencing tools if booleans are not set.",
      ),
    headcount: z.string()
      .optional()
      .describe(
        "Current employee headcount. Accepts a numeric string (e.g. \"3000\"). Sent as a string for Clay compatibility and coerced to integer at runtime.",
      ),
    headcount_min: z.number().int()
      .optional()
      .describe(
        "Minimum headcount for the headcount_in_range signal.",
      ),
    headcount_max: z.number().int()
      .optional()
      .describe(
        "Maximum headcount for the headcount_in_range signal.",
      ),
    headcount_in_range: z.boolean()
      .optional()
      .describe(
        "Override: whether headcount is in your target range.",
      ),
    employee_band: z.string()
      .optional()
      .describe(
        "Firmographic employee band from the Company Firmographic Enricher (Actor ID YlUtLWjfPpqykmB8g), e.g. \"201-500\". Scores via employee_band_match when it is in target_employee_bands.",
      ),
    revenue_estimate: z.string()
      .optional()
      .describe(
        "Estimated annual revenue in dollars from the Company Firmographic Enricher (Actor ID YlUtLWjfPpqykmB8g). Scores via revenue_in_range. Accepts a numeric string (e.g. \"50000000\"). Coerced to integer at runtime.",
      ),
    hq_location: z.string()
      .optional()
      .describe(
        "Headquarters location from the Company Firmographic Enricher (Actor ID YlUtLWjfPpqykmB8g). Carried for reference; not currently scored.",
      ),
    founded_year: z.string()
      .optional()
      .describe(
        "Year the company was founded, from the Company Firmographic Enricher (Actor ID YlUtLWjfPpqykmB8g). Carried for reference; not currently scored. Accepts a numeric string (e.g. \"2015\").",
      ),
    recently_funded: z.boolean()
      .optional()
      .describe(
        "Override: whether the company was recently funded (within funded_within_days, default 540).",
      ),
    last_funding_date: z.string()
      .optional()
      .describe(
        "ISO date of last funding round (legacy field; latest_funding_date is preferred). Used to auto-detect recently_funded if the boolean is not set.",
      ),
    latest_funding_date: z.string()
      .optional()
      .describe(
        "ISO date of the latest funding round (from C1 Funding & Press Signal Scanner when it ships). Drives recently_funded against funded_within_days.",
      ),
    latest_funding_amount: z.string()
      .optional()
      .describe(
        "Dollar amount of the latest funding round (from C1 when it ships). Scores via well_funded when at or above min_funding_amount (default 1000000). Accepts a numeric string (e.g. \"50000000\").",
      ),
    funding_stage: z.string()
      .optional()
      .describe(
        "Funding stage (e.g. seed, series_a, series_b, growth). Used to infer recently_funded.",
      ),
    industry: z.string()
      .optional()
      .describe(
        "The company's industry (from the Company Firmographic Enricher, Actor ID YlUtLWjfPpqykmB8g).",
      ),
    industry_match: z.boolean()
      .optional()
      .describe(
        "Override: whether the company's industry matches your target list.",
      ),
    target_industries: z.string()
      .optional()
      .describe(
        "Comma-separated list of target industries for the industry_match signal.",
      ),
    social_platforms_found: z.string()
      .optional()
      .describe(
        "Number of official social platforms found, from the Company Social Presence Mapper (Actor ID 4k6CCemkgBDz18m2h). Scores via social_presence when at or above min_social_platforms (default 2). Accepts a numeric string.",
      ),
    total_followers: z.string()
      .optional()
      .describe(
        "Total social followers across platforms, from the Company Social Presence Mapper (Actor ID 4k6CCemkgBDz18m2h). Scores via strong_social_following when at or above min_total_followers (default 1000). Accepts a numeric string.",
      ),
    has_linkedin: z.string()
      .optional()
      .describe(
        "Whether a company LinkedIn page was found, from the Company Social Presence Mapper (Actor ID 4k6CCemkgBDz18m2h) or the Domain to LinkedIn URL Resolver (Actor ID 3HtnSaqPHOg1Qg5gx). Contributes to social_presence. Accepts a boolean-like string.",
      ),
    has_twitter: z.string()
      .optional()
      .describe(
        "Whether a company X/Twitter profile was found, from the Company Social Presence Mapper (Actor ID 4k6CCemkgBDz18m2h). Contributes to social_presence. Accepts a boolean-like string.",
      ),
    job_count: z.string()
      .optional()
      .describe(
        "Number of open jobs found, from the Job Board Keyword Signal Scanner (Actor ID 4DvqpvhMR74NLcDDY). Scores via active_hiring_volume when at or above min_job_count (default 3). Accepts a numeric string.",
      ),
    keyword_match_count: z.string()
      .optional()
      .describe(
        "Number of target-keyword matches found, from the Job Board Keyword Signal Scanner (Actor ID 4DvqpvhMR74NLcDDY). Scores via keyword_signal_match when at or above min_keyword_matches (default 1). Accepts a numeric string.",
      ),
  },
  },
  async (args) => {
    const input: Record<string, unknown> = { company_domain: args.company_domain };
    for (const key of [
      "company_name",
      "template",
      "scoring_config",
      "icp_description",
      "llm_api_key",
      "llm_provider",
      "fetch_signals",
      "include_explanation",
      "tier_thresholds",
      "funded_within_days",
      "min_score_to_output",
      "previous_score",
      "gtm_hiring_signal",
      "gtm_role_count",
      "uses_hubspot",
      "uses_salesforce",
      "uses_clay",
      "crm_detected",
      "seq_tool_detected",
      "tech_stack",
      "headcount",
      "headcount_min",
      "headcount_max",
      "headcount_in_range",
      "employee_band",
      "revenue_estimate",
      "hq_location",
      "founded_year",
      "recently_funded",
      "last_funding_date",
      "latest_funding_date",
      "latest_funding_amount",
      "funding_stage",
      "industry",
      "industry_match",
      "target_industries",
      "social_platforms_found",
      "total_followers",
      "has_linkedin",
      "has_twitter",
      "job_count",
      "keyword_match_count",
    ] as const) {
      if (args[key] !== undefined) input[key] = args[key];
    }

    return runActor("W161DT8W4kW55dMFh", "ICP Fit Scorer", input);
  },
);


// The six prebuilt templates the live actor accepts and its own description of
// them (input schema enum and description, read 2026-10-05). Answering this
// locally costs the caller nothing and lets an agent pick a template before it
// spends a scoring run.
const ICP_TEMPLATES = {
  templates: ["full_signal", "saas_outbound", "b2b_services", "fintech", "smb_local", "enterprise"],
  note: "full_signal scores every fleet source; the others are role-specific presets. A template is used only when scoring_config is not provided.",
};

server.registerTool(
  "list_icp_templates",
  {
    title: "List ICP Templates",
    description:
      "List the prebuilt ICP scoring templates score_icp_fit accepts in its template input, with the actor's own note on how they differ. Answers locally from the server: no Apify run, no token needed, and no charge. Use it before score_icp_fit when you have no scoring_config or icp_description of your own.",
    annotations: {
      title: "List ICP Templates",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {},
  },
  async () => ({ content: [{ type: "text", text: JSON.stringify(ICP_TEMPLATES, null, 2) }] }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
