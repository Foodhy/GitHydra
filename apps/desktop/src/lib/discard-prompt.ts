export function discardPrompt(path: string, kind: string): string {
  if (kind === "untracked" || kind === "added") {
    return `¿Descartar ${path}? No está en el último commit y se borra.`;
  }
  return `¿Descartar los cambios de ${path}? Vuelve a como estaba en el último commit.`;
}
