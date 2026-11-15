export const GRAPH_ROW_HEIGHT = 32;
export const GRAPH_COLUMN_WIDTH = 16;
export const GRAPH_PAD = 12;

export interface GraphCommit {
  sha: string;
  parentShas: string[];
}

export interface GraphLink {
  toColumn: number;
  toRow: number;
}

export interface GraphNode {
  sha: string;
  column: number;
  links: GraphLink[];
}

export interface GraphLayout {
  columns: number;
  nodes: GraphNode[];
}

/** Carriles de más nuevo a más viejo. El primer padre sigue en el carril; el resto abre otro. */
export function layoutCommits(commits: GraphCommit[]): GraphLayout {
  const lanes: (string | null)[] = [];
  const columnBySha = new Map<string, number>();

  for (const commit of commits) {
    const waiting = lanes.flatMap((sha, index) =>
      sha === commit.sha ? [index] : [],
    );
    let column = waiting[0];
    if (column === undefined) {
      const free = lanes.indexOf(null);
      column = free === -1 ? lanes.length : free;
      if (free === -1) {
        lanes.push(null);
      }
    }
    for (const index of waiting) {
      lanes[index] = null;
    }
    lanes[column] = null;
    columnBySha.set(commit.sha, column);

    const [firstParent, ...otherParents] = commit.parentShas;
    if (firstParent) {
      lanes[column] = firstParent;
    }
    for (const parent of otherParents) {
      if (lanes.includes(parent)) {
        continue;
      }
      const free = lanes.indexOf(null);
      if (free === -1) {
        lanes.push(parent);
      } else {
        lanes[free] = parent;
      }
    }
  }

  const rowBySha = new Map(commits.map((commit, row) => [commit.sha, row]));
  const nodes = commits.map((commit) => ({
    sha: commit.sha,
    column: columnBySha.get(commit.sha) ?? 0,
    links: commit.parentShas.flatMap((parent) => {
      const toRow = rowBySha.get(parent);
      const toColumn = columnBySha.get(parent);
      if (toRow === undefined || toColumn === undefined) {
        return [];
      }
      return [{ toColumn, toRow }];
    }),
  }));
  const columns = nodes.reduce(
    (width, node) => Math.max(width, node.column + 1),
    1,
  );
  return { columns, nodes };
}
