import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const token = match[0];
    if (token.startsWith("`")) nodes.push(<code key={`${index}-c`}>{token.slice(1, -1)}</code>);
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) nodes.push(<a key={`${index}-a`} href={link[2]}>{link[1]}</a>);
    }
    last = index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  let index = 0;
  let key = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith("```")) {
      const buffer: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        buffer.push(lines[index]);
        index += 1;
      }
      blocks.push(<pre key={key += 1}><code>{buffer.join("\n")}</code></pre>);
      index += 1;
      continue;
    }
    if (line.startsWith("|")) {
      const buffer: string[] = [];
      while (index < lines.length && lines[index].startsWith("|")) {
        if (!/^\|\s*-+/.test(lines[index])) buffer.push(lines[index]);
        index += 1;
      }
      blocks.push(
        <table key={key += 1}>
          <tbody>
            {buffer.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.split("|").slice(1, -1).map((cell, cellIndex) =>
                  rowIndex === 0 ? <th key={cellIndex}>{inline(cell.trim())}</th> : <td key={cellIndex}>{inline(cell.trim())}</td>,
                )}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].startsWith("- ")) {
        items.push(lines[index].slice(2));
        index += 1;
      }
      blocks.push(<ul key={key += 1}>{items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ul>);
      continue;
    }
    if (line.startsWith("# ")) blocks.push(<h1 key={key += 1}>{inline(line.slice(2))}</h1>);
    else if (line.startsWith("## ")) blocks.push(<h2 key={key += 1}>{inline(line.slice(3))}</h2>);
    else if (line.startsWith("### ")) blocks.push(<h3 key={key += 1}>{inline(line.slice(4))}</h3>);
    else if (line.trim() !== "") blocks.push(<p key={key += 1}>{inline(line)}</p>);
    index += 1;
  }
  return <article>{blocks}</article>;
}
