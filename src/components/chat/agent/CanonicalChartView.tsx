'use client';
import { lazy, Suspense } from 'react';
import type { AgentChart } from '@/lib/agent/tool-presentation';

const Bazi = lazy(() => import('@/components/bazi/result/ProfessionalTable').then(module => ({ default: module.ProfessionalTable })));
const Ziwei = lazy(() => import('@/components/ziwei/ZiweiChartGrid').then(module => ({ default: module.ZiweiChartGrid })));
const Qimen = lazy(() => import('@/components/qimen/QimenGrid').then(module => ({ default: module.QimenGrid })));
const Liuyao = lazy(() => import('@/components/liuyao/CanonicalLiuyaoChart').then(module => ({ default: module.CanonicalLiuyaoChart })));
const Meihua = lazy(() => import('@/components/meihua/MeihuaChart').then(module => ({ default: module.MeihuaChart })));
const Daliuren = lazy(() => import('@/components/daliuren/DaliurenChart').then(module => ({ default: module.DaliurenChart })));
const Xiaoliuren = lazy(() => import('@/components/xiaoliuren/XiaoliurenChart').then(module => ({ default: module.XiaoliurenChart })));
const Tarot = lazy(() => import('@/components/tarot/TarotChart').then(module => ({ default: module.TarotChart })));

export function CanonicalChartView({ value }: { value: AgentChart; text?: string }) {
  let content;
  switch (value.kind) {
    case 'bazi': content = <Bazi canonicalChart={value.chart} isUnknownTime={value.chart.四柱[3]?.干支.includes('*')} />; break;
    case 'ziwei': content = <Ziwei canonicalChart={value.chart} />; break;
    case 'qimen': content = <Qimen palaces={value.chart.九宫盘} monthPhaseMap={value.chart.十干月令旺衰} ju={value.chart.基本信息.局式} />; break;
    case 'liuyao': content = <Liuyao chart={value.chart} />; break;
    case 'meihua': content = <Meihua chart={value.chart} />; break;
    case 'daliuren': content = <Daliuren chart={value.chart} />; break;
    case 'xiaoliuren': content = <Xiaoliuren chart={value.chart} />; break;
    case 'tarot': content = <Tarot chart={value.chart} />; break;
  }
  return <Suspense fallback={<p className="p-4 text-sm text-foreground-secondary" role="status">加载命盘视图…</p>}><div className={`agent-canonical-chart agent-canonical-chart--${value.kind}`} data-chart-kind={value.kind}>{content}</div></Suspense>;
}
