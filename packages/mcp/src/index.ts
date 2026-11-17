import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  createBranch,
  GitToolError,
  listCommits,
  listWorktrees,
  proposeCommit,
  repoInfo,
  showDiff,
  stageFiles,
  unstageFiles,
  workingTree,
} from "./git.js";
import { addScript, listScripts } from "./scripts.js";
import { readSessionPath, resolveRepoPath } from "./session.js";

/**
 * Servidor MCP aparte de la ventana. Lee git en la ruta del argumento,
 * en GITHYDRA_REPO, o en el repositorio que la app dejó en session.json.
 */

const server = new Server(
  { name: "githydra", version: "0.15.0" },
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
    {
      name: "githydra_list_worktrees",
      description:
        "Copias enlazadas del repositorio, con bloqueo, carpeta ausente y la frase de cada situación. No crea ni borra.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
      },
    },
    {
      name: "githydra_list_scripts",
      description:
        "Scripts del repo en .githydra/scripts.json. No los ejecuta.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
      },
    },
    {
      name: "githydra_add_script",
      description:
        "Agrega o reemplaza un script en .githydra/scripts.json. No lo ejecuta.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          name: { type: "string" },
          command: { type: "string" },
          icon: {
            type: "string",
            description:
              "Optional icon id: eraser, play, terminal, git-branch, package, bug, hammer, refresh-cw, search, sparkles. Empty clears it.",
          },
        },
        required: ["name", "command"],
      },
    },
    {
      name: "githydra_stage_files",
      description:
        "Stage files with git add. Does not commit. The open window refreshes.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          files: {
            type: "array",
            items: { type: "string" },
            description: "Paths relative to the repository",
          },
        },
        required: ["files"],
      },
    },
    {
      name: "githydra_unstage_files",
      description:
        "Unstage files with git restore --staged. Leaves the working tree as it is.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          files: { type: "array", items: { type: "string" } },
        },
        required: ["files"],
      },
    },
    {
      name: "githydra_propose_commit",
      description:
        "Write a commit summary and description for the person to confirm. Does not create the commit.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          summary: { type: "string" },
          description: { type: "string" },
        },
        required: ["summary"],
      },
    },
    {
      name: "githydra_create_branch",
      description: "Create a branch without moving HEAD of the open folder.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          name: { type: "string" },
          sha: { type: "string" },
        },
        required: ["name"],
      },
    },
    {
      name: "githydra_show_diff",
      description:
        "Ask the window to open the working diff of a file that is already in the tree.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          file: { type: "string" },
          staged: { type: "boolean" },
        },
        required: ["file"],
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
      case "githydra_list_worktrees":
        return json(listWorktrees(path));
      case "githydra_list_scripts":
        return json(listScripts(path));
      case "githydra_add_script": {
        const name = stringArg(request.params.arguments?.name);
        const command = stringArg(request.params.arguments?.command);
        if (!name || !command) {
          return textError("Faltan name y command.");
        }
        return json(
          addScript(
            path,
            name,
            command,
            stringArg(request.params.arguments?.icon),
          ),
        );
      }
      case "githydra_stage_files":
        stageFiles(path, stringList(request.params.arguments?.files));
        return json({ staged: true });
      case "githydra_unstage_files":
        unstageFiles(path, stringList(request.params.arguments?.files));
        return json({ unstaged: true });
      case "githydra_propose_commit": {
        const summary = stringArg(request.params.arguments?.summary);
        if (!summary) {
          return textError("Missing summary.");
        }
        proposeCommit(
          path,
          summary,
          stringArg(request.params.arguments?.description) ?? "",
        );
        return json({ proposed: true });
      }
      case "githydra_create_branch": {
        const name = stringArg(request.params.arguments?.name);
        if (!name) {
          return textError("Missing branch name.");
        }
        return json(
          createBranch(path, name, stringArg(request.params.arguments?.sha)),
        );
      }
      case "githydra_show_diff": {
        const file = stringArg(request.params.arguments?.file);
        if (!file) {
          return textError("Missing file path.");
        }
        const staged = request.params.arguments?.staged === true;
        showDiff(path, file, staged);
        return json({ file, staged });
      }
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

function stringList(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
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
