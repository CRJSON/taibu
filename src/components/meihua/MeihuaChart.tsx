'use client';

import type { MeihuaCanonicalJSON } from 'taibu-core/meihua';
import { HEXAGRAMS } from '@/lib/divination/liuyao';
import { parseTraditionalYaoPosition } from '@/lib/divination/liuyao-result-state';

function HexagramLines({ code, movingLine }: { code: string; movingLine?: number }) {
  return <div className="space-y-2" aria-label="六爻自下而上">
    {[6, 5, 4, 3, 2, 1].map(position => {
      const yang = code[position - 1] === '1';
      const moving = position === movingLine;
      const color = moving ? 'bg-accent' : 'bg-foreground/70';
      return <div key={position} className="flex items-center gap-3 min-h-5">
        <span className={`w-5 text-right text-[10px] font-mono ${moving ? 'text-accent font-bold' : 'text-foreground-secondary'}`}>{position}</span>
        <div className="flex-1 flex items-center gap-1.5" aria-label={`${position}爻${moving ? '动爻' : ''}`}>
          {yang ? <span className={`block h-2.5 w-full rounded-sm ${color}`} /> : <><span className={`block h-2.5 flex-1 rounded-sm ${color}`} /><span className="w-3 shrink-0" /><span className={`block h-2.5 flex-1 rounded-sm ${color}`} /></>}
        </div>
        {moving && <span className="text-[10px] text-accent">动</span>}
      </div>;
    })}
  </div>;
}

function HexagramCard({ label, hexagram, movingLine }: { label: string; hexagram: MeihuaCanonicalJSON['卦盘']['本卦']; movingLine?: number }) {
  // Looking up the returned hexagram's fixed line pattern does not cast another reading.
  const code = HEXAGRAMS.find(item => item.name === hexagram.卦名)?.code;
  if (!code) throw new Error('卦名缺少对应的展示数据');
  return <article className="border border-border rounded-lg p-4 bg-surface">
    <div className="flex items-center justify-between gap-3 mb-4"><h3 className="text-xs font-medium text-foreground-secondary">{label}</h3><span className="text-base font-semibold">{hexagram.卦名}</span></div>
    <div className="grid grid-cols-[minmax(80px,1fr)_1fr] gap-4 items-center">
      <HexagramLines code={code} movingLine={movingLine} />
      <dl className="space-y-2 text-xs text-foreground-secondary">
        <div><dt>上卦</dt><dd className="text-foreground">{hexagram.上卦} · {hexagram.上卦五行}</dd></div>
        <div><dt>下卦</dt><dd className="text-foreground">{hexagram.下卦} · {hexagram.下卦五行}</dd></div>
        <div><dt>整卦五行</dt><dd className="text-foreground">{hexagram.整卦五行}</dd></div>
      </dl>
    </div>
  </article>;
}

export function MeihuaChart({ chart }: { chart: MeihuaCanonicalJSON }) {
  const movingLine = parseTraditionalYaoPosition(chart.卦盘.动爻) ?? undefined;
  return <section className="space-y-3">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="text-sm font-medium">卦象演进</h2><span className="text-xs text-foreground-secondary">六爻自下而上 · 动爻以强调色标记</span></div>
    <div className="grid gap-3 lg:grid-cols-3">
      <HexagramCard label="本卦" hexagram={chart.卦盘.本卦} movingLine={movingLine} />
      {chart.卦盘.互卦 && <HexagramCard label="互卦" hexagram={chart.卦盘.互卦} />}
      <HexagramCard label="变卦" hexagram={chart.卦盘.变卦} />
    </div>
  </section>;
}
