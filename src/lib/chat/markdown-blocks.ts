import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

export const markdownPlugins = [remarkGfm];
const parser = unified().use(remarkParse).use(remarkGfm);
type Node = { type?: string; children?: Node[] };
function needsDocument(node: Node): boolean {
    return node.type === 'definition' || node.type === 'footnoteDefinition' || node.type === 'html'
        || Boolean(node.children?.some(needsDocument));
}

/** Same GFM grammar as the renderer; source slices retain indentation and CRLF. */
export function splitMarkdown(source: string): { blocks: string[]; document: boolean } {
    if (!source) return { blocks: [], document: false };
    const tree = parser.parse(source);
    if (needsDocument(tree)) return { blocks: [source], document: true };
    const boundaries = tree.children.slice(1).map(node => node.position?.start.offset);
    if (boundaries.some(offset => offset === undefined)) return { blocks: [source], document: true };
    let start = 0;
    const blocks = boundaries.map(offset => {
        const end = source.lastIndexOf('\n', offset! - 1) + 1;
        const block = source.slice(start, end);
        start = end;
        return block;
    });
    blocks.push(source.slice(start));
    return { blocks, document: false };
}

export function pendingChartFence(source: string): boolean {
    // CommonMark closes a fence only with the same character and at least its opening length.
    const lines = source.split(/\r?\n/u);
    let fence: { marker: string; length: number; chart: boolean } | null = null;
    for (const line of lines) {
        const match = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
        if (!match) continue;
        if (!fence) fence = { marker: match[1][0], length: match[1].length, chart: /^chart(?:\s|$)/u.test(match[2].trim()) };
        else if (match[1][0] === fence.marker && match[1].length >= fence.length && !match[2].trim()) fence = null;
    }
    return fence?.chart ?? false;
}

export class MarkdownBlocks {
    private source = '';
    private blocks: string[] = [];
    private document = false;
    advance(source: string): string[] {
        if (source === this.source) return this.blocks;
        const append = this.blocks.length > 0 && source.startsWith(this.source);
        if (append && this.document) this.blocks = [source];
        else {
            const stable = append ? this.blocks.slice(0, -1) : [];
            const tail = source.slice(stable.reduce((total, block) => total + block.length, 0));
            const parsed = splitMarkdown(tail);
            this.document = parsed.document;
            this.blocks = parsed.document ? [source] : [...stable, ...parsed.blocks];
            // Bound memoized elements in unusually fragmented messages.
            if (this.blocks.length > 512) this.blocks = [this.blocks.slice(0, -128).join(''), ...this.blocks.slice(-128)];
        }
        this.source = source;
        return this.blocks;
    }
}

export function tableCsv(rows: string[][]): string {
    return '\ufeff' + rows.map(row => row.map(cell => {
        const safe = /^[\s]*[=+@-]/u.test(cell) ? `'${cell}` : cell;
        return `"${safe.replaceAll('"', '""')}"`;
    }).join(',')).join('\r\n');
}
