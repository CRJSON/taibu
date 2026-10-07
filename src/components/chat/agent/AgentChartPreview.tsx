'use client';
import { useEffect, useState } from 'react';
import type { BaziCanonicalJSON } from 'taibu-core/bazi';
import type { ZiweiCanonicalJSON } from 'taibu-core/ziwei';
import { loadSavedChart } from '@/lib/user/charts-client';
import { buildBaziInputFromStoredFields, calculateBaziOutputFromStoredFields } from '@/lib/divination/bazi-record';
import { buildBaziCanonicalJSON } from '@/lib/divination/bazi';
import { buildZiweiCanonicalJSON, calculateZiweiChartBundle } from '@/lib/divination/ziwei';
import { ProfessionalTable } from '@/components/bazi/result/ProfessionalTable';
import { ZiweiChartGrid } from '@/components/ziwei/ZiweiChartGrid';
import { SoundWaveLoader } from '@/components/ui/SoundWaveLoader';
import type { AgentArtifact } from './presentation';

export function AgentChartPreview({ artifact, userId }: { artifact: AgentArtifact; userId: string }) {
    const [value, setValue] = useState<{ bazi?: BaziCanonicalJSON; ziwei?: ZiweiCanonicalJSON; unknownTime?: boolean; error?: string } | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            if (!artifact.chartId || !['bazi', 'ziwei'].includes(artifact.chartType ?? '')) throw new Error('此成果可从原始页面查看');
            const row = await loadSavedChart(artifact.chartType as 'bazi' | 'ziwei', artifact.chartId, { expectedUserId: userId, signal: controller.signal });
            if (!row) throw new Error('命盘不存在或无权查看');
            if (artifact.chartType === 'bazi') {
                const output = calculateBaziOutputFromStoredFields(row);
                if (!output) throw new Error('命盘资料无效');
                if (!controller.signal.aborted) setValue({ bazi: buildBaziCanonicalJSON(output), unknownTime: !row.birth_time });
            } else {
                if (!row.birth_time) throw new Error('紫微命盘缺少时辰');
                const input = buildBaziInputFromStoredFields(row);
                const output = calculateZiweiChartBundle({ ...input, calendarType: input.calendarType ?? 'solar', birthMinute: input.birthMinute ?? 0, name: typeof row.name === 'string' ? row.name : '命盘' }).output;
                if (!controller.signal.aborted) setValue({ ziwei: buildZiweiCanonicalJSON(output) });
            }
        }
        void load().catch(error => { if (!controller.signal.aborted) setValue({ error: error instanceof Error ? error.message : '加载失败' }); });
        return () => controller.abort();
    }, [artifact.chartId, artifact.chartType, userId]);
    if (!value) return <SoundWaveLoader variant="block" text="加载命盘" />;
    if (value.error) return <p role="alert" className="text-sm text-foreground-secondary">{value.error}</p>;
    return <div className="agent-chart-preview">{value.bazi ? <ProfessionalTable canonicalChart={value.bazi} isUnknownTime={value.unknownTime} /> : value.ziwei ? <ZiweiChartGrid canonicalChart={value.ziwei} /> : null}</div>;
}
