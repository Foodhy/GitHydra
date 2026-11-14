# Roadmap

Un paso es un cambio reviewable. No se empieza el siguiente hasta que el activo se prueba con `pnpm dev` y queda en `main`.

El paso activo es el **1**.

## Hecho — fase 0

Ya está en el primer commit:

- App Tauri + React. `pnpm dev` y `pnpm build`.
- Abrir carpeta, validar que es un repo y guardar recientes.
- Ramas locales y remotas, historial paginado y lista de lectura del árbol de trabajo.
- Huecos visibles para el grafo, el commit, la terminal y el editor. Esos controles no escriben en git.
- Contratos compartidos y servidor MCP que responde con la misma forma, sin leer el repositorio.
- `pnpm check`, CI de comprobación y empaquetado manual de macOS.

## Pasos

### 1. Diff de solo lectura

Al elegir un commit, el panel derecho muestra los archivos de ese commit y el parche. El formulario de commit sigue inactivo. Sirve para comprobar que la selección y `git2` conviven antes de dibujar el grafo.

### 2. Grafo

Columnas en SVG a partir de `parentShas`. Sin animación y sin interacciones distintas a las del paso 1.

### 3. Stage

Mover archivos entre "sin stage" y "en stage". Todavía sin crear el commit.

### 4. Commit

Resumen, descripción y el botón Confirmar. Sin enmendar, sin push.

### 5. Checkout

Clic en una rama local mueve `HEAD`. Sin crear ni borrar ramas.

### 6. Crear y borrar rama

Alta y baja de ramas locales. El borrado pide confirmación y no borra la rama actual.

### 7. Fetch, pull y push

Activar `https` y `ssh` en `git2`. Los botones de la barra dejan de ser decoración. Hace falta una credencial real para probarlo.

### 8. Clonar por URL

El botón de la pantalla inicial deja de estar deshabilitado.

### 9. Terminal con PTY

La terminal de abajo ejecuta un shell en la carpeta del repo.

### 10. Editor con el archivo del diff

El tab Editor abre el archivo seleccionado en el paso 1. Sigue en solo lectura.

### 11. MCP que lee git

Las tres herramientas dejan de devolver datos vacíos y leen la ruta (`path` o `GITHYDRA_REPO`). Siguen siendo un proceso aparte.

### 12. Puente con la ventana

El MCP ve el repositorio que está abierto en la app.

## Fuera de esta secuencia

Elegir el icono de la app entre `design/icons/candidates/`. Los candidatos no sustituyen el icono de Tauri hasta que haya una decisión. La firma de Apple para distribuir el `.app` tampoco entra en estos pasos.
