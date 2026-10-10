'use client';
import type { LiuyaoCanonicalJSON } from 'taibu-core/liuyao';
import { HEXAGRAMS, type Yao } from '@/lib/divination/liuyao';
import { parseTraditionalYaoPosition } from '@/lib/divination/liuyao-result-state';
import { HexagramDisplay } from './HexagramDisplay';
import { ChartTarget, isChartTargetSelected, type ChartInteraction } from '@/components/visualization/ChartTarget';
import { HexagramLines } from '@/components/meihua/MeihuaChart';

export function CanonicalLiuyaoChart({ chart, interaction }: { chart: LiuyaoCanonicalJSON; interaction?: ChartInteraction }) {
  const hexagram = HEXAGRAMS.find(row => row.name === chart.卦盘.本卦.卦名);
  const changedHexagram = chart.卦盘.变卦 ? HEXAGRAMS.find(row => row.name === chart.卦盘.变卦?.卦名) : undefined;
  if (!hexagram || (chart.卦盘.变卦 && !changedHexagram)) throw new Error('卦名缺少对应的展示数据');
  const lines = [...chart.六爻].sort((a, b) => (parseTraditionalYaoPosition(a.爻位) ?? 0) - (parseTraditionalYaoPosition(b.爻位) ?? 0));
  if (lines.some((line, index) => parseTraditionalYaoPosition(line.爻位) !== index + 1)) throw new Error('爻位数据不完整');
  // Draw the two returned fixed patterns. This comparison does not cast another reading.
  const yaos: Yao[] = lines.map((_, index) => ({ position: index + 1, type: hexagram.code[index] === '1' ? 1 : 0, change: changedHexagram && hexagram.code[index] !== changedHexagram.code[index] ? 'changing' : 'stable' }));
  return <div className="space-y-4"><HexagramDisplay yaos={yaos} hexagram={hexagram} changedHexagram={changedHexagram} changedLines={yaos.filter(yao => yao.change === 'changing').map(yao => yao.position)} fullYaos={lines} showTraditional showDetails interaction={interaction} />
    {lines.some(line => line.伏神) && <section aria-label="伏神" className="grid gap-2 sm:grid-cols-2">{lines.flatMap(line => line.伏神 ? [
      <div key={line.爻位} className="rounded border border-border p-3" data-chart-selected={isChartTargetSelected(interaction, 'liuyao:line:' + parseTraditionalYaoPosition(line.爻位) + ':hidden') || undefined}>
        <ChartTarget interaction={interaction} id={'liuyao:line:' + parseTraditionalYaoPosition(line.爻位) + ':hidden'}>{line.爻位}伏神</ChartTarget>
        <p className="text-sm">{line.伏神.六亲} · {line.伏神.纳甲} · {line.伏神.五行}</p>
      </div>] : [])}</section>}
    <section aria-label="派生卦" className="grid gap-3 sm:grid-cols-3">{(['互卦', '错卦', '综卦'] as const).map(key => {
      const derived = chart.卦盘[key], code = derived && HEXAGRAMS.find(row => row.name === derived.卦名)?.code, id = 'liuyao:derived:' + key;
      return derived && code ? <article key={key} className="border border-border rounded-lg p-4" data-chart-selected={isChartTargetSelected(interaction, id) || undefined}>
        <h3 className="mb-3"><ChartTarget interaction={interaction} id={id}>{key} · {derived.卦名}</ChartTarget></h3><HexagramLines code={code} id={id} interaction={interaction} />
      </article> : null;
    })}</section>
  </div>;
}
