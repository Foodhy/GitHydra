# Disco de macOS (`.dmg`)

`pnpm build` ya genera el `.app` y el `.dmg`. No hay un empaquetador aparte. Este archivo es el procedimiento para producir el disco cuando haga falta, en esta máquina.

La firma y la notarización de Apple quedan fuera de esta fase. El disco se puede copiar a otra Mac Apple Silicon; Gatekeeper lo bloquea al abrirlo. Cómo pasarlo está en «Otra Mac».

## Requisitos

Los mismos que el resto del repo, y estar en macOS:

- Node.js 22+
- pnpm 11
- Rust stable (rustfmt y clippy)
- CMake (lo pide `git2` / libgit2 al compilar)

## Generar el disco

Desde la raíz del monorepo:

```bash
pnpm install
pnpm build
```

`pnpm build` ejecuta `tauri build` en `apps/desktop`. Tauri compila el frontend (`tsc` y Vite), el binario de release y, porque `apps/desktop/src-tauri/tauri.conf.json` tiene el bundle activo con `"targets": "all"`, empaqueta la app de macOS.

La primera vez tarda: el perfil `release` usa LTO. Las siguientes reutilizan lo ya compilado.

`pnpm install-app` hace este mismo build y además copia el `.app` a `/Applications` y lo abre. No usa el `.dmg`. Si solo hace falta el disco, `pnpm build` basta.

## Dónde queda

Sin `CARGO_TARGET_DIR`:

- App: `apps/desktop/src-tauri/target/release/bundle/macos/GitHydra.app`
- Disco: `apps/desktop/src-tauri/target/release/bundle/dmg/`

Con `CARGO_TARGET_DIR` definido, el mismo árbol cuelga de ese directorio (`$CARGO_TARGET_DIR/release/bundle/...`). `scripts/install-macos.sh` ya mira las dos rutas.

El nombre del disco lo arma Tauri con el producto, la versión de `tauri.conf.json` y la arquitectura de esta Mac. En Apple Silicon, con la versión actual, es `GitHydra_0.13.0_aarch64.dmg`.

## Comprobar

```bash
ls -lh apps/desktop/src-tauri/target/release/bundle/dmg
```

Tiene que aparecer un `.dmg`. Abrirlo monta un volumen con `GitHydra.app`. Arrastrar esa app a Aplicaciones es la instalación desde el disco. En esta Mac también se puede abrir el `.app` del bundle directamente, o usar `pnpm install-app`.

## Otra Mac

El disco es solo `aarch64`. En un Mac Intel no abre.

Copia el `.dmg` de `apps/desktop/src-tauri/target/release/bundle/dmg/`. En la otra Mac, ábrelo y arrastra `GitHydra.app` a Aplicaciones. El primer arranque lo bloquea Gatekeeper: la firma del build es ad hoc, sin equipo de Apple y sin notarizar.

Clic derecho sobre `GitHydra.app` → **Abrir** → **Abrir**. Si sigue bloqueada: Ajustes del Sistema → Privacidad y seguridad → **Abrir de todas formas**.

Si el clic derecho no basta, en la Terminal de esa Mac:

```bash
xattr -dr com.apple.quarantine /Applications/GitHydra.app
open /Applications/GitHydra.app
```

`xattr` quita la marca de cuarentena que macOS pone al copiar el archivo. No firma la app.

## Qué no hace este build

- No firma el binario ni el disco.
- No lo sube a ningún sitio.
- No instala la app, salvo que se lance `pnpm install-app`.
