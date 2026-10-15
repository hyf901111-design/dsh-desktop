import { escapeHtml as esc } from './forms';

/** Text-first Markdown for untrusted SKILL.md. Never emits raw HTML, image sources or executable URLs. */
function inline(source: string, depth = 0): string {
    if (depth > 3) return esc(source);
    const pattern = /`([^`\n]+)`|(!?)\[([^\]\n]*)\]\(([^)\n]*)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_|~~([^~\n]+)~~/g;
    let html = '', end = 0;
    for (const match of source.matchAll(pattern)) {
        html += esc(source.slice(end, match.index)); end = match.index! + match[0].length;
        if (match[1] !== undefined) html += `<code>${esc(match[1])}</code>`;
        else if (match[3] !== undefined) {
            const label = inline(match[3], depth + 1), address = match[4]!.trim();
            if (match[2]) html += `<span class="ig-markdown-image">[图片${label ? `：${label}` : ''}]</span>`;
            else {
                let safe: string | undefined;
                try { const url = new URL(address); if (/^https?:$/.test(url.protocol) && !url.username && !url.password && !/[\u0000-\u0020]/u.test(address)) safe = url.href; } catch { /* Relative resources remain readable text. */ }
                html += safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
            }
        } else if (match[5] !== undefined || match[6] !== undefined) html += `<strong>${inline(match[5] ?? match[6]!, depth + 1)}</strong>`;
        else if (match[7] !== undefined || match[8] !== undefined) html += `<em>${inline(match[7] ?? match[8]!, depth + 1)}</em>`;
        else html += `<del>${inline(match[9]!, depth + 1)}</del>`;
    }
    return html + esc(source.slice(end));
}
const listItem = (line: string) => /^(\s*)([-+*]|\d+[.)])\s+(.+)$/.exec(line);
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(value => value.trim());
function blocks(lines: string[], depth = 0): string {
    if (depth > 8) return `<pre>${esc(lines.join('\n'))}</pre>`;
    const output: string[] = [];
    for (let i = 0; i < lines.length;) {
        const line = lines[i]!;
        if (!line.trim()) { i++; continue; }
        const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
        if (fence) {
            const code: string[] = []; i++;
            while (i < lines.length && !new RegExp(`^\\s*${fence[1]![0]}{${fence[1]!.length},}\\s*$`).test(lines[i]!)) code.push(lines[i++]!);
            if (i < lines.length) i++;
            output.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); continue;
        }
        const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
        if (heading) { const level = Math.min(heading[1]!.length + 1, 6); output.push(`<h${level}>${inline(heading[2]!)}</h${level}>`); i++; continue; }
        if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { output.push('<hr>'); i++; continue; }
        if (/^\s*>/.test(line)) {
            const quote: string[] = []; while (i < lines.length && /^\s*>/.test(lines[i]!)) quote.push(lines[i++]!.replace(/^\s*>\s?/, ''));
            output.push(`<blockquote>${blocks(quote, depth + 1)}</blockquote>`); continue;
        }
        if (line.includes('|') && lines[i + 1]?.includes('-') && cells(lines[i + 1]!).every(cell => /^:?-{3,}:?$/.test(cell))) {
            const headers = cells(line); i += 2; const rows: string[] = [];
            while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) { const row = cells(lines[i++]!); rows.push(`<tr>${headers.map((_, index) => `<td>${inline(row[index] || '')}</td>`).join('')}</tr>`); }
            output.push(`<div class="ig-markdown-table"><table><thead><tr>${headers.map(value => `<th>${inline(value)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`); continue;
        }
        const item = listItem(line);
        if (item) {
            const tag = /^\d/.test(item[2]!) ? 'ol' : 'ul', indent = item[1]!.length, items: string[] = [];
            while (i < lines.length) {
                const next = listItem(lines[i]!); if (!next || next[1]!.length !== indent || (/^\d/.test(next[2]!) ? 'ol' : 'ul') !== tag) break;
                let content = inline(next[3]!).replace(/^\[([ xX])\]\s*/, (_all, checked) => checked.toLowerCase() === 'x' ? '☑ ' : '☐ '); i++;
                const nested: string[] = [];
                while (i < lines.length && lines[i]!.trim() && (listItem(lines[i]!)?.[1]?.length ?? /^\s*/.exec(lines[i]!)![0].length) > indent) nested.push(lines[i++]!.slice(indent + 1));
                if (nested.length) content += blocks(nested, depth + 1);
                items.push(`<li>${content}</li>`);
            }
            const start = tag === 'ol' ? Number.parseInt(item[2]!, 10) : 1;
            output.push(`<${tag}${tag === 'ol' && Number.isSafeInteger(start) && start !== 1 ? ` start="${start}"` : ''}>${items.join('')}</${tag}>`); continue;
        }
        const paragraph = [line]; i++;
        while (i < lines.length && lines[i]!.trim() && !/^(?:\s*[#>`~]|\s*[-+*]\s|\s*\d+[.)]\s)/.test(lines[i]!) && !lines[i + 1]?.match(/^\s*\|?\s*:?-{3,}/)) paragraph.push(lines[i++]!);
        output.push(`<p>${inline(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`);
    }
    return output.join('');
}
export function renderSkillMarkdown(content: string): string {
    const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const metadata = /^---\n([\s\S]*?)\n(?:---|\.\.\.)(?:\n|$)/.exec(normalized);
    const body = metadata ? normalized.slice(metadata[0].length) : normalized;
    const html = blocks(body.split('\n')).replace(/<(h[1-6]|p|ul|ol|pre|blockquote|table|details)(?=[\s>])/g,'<$1 data-ui-preserve');
    return `${html || '<p class="ig-note">此技能暂时没有正文。</p>'}${metadata ? `<details class="ig-skill-metadata"><summary>技能元信息</summary><pre data-ui-preserve>${esc(metadata[1])}</pre></details>` : ''}`;
}
