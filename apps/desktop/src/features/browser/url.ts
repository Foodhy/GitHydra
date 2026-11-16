const SCHEME = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const HOST_PORT = /^(?:\[[^\]]+\]|[^[\]:/]+):\d+(?:[/?#].*)?$/;

function isLocal(value: string): boolean {
  const host = value.startsWith("[")
    ? value.slice(1, value.indexOf("]"))
    : (value.split(/[/:]/)[0] ?? "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return null;
      }
      return trimmed;
    } catch {
      return null;
    }
  }
  if (SCHEME.test(trimmed) && !HOST_PORT.test(trimmed)) {
    return null;
  }
  const next = `${isLocal(trimmed) ? "http" : "https"}://${trimmed}`;
  try {
    const url = new URL(next);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return next;
  } catch {
    return null;
  }
}
