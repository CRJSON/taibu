'use client';
import type { ReactNode } from 'react';
import type { AstrologyCanonicalJSON } from 'taibu-core/astrology';
import { ChartTarget, isChartTargetSelected, type ChartInteraction } from './ChartTarget';
import { ChartFacts } from './ChartFacts';

type Factor = AstrologyCanonicalJSON['命盘锚点']['太阳'];
type Point = { id: string; label: string; factor: Factor };
const polar = (degree: number, radius: number) => ({ x: 170 + radius * Math.cos((degree - 90) * Math.PI / 180), y: 170 + radius * Math.sin((degree - 90) * Math.PI / 180) });
const hasCoordinate = (factor: Factor) => typeof factor.黄经度 === 'number' && Number.isFinite(factor.黄经度) && factor.黄经度 >= 0 && factor.黄经度 < 360;

export function AstrologyChart({ chart, interaction, includeRelated = true }: { chart: AstrologyCanonicalJSON; interaction?: ChartInteraction; includeRelated?: boolean }) {
  const points: Point[] = chart.本命主星.map((factor, index) => ({ factor, label: factor.因素, id: 'astrology:natal:' + index }));
  for (const name of ['上升', '天顶'] as const) {
    const factor = chart.命盘锚点[name];
    if (factor) points.push({ factor, label: name, id: 'astrology:anchor:' + name });
  }
  const visible = points.filter(point => hasCoordinate(point.factor));
  const activeKeys = new Set(points.flatMap(point => isChartTargetSelected(interaction, point.id) && point.factor.标识 ? [point.factor.标识] : []));
  for (const name of ['太阳', '月亮', '上升', '天顶'] as const) if (interaction?.selectedIds.includes('astrology:anchor:' + name) && chart.命盘锚点[name]?.标识) activeKeys.add(chart.命盘锚点[name]!.标识!);
  const lines: Array<{ from: string; to: string; label: string }> = [];
  chart.本命主星.forEach((planet, index) => planet.关键相位.forEach((aspect, aspectIndex) => {
    if (planet.标识 && aspect.对象标识 && (interaction?.selectedIds.includes('astrology:natal:' + index + ':aspect:' + aspectIndex) || includeRelated && interaction?.selectedIds.includes('astrology:natal:' + index)))
      lines.push({ from: planet.标识, to: aspect.对象标识, label: planet.因素 + aspect.相位 + aspect.对象 });
  }));
  chart.扩展信息?.完整相位矩阵?.本命.forEach((aspect, index) => {
    if (interaction?.selectedIds.includes('astrology:aspect:本命:' + index) && aspect.起点标识 && aspect.终点标识) lines.push({ from: aspect.起点标识, to: aspect.终点标识, label: aspect.起点 + aspect.相位 + aspect.终点 });
  });
  lines.forEach(line => { activeKeys.add(line.from); activeKeys.add(line.to); });
  const card = (id: string, label: string, body: ReactNode) => <article key={id} className="border border-border rounded-lg p-3 space-y-2" data-chart-selected={isChartTargetSelected(interaction, id) || undefined}>
    <ChartTarget interaction={interaction} id={id}>{label}</ChartTarget>{body}
  </article>;
  return <div className="space-y-4">
    {visible.length > 0 && <figure className="chart-astrology-wheel"><svg viewBox="0 0 340 340" role="group" aria-label="原始黄经投影">
      <circle cx="170" cy="170" r="142" fill="none" stroke="currentColor" opacity=".25" /><circle cx="170" cy="170" r="112" fill="none" stroke="currentColor" opacity=".15" />
      {Array.from({ length: 12 }, (_, index) => {
        const from = polar(index * 30, 132), to = polar(index * 30, 142), label = polar(index * 30, 157);
        return <g key={index}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" opacity=".4" /><text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="currentColor">{index * 30}°</text></g>;
      })}
      {chart.扩展信息?.宫位宫头?.map((house, index) => {
        if (typeof house.宫头黄经度 !== 'number' || !Number.isFinite(house.宫头黄经度)) return null;
        const from = polar(house.宫头黄经度, 34), to = polar(house.宫头黄经度, 132);
        return <line key={index} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" opacity={interaction?.selectedIds.includes('astrology:house:' + index) ? .8 : .12} />;
      })}
      {lines.map((line, index) => {
        const from = visible.find(point => point.factor.标识 === line.from), to = visible.find(point => point.factor.标识 === line.to);
        if (!from || !to) return null;
        const a = polar(from.factor.黄经度!, 103), b = polar(to.factor.黄经度!, 103);
        return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="chart-aspect-line"><title>{line.label}</title></line>;
      })}
      {visible.map((point, index) => {
        const spot = polar(point.factor.黄经度!, 103), label = polar(point.factor.黄经度!, index % 2 ? 126 : 118), selected = Boolean(point.factor.标识 && activeKeys.has(point.factor.标识));
        return <g key={point.id} data-chart-planet={point.id} data-chart-selected={selected || undefined} role={interaction ? 'button' : undefined} tabIndex={interaction ? 0 : undefined}
          aria-label={'盘面 ' + point.label} aria-pressed={interaction ? selected : undefined} onClick={() => interaction?.onSelect(point.id)} onKeyDown={event => { if (interaction && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); interaction.onSelect(point.id); } }}>
          <circle cx={spot.x} cy={spot.y} r={selected ? 6 : 3.5} fill="currentColor" /><text x={label.x} y={label.y} fontSize="10" textAnchor="middle" fill="currentColor">{point.label}</text>
        </g>;
      })}
    </svg><figcaption>黄经投影 · {chart.基础坐标.计算模式} · {chart.基础坐标.黄道体系}</figcaption></figure>}
    <div className="grid gap-2 sm:grid-cols-2">{(['太阳', '月亮', '上升', '天顶'] as const).map(name => chart.命盘锚点[name] ? card('astrology:anchor:' + name, name, <ChartFacts value={{ ...chart.命盘锚点[name]!, 标识: undefined, 黄经度: undefined }} />) : null)}</div>
    <section aria-label="本命主星" className="space-y-2">{chart.本命主星.map((planet, index) => card('astrology:natal:' + index, planet.因素, <>
      <p className="text-sm">{planet.星座} · {planet.黄经} {planet.宫位} {planet.逆行 ? '逆行' : ''}</p>
      <div className="flex flex-wrap gap-1">{planet.关键相位.map((aspect, aspectIndex) => <ChartTarget key={aspectIndex} interaction={interaction} id={'astrology:natal:' + index + ':aspect:' + aspectIndex} className="text-xs">{aspect.相位} {aspect.对象} · {aspect.容许度}°</ChartTarget>)}</div>
    </>))}</section>
    {chart.当前流运触发.length > 0 && <section aria-label="流运触发" className="space-y-2">{chart.当前流运触发.map((planet, index) => card('astrology:transit:' + index, '流运 ' + planet.流运星体, <>
      <p>{planet.星座} · {planet.黄经}</p><p className="text-xs">{planet.触发相位.map(aspect => aspect.相位 + aspect.对象 + ' ' + aspect.容许度 + '°').join('；')}</p>
    </>))}</section>}
    <div className="grid gap-2 sm:grid-cols-2">{chart.扩展信息?.宫位宫头?.map((house, index) => card('astrology:house:' + index, house.宫位, <p>{house.宫头星座} · {house.宫头黄经}</p>))}
      {chart.扩展信息?.附加点与交点?.map((point, index) => card('astrology:point:' + index, point.因素, <ChartFacts value={{ 本命: point.本命, 流运: point.流运 }} />))}</div>
    {chart.扩展信息?.完整相位矩阵 && <details open={interaction?.selectedIds.some(id => id.startsWith('astrology:aspect:')) || undefined}><summary>完整相位矩阵</summary>
      {(['本命', '流运'] as const).map(group => <section key={group} aria-label={group + '相位'} className="space-y-1 mt-3">{chart.扩展信息!.完整相位矩阵![group].map((aspect, index) => card('astrology:aspect:' + group + ':' + index, group + ' ' + aspect.起点 + ' ' + aspect.相位 + ' ' + aspect.终点, <span className="text-xs text-foreground-secondary">容许度 {aspect.容许度}°</span>))}</section>)}
    </details>}
    <ChartFacts value={chart.基础坐标} />
  </div>;
}
