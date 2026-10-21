import { Fragment, memo, type ReactNode } from 'react';
import { Icon } from './Icon';

// Render a deliberately small Markdown subset as React text nodes. Model output
// never becomes HTML, executable code, an image URL, or a navigation target.
function inline(text: string): ReactNode {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|~~[^~\n]+~~)/g).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith('~~') && part.endsWith('~~')) return <del key={index}>{part.slice(2, -2)}</del>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

const listPattern = /^\s*(?:([-*+])|\d+[.)])\s+(.+)$/;
const headingPattern = /^(#{1,6})\s+(.+)$/;
const dividerPattern = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const tableDividerPattern = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
function cells(line: string) { return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()); }

export const MessageContent = memo(function MessageContent({ text, onCopy }: { text: string; onCopy: (text: string) => void }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let row = 0;
  while (row < lines.length) {
    const line = lines[row] ?? '';
    const key = row;
    if (!line.trim()) { row += 1; continue; }
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      const marker = fence[1] ?? '```';
      const closingFence = new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`);
      const codeLines: string[] = [];
      row += 1;
      while (row < lines.length && !closingFence.test(lines[row] ?? '')) { codeLines.push(lines[row] ?? ''); row += 1; }
      if (row < lines.length) row += 1;
      const code = codeLines.join('\n');
      const language = /^[\w#+.-]{1,30}$/.test(fence[2]?.trim() ?? '') ? fence[2]?.trim() : '代码';
      blocks.push(<div className="agent-code-block" key={key}><div className="agent-code-header"><span>{language}</span><button type="button" onClick={() => onCopy(code)} aria-label="复制代码"><Icon name="copy" size={13} /><span>复制</span></button></div><pre tabIndex={0} aria-label={language}><code>{code}</code></pre></div>);
      continue;
    }
    const heading = headingPattern.exec(line);
    if (heading) {
      const content = inline(heading[2] ?? '');
      blocks.push(heading[1]?.length === 1 ? <h2 key={key}>{content}</h2> : heading[1]?.length === 2 ? <h3 key={key}>{content}</h3> : <h4 key={key}>{content}</h4>);
      row += 1; continue;
    }
    if (dividerPattern.test(line)) { blocks.push(<hr key={key} />); row += 1; continue; }
    if (line.includes('|') && tableDividerPattern.test(lines[row + 1] ?? '')) {
      const headers = cells(line);
      const rows: string[][] = [];
      row += 2;
      while (row < lines.length && lines[row]?.includes('|') && lines[row]?.trim()) { rows.push(cells(lines[row] ?? '')); row += 1; }
      blocks.push(<div className="agent-table" key={key} tabIndex={0} role="region" aria-label="回复中的表格"><table><thead><tr>{headers.map((cell, column) => <th key={column} scope="col">{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((cells, index) => <tr key={index}>{headers.map((_, column) => <td key={column}>{inline(cells[column] ?? '')}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const firstItem = listPattern.exec(line);
    if (firstItem) {
      const unordered = Boolean(firstItem[1]);
      const items: ReactNode[] = [];
      const start = unordered ? undefined : Number.parseInt(line.trim(), 10);
      while (row < lines.length) {
        const item = listPattern.exec(lines[row] ?? '');
        if (!item || Boolean(item[1]) !== unordered) break;
        items.push(<li key={row}>{inline(item[2] ?? '')}</li>); row += 1;
      }
      blocks.push(unordered ? <ul key={key}>{items}</ul> : <ol key={key} start={start}>{items}</ol>);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (row < lines.length && /^\s*>\s?/.test(lines[row] ?? '')) { quote.push((lines[row] ?? '').replace(/^\s*>\s?/, '')); row += 1; }
      blocks.push(<blockquote key={key}><p>{inline(quote.join('\n'))}</p></blockquote>);
      continue;
    }
    const paragraph: string[] = [line];
    row += 1;
    while (row < lines.length && lines[row]?.trim() && !headingPattern.test(lines[row] ?? '') && !listPattern.test(lines[row] ?? '') && !/^\s*(?:`{3,}|~{3,}|>)/.test(lines[row] ?? '') && !dividerPattern.test(lines[row] ?? '') && !(lines[row]?.includes('|') && tableDividerPattern.test(lines[row + 1] ?? ''))) {
      paragraph.push(lines[row] ?? ''); row += 1;
    }
    blocks.push(<p key={key}>{inline(paragraph.join('\n'))}</p>);
  }
  return <>{blocks}</>;
});
