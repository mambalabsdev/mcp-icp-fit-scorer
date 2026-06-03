# ICP Fit Scorer MCP Server

[![Smithery](https://smithery.ai/badge/mambabuilt/mcp-icp-fit-scorer)](https://smithery.ai/servers/mambabuilt/mcp-icp-fit-scorer) [![mcp-icp-fit-scorer MCP server](https://glama.ai/mcp/servers/mambalabsdev/mcp-icp-fit-scorer/badges/card.svg)](https://glama.ai/mcp/servers/mambalabsdev/mcp-icp-fit-scorer)

An MCP server that scores a company against your ideal customer profile. It wraps the Mamba Labs ICP Fit Scorer actor on Apify and returns a Clay-ready flat JSON row to any MCP client.

## What it does

Give it a company domain and a definition of your ICP, and it scores the company on weighted signals, returning a 0 to 100 score, an A to D tier, and a per-signal breakdown. Define your ICP three ways: a prebuilt template, a JSON scoring config, or a plain-English description (which uses your own LLM key). Turn on `fetch_signals` and the actor will gather hiring and tech-stack signals for you before scoring. One flat row, ready for Clay, a CRM, or an AI agent workflow. All of the scoring runs on Apify. This package is a thin client that calls the actor and hands back the result.

## Quick start

You need Node.js 18 or newer and an Apify account with an API token.

Add this to your Claude Desktop config:

```json
{
  "mcpServers": {
    "mamba-icp-scorer": {
      "command": "npx",
      "args": ["-y", "@mambalabsdev/mcp-icp-fit-scorer"],
      "env": {
        "APIFY_TOKEN": "your-apify-token"
      }
    }
  }
}
```

Get your token at https://console.apify.com/account/integrations, paste it in, and restart Claude Desktop. The `score_icp_fit` tool will be available.

## Prerequisites

- Node.js 18 or newer
- An Apify account with an API token

## Example prompts

- "Score clay.com against the b2b_saas template and fetch its signals."
- "How well does stripe.com fit an ICP of mid-market fintech companies? Explain the score."
- "Score figma.com with my scoring config and include the per-signal breakdown."
- "Rate openai.com against this ICP description: enterprise AI teams hiring for go-to-market."

## Inputs

- `company_domain` (required): the primary domain of the company to score. Example: `clay.com`
- `company_name` (optional): display name of the company.
- `template` (optional): name of a prebuilt scoring config.
- `scoring_config` (optional): a JSON object of scoring weights.
- `icp_description` (optional): plain-English ICP description. Requires `llm_api_key`.
- `llm_api_key` (optional): your OpenAI or Anthropic key, used only with `icp_description`.
- `llm_provider` (optional): `openai` or `anthropic`.
- `fetch_signals` (optional): let the actor gather hiring and tech-stack signals automatically.
- `include_explanation` (optional): add a `score_explanation` string to the output.

Define your ICP with exactly one of `template`, `scoring_config`, or `icp_description`.

This server exposes the single-company scoring path. The actor also supports batch inputs (a dataset or CSV of companies) and a results webhook. For those, run the actor directly on Apify.

## Output

The tool returns the actor's flat JSON row for the scored company, including `icp_score` (0 to 100), `icp_tier` (A to D), the per-signal breakdown, and an optional explanation. See the Apify Store page for the full output schema.

## Example output

```json
{
  "company_domain": "ramp.com",
  "icp_score": 87,
  "icp_tier": "A",
  "lead_tag": "priority",
  "score_hiring": 25,
  "score_tech_stack": 22,
  "score_headcount": 20,
  "score_funding": 20,
  "score_industry": 0,
  "run_date": "2026-05-28"
}
```

## Features

- User-defined JSON scoring config with custom weights
- Returns icp_score (0 to 100), icp_tier (A to D), and lead_tag
- Per-signal point breakdown: hiring, tech stack, headcount, funding, industry
- Replaces 6+ manual formula columns in Clay

## Full actor documentation

This server is a thin client and holds no scoring logic. For the complete input and output reference, pricing, and run history, see the Apify Store page:

https://apify.com/mambalabs/icp-fit-scorer

## Mamba Labs GTM Suite

This is one of six actors in the Mamba Labs GTM Suite, covering hiring signals, tech stack detection, signal aggregation, job board keyword scanning, LinkedIn URL resolution, and ICP scoring. See them all at https://apify.com/mambalabs.

## Related Mamba Labs MCP servers

The rest of the Mamba Labs GTM toolkit, each as its own MCP server:

- [Mamba Labs GTM Suite (all six tools)](https://github.com/mambalabsdev/mcp-gtm-suite)
- [GTM Hiring Signal Scraper](https://github.com/mambalabsdev/mcp-gtm-hiring-signal-scraper)
- [GTM Tech Stack Signal Enrichment](https://github.com/mambalabsdev/mcp-gtm-tech-stack-signal-scraper)
- [GTM Signals Aggregator](https://github.com/mambalabsdev/mcp-gtm-signals-aggregator)
- [Job Board Keyword Signal Scanner](https://github.com/mambalabsdev/mcp-job-board-keyword-signal-scanner)
- [Domain to LinkedIn URL Resolver](https://github.com/mambalabsdev/mcp-domain-to-linkedin-url-resolver)

## License

MIT

Built by Mamba Labs. https://apify.com/mambalabs
