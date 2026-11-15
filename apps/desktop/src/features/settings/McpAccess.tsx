import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

const TOOLS = [
  {
    name: "githydra_repo_info",
    detail: "Metadatos del repositorio abierto: rama, HEAD y ruta.",
  },
  {
    name: "githydra_list_commits",
    detail: "Página de commits. El cursor es el último sha ya visto.",
  },
  {
    name: "githydra_working_tree",
    detail: "Archivos del árbol, con stage y sin stage.",
  },
];

interface McpLaunch {
  root: string;
  command: string;
  args: string[];
}

export function McpAccess() {
  const [launch, setLaunch] = useState<McpLaunch | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<McpLaunch>("mcp_launch")
      .then(setLaunch)
      .catch(() => {
        setError("No se pudo leer la ruta del servidor.");
      });
  }, []);

  const snippets = launch ? clientSnippets(launch) : [];

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
        MCP
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        El servidor habla por la entrada estándar. No tiene puerto ni clave. Si
        la ventana tiene un repositorio abierto, las herramientas lo usan. Si
        no, aceptan <span className="text-text">path</span> o la variable{" "}
        <span className="text-text">GITHYDRA_REPO</span>.
      </p>
      <ul className="mt-4 grid gap-2">
        {TOOLS.map((tool) => (
          <li
            key={tool.name}
            className="rounded border border-line bg-surface-raised px-3 py-2"
          >
            <p className="font-mono text-xs text-accent">{tool.name}</p>
            <p className="mt-1 text-xs text-muted">{tool.detail}</p>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-xs text-warn">{error}</p> : null}
      {launch ? (
        <p className="mt-4 font-mono text-[11px] text-muted">{launch.root}</p>
      ) : null}
      <div className="mt-3 grid gap-3">
        {snippets.map((snippet) => (
          <article
            key={snippet.id}
            className="rounded border border-line bg-surface-raised"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
              <div>
                <p className="text-sm">{snippet.title}</p>
                <p className="text-[11px] text-muted">{snippet.where}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void copy(snippet.id, snippet.body);
                }}
                className="shrink-0 text-xs text-accent"
              >
                {copied === snippet.id ? "Copiado" : "Copiar"}
              </button>
            </div>
            <pre className="overflow-x-auto px-3 py-2 font-mono text-[11px] leading-5 text-text">
              {snippet.body}
            </pre>
          </article>
        ))}
      </div>
    </section>
  );
}

function clientSnippets(launch: McpLaunch): {
  id: string;
  title: string;
  where: string;
  body: string;
}[] {
  const json = JSON.stringify(
    {
      mcpServers: {
        githydra: {
          command: launch.command,
          args: launch.args,
        },
      },
    },
    null,
    2,
  );
  const command = [launch.command, ...launch.args].join(" ");
  const toml = `[mcp_servers.githydra]\ncommand = "${launch.command}"\nargs = ${JSON.stringify(launch.args)}\n`;
  return [
    {
      id: "cursor",
      title: "Cursor",
      where: ".cursor/mcp.json",
      body: json,
    },
    {
      id: "claude",
      title: "Claude",
      where: "Claude Desktop o .mcp.json de Claude Code",
      body: json,
    },
    {
      id: "codex",
      title: "Codex",
      where: "~/.codex/config.toml",
      body: toml,
    },
    {
      id: "stdio",
      title: "Cualquier cliente",
      where: "Comando stdio",
      body: command,
    },
  ];
}
