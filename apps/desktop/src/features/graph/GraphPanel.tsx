import {
  GRAPH_COLUMN_WIDTH,
  GRAPH_PAD,
  GRAPH_ROW_HEIGHT,
  type GraphCommit,
  layoutCommits,
} from "./layout";

const LANE_COLORS = [
  "var(--color-graph-edge)",
  "var(--color-accent)",
  "var(--color-warn)",
];

export function CommitGraph({
  commits,
  selectedSha,
}: {
  commits: GraphCommit[];
  selectedSha: string | null;
}) {
  const layout = layoutCommits(commits);
  const width = GRAPH_PAD * 2 + layout.columns * GRAPH_COLUMN_WIDTH;
  const height = commits.length * GRAPH_ROW_HEIGHT;

  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden="true">
      {layout.nodes.flatMap((node, row) =>
        node.links.map((link) => {
          const x1 = center(node.column);
          const y1 = centerY(row);
          const x2 = center(link.toColumn);
          const y2 = centerY(link.toRow);
          const color = LANE_COLORS[node.column % LANE_COLORS.length];
          const path =
            x1 === x2
              ? `M ${x1} ${y1} L ${x2} ${y2}`
              : `M ${x1} ${y1} C ${x1} ${y1 + 24}, ${x2} ${y2 - 24}, ${x2} ${y2}`;
          return (
            <path
              key={`${node.sha}-${link.toRow}-${link.toColumn}`}
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={2}
            />
          );
        }),
      )}
      {layout.nodes.map((node, row) => (
        <circle
          key={node.sha}
          cx={center(node.column)}
          cy={centerY(row)}
          r={node.sha === selectedSha ? 5 : 4}
          fill={LANE_COLORS[node.column % LANE_COLORS.length]}
        />
      ))}
    </svg>
  );
}

function center(column: number): number {
  return GRAPH_PAD + column * GRAPH_COLUMN_WIDTH + GRAPH_COLUMN_WIDTH / 2;
}

function centerY(row: number): number {
  return row * GRAPH_ROW_HEIGHT + GRAPH_ROW_HEIGHT / 2;
}
