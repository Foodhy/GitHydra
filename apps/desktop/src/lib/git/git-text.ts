import type { Locale } from "../i18n";

const exact: Record<string, string> = {
  Cancelled: "Cancelado",
  "The commit summary is empty": "El resumen del commit está vacío",
  "Nothing is staged": "No hay cambios en stage",
  "The commit author is not valid": "El autor del commit no es válido",
  "Missing user.name or user.email in the git config":
    "Falta user.name o user.email en la configuración de git",
  "Cannot delete the current branch": "No se puede borrar la rama actual",
  "No commits to create the branch": "No hay commits para crear la rama",
  "The branch has no upstream": "La rama no tiene upstream",
  "Write the upstream as origin/branch":
    "El upstream se escribe como origen/rama",
  "The URL is empty": "La URL está vacía",
  "The destination folder does not exist": "La carpeta de destino no existe",
  "The folder does not exist": "La carpeta no existe",
  "The cloned path is not UTF-8": "La ruta clonada no es UTF-8",
  "No commits": "No hay commits",
  "HEAD is not on a branch": "HEAD no está en una rama",
  "The repository has no working directory":
    "El repositorio no tiene directorio de trabajo",
  "The path must stay inside the repository":
    "La ruta tiene que quedar dentro del repositorio",
  "Missing file path": "Falta la ruta del archivo",
  "The diff delta does not exist": "El delta del diff no existe",
  "The agent returned no message.": "El agente no devolvió un mensaje.",
  "Nothing is staged. Stage files before generating a message.":
    "No hay cambios en stage. Pasa archivos a stage antes de generar el mensaje.",
  "Invalid branch name": "Nombre de rama inválido",
  "Missing destination folder": "Falta la carpeta de destino",
  "The main folder cannot be removed.": "La carpeta principal no se quita.",
  "It is locked. Unlock it before removing.":
    "Está bloqueada. Desbloquéala antes de quitarla.",
  "The folder is gone. Prune it to free the branch.":
    "La carpeta ya no está. Pódala para liberar la rama.",
  "The destination is inside the working tree. Choose a sibling folder, or an ignored path.":
    "El destino está dentro del árbol de trabajo. Elige una carpeta hermana, o una ruta ignorada.",
  "Could not read the repository name":
    "No se pudo leer el nombre del repositorio",
  "This is the open folder.": "Esta es la carpeta abierta.",
  "Locked and the folder is gone. Prune skips it: unlock, then prune. If the disk is just unmounted, do not unlock.":
    "Bloqueada y la carpeta no está. Podar no la toca: desbloquea y luego poda. Si el disco no está montado, no la desbloquees.",
  "Locked. Remove fails until you unlock.":
    "Bloqueada. Quitar falla hasta desbloquear.",
  "The folder is gone. The branch is still checked out. Prune frees it.":
    "La carpeta ya no está. La rama sigue ocupada. Podar la libera.",
  "Main folder. It cannot be removed.": "Carpeta principal. No se quita.",
  "Another folder of the same history.": "Otra carpeta de la misma historia.",
  "A merge is required. This version only moves forward on a fast-forward.":
    "Hace falta un merge. Esta versión solo avanza si es fast-forward.",
  "No credential. Check the SSH agent or git credential.":
    "No hay credencial. Revisa el agente SSH o git credential.",
  "No credential": "No hay credencial",
  "git credential did not respond": "git credential no respondió",
  "This file cannot be shown.": "No se puede mostrar este archivo.",
  "Binary file, no text view.": "Archivo binario, sin vista de texto.",
  "The file is over 1 MB and is not shown.":
    "El archivo supera 1 MB y no se muestra.",
  "Binary file, no text patch.": "Archivo binario, sin parche de texto.",
  "Patch truncated.": "Parche truncado.",
  "Files with no text patch:": "Archivos sin parche de texto:",
};

const templates: Array<{
  pattern: RegExp;
  es: (match: RegExpMatchArray) => string;
}> = [
  {
    pattern: /^No local branch: (.+)$/,
    es: (match) => `No existe la rama local: ${match[1]}`,
  },
  {
    pattern: /^The branch has no name: (.+)$/,
    es: (match) => `La rama no tiene nombre: ${match[1]}`,
  },
  {
    pattern: /^Invalid branch name: (.+)$/,
    es: (match) => `Nombre de rama inválido: ${match[1]}`,
  },
  {
    pattern: /^Branch (.+) already exists$/,
    es: (match) => `Ya existe la rama ${match[1]}`,
  },
  {
    pattern: /^No remote (.+)$/,
    es: (match) => `No existe el remoto ${match[1]}`,
  },
  {
    pattern: /^The path does not exist: (.+)$/,
    es: (match) => `La ruta no existe: ${match[1]}`,
  },
  {
    pattern: /^Resolve the conflict before staging: (.+)$/,
    es: (match) => `Resuelve el conflicto antes de stage: ${match[1]}`,
  },
  {
    pattern: /^The folder already exists and is not empty: (.+)$/,
    es: (match) => `La carpeta ya existe y no está vacía: ${match[1]}`,
  },
  {
    pattern: /^The destination folder already exists: (.+)$/,
    es: (match) => `La carpeta de destino ya existe: ${match[1]}`,
  },
  {
    pattern:
      /^There are uncommitted changes in (.+)\. Confirm again to remove it\.$/,
    es: (match) =>
      `Hay cambios sin commit en ${match[1]}. Confirma otra vez para quitarla.`,
  },
  {
    pattern:
      /^(.+) is still checked out by a locked copy whose folder is gone \((.+)\)\. Unlock it, then prune\.$/,
    es: (match) =>
      `${match[1]} sigue ocupada por una copia bloqueada cuya carpeta no está (${match[2]}). Desbloquéala y luego pódala.`,
  },
  {
    pattern:
      /^(.+) is still checked out by a missing copy at (.+)\. Prune it to free the branch\.$/,
    es: (match) =>
      `${match[1]} sigue ocupada por una copia ausente en ${match[2]}. Pódala para liberarla.`,
  },
  {
    pattern: /^(.+) is checked out at (.+)$/,
    es: (match) => `${match[1]} está abierta en ${match[2]}`,
  },
  {
    pattern: /^Locked: (.+)\. Remove fails until you unlock\.$/,
    es: (match) => `Bloqueada: ${match[1]}. Quitar falla hasta desbloquear.`,
  },
  {
    pattern: /^Detached HEAD at (.+)\.$/,
    es: (match) => `HEAD suelto en ${match[1]}.`,
  },
  {
    pattern: /^Not in the copy list: (.+)$/,
    es: (match) => `No está en la lista de copias: ${match[1]}`,
  },
  {
    pattern: /^Could not remove the folder (.+)$/,
    es: (match) => `No se pudo quitar la carpeta ${match[1]}`,
  },
  {
    pattern: /^The commit has no (.+)$/,
    es: (match) => `El commit no tiene ${match[1]}`,
  },
  {
    pattern: /^That file is not in the working tree: (.+)$/,
    es: (match) => `Ese archivo no está en el árbol de trabajo: ${match[1]}`,
  },
  {
    pattern: /^Invalid tag name: (.+)$/,
    es: (match) => `Nombre de tag inválido: ${match[1]}`,
  },
];

export function translateGitMessage(message: string, language: Locale): string {
  if (language !== "es") {
    return message;
  }
  const known = exact[message];
  if (known) {
    return known;
  }
  for (const template of templates) {
    const match = template.pattern.exec(message);
    if (match) {
      return template.es(match);
    }
  }
  return message;
}
