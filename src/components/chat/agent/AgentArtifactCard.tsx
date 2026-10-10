'use client';

import { ArrowUpRight, FileCheck2, Orbit } from 'lucide-react';
import Link from 'next/link';
import { getAgentArtifactHref, type AgentArtifact } from './presentation';

export function AgentArtifactCard({ artifact }: {
    artifact: AgentArtifact;
}) {
    const href = getAgentArtifactHref(artifact);
    if (!href) return null;
    const Icon = artifact.recordId ? FileCheck2 : Orbit;
    const kind = artifact.recordId ? '已保存的分析' : artifact.chartType === 'bazi' ? '八字命盘' : '紫微命盘';
    return (
        <div className="agent-artifact-card">
            <Link href={href} aria-label={artifact.title} className="agent-artifact-link">
                <span className="agent-artifact-icon"><Icon size={18} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{artifact.title}</span>
                    <span className="agent-artifact-kind">{kind}</span>
                </span>
                <ArrowUpRight size={15} className="shrink-0 text-foreground-secondary" aria-hidden="true" />
            </Link>
        </div>
    );
}
