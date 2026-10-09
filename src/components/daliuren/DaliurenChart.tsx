'use client';

import type { DaliurenCanonicalJSON } from 'taibu-core/daliuren';
import { TianDiPanGrid } from './TianDiPanGrid';
import { ChartTarget, isChartTargetSelected, type ChartInteraction } from '@/components/visualization/ChartTarget';

/** The same returned board is used by the result page and Agent workflow. */
export function DaliurenChart({ chart, interaction, includeRelated = true }: { chart: DaliurenCanonicalJSON; interaction?: ChartInteraction; includeRelated?: boolean }) {
    const relatedBranches = interaction && includeRelated ? [
        ...chart.三传.flatMap((step, index) => interaction.selectedIds.includes('daliuren:transmission:' + index) ? [step.地支] : []),
        ...chart.四课.flatMap((lesson, index) => interaction.selectedIds.includes('daliuren:lesson:' + index) ? [lesson.上神] : []),
    ] : [];
    const boardInteraction = interaction ? { ...interaction, selectedIds: [...interaction.selectedIds, ...chart.天地盘.flatMap((palace, index) => relatedBranches.includes(palace.天盘) ? ['daliuren:palace:' + index] : [])] } : undefined;
    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
                <section className="bg-background border border-border rounded-lg p-4 sm:p-6">
                    <h3 className="text-xs font-medium text-foreground-secondary mb-5">三传分析</h3>
                    <div className="grid grid-cols-3 gap-3">
                        {chart.三传.map((data, index) => (
                            <div key={index} data-chart-selected={isChartTargetSelected(interaction, 'daliuren:transmission:' + index) || undefined} className="flex flex-col items-center p-3 rounded-md bg-background-secondary/30 border border-border">
                                <ChartTarget interaction={interaction} id={'daliuren:transmission:' + index} className="text-xs text-foreground-secondary mb-2">{data.传序}</ChartTarget>
                                <span className="text-xl font-semibold mb-1">{data.地支}</span>
                                <span className="text-xs text-foreground-secondary">{data.天将}</span>
                                <span className="text-xs text-accent">{data.六亲}</span>
                            </div>
                        ))}
                    </div>
                </section>
                <section className="bg-background border border-border rounded-lg p-4 sm:p-6">
                    <h3 className="text-xs font-medium text-foreground-secondary mb-5">四课排布</h3>
                    <div className="grid grid-cols-4 gap-2">
                        {['四课', '三课', '二课', '一课'].map(label => {
                            const data = chart.四课.find(item => item.课别.startsWith(label));
                            const index = data ? chart.四课.indexOf(data) : -1;
                            return (
                                <div key={label} data-chart-selected={isChartTargetSelected(interaction, 'daliuren:lesson:' + index) || undefined} className="flex flex-col items-center p-2 rounded-md bg-background-secondary/30 border border-border">
                                    {data && <ChartTarget interaction={interaction} id={'daliuren:lesson:' + index} className="text-[10px]">{data.课别}</ChartTarget>}
                                    <span className="text-xs text-accent mb-1">{data?.乘将}</span>
                                    <span className="text-lg font-semibold">{data?.上神}</span>
                                    <div className="w-4 h-px bg-border my-1" />
                                    <span className="text-xs text-foreground-secondary">{data?.下神}</span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
            <section className="bg-background border border-border rounded-lg p-4 sm:p-6">
                <h3 className="text-xs font-medium text-foreground-secondary mb-5">天地盘十二宫</h3>
                <TianDiPanGrid result={chart} interaction={boardInteraction} />
            </section>
        </div>
    );
}
