'use client';
import type { XiaoliurenCanonicalJSON } from 'taibu-core/xiaoliuren';
import { ChartTarget, isChartTargetSelected, type ChartInteraction } from '@/components/visualization/ChartTarget';

export function XiaoliurenChart({ chart, interaction }: { chart: XiaoliurenCanonicalJSON; interaction?: ChartInteraction }) {
  const labels = ['月上起', '日上落', '时上落'] as const;
  const result = chart.结果;
  return <div className="space-y-4">
    <section className="space-y-3">
      <div className="flex justify-between"><h2 className="text-sm font-medium">三步落宫</h2><span className="text-xs text-foreground-secondary">月 → 日 → 时</span></div>
      <div className="grid gap-3 sm:grid-cols-3">{labels.map((label, index) => <article key={label} data-chart-selected={isChartTargetSelected(interaction, 'xiaoliuren:step:' + index) || undefined} className={`border rounded-lg p-4 ${index === 2 ? 'border-accent/50 bg-accent-light' : 'border-border bg-surface'}`}>
        <div className="flex justify-between mb-5 text-xs text-foreground-secondary"><ChartTarget interaction={interaction} id={'xiaoliuren:step:' + index}>{label}</ChartTarget><span>0{index + 1}</span></div>
        <div className="text-2xl font-display">{chart.推演链[label]}</div>
        {index === 2 && <p className="mt-2 text-sm text-foreground-secondary">{result.性质} · {result.五行}</p>}
      </article>)}</div>
    </section>
    <section className="border border-border rounded-lg p-5 space-y-3 bg-surface" data-chart-selected={isChartTargetSelected(interaction, 'xiaoliuren:result') || undefined}>
      <h2 className="text-sm font-medium"><ChartTarget interaction={interaction} id="xiaoliuren:result">最终落宫</ChartTarget></h2>
      <div className="flex flex-wrap items-baseline gap-3"><span className="text-2xl font-display">{result.落宫}</span><span className="text-sm text-foreground-secondary">{result.性质} · {result.五行} · {result.方位}</span></div>
      {result.释义 && <p className="text-sm text-foreground-secondary">{result.释义}</p>}
      {result.诗诀 && <p className="text-sm text-foreground-secondary border-l-2 border-accent/50 pl-3">{result.诗诀}</p>}
    </section>
  </div>;
}
