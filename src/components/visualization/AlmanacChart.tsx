'use client';
import type { AlmanacCanonicalJSON } from 'taibu-core/almanac';
import { ChartTarget, isChartTargetSelected, type ChartInteraction } from './ChartTarget';
import { ChartFacts } from './ChartFacts';

/** Display the inspected snapshot without recalculating the daily calendar. */
export function AlmanacChart({ chart, interaction }: { chart: AlmanacCanonicalJSON; interaction?: ChartInteraction }) {
  const block = (id: string, title: string, value: string | Record<string, unknown>) => <article key={id} className="border border-border rounded-lg p-4 space-y-2" data-chart-selected={isChartTargetSelected(interaction, id) || undefined}>
    <ChartTarget interaction={interaction} id={id}>{title}</ChartTarget>{typeof value === 'string' ? <p className="text-sm leading-relaxed">{value}</p> : <ChartFacts value={value} />}
  </article>;
  return <div className="space-y-4">
    {block('almanac:date', chart.基础与个性化坐标.日期, { ...chart.基础与个性化坐标, ...chart.传统黄历基调 })}
    <div className="grid gap-3 sm:grid-cols-2">{(['宜', '忌'] as const).map(field => block('almanac:activity:' + field, field, chart.择日宜忌[field].join('、') || '无'))}</div>
    <div className="grid gap-3 sm:grid-cols-2">{(['吉神宜趋', '凶煞宜忌'] as const).map(field => chart.神煞参考[field]?.length ? block('almanac:spirit:' + field, field, chart.神煞参考[field]!.join('、')) : null)}</div>
    {chart.方位信息 && <section aria-label="神位方位" className="grid gap-2 grid-cols-2 sm:grid-cols-3">{Object.entries(chart.方位信息).map(([field, direction]) => block('almanac:direction:' + field, field, direction))}</section>}
    {chart.值日信息 && <section aria-label="值日信息" className="grid gap-2 sm:grid-cols-2">{Object.entries(chart.值日信息).map(([field, value]) => value ? block('almanac:day:' + field, field, value) : null)}</section>}
    {Boolean(chart.时辰吉凶?.length) && <section aria-label="时辰吉凶" className="grid gap-2 sm:grid-cols-2">{chart.时辰吉凶!.map((hour, index) => block('almanac:hour:' + index, hour.时辰, hour))}</section>}
  </div>;
}
