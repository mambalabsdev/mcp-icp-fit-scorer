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

const APIFY_TOKEN = process.env.APIFY_TOKEN;
if (!APIFY_TOKEN) {
  console.error(
    [
      "APIFY_TOKEN is not set.",
      "This server needs an Apify API token to run the ICP Fit Scorer actor.",
      "Create a token at https://console.apify.com/account/integrations and pass it as the APIFY_TOKEN environment variable.",
    ].join("\n"),
  );
  process.exit(1);
}

// The tilde between the org name and the actor name is Apify's required separator.
const ACTOR_ENDPOINT =
  "https://api.apify.com/v2/acts/mambalabs~icp-fit-scorer/run-sync-get-dataset-items?timeout=300";

const server = new McpServer({
  name: "mamba-icp-fit-scorer",
  version: pkg.version,
});

// This tool exposes the single-company scoring surface. The actor also supports
// batch inputs (dataset_id, csv_url), a webhook, and ~18 manual signal-override
// fields; those are intentionally not surfaced here. Use fetch_signals to let the
// actor gather hiring and tech-stack signals on its own.
server.tool(
  "score_icp_fit",
  "Score a company against your ideal customer profile (ICP) using weighted signals. Returns a 0 to 100 icp_score, an A to D icp_tier, and a per-signal breakdown as a flat, Clay-ready JSON row. Define your ICP with a prebuilt template, a JSON scoring_config, or a plain-English icp_description (which requires llm_api_key).",
  {
    company_domain: z
      .string()
      .describe("The primary domain of the company to score. Example: clay.com"),
    company_name: z.string().optional().describe("Optional display name of the company."),
    template: z
      .string()
      .optional()
      .describe(
        "Name of a prebuilt scoring config. Alternative to scoring_config or icp_description.",
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
      .string()
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
    ] as const) {
      if (args[key] !== undefined) input[key] = args[key];
    }

    let response: Response;
    try {
      response = await fetch(ACTOR_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${APIFY_TOKEN}`,
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify(input),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `Could not reach the Apify API: ${message}` }],
      };
    }

    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        if (body?.error?.message) detail = ` ${body.error.message}`;
      } catch {
        detail = "";
      }

      let message: string;
      switch (response.status) {
        case 401:
          message = "Invalid Apify token. Check your APIFY_TOKEN environment variable.";
          break;
        case 402:
          message =
            "Insufficient Apify credits. Check your account balance at https://console.apify.com/billing";
          break;
        case 408:
          message =
            "Actor run timed out after 300 seconds. Try again, or run the actor on Apify directly for longer jobs.";
          break;
        default:
          message = `Apify request failed with status ${response.status}.${detail}`;
      }
      return { isError: true, content: [{ type: "text", text: message }] };
    }

    const items = await response.json();
    return {
      content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
