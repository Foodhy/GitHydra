# Worktrees

Idea para una iteración futura. No hay comandos, contratos ni UI. En el roadmap sigue siendo el ítem pendiente «Worktree».

La acción que esa iteración tiene que ofrecer: abrir una rama en otra carpeta y dejar el checkout actual donde está. Las dos carpetas comparten commits, ramas y remotos. Cada una tiene sus archivos, su stage y su `HEAD`.

## Qué hay hoy

Abrir la carpeta de un worktree ya funciona por accidente. `Repository::discover` sigue el archivo `.git` de la copia y `open_repository` devuelve el `workdir`. Una pestaña por ruta basta para tener las dos abiertas. Se ven como dos repositorios distintos, con el mismo nombre de carpeta, sin decir que comparten historia.

`watch_roots` ya separa el gitdir privado del `commondir` cuando no son la misma ruta, así que los refs compartidos se observan.

El candado de `with_repo` usa la ruta de la carpeta. Dos pestañas de dos worktrees del mismo repo no comparten candado y pueden escribir ramas y objetos a la vez. El candado de esta iteración es el directorio común, canónico.

`worktree_kind` en `apps/desktop/src-tauri/src/git/mod.rs` no es este concepto. Clasifica cambios sin stage (`WT_MODIFIED`, `WT_NEW`). El nombre nuevo en contratos tiene que ser otro, por ejemplo `LinkedWorktree`, para no mezclarlos.

Checkout y borrado de rama solo miran el `HEAD` de la carpeta abierta. Si la rama está ocupada en otra copia, el fallo llega como texto crudo de git.

## En disco

```text
GitHydra/                         checkout principal, rama main
  .git/                           objetos, ramas, config, hooks
    worktrees/
      GitHydra-prueba/
        HEAD                      rama de esa copia
        index
        commondir                 ../../
        gitdir                    ruta absoluta de la carpeta
        locked                    solo si alguien lo bloqueó

../GitHydra-prueba/               otra rama, otros archivos
  .git                            un archivo: gitdir: …/GitHydra/.git/worktrees/GitHydra-prueba
```

Cada copia guarda sus archivos, su index, su `HEAD` y un merge a medias. Comparten objetos, ramas, tags, remotos, config y hooks.

Una rama local solo puede estar checked out en una copia. Los archivos sin seguimiento se quedan en la carpeta de origen: `.env`, `node_modules` y builds no viajan. La copia nueva sale en el commit de la rama.

El archivo `.git` de la copia guarda una ruta absoluta. Mover el repo principal deja las copias colgando. Reparar eso queda fuera de esta iteración.

Crear la copia dentro del propio árbol de trabajo hace que `git status` la vea como archivos nuevos. El destino por defecto es una carpeta hermana, `{nombre-del-repo}-{rama}`.

## Qué se vería

En el menú de una rama o de un commit, junto a checkout y «crear rama»: **Abrir en otra carpeta**.

El diálogo pide:

- rama existente, o nombre de una rama nueva en ese commit;
- carpeta destino, con la hermana ya rellenada.

Al confirmar, GitHydra crea el worktree y abre esa ruta en una pestaña nueva. La pestaña actual no cambia de rama. La terminal de la pestaña nueva arranca en la carpeta nueva. El servidor de la app, si se lanza ahí, usa otro puerto: esta iteración no elige el puerto ni copia `.env`.

Una lista, en el mismo sitio que las ramas, muestra las copias de ese `commondir`:

| Dato | Para qué |
| --- | --- |
| ruta | abrir la pestaña o revelar la carpeta |
| rama, o sha corto si `HEAD` está suelto | distinguirla del checkout actual |
| bloqueada | un agente o `git worktree lock` impide borrarla |
| carpeta ausente | la entrada sigue en `.git/worktrees` y la rama sigue ocupada |

Acciones de cada fila: abrir, revelar, desbloquear, quitar. Quitar pide confirmación. Con cambios sin commit, la confirmación lo dice y hace falta una segunda aceptación (`force`). «Podar ausentes» recorre las que ya no tienen carpeta y libera la rama. Equivale a `git worktree prune`.

Si dos carpetas tienen el mismo nombre, la pestaña muestra la rama o la carpeta padre. El nombre de hoy sale del último tramo de la ruta (`tabName` en `repo-tabs.ts`) y por eso dos copias se confunden.

Checkout y borrado, cuando la rama está en otra copia, dicen la ruta: «`prueba` está abierta en `/ruta/GitHydra-prueba`». Borrar esa rama sigue prohibido hasta quitar el worktree.

## Contrato

Propuesta. No está en `packages/contracts`.

```ts
export interface LinkedWorktree {
  path: string;
  branch: string | null;
  headSha: string;
  isDetached: boolean;
  locked: boolean;
  missing: boolean;
  isMain: boolean;
}

export interface AddWorktreeRequest {
  directory: string;
  branch: string;
  sha: string | null;
  createBranch: boolean;
}
```

En `GitPort`:

- `listWorktrees(path)`
- `addWorktree(path, request)` devuelve el `RepositoryInfo` de la carpeta nueva, para abrir la pestaña con lo que ya existe
- `removeWorktree(path, worktreePath, force)`
- `unlockWorktree(path, worktreePath)`
- `pruneWorktrees(path)`

`path` es cualquier copia del repo. La lista sale del directorio común, así que se ve igual desde la carpeta principal y desde una copia.

La implementación va en `apps/desktop/src-tauri/src/git/mod.rs`, con la API de worktree de `git2`. El proceso `git` solo se usa hoy para `credential fill`; esta iteración no añade otro camino por CLI salvo que `git2` no pueda expresar bloqueo, poda o «carpeta ausente».

El MCP, si entra en la misma iteración, expone listar y abrir. Crear y borrar quedan en la ventana: un cliente externo que cree carpetas al lado del repo es justo el caso que esta lista tiene que hacer visible, y conviene no automatizarlo todavía.

## Candado

`with_repo` pasa a tomar la clave del `commondir` canónico, no de la carpeta de trabajo. Commit, fetch, alta de rama y alta de worktree de dos pestañas del mismo repo esperan el mismo mutex. El watch de `watch_roots` ya cubre los dos directorios; no hace falta un tercer watcher.

## Copias para probar

La pestaña es la instancia. No hace falta un segundo proceso de GitHydra.

Una carpeta se queda en `main`. Otra, en una rama de prueba, con su install y su `pnpm dev` en otro puerto. Se pueden tener las dos pestañas abiertas y comparar. Cada copia usa una rama distinta. Para dos variantes del mismo commit, una es una rama nueva en ese punto (`createBranch: true`).

Al crear, la UI avisa de que `.env` y las dependencias no se copian y de que el dev server de esa carpeta necesita otro puerto.

## Copias que deja un agente

Cursor y otros agentes crean worktrees para editar sin pisar el checkout abierto. GitHydra no los crea y no los esconde. Si comparten el `commondir`, salen en la lista. Hay que tolerar lo que suelen traer:

- ruta fuera del proyecto, a menudo con un nombre hash;
- `HEAD` suelto o una rama sintética;
- `locked`, así que Quitar falla hasta Desbloquear;
- árbol sin `node_modules` ni `.env`;
- la rama del usuario ocupada, y por eso el checkout en la carpeta principal falla.

Esas cuatro señales (ruta, rama o sha, bloqueo, carpeta ausente) son las columnas de la lista. Con eso se puede entrar, probar y quitar la copia cuando el agente terminó.

Si alguien borra la carpeta a mano, la fila queda como ausente y «Podar ausentes» libera la rama.

## Fuera de esta iteración

- Copiar `.env`, `node_modules` u otros archivos sin seguimiento.
- Elegir el puerto del dev server.
- Sparse checkout.
- Reescribir las rutas absolutas de `gitdir` si el repo principal se mueve.
- Repos bare.
- Un worktree por submódulo.

## Cómo probar la idea a mano

Desde el repo, con la copia fuera del árbol:

```bash
git worktree add ../GitHydra-prueba -b prueba
git worktree list --porcelain
git worktree remove ../GitHydra-prueba
git branch -d prueba
```

`list --porcelain` es la forma que la lista de la app tiene que igualar: un bloque por copia, con ruta, `HEAD`, `branch` o `detached`, y `locked` si existe.

## Pruebas de esa iteración

- Alta de una hermana, lista, pestaña nueva, quitar, y la rama nueva se puede borrar.
- Checkout de una rama ocupada devuelve el mensaje con la ruta de la otra carpeta.
- Borrar esa rama falla con el mismo mensaje.
- Borrar la carpeta en disco y podar deja la rama libre.
- Una copia bloqueada no se quita hasta desbloquearla.
- Quitar con cambios sin commit exige la confirmación extra.
- Dos pestañas del mismo `commondir` serializan un commit y un alta de rama.
- Dos carpetas con el mismo nombre de tramo final se distinguen en la pestaña.
- El destino dentro del propio árbol de trabajo se rechaza, o solo se acepta si esa ruta está ignorada.
