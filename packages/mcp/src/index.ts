import type {
  CommitPage,
  RepositoryInfo,
  WorkingTreeStatus,
} from "@githydra/contracts";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Servidor MCP de fase 0. Comparte los DTO de `@githydra/contracts`
 * con la app de escritorio, pero todavía no abre el repositorio:
 * responde con la forma correcta y datos vacíos. La ruta sale del
 * argumento `path` o de la variable `GITHYDRA_REPO`.
 */

const server = new Server(
  { name: "githydra", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "githydra_repo_info",
      description:
        "Metadatos del repositorio (fase 0: no lee git; rellena la ruta y deja la rama vacía). Usa el argumento path o GITHYDRA_REPO.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Ruta absoluta del repositorio",
          },
        },
      },
    },
    {
      name: "githydra_list_commits",
      description:
        "Página de commits con la forma CommitPage. En fase 0 la lista va vacía; el puente con la app llega después.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          limit: { type: "number" },
          cursor: { type: "string" },
        },
      },
    },
    {
      name: "githydra_working_tree",
      description:
        "Estado del árbol de trabajo con la forma WorkingTreeStatus. En fase 0 la lista va vacía.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments;
  const path = readPath(args);
  if (!path) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "Falta la ruta del repositorio. Pasa `path` o define GITHYDRA_REPO.",
        },
      ],
    };
  }

  switch (request.params.name) {
    case "githydra_repo_info": {
      const info: RepositoryInfo = {
        path,
        name: baseName(path),
        currentBranch: null,
        headSha: null,
        isDetached: false,
      };
      return json(info);
    }
    case "githydra_list_commits": {
      const page: CommitPage = { commits: [], nextCursor: null };
      return json(page);
    }
    case "githydra_working_tree": {
      const status: WorkingTreeStatus = { entries: [] };
      return json(status);
    }
    default:
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Herramienta desconocida: ${request.params.name}`,
          },
        ],
      };
  }
});

function readPath(args: Record<string, unknown> | undefined): string | null {
  const fromArgs = args?.path;
  if (typeof fromArgs === "string" && fromArgs.trim().length > 0) {
    return fromArgs.trim();
  }
  const fromEnv = process.env.GITHYDRA_REPO?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

function baseName(path: string): string {
  const parts = path.split(/[/\\]/).filter((part) => part.length > 0);
  return parts.at(-1) ?? path;
}

function json(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);
