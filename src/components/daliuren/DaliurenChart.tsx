'use client';

import type { DaliurenCanonicalJSON } from 'taibu-core/daliuren';
import { TianDiPanGrid } from './TianDiPanGrid';

/** The same returned board is used by the result page and Agent workflow. */
export function DaliurenChart({ chart }: { chart: DaliurenCanonicalJSON }) {
    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
                <section className="bg-background border border-border rounded-lg p-4 sm:p-6">
                    <h3 className="text-xs font-medium text-foreground-secondary mb-5">三传分析</h3>
                    <div className="grid grid-cols-3 gap-3">
                        {chart.三传.map((data, index) => (
                            <div key={index} className="flex flex-col items-center p-3 rounded-md bg-background-secondary/30 border border-border">
                                <span className="text-xs text-foreground-secondary mb-2">{['初传', '中传', '末传'][index]}</span>
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
                            return (
                                <div key={label} className="flex flex-col items-center p-2 rounded-md bg-background-secondary/30 border border-border">
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
                <h3 className="text-xs font-medium text-foreground-secondary mb-5">天地盘九宫</h3>
                <TianDiPanGrid result={chart} />
            </section>
        </div>
    );
}
