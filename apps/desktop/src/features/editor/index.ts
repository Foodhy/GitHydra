export const INDEX_SEARCH_LIMIT = 80;

export function filterIndexedFiles(
  files: readonly string[],
  query: string,
): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const found: string[] = [];
  for (const file of files) {
    if (file.toLowerCase().includes(needle)) {
      found.push(file);
      if (found.length === INDEX_SEARCH_LIMIT) {
        break;
      }
    }
  }
  return found;
}
