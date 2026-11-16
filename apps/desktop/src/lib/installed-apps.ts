export interface InstalledApp {
  name: string;
  path: string;
}

export interface InstalledApps {
  editors: InstalledApp[];
  terminals: InstalledApp[];
}

export interface AppChoice {
  value: string;
  label: string;
  missing: boolean;
}

export function selectedApp(stored: string, detected: InstalledApp[]): string {
  return matchApp(stored, detected)?.path ?? stored.trim();
}

export function appChoices(
  stored: string,
  detected: InstalledApp[],
  ready: boolean,
): AppChoice[] {
  const choices = detected.map((app) => ({
    value: app.path,
    label: app.name,
    missing: false,
  }));
  const value = stored.trim();
  if (!value || matchApp(value, detected)) {
    return choices;
  }
  const custom = appBundlePath(value) === value;
  return [
    {
      value,
      label: custom
        ? appStem(value)
        : ready
          ? `${value} (no está instalada)`
          : value,
      missing: ready && !custom,
    },
    ...choices,
  ];
}

export function appBundlePath(selected: string): string | null {
  const marker = ".app";
  const index = selected.indexOf(marker);
  if (index === -1) {
    return null;
  }
  return selected.slice(0, index + marker.length);
}

function matchApp(
  stored: string,
  detected: InstalledApp[],
): InstalledApp | undefined {
  const value = stored.trim();
  const lower = value.toLowerCase();
  return detected.find(
    (app) => app.path === value || app.name.toLowerCase() === lower,
  );
}

function appStem(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.endsWith(".app") ? base.slice(0, -4) : base;
}
