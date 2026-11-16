export function browserTabLabel(
  url: string | null,
  title: string | null,
): string {
  const name = title?.replace(/\s+/g, " ").trim() ?? "";
  if (!url) {
    return "Browser";
  }
  const place = pagePlace(url);
  if (!place) {
    return name ? `${name} · Browser` : "Browser";
  }
  if (place.local) {
    return name ? `${name} · ${place.label}` : place.label;
  }
  return name ? `${name} · Browser` : place.label;
}

function pagePlace(url: string): { local: boolean; label: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const name = local ? "localhost" : host.replace(/^www\./, "");
  if (!name) {
    return null;
  }
  return {
    local,
    label: parsed.port ? `${name}:${parsed.port}` : name,
  };
}
