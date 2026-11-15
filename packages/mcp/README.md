# @githydra/mcp

Servidor MCP por stdio. Lee el repositorio con `git` y devuelve los DTO de `@githydra/contracts`.

| Herramienta             | Respuesta           |
| ----------------------- | ------------------- |
| `githydra_repo_info`    | `RepositoryInfo`    |
| `githydra_list_commits` | `CommitPage`        |
| `githydra_working_tree` | `WorkingTreeStatus` |

La ruta se elige en este orden:

1. El argumento `path`.
2. La variable `GITHYDRA_REPO`.
3. El repositorio abierto en la ventana, guardado en `session.json` dentro de Application Support de `com.githydra.app`.

El proceso no está embebido en la app. Desde la raíz del repo:

```bash
pnpm mcp
```

Ejemplo para Cursor (`.cursor/mcp.json`), con la ruta real del monorepo:

```json
{
  "mcpServers": {
    "githydra": {
      "command": "pnpm",
      "args": ["--dir", "/ruta/absoluta/GitHydra", "mcp"]
    }
  }
}
```

Si la ventana tiene un repositorio abierto, las herramientas lo usan sin `GITHYDRA_REPO`.
