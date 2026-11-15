import type { BranchRef } from "@githydra/contracts";
import type { MouseEvent } from "react";
import { laneColor, tipColor } from "./colors";
import {
  GRAPH_COLUMN_WIDTH,
  GRAPH_PAD,
  GRAPH_ROW_HEIGHT,
  type GraphCommit,
  layoutCommits,
} from "./layout";

export function CommitGraph({
  commits,
  branches,
  selectedSha,
  onOpen,
}: {
  commits: GraphCommit[];
  branches: BranchRef[];
  selectedSha: string | null;
  onOpen: (sha: string, event: MouseEvent) => void;
}) {
  const layout = layoutCommits(commits);
  const width = GRAPH_PAD * 2 + layout.columns * GRAPH_COLUMN_WIDTH;
  const height = commits.length * GRAPH_ROW_HEIGHT;
  const colorBySha = new Map(
    commits.map((commit) => [
      commit.sha,
      tipColor(branches.filter((branch) => branch.tipSha === commit.sha)),
    ]),
  );

  return (
    <svg width={width} height={height} className="shrink-0" aria-label="Grafo">
      {layout.nodes.flatMap((node, row) =>
        node.links.map((link) => {
          const x1 = center(node.column);
          const y1 = centerY(row);
          const x2 = center(link.toColumn);
          const y2 = centerY(link.toRow);
          const parentSha = commits[link.toRow]?.sha;
          const column =
            link.toColumn === node.column ? node.column : link.toColumn;
          const color =
            colorBySha.get(node.sha) ??
            (parentSha ? colorBySha.get(parentSha) : null) ??
            laneColor(column);
          const bend = GRAPH_ROW_HEIGHT / 2;
          const path =
            x1 === x2
              ? `M ${x1} ${y1} L ${x2} ${y2}`
              : `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
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
      {layout.nodes.map((node, row) => {
        const color = colorBySha.get(node.sha) ?? laneColor(node.column);
        return (
          // biome-ignore lint/a11y/useSemanticElements: el punto del grafo sigue siendo un círculo
          <circle
            key={node.sha}
            role="button"
            aria-label={node.sha.slice(0, 7)}
            cx={center(node.column)}
            cy={centerY(row)}
            r={node.sha === selectedSha ? 5.5 : 4.5}
            fill={color}
            className="cursor-pointer"
            onClick={(event) => onOpen(node.sha, event)}
          >
            <title>{node.sha.slice(0, 7)}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function center(column: number): number {
  return GRAPH_PAD + column * GRAPH_COLUMN_WIDTH + GRAPH_COLUMN_WIDTH / 2;
}

function centerY(row: number): number {
  return row * GRAPH_ROW_HEIGHT + GRAPH_ROW_HEIGHT / 2;
}
