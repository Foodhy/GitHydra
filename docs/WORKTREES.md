# Worktrees

Desde 0.14.0 una copia es otra carpeta del mismo repositorio. Comparte commits, ramas, tags, remotos, config y hooks. Tiene sus propios archivos, su stage y su `HEAD`. La carpeta que ya tenías abierta no cambia de rama.

Una rama local solo puede estar checked out en una copia. Los archivos sin seguimiento se quedan donde estaban: `.env`, `node_modules` y builds no viajan. La copia nueva sale en el commit de la rama.

## Abrir una copia

Clic derecho en una rama local, o en un commit del historial, y **Abrir en otra carpeta**.

El diálogo trae:

- la rama, ya rellenada si vienes de una rama;
- **Crear rama nueva en este punto**, marcado al venir de un commit y desmarcado al venir de una rama local que ya existe;
- la carpeta hermana `{nombre-del-repo}-{rama}`. Una barra en el nombre de la rama pasa a guion en la carpeta (`feature/login` → `GitHydra-feature-login`).

Al confirmar, GitHydra crea la copia y la abre en una pestaña nueva. La terminal de esa pestaña arranca en la carpeta nueva. El aviso del diálogo es literal: `.env` y las dependencias no se copian, y el servidor de desarrollo de esa carpeta necesita otro puerto. GitHydra no elige el puerto ni copia esos archivos.

Una ruta dentro del árbol de trabajo se rechaza, porque `git status` la vería como archivos nuevos. Solo pasa si esa ruta está ignorada (por ejemplo `.claude/worktrees/…` cuando `.claude/` está en `.gitignore`).

## La lista Copias

Está al final del panel de ramas. Sale igual desde la carpeta principal y desde cualquier copia, porque lee el `commondir`.

Cada fila muestra la rama, o `HEAD` y siete caracteres del sha si está suelto, la ruta en corto y una frase. Un clic en la fila abre las acciones: **Abrir**, **Revelar**, **Desbloquear**, **Quitar**, y **Desbloquear y podar** cuando toca. **Abrir** deja la pestaña actual en su rama y abre la otra carpeta. **Revelar** la muestra en el Finder.

Arriba de la lista, **Podar ausentes** recorre las entradas cuya carpeta ya no existe y las suelta. No borra commits ni toca una carpeta que sigue en disco. Una entrada bloqueada no entra en esa poda.

Si dos carpetas terminan con el mismo nombre, la pestaña muestra `carpeta · rama`. Con `HEAD` suelto muestra la carpeta padre: `padre/carpeta`.

La rama local que está en otra copia lleva esa ruta en su propia fila. Checkout y borrar siguen ejecutándose y enseñan la frase, para ver el fallo y no solo la ruta.

## Qué hacer con cada frase

La ventana muestra la frase en el idioma elegido. El texto de origen, en inglés, es este:

| Frase                                                                                                            | Qué pasa                                                                        | Qué hacer                                                                         |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| This is the open folder.                                                                                         | Es la pestaña actual.                                                           | Nada. Sigue aquí.                                                                 |
| Main folder. It cannot be removed.                                                                               | Es el checkout original.                                                        | No tiene Quitar.                                                                  |
| Another folder of the same history.                                                                              | Copia sana, en su rama.                                                         | Abrir, revelar o quitar.                                                          |
| Detached HEAD at `abcdef1`.                                                                                      | No hay rama; a menudo la dejó un agente.                                        | Abrir para mirar. Al quitar, no hay rama que borrar.                              |
| `topic` is checked out at `/ruta/GitHydra-topic`                                                                 | Checkout o borrar de esa rama. Borrar con `-D` tampoco la suelta.               | Quitar la copia, o abrirla y cambiarla de rama. Después se puede borrar la rama.  |
| The folder is gone. The branch is still checked out. Prune frees it.                                             | Alguien hizo `rm -rf`. El registro sigue en `.git/worktrees`.                   | **Podar ausentes**. Luego la rama se puede borrar.                                |
| Locked: `agente`. Remove fails until you unlock.                                                                 | `git worktree lock` o un agente en marcha.                                      | Confirma que el agente terminó. **Desbloquear**, luego **Quitar**.                |
| Locked and the folder is gone. Prune skips it: unlock, then prune. If the disk is just unmounted, do not unlock. | El candado sobrevive a la carpeta borrada. También protege un disco desmontado. | Si el disco solo está fuera, déjala. Si el agente murió, **Desbloquear y podar**. |

Al quitar, la confirmación dice que la rama se queda. Si hay cambios sin commit, la segunda pregunta es «There are uncommitted changes in `/ruta`. Confirm again to remove it.» En español: «Hay cambios sin commit en `/ruta`. Confirma otra vez para quitarla.» Aceptarla borra esos cambios con la carpeta. La rama, si la había, sigue existiendo.

Checkout o borrado de una rama cuya copia está ausente dice: «`topic` is still checked out by a missing copy at `/ruta`. Prune it to free the branch.» Si además está bloqueada: «`topic` is still checked out by a locked copy whose folder is gone (`/ruta`). Unlock it, then prune.»

## Copias que deja un agente

Cursor y Claude crean copias para no pisar el checkout abierto. GitHydra no las crea por ellos y no las esconde. Si comparten el `commondir`, salen en la lista aunque la ruta sea `~/.cursor/worktrees/…` o `.claude/worktrees/…`, con nombre hash, `HEAD` suelto o una rama sintética, y a menudo `locked` mientras el agente corre.

Para entrar: **Abrir**. La copia no trae `.env` ni `node_modules`. Para cerrarla cuando el agente terminó: **Desbloquear** si la frase lo pide, **Quitar**, y borrar la rama si ya no la quieres. Si boraste la carpeta a mano, la fila queda ausente y **Podar ausentes** libera la rama. Si sigue bloqueada, la poda no hace nada: usa **Desbloquear y podar**.

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

El `.git` de la copia guarda una ruta absoluta. Mover o renombrar el repo principal deja las copias colgando. GitHydra no reescribe esas rutas.

Dos pestañas del mismo repositorio comparten un candado: el `commondir` canónico. Un commit en una y un alta de rama en la otra esperan el mismo turno. El watch de refs ya mira ese directorio común.

## MCP

`githydra_list_worktrees` devuelve la misma lista, con la misma frase en `situation`. No crea ni borra carpetas: un cliente externo que cree copias al lado del repo es justo el caso que la lista tiene que mostrar.

## Qué deja fuera

- Copiar `.env`, `node_modules` u otros archivos sin seguimiento.
- Elegir el puerto del dev server.
- Sparse checkout.
- Reparar el `gitdir` absoluto si el repo principal se mueve.
- Repositorios bare.
- Un worktree por submódulo.
