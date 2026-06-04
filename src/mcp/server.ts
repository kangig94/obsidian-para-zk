import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type ListToolsResult } from "@modelcontextprotocol/sdk/types.js";

export type ParaZkCli = "optsidian" | "obsidian";

type DescribePayload = {
  ok: true;
  [key: string]: unknown;
};

type CliEnv = {
  PARA_ZK_CLI?: string;
};

const TOOL_DESCRIPTION = "PARA-ZK — read & write the user's Obsidian vault (PARA + Zettelkasten: projects, areas, resources, journal, Zettelkasten notes). Call this FIRST whenever a task involves the user's personal notes or knowledge base. Returns how to drive the vault via its `para-zk:*` CLI: invocation, surface types, and where to fetch per-type keys.";
const HOWTO_BASE = "Locale-neutral codes only. Collections (tasks/references/backlinks) page via offset/limit, key/<i> for one item; backlinks read-only. Use `schema` for a type's read/write keys and filters, `commands` for the full command list.";
const OPTSIDIAN_NOTE = " `optsidian` is an Obsidian-based optimized CLI; run the `invoke`/`schema`/`commands` strings exactly as given and do not substitute `obsidian`.";
const FALLBACK_HOWTO = "PARA-ZK CLI detected but no running Obsidian vault was reachable (or no optsidian/obsidian CLI on PATH). Open the vault in Obsidian and ensure the CLI is on PATH, then call this tool again for the live schema.";
const DESCRIBE_INPUT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false
} satisfies ListToolsResult["tools"][number]["inputSchema"];

export function resolveCliOrder(env: CliEnv): ParaZkCli[] {
  const override = env.PARA_ZK_CLI?.trim();
  if (override === "optsidian" || override === "obsidian") return [override];
  return ["optsidian", "obsidian"];
}

export function invokePattern(cli: ParaZkCli): string {
  return cli === "optsidian"
    ? "optsidian raw para-zk:<command> [args...] format=json"
    : "obsidian para-zk:<command> [args...] format=json";
}

export function helpCommand(cli: ParaZkCli): string {
  return `${cli} --help`;
}

export function schemaCommand(cli: ParaZkCli): string {
  const prefix = cli === "optsidian" ? "optsidian raw " : "obsidian ";
  return `${prefix}para-zk:describe type=<surfaceType> format=json`;
}

export function howtoFor(cli: ParaZkCli): string {
  return cli === "optsidian" ? `${HOWTO_BASE}${OPTSIDIAN_NOTE}` : HOWTO_BASE;
}

function surfaceTypes(describe: DescribePayload): string[] {
  const direct = describe.surfaceTypes;
  if (Array.isArray(direct)) {
    return direct.filter((type): type is string => typeof type === "string");
  }
  const surfaces = describe.surfaces;
  if (!Array.isArray(surfaces)) return [];
  return surfaces
    .map((surface) => (surface && typeof surface === "object" ? (surface as { type?: unknown }).type : undefined))
    .filter((type): type is string => typeof type === "string");
}

export function buildEnvelope({ cli, describe }: { cli: ParaZkCli; describe: DescribePayload }) {
  return {
    running: true,
    cli,
    invoke: invokePattern(cli),
    surfaceTypes: surfaceTypes(describe),
    schema: schemaCommand(cli),
    commands: helpCommand(cli),
    howto: howtoFor(cli)
  };
}

export function buildFallback({ cli, reason }: { cli: ParaZkCli; reason?: string }) {
  return {
    running: false,
    cli,
    invoke: invokePattern(cli),
    commands: helpCommand(cli),
    howto: FALLBACK_HOWTO,
    ...(reason ? { reason } : {})
  };
}

type CliAttempt =
  | { kind: "ok"; describe: DescribePayload }
  | { kind: "unavailable"; error: string };

async function describeWithCli(cli: ParaZkCli): Promise<CliAttempt> {
  const args = cli === "optsidian"
    ? ["raw", "para-zk:describe", "format=json"]
    : ["para-zk:describe", "format=json"];

  let stdout: string;
  try {
    stdout = await execFileText(cli, args, 15_000);
  } catch (error) {
    return { kind: "unavailable", error: errorMessage(error) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    return { kind: "unavailable", error: `${cli} returned non-JSON output` };
  }

  if (isDescribePayload(parsed)) return { kind: "ok", describe: parsed };
  return { kind: "unavailable", error: `${cli} returned a non-ok response` };
}

async function describeFromAvailableCli(env: CliEnv) {
  const order = resolveCliOrder(env);
  const preferred = order[0] ?? "optsidian";
  let reason = "no CLI attempted";

  for (const cli of order) {
    const attempt = await describeWithCli(cli);
    if (attempt.kind === "ok") return buildEnvelope({ cli, describe: attempt.describe });
    reason = attempt.error;
    console.error(`PARA-ZK MCP: ${cli} unavailable: ${reason}`);
  }

  return buildFallback({ cli: preferred, reason });
}

function execFileText(file: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function isDescribePayload(value: unknown): value is DescribePayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.ok === true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createServer(): Server {
  const server = new Server({
    name: "para-zk",
    version: "0.0.1"
  }, {
    capabilities: {
      tools: {}
    }
  });

  server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => ({
    tools: [
      {
        name: "describe",
        description: TOOL_DESCRIPTION,
        inputSchema: DESCRIBE_INPUT_SCHEMA
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    if (request.params.name !== "describe") {
      return {
        content: [
          {
            type: "text",
            text: `Unknown PARA-ZK MCP tool: ${request.params.name}`
          }
        ],
        isError: true
      };
    }

    try {
      const envelope = await describeFromAvailableCli(process.env);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(envelope)
          }
        ]
      };
    } catch (error) {
      const preferred = resolveCliOrder(process.env)[0] ?? "optsidian";
      console.error(`PARA-ZK MCP: unexpected describe failure: ${errorMessage(error)}`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(buildFallback({ cli: preferred, reason: errorMessage(error) }))
          }
        ]
      };
    }
  });

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`PARA-ZK MCP server failed: ${errorMessage(error)}`);
    process.exit(1);
  });
}
