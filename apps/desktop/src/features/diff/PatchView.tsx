type DiffMode = "unido" | "lados" | "antes" | "despues";

interface PatchLine {
  kind: "add" | "del" | "same" | "hunk";
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

export function PatchView({ patch, mode }: { patch: string; mode: DiffMode }) {
  const lines = parsePatch(patch);
  if (lines.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted">
        {patch.trim() || "Sin cambios de texto."}
      </p>
    );
  }
  if (mode === "lados") {
    return <SplitLines lines={lines} />;
  }
  const visible = lines.filter((line) => {
    if (line.kind === "hunk") {
      return true;
    }
    if (mode === "antes") {
      return line.oldNo !== null;
    }
    if (mode === "despues") {
      return line.newNo !== null;
    }
    return true;
  });
  return (
    <div className="min-w-full overflow-x-auto font-mono text-[11px] leading-5">
      {visible.map((line, index) => (
        <PatchRow
          // biome-ignore lint/suspicious/noArrayIndexKey: las líneas repetidas del parche se distinguen por su posición
          key={index}
          line={line}
          number={mode === "antes" ? line.oldNo : line.newNo}
        />
      ))}
    </div>
  );
}

function PatchRow({
  line,
  number,
}: {
  line: PatchLine;
  number: number | null;
}) {
  return (
    <div className={`flex whitespace-pre ${tint(line.kind)}`}>
      <span className="w-10 shrink-0 pr-2 text-right text-muted select-none">
        {line.kind === "hunk" ? "" : (number ?? "")}
      </span>
      <span className="min-w-0 pr-3 text-text">
        {line.kind === "hunk" ? line.text : line.text || " "}
      </span>
    </div>
  );
}

function SplitLines({ lines }: { lines: PatchLine[] }) {
  const rows = pairChanges(lines);
  return (
    <div className="min-w-full overflow-x-auto font-mono text-[11px] leading-5">
      <div className="grid grid-cols-2 border-b border-line text-muted">
        <span className="px-3 py-1">Antes</span>
        <span className="border-l border-line px-3 py-1">Después</span>
      </div>
      {rows.map((row, index) =>
        row.kind === "hunk" ? (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: las filas del parche se distinguen por su posición
            key={index}
            className="bg-surface px-3 whitespace-pre text-graph-edge"
          >
            {row.text}
          </div>
        ) : (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: las filas del parche se distinguen por su posición
            key={index}
            className="grid grid-cols-2"
          >
            <SplitCell
              text={row.left}
              number={row.oldNo}
              active={row.kind === "del" || row.kind === "change"}
              tone="del"
            />
            <SplitCell
              text={row.right}
              number={row.newNo}
              active={row.kind === "add" || row.kind === "change"}
              tone="add"
            />
          </div>
        ),
      )}
    </div>
  );
}

function SplitCell({
  text,
  number,
  active,
  tone,
}: {
  text: string | null;
  number: number | null;
  active: boolean;
  tone: "add" | "del";
}) {
  const empty = text === null;
  return (
    <div
      className={`flex min-w-0 border-l border-line whitespace-pre first:border-l-0 ${
        empty ? "bg-surface" : active ? tint(tone) : "bg-surface"
      }`}
    >
      <span className="w-10 shrink-0 pr-2 text-right text-muted select-none">
        {empty ? "" : (number ?? "")}
      </span>
      <span className="min-w-0 pr-3 text-text">
        {empty ? " " : text || " "}
      </span>
    </div>
  );
}

function tint(kind: string): string {
  if (kind === "add") {
    return "bg-accent/15";
  }
  if (kind === "del") {
    return "bg-warn/15";
  }
  return "";
}

interface SplitRow {
  kind: "same" | "add" | "del" | "change" | "hunk";
  left: string | null;
  right: string | null;
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

function pairChanges(lines: PatchLine[]): SplitRow[] {
  const paired: SplitRow[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line) {
      break;
    }
    if (line.kind !== "del") {
      paired.push(asSplit(line));
      index += 1;
      continue;
    }
    const deletions: PatchLine[] = [];
    while (lines[index]?.kind === "del") {
      const current = lines[index];
      if (!current) {
        break;
      }
      deletions.push(current);
      index += 1;
    }
    const additions: PatchLine[] = [];
    while (lines[index]?.kind === "add") {
      const current = lines[index];
      if (!current) {
        break;
      }
      additions.push(current);
      index += 1;
    }
    const count = Math.max(deletions.length, additions.length);
    for (let cursor = 0; cursor < count; cursor += 1) {
      const left = deletions[cursor];
      const right = additions[cursor];
      let kind: SplitRow["kind"] = "add";
      if (left && right) {
        kind = "change";
      } else if (left) {
        kind = "del";
      }
      paired.push({
        kind,
        left: left?.text ?? null,
        right: right?.text ?? null,
        oldNo: left?.oldNo ?? null,
        newNo: right?.newNo ?? null,
        text: "",
      });
    }
  }
  return paired;
}

function asSplit(line: PatchLine): SplitRow {
  if (line.kind === "hunk") {
    return {
      kind: "hunk",
      left: null,
      right: null,
      oldNo: null,
      newNo: null,
      text: line.text,
    };
  }
  if (line.kind === "add") {
    return {
      kind: "add",
      left: null,
      right: line.text,
      oldNo: null,
      newNo: line.newNo,
      text: "",
    };
  }
  return {
    kind: "same",
    left: line.text,
    right: line.text,
    oldNo: line.oldNo,
    newNo: line.newNo,
    text: "",
  };
}

export function sidesFromPatch(patch: string): {
  before: string;
  after: string;
} | null {
  const lines = parsePatch(patch);
  if (lines.every((line) => line.kind === "hunk")) {
    return null;
  }
  const before = lines
    .filter((line) => line.oldNo !== null)
    .map((line) => line.text)
    .join("\n");
  const after = lines
    .filter((line) => line.newNo !== null)
    .map((line) => line.text)
    .join("\n");
  return { before, after };
}

function parsePatch(patch: string): PatchLine[] {
  const lines: PatchLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const line of patch.split("\n")) {
    if (
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("new file") ||
      line.startsWith("deleted file") ||
      line.startsWith("\\")
    ) {
      continue;
    }
    if (line.startsWith("@@")) {
      const match = /@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
      oldNo = match ? Number(match[1]) : 0;
      newNo = match ? Number(match[2]) : 0;
      lines.push({ kind: "hunk", text: line, oldNo: null, newNo: null });
      continue;
    }
    if (line.startsWith("+")) {
      lines.push({
        kind: "add",
        text: line.slice(1),
        oldNo: null,
        newNo,
      });
      newNo += 1;
      continue;
    }
    if (line.startsWith("-")) {
      lines.push({
        kind: "del",
        text: line.slice(1),
        oldNo,
        newNo: null,
      });
      oldNo += 1;
      continue;
    }
    if (line.startsWith(" ")) {
      lines.push({
        kind: "same",
        text: line.slice(1),
        oldNo,
        newNo,
      });
      oldNo += 1;
      newNo += 1;
    }
  }
  return lines;
}
