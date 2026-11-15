const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.startsWith("```")) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push("<hr />");
      index += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      blocks.push(`<h${level}>${inline(heading[2] ?? "")}</h${level}>`);
      index += 1;
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (index < lines.length && (lines[index] ?? "").startsWith(">")) {
        quote.push((lines[index] ?? "").replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        `<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`,
      );
      continue;
    }
    if (isTable(lines, index)) {
      const header = splitRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] ?? "").includes("|")) {
        rows.push(splitRow(lines[index] ?? ""));
        index += 1;
      }
      const head = header.map((cell) => `<th>${inline(cell)}</th>`).join("");
      const body = rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`,
        )
        .join("");
      blocks.push(
        `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] ?? "")) {
        items.push(
          `<li>${inline((lines[index] ?? "").replace(/^\s*[-*]\s+/, ""))}</li>`,
        );
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index] ?? "")) {
        items.push(
          `<li>${inline((lines[index] ?? "").replace(/^\s*\d+\.\s+/, ""))}</li>`,
        );
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && continuesParagraph(lines, index)) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return blocks.join("");
}

function continuesParagraph(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  if (line.trim() === "") {
    return false;
  }
  if (/^(#{1,6}\s|```|>|\s*[-*]\s+|\s*\d+\.\s+)/.test(line)) {
    return false;
  }
  return !isTable(lines, index);
}

function isTable(lines: string[], index: number): boolean {
  const current = lines[index] ?? "";
  const next = lines[index + 1] ?? "";
  return (
    current.includes("|") &&
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next)
  );
}

function splitRow(line: string): string[] {
  let cells = line.trim();
  if (cells.startsWith("|")) {
    cells = cells.slice(1);
  }
  if (cells.endsWith("|")) {
    cells = cells.slice(0, -1);
  }
  return cells.split("|").map((cell) => cell.trim());
}

function inline(source: string): string {
  let html = "";
  let index = 0;
  while (index < source.length) {
    if (source.startsWith("**", index) || source.startsWith("__", index)) {
      const marker = source.slice(index, index + 2);
      const end = source.indexOf(marker, index + 2);
      if (end > index + 2) {
        html += `<strong>${inline(source.slice(index + 2, end))}</strong>`;
        index = end + 2;
        continue;
      }
    }
    if (source[index] === "`") {
      const end = source.indexOf("`", index + 1);
      if (end > index) {
        html += `<code>${escapeHtml(source.slice(index + 1, end))}</code>`;
        index = end + 1;
        continue;
      }
    }
    if (source[index] === "[") {
      const endText = source.indexOf("]", index + 1);
      if (endText > index && source[endText + 1] === "(") {
        const endUrl = source.indexOf(")", endText + 2);
        if (endUrl > endText) {
          const label = source.slice(index + 1, endText);
          const url = source.slice(endText + 2, endUrl).trim();
          html += safeUrl(url)
            ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${inline(label)}</a>`
            : inline(label);
          index = endUrl + 1;
          continue;
        }
      }
    }
    const mark = source[index];
    if ((mark === "*" || mark === "_") && source[index + 1] !== mark) {
      const end = source.indexOf(mark, index + 1);
      if (end > index + 1) {
        html += `<em>${inline(source.slice(index + 1, end))}</em>`;
        index = end + 1;
        continue;
      }
    }
    html += escapeHtml(source[index] ?? "");
    index += 1;
  }
  return html;
}

function safeUrl(url: string): boolean {
  return (
    url.startsWith("https://") ||
    url.startsWith("http://") ||
    url.startsWith("mailto:") ||
    url.startsWith("#") ||
    url.startsWith("/")
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ESCAPE[char] ?? char);
}
