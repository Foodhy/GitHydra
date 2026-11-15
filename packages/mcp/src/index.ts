import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GitToolError, listCommits, repoInfo, workingTree } from "./git.js";
import { readSessionPath, resolveRepoPath } from "./session.js";

/**
 * Servidor MCP aparte de la ventana. Lee git en la ruta del argumento,
 * en GITHYDRA_REPO, o en el repositorio que la app dejó en session.json.
 */

const server = new Server(
  { name: "githydra", version: "0.7.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "githydra_repo_info",
      description:
        "Metadatos del repositorio. Usa path, GITHYDRA_REPO o el repo abierto en GitHydra.",
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
        "Página de commits con la forma CommitPage. El cursor es el último sha ya visto.",
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
        "Estado del árbol de trabajo con la forma WorkingTreeStatus.",
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
  const path = resolveRepoPath({
    args: request.params.arguments,
    envPath: process.env.GITHYDRA_REPO,
    sessionPath: readSessionPath(),
  });
  if (!path) {
    return textError(
      "Falta la ruta del repositorio. Pasa `path`, define GITHYDRA_REPO o abre un repo en GitHydra.",
    );
  }

  try {
    switch (request.params.name) {
      case "githydra_repo_info":
        return json(repoInfo(path));
      case "githydra_list_commits":
        return json(
          listCommits(
            path,
            numberArg(request.params.arguments?.limit),
            stringArg(request.params.arguments?.cursor),
          ),
        );
      case "githydra_working_tree":
        return json(workingTree(path));
      default:
        return textError(`Herramienta desconocida: ${request.params.name}`);
    }
  } catch (error) {
    const message =
      error instanceof GitToolError ? error.message : "No se pudo leer git.";
    return textError(message);
  }
});

function numberArg(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function json(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  };
}

function textError(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);
