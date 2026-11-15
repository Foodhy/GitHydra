import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ACCENTS,
  readAppearance,
  saveAppearance,
  styleById,
  tokensFor,
  VISUAL_STYLES,
} from "../../lib/appearance";
import {
  type ExternalApps,
  readExternalApps,
  saveExternalApps,
} from "../../lib/external-apps";
import { AppThemePreview } from "./AppThemePreview";
import { McpAccess } from "./McpAccess";

export function SettingsPage() {
  const [styleId, setStyleId] = useState("hydra");
  const [accent, setAccent] = useState(VISUAL_STYLES[0].tokens.accent);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apps, setApps] = useState<ExternalApps>({
    editor: "Cursor",
    terminal: "Terminal",
  });
  const [appsSaved, setAppsSaved] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);
  const draft = styleById(styleId);
  const preview = tokensFor(styleId, accent);

  useEffect(() => {
    readAppearance()
      .then((appearance) => {
        setStyleId(appearance.style);
        setAccent(appearance.accent);
      })
      .catch(() => {
        setError("No se pudieron leer las preferencias.");
      });
    readExternalApps()
      .then(setApps)
      .catch(() => {
        setAppsError("No se pudieron leer las aplicaciones externas.");
      });
  }, []);

  async function saveApps() {
    setAppsError(null);
    setAppsSaved(false);
    try {
      await saveExternalApps(apps);
      setAppsSaved(true);
    } catch {
      setAppsError("No se pudieron guardar las aplicaciones externas.");
    }
  }

  async function apply() {
    setError(null);
    setSaved(false);
    try {
      await saveAppearance(styleId, accent);
      setSaved(true);
    } catch {
      setError("No se pudieron guardar las preferencias.");
    }
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-surface text-text lg:flex-row">
      <aside className="order-2 max-h-[46%] min-h-0 w-full shrink-0 overflow-auto border-t border-line px-5 py-5 lg:order-1 lg:max-h-none lg:w-80 lg:border-t-0 lg:border-r">
        <Link to="/" className="text-xs text-accent">
          Volver
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Preferencias</h1>
        <p className="mt-2 text-sm text-muted">
          Elige un estilo. La vista de al lado es la app entera, para ver cómo
          queda antes de usarlo.
        </p>
        {error ? <p className="mt-4 text-sm text-warn">{error}</p> : null}
        <section className="mt-6">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Estilos
          </h2>
          <div className="mt-3 grid gap-2">
            {VISUAL_STYLES.map((style) => {
              const swatch = style.id === styleId ? preview : style.tokens;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => {
                    setStyleId(style.id);
                    setAccent(style.tokens.accent);
                    setSaved(false);
                  }}
                  className={`rounded border px-3 py-2 text-left ${
                    style.id === styleId
                      ? "border-accent bg-surface-raised"
                      : "border-line hover:bg-surface-raised"
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{style.name}</span>
                    <span className="flex overflow-hidden rounded-full">
                      <span
                        className="h-3 w-3"
                        style={{ background: swatch.surfaceRaised }}
                      />
                      <span
                        className="h-3 w-3"
                        style={{ background: swatch.text }}
                      />
                      <span
                        className="h-3 w-3"
                        style={{ background: swatch.accent }}
                      />
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {style.detail}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="mt-6">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Acento
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {ACCENTS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Acento ${swatch}`}
                onClick={() => {
                  setAccent(swatch);
                  setSaved(false);
                }}
                className={`size-7 rounded-full border ${
                  accent.toLowerCase() === swatch
                    ? "border-text"
                    : "border-line"
                }`}
                style={{ background: swatch }}
              />
            ))}
            <label className="flex items-center gap-2 text-xs text-muted">
              Color
              <input
                type="color"
                value={toColorInput(accent)}
                onChange={(event) => {
                  setAccent(event.target.value);
                  setSaved(false);
                }}
                className="h-7 w-10 bg-transparent"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              void apply();
            }}
            className="mt-4 rounded bg-accent px-4 py-2 text-sm font-medium text-surface"
          >
            Usar este estilo
          </button>
          {saved ? (
            <p className="mt-2 text-xs text-muted">
              Guardado. La próxima apertura lo vuelve a leer.
            </p>
          ) : null}
        </section>
        <section className="mt-8">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Aplicaciones externas
          </h2>
          <p className="mt-2 text-sm text-muted">
            File usa estos nombres de app de macOS para el editor y la terminal.
          </p>
          {appsError ? (
            <p className="mt-3 text-sm text-warn">{appsError}</p>
          ) : null}
          <div className="mt-3 grid gap-3">
            <label className="text-xs text-muted">
              Editor
              <input
                value={apps.editor}
                onChange={(event) => {
                  setApps((current) => ({
                    ...current,
                    editor: event.target.value,
                  }));
                  setAppsSaved(false);
                }}
                className="mt-1 w-full rounded border border-line bg-surface-raised px-3 py-2 text-sm text-text"
              />
            </label>
            <label className="text-xs text-muted">
              Terminal
              <input
                value={apps.terminal}
                onChange={(event) => {
                  setApps((current) => ({
                    ...current,
                    terminal: event.target.value,
                  }));
                  setAppsSaved(false);
                }}
                className="mt-1 w-full rounded border border-line bg-surface-raised px-3 py-2 text-sm text-text"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              void saveApps();
            }}
            className="mt-4 rounded border border-line px-4 py-2 text-sm"
          >
            Guardar aplicaciones
          </button>
          {appsSaved ? (
            <p className="mt-2 text-xs text-muted">
              El menú File usará estos nombres.
            </p>
          ) : null}
        </section>
        <McpAccess />
      </aside>
      <section className="order-1 flex min-h-0 min-w-0 flex-1 flex-col px-4 pt-4 pb-3 lg:order-2">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Vista previa
          </h2>
          <p className="truncate text-xs text-muted">
            {draft.name} · app completa
          </p>
        </div>
        <div className="min-h-0 flex-1">
          <AppThemePreview style={draft} tokens={preview} />
        </div>
      </section>
    </main>
  );
}

function toColorInput(accent: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#3ee0b0";
}
