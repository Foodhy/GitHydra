import { load } from "@tauri-apps/plugin-store";

export interface AppearanceTokens {
  surface: string;
  surfaceRaised: string;
  surfaceOverlay: string;
  line: string;
  text: string;
  muted: string;
  accent: string;
  accentDim: string;
  graphEdge: string;
  warn: string;
}

export interface VisualStyle {
  id: string;
  name: string;
  detail: string;
  radius: string;
  tokens: AppearanceTokens;
}

export const ACCENTS = ["#3ee0b0", "#5b8cff", "#e2b15a", "#e06b8a", "#b388ff"];

export const VISUAL_STYLES: VisualStyle[] = [
  {
    id: "hydra",
    name: "Hydra",
    detail: "El estilo actual.",
    radius: "4px",
    tokens: {
      surface: "#12141a",
      surfaceRaised: "#1b1e27",
      surfaceOverlay: "#232733",
      line: "#2e3442",
      text: "#e7e9ef",
      muted: "#8d95a8",
      accent: "#3ee0b0",
      accentDim: "#163f36",
      graphEdge: "#4c9aff",
      warn: "#e6b35a",
    },
  },
  {
    id: "moderno",
    name: "Moderno",
    detail: "Superficies separadas y botones redondos.",
    radius: "12px",
    tokens: {
      surface: "#0e1116",
      surfaceRaised: "#181c25",
      surfaceOverlay: "#222836",
      line: "#31384a",
      text: "#f4f6fb",
      muted: "#9aa3b5",
      accent: "#5b8cff",
      accentDim: "#1a2744",
      graphEdge: "#7aa2ff",
      warn: "#f0b45a",
    },
  },
  {
    id: "fino",
    name: "Fino",
    detail: "Bordes cortos y tipo cerrado.",
    radius: "2px",
    tokens: {
      surface: "#161616",
      surfaceRaised: "#1c1c1c",
      surfaceOverlay: "#242424",
      line: "#2c2c2c",
      text: "#ececec",
      muted: "#8a8a8a",
      accent: "#d6d6d6",
      accentDim: "#2a2a2a",
      graphEdge: "#9a9a9a",
      warn: "#c4a574",
    },
  },
  {
    id: "ultra",
    name: "Ultramínimo",
    detail: "Casi sin cromo.",
    radius: "0px",
    tokens: {
      surface: "#000000",
      surfaceRaised: "#000000",
      surfaceOverlay: "#111111",
      line: "#1c1c1c",
      text: "#f5f5f5",
      muted: "#777777",
      accent: "#ffffff",
      accentDim: "#1a1a1a",
      graphEdge: "#555555",
      warn: "#aaaaaa",
    },
  },
  {
    id: "papel",
    name: "Papel",
    detail: "Claro, con tinta oscura.",
    radius: "8px",
    tokens: {
      surface: "#f7f5f0",
      surfaceRaised: "#fffdf8",
      surfaceOverlay: "#efece4",
      line: "#e2ddd2",
      text: "#1c1b19",
      muted: "#6f6a62",
      accent: "#0f6e56",
      accentDim: "#d7efe6",
      graphEdge: "#3d6f9a",
      warn: "#9a5b12",
    },
  },
  {
    id: "tinta",
    name: "Tinta",
    detail: "Azul oscuro y acento cálido.",
    radius: "6px",
    tokens: {
      surface: "#0b1220",
      surfaceRaised: "#121a2b",
      surfaceOverlay: "#1a2438",
      line: "#2a3650",
      text: "#e7eefc",
      muted: "#93a0bd",
      accent: "#e2b15a",
      accentDim: "#3a2e16",
      graphEdge: "#6ea8ff",
      warn: "#e07a5f",
    },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    detail: "Magenta, cian y rejilla.",
    radius: "2px",
    tokens: {
      surface: "#0a0614",
      surfaceRaised: "#140a22",
      surfaceOverlay: "#1c1030",
      line: "#3a2158",
      text: "#f6e9ff",
      muted: "#b59ac8",
      accent: "#ff2bd6",
      accentDim: "#4a123c",
      graphEdge: "#22e0ff",
      warn: "#f5e642",
    },
  },
  {
    id: "hacker",
    name: "Hacker",
    detail: "Negro, verde y mono.",
    radius: "0px",
    tokens: {
      surface: "#050805",
      surfaceRaised: "#0c140c",
      surfaceOverlay: "#122012",
      line: "#1d3a1d",
      text: "#d6ffd2",
      muted: "#5d8a5d",
      accent: "#39ff14",
      accentDim: "#0e2c0a",
      graphEdge: "#7dff63",
      warn: "#d6ff4a",
    },
  },
  {
    id: "linux",
    name: "Linux",
    detail: "Berenjena y naranja.",
    radius: "10px",
    tokens: {
      surface: "#1a0f16",
      surfaceRaised: "#2a1422",
      surfaceOverlay: "#3a1c2e",
      line: "#5a3048",
      text: "#f7f1f4",
      muted: "#c4a3b4",
      accent: "#e95420",
      accentDim: "#4a2416",
      graphEdge: "#f6a07a",
      warn: "#f0c14a",
    },
  },
  {
    id: "anthropic",
    name: "Anthropic",
    detail: "Crema, coral y serif.",
    radius: "16px",
    tokens: {
      surface: "#f5f0e8",
      surfaceRaised: "#faf7f2",
      surfaceOverlay: "#efe8dc",
      line: "#e6dfd4",
      text: "#1f1a17",
      muted: "#7a6e64",
      accent: "#d97757",
      accentDim: "#f3ddd4",
      graphEdge: "#c4553a",
      warn: "#b45309",
    },
  },
  {
    id: "openai",
    name: "OpenAI",
    detail: "Negro, verde y superficies limpias.",
    radius: "18px",
    tokens: {
      surface: "#0d0d0d",
      surfaceRaised: "#171717",
      surfaceOverlay: "#212121",
      line: "#2e2e2e",
      text: "#ececec",
      muted: "#a3a3a3",
      accent: "#10a37f",
      accentDim: "#12382e",
      graphEdge: "#3ecf8e",
      warn: "#f5c16c",
    },
  },
  {
    id: "xspace",
    name: "X Space",
    detail: "Negro, blanco frío y velo.",
    radius: "0px",
    tokens: {
      surface: "#000000",
      surfaceRaised: "#0a0a0a",
      surfaceOverlay: "#141414",
      line: "#2a2a2a",
      text: "#f5f7fa",
      muted: "#9aa3b2",
      accent: "#d7e3f4",
      accentDim: "#1c2430",
      graphEdge: "#7eb6ff",
      warn: "#f0d48a",
    },
  },
  {
    id: "pokemon",
    name: "Pokémon",
    detail: "Claro, con rojo, azul y amarillo.",
    radius: "20px",
    tokens: {
      surface: "#f4f7ff",
      surfaceRaised: "#ffffff",
      surfaceOverlay: "#e7edff",
      line: "#d5def5",
      text: "#1a1a2e",
      muted: "#5c6478",
      accent: "#ee1515",
      accentDim: "#ffd6d6",
      graphEdge: "#3b4cca",
      warn: "#c9a000",
    },
  },
];

const FILE = "appearance.json";

export interface SavedAppearance {
  style: string;
  accent: string;
}

export function styleById(id: string): VisualStyle {
  return VISUAL_STYLES.find((style) => style.id === id) ?? VISUAL_STYLES[0];
}

export function dimAccent(hex: string): string {
  const normalized = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return "#163f36";
  }
  const mix = (channel: number) => Math.round(channel * 0.22);
  const red = mix(Number.parseInt(normalized.slice(0, 2), 16));
  const green = mix(Number.parseInt(normalized.slice(2, 4), 16));
  const blue = mix(Number.parseInt(normalized.slice(4, 6), 16));
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function tokensFor(styleId: string, accent: string): AppearanceTokens {
  const style = styleById(styleId);
  return {
    ...style.tokens,
    accent,
    accentDim: dimAccent(accent),
  };
}

export function applyAppearance(styleId: string, accent: string): void {
  const style = styleById(styleId);
  const tokens = tokensFor(style.id, accent);
  const root = document.documentElement;
  root.dataset.style = style.id;
  root.style.setProperty("--radius-ui", style.radius);
  root.style.setProperty("--color-surface", tokens.surface);
  root.style.setProperty("--color-surface-raised", tokens.surfaceRaised);
  root.style.setProperty("--color-surface-overlay", tokens.surfaceOverlay);
  root.style.setProperty("--color-line", tokens.line);
  root.style.setProperty("--color-text", tokens.text);
  root.style.setProperty("--color-muted", tokens.muted);
  root.style.setProperty("--color-accent", tokens.accent);
  root.style.setProperty("--color-accent-dim", tokens.accentDim);
  root.style.setProperty("--color-graph-edge", tokens.graphEdge);
  root.style.setProperty("--color-warn", tokens.warn);
}

export async function readAppearance(): Promise<SavedAppearance> {
  const fallback = {
    style: "hydra",
    accent: VISUAL_STYLES[0].tokens.accent,
  };
  try {
    const store = await load(FILE, { autoSave: false, defaults: {} });
    const saved = await store.get<SavedAppearance>("appearance");
    if (
      !saved ||
      typeof saved.style !== "string" ||
      typeof saved.accent !== "string"
    ) {
      return fallback;
    }
    return { style: styleById(saved.style).id, accent: saved.accent };
  } catch {
    return fallback;
  }
}

export async function saveAppearance(
  styleId: string,
  accent: string,
): Promise<void> {
  const appearance: SavedAppearance = {
    style: styleById(styleId).id,
    accent,
  };
  const store = await load(FILE, { autoSave: false, defaults: {} });
  await store.set("appearance", appearance);
  await store.save();
  applyAppearance(appearance.style, appearance.accent);
}
