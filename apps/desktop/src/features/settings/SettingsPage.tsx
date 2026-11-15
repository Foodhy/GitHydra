import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ACCENTS,
  type AppearanceTokens,
  readAppearance,
  saveAppearance,
  styleById,
  tokensFor,
  VISUAL_STYLES,
  type VisualStyle,
} from "../../lib/appearance";
import { McpAccess } from "./McpAccess";

export function SettingsPage() {
  const [styleId, setStyleId] = useState("hydra");
  const [accent, setAccent] = useState(VISUAL_STYLES[0].tokens.accent);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  }, []);

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
    <main className="h-full overflow-auto bg-surface px-6 py-8 text-text">
      <div className="mx-auto w-full max-w-5xl">
        <Link to="/" className="text-xs text-accent">
          Volver
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">Preferencias</h1>
        <p className="mt-2 text-sm text-muted">
          Elige un estilo y un acento. La vista grande muestra cómo queda antes
          de usarlo.
        </p>
        {error ? <p className="mt-4 text-sm text-warn">{error}</p> : null}
        <section className="mt-8">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Estilos
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {VISUAL_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => {
                  setStyleId(style.id);
                  setAccent(style.tokens.accent);
                  setSaved(false);
                }}
                className={`rounded border p-3 text-left ${
                  style.id === styleId
                    ? "border-accent"
                    : "border-line hover:bg-surface-raised"
                }`}
              >
                <StylePreview style={style} tokens={style.tokens} compact />
                <p className="mt-2 text-sm font-medium">{style.name}</p>
                <p className="text-xs text-muted">{style.detail}</p>
              </button>
            ))}
          </div>
        </section>
        <section className="mt-8">
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
        </section>
        <section className="mt-8">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Vista previa
          </h2>
          <div className="mt-3">
            <StylePreview style={draft} tokens={preview} />
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
        <McpAccess />
      </div>
    </main>
  );
}

function StylePreview({
  style,
  tokens,
  compact = false,
}: {
  style: VisualStyle;
  tokens: AppearanceTokens;
  compact?: boolean;
}) {
  return (
    <div
      className="overflow-hidden border text-left"
      style={{
        background: tokens.surface,
        color: tokens.text,
        borderColor: tokens.line,
        borderRadius: style.radius,
        fontSize: compact ? 10 : 12,
      }}
    >
      <div
        className="flex items-center justify-between px-2 py-1"
        style={{
          background: tokens.surfaceRaised,
          borderBottom: `1px solid ${tokens.line}`,
        }}
      >
        <span>GitHydra</span>
        <span style={{ color: tokens.muted }}>main</span>
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: compact ? "1fr" : "1.2fr 0.8fr" }}
      >
        <div
          className="px-2 py-1"
          style={{ borderRight: `1px solid ${tokens.line}` }}
        >
          <div className="flex items-center gap-1">
            <span
              className="inline-block size-1.5 rounded-full"
              style={{ background: tokens.graphEdge }}
            />
            <span className="truncate">Anota el cambio</span>
          </div>
        </div>
        {compact ? null : (
          <div className="px-2 py-1">
            <p style={{ color: tokens.muted }}>En stage</p>
            <p>notes.txt</p>
            <span
              className="mt-1 inline-block px-2 py-0.5"
              style={{
                background: tokens.accent,
                color: tokens.surface,
                borderRadius: style.radius,
              }}
            >
              Confirmar
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function toColorInput(accent: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#3ee0b0";
}
