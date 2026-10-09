'use client';
import type { TaiyiCanonicalJSON } from 'taibu-core/taiyi';
import { ChartTarget, isChartTargetSelected, type ChartInteraction } from './ChartTarget';
import { ChartFacts } from './ChartFacts';

export function TaiyiChart({ chart, interaction }: { chart: TaiyiCanonicalJSON; interaction?: ChartInteraction }) {
  const board = chart.太乙七十二局;
  return <div className="space-y-4">
    <ChartFacts value={chart.问卜与时空底盘} />
    {board ? <>
      <h3 className="font-medium">{board.流派} · {board.局式}</h3>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">{board.十六宫.map((palace, index) => {
        const id = 'taiyi:palace:' + index;
        return <article key={index} className="border border-border rounded-lg p-3 space-y-2" data-chart-selected={isChartTargetSelected(interaction, id) || undefined}>
          <ChartTarget interaction={interaction} id={id}>{palace.宫位}</ChartTarget><p className="text-sm text-foreground-secondary">{palace.宫神}</p>
          <div className="flex flex-wrap gap-1">{palace.星将.map((star, starIndex) => <ChartTarget key={starIndex} interaction={interaction} id={id + ':star:' + starIndex} className="text-sm">{star}</ChartTarget>)}</div>
        </article>;
      })}</div>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">{(['太乙', '文昌', '始击', '计神', '合神', '太岁', '主算', '主大将', '主参将', '客算', '客大将', '客参将'] as const).map(field => <div key={field} className="rounded border border-border p-3" data-chart-selected={isChartTargetSelected(interaction, 'taiyi:field:' + field) || undefined}>
        <ChartTarget interaction={interaction} id={'taiyi:field:' + field}>{field}</ChartTarget><p className="text-lg">{board[field]}</p>
      </div>)}</div>
    </> : <div className="grid gap-3 sm:grid-cols-2">{chart.九星阵列.map((star, index) => <article key={index} className="border border-border rounded-lg p-4" data-chart-selected={isChartTargetSelected(interaction, 'taiyi:star:' + index) || undefined}>
      <h3 className="font-medium"><ChartTarget interaction={interaction} id={'taiyi:star:' + index}>{star.观测层级} · {star.太乙名}</ChartTarget></h3><ChartFacts value={star} />
    </article>)}</div>}
    <ChartFacts value={chart.外部时空环境} /><ChartFacts value={chart.核心物理关系} />
    {chart.古典参考 && <details><summary>古典参考</summary><ChartFacts value={chart.古典参考} /></details>}
  </div>;
}
