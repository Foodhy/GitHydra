# @githydra/mcp

Servidor MCP por stdio. En esta fase las herramientas devuelven los DTO de `@githydra/contracts` sin leer git.

| Herramienta             | Respuesta                                    |
| ----------------------- | -------------------------------------------- |
| `githydra_repo_info`    | `RepositoryInfo` con la ruta y la rama vacía |
| `githydra_list_commits` | `CommitPage` vacía                           |
| `githydra_working_tree` | `WorkingTreeStatus` vacío                    |

La ruta sale del argumento `path` o de `GITHYDRA_REPO`.

Desde la raíz del repo:

```bash
pnpm mcp
```

Ejemplo para Cursor (`.cursor/mcp.json`), con la ruta real del monorepo:

```json
{
  "mcpServers": {
    "githydra": {
      "command": "pnpm",
      "args": ["--dir", "/ruta/absoluta/GitHydra", "mcp"],
      "env": {
        "GITHYDRA_REPO": "/ruta/absoluta/de/un/repo"
      }
    }
  }
}
```

El proceso no está embebido en la app Tauri. El puente con el repositorio abierto en el escritorio queda para una fase posterior.
