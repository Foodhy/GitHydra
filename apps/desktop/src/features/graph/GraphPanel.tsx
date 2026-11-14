import { EmptyState } from "../../components/EmptyState";

export function GraphPanel() {
  return (
    <div className="h-full border-r border-line bg-surface">
      <EmptyState
        title="Grafo"
        detail="Fase 2. El layout irá en canvas o SVG a partir de los parentShas que ya devuelve el historial."
      />
    </div>
  );
}
