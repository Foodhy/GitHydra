# GitHydra

Cliente git de escritorio para macOS. Esta es la fundación: abrir un repositorio, ver ramas e historial, y el espacio reservado para el grafo, el stage, la terminal y el editor.

## Requisitos

- Node.js 22+
- pnpm 11
- Rust stable (rustfmt y clippy)
- CMake (lo usa `git2` / libgit2 al compilar)

## Comandos

```bash
pnpm install
pnpm dev          # ventana de desarrollo
pnpm install-app  # recompila, instala en /Applications y abre GitHydra
pnpm build        # solo el .app y el .dmg, sin instalar
pnpm mcp      # servidor MCP por stdio
pnpm check    # Biome, formato, clippy y tests
```

La firma de Apple para distribuir el `.app` fuera de esta máquina no forma parte de esta fase.

El orden de construcción está en [docs/ROADMAP.md](docs/ROADMAP.md). Las capas están en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) y el MCP en [packages/mcp/README.md](packages/mcp/README.md).
