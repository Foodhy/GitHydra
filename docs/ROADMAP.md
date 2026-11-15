# Roadmap

Un paso es un cambio reviewable. No se empieza el siguiente hasta que el activo se prueba con `pnpm dev` y queda en `main`.

El paso activo es el **7**. Cada paso que llega a `main` sube la versión que muestra la ventana. Ahora es `0.5.0`.

## Hecho — fase 0

Ya está en el primer commit:

- [x] App Tauri + React. `pnpm dev` y `pnpm build`.
- [x] Abrir carpeta, validar que es un repo y guardar recientes.
- [x] Ramas locales y remotas, historial paginado y lista de lectura del árbol de trabajo.
- [x] Huecos visibles para el commit, la terminal y el editor. El grafo ya se dibuja (paso 2). Esos controles no escriben en git.
- [x] Contratos compartidos y servidor MCP que responde con la misma forma, sin leer el repositorio.
- [x] `pnpm check`, CI de comprobación y empaquetado manual de macOS.

## Pasos

### 1. Diff de solo lectura — hecho en 0.2.0

- [x] Al elegir un commit, el panel derecho muestra los archivos de ese commit y el parche. El formulario de commit sigue inactivo.

### 2. Grafo — hecho en 0.3.0

- [x] Columnas en SVG a partir de `parentShas`, alineadas con las filas del historial. El clic sigue abriendo el diff.

### 3. Stage — hecho en 0.4.0

- [x] Clic en un archivo, o en Todos, lo mueve entre "sin stage" y "en stage". El formulario de commit sigue inactivo.

### 4. Commit — hecho en 0.5.0

- [x] Resumen, descripción y el botón Confirmar. Sin enmendar, sin push.

### 5. Checkout — hecho en 0.5.0

- [x] Clic en una rama local mueve `HEAD`. Sin crear ni borrar ramas.

### 6. Crear y borrar rama — hecho en 0.5.0

- [x] Alta y baja de ramas locales. El borrado pide confirmación y no borra la rama actual.

### 7. Fetch, pull y push

- [ ] Activar `https` y `ssh` en `git2`. Los botones de la barra dejan de ser decoración. Hace falta una credencial real para probarlo.

### 8. Clonar por URL

- [ ] El botón de la pantalla inicial deja de estar deshabilitado.

### 9. Terminal con PTY

- [ ] La terminal de abajo ejecuta un shell en la carpeta del repo.

### 10. Editor con el archivo del diff

- [ ] El tab Editor abre el archivo seleccionado en el paso 1. Sigue en solo lectura.

### 11. MCP que lee git

- [ ] Las tres herramientas dejan de devolver datos vacíos y leen la ruta (`path` o `GITHYDRA_REPO`). Siguen siendo un proceso aparte.

### 12. Puente con la ventana

- [ ] El MCP ve el repositorio que está abierto en la app.

## StealThis

La librería no tiene un grafo de git. Estas piezas sirven en pasos posteriores, sin copiar landings, shaders ni cursores:

- `effect-skeleton-load` cuando el historial o el diff están cargando.
- `infinite-scroll` para “Cargar más” sin un botón.
- `copy-to-clipboard` en el sha corto.
- `virtual-list` si el historial se vuelve largo.
- `effect-nav-underline` en las pestañas Historial / Editor.

## Fuera de esta secuencia

Elegir el icono de la app entre `design/icons/candidates/`. Los candidatos no sustituyen el icono de Tauri hasta que haya una decisión. La firma de Apple para distribuir el `.app` tampoco entra en estos pasos.
