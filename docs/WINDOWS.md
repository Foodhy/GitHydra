# Compilar en Windows

Nota para cuando haga falta un build de Windows. Hoy la app se empaqueta y se documenta para macOS. No hay target de cargo, script de instalación ni CI para Windows. Hay que compilar en una máquina Windows: desde macOS no hay cruce configurado.

`pnpm install-app` no aplica. Ejecuta `scripts/install-macos.sh` y copia el `.app` a `/Applications`.

## Requisitos

Los del resto del repo, en esa máquina:

- Node.js 22+
- pnpm 11 (`packageManager` del repo es `pnpm@11.5.2`)
- Rust stable con el toolchain MSVC. Visual Studio Build Tools, carga de trabajo «Desktop development with C++». El canal está en `rust-toolchain.toml` (`stable`, con rustfmt y clippy).
- WebView2. En Windows 10 y 11 recientes ya viene instalado.
- CMake. Lo pide `git2` / libgit2 al compilar.
- Git en el `PATH`. La app lanza el binario `git`.

## Generar el instalador

Desde la raíz del monorepo, en Windows:

```bash
pnpm install
pnpm build
```

`pnpm build` ejecuta `tauri build` en `apps/desktop`. Tauri compila el frontend (`tsc` y Vite), el binario de release y, porque `apps/desktop/src-tauri/tauri.conf.json` tiene el bundle activo con `"targets": "all"`, empaqueta el instalador nativo de la plataforma. En Windows eso es NSIS y/o MSI, no un `.app` ni un `.dmg`.

La primera vez tarda: el perfil `release` usa LTO. Las siguientes reutilizan lo ya compilado.

Para la ventana de desarrollo, el mismo `pnpm dev` de macOS.

## Dónde queda

Sin `CARGO_TARGET_DIR`:

- Instalador: `apps/desktop/src-tauri/target/release/bundle/nsis/`
- MSI, si Tauri lo genera: `apps/desktop/src-tauri/target/release/bundle/msi/`

Con `CARGO_TARGET_DIR` definido, el mismo árbol cuelga de ese directorio.

## Qué puede fallar al compilar

`git2` en `apps/desktop/src-tauri/Cargo.toml` lleva las features `https` y `ssh`. En Windows, OpenSSL y libssh2 a menudo no enlazan solos. Si `pnpm build` se cae en `libgit2-sys`, `openssl-sys` o `libssh2-sys`, el arreglo es instalar esas bibliotecas (vcpkg u OpenSSL) o activar las features vendored. El frontend no es el punto frágil.

## Qué compila y luego no sirve

El Dock ya está detrás de `#[cfg(target_os = "macos")]` en `apps/desktop/src-tauri/src/dock.rs` y no rompe el build.

Dos piezas asumen macOS y en Windows quedan rotas o vacías:

- La terminal lee `SHELL` y, si no existe, abre `/bin/zsh` (`apps/desktop/src-tauri/src/pty.rs`). En Windows hace falta un shell de esa máquina (`COMSPEC`, `powershell.exe` o el que corresponda). `portable-pty` sí usa ConPTY.
- La lista de editores y terminales solo recorre `/Applications` y `/System/Applications` buscando carpetas `.app` (`apps/desktop/src-tauri/src/apps.rs`). En Windows esa lista sale vacía.
