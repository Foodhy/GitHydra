import { lazy, Suspense } from "react";

const MonacoPane = lazy(() => import("./MonacoPane"));

const PLACEHOLDER = `// Editor reservado
// En una fase posterior este panel abre el archivo del diff
// y puede pedir sugerencias a un agente.

export function hydra() {
  return "GitHydra";
}
`;

export function EditorPanel() {
  return (
    <Suspense
      fallback={<p className="p-3 text-xs text-muted">Cargando editor…</p>}
    >
      <MonacoPane value={PLACEHOLDER} />
    </Suspense>
  );
}
