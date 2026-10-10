'use client';
// 需要读取工作区上下文，在工作区打开“回答依据”

import { BookOpenCheck } from 'lucide-react';
import type { AgentPart } from '@/lib/agent/types';
import { useAgentResultWorkspace } from './AgentResultContext';
import { getAgentEvidenceSummary } from './presentation';

/** 依据: how many search results this answer can cite; the sources themselves live in the workspace. */
export function AgentEvidenceChip({ parts }: { parts: AgentPart[] }) {
    const workspace = useAgentResultWorkspace();
    const evidence = getAgentEvidenceSummary(parts);
    if (!evidence.total) return null;
    const detail = [evidence.knowledge && `知识库 ${evidence.knowledge}`, evidence.web && `联网 ${evidence.web}`].filter(Boolean).join(' · ');
    const label = <><BookOpenCheck size={14} aria-hidden="true" /><span>依据 {evidence.total}</span><small>{detail}</small></>;
    return workspace
        ? <button type="button" className="agent-evidence-chip" onClick={() => workspace.openResource('evidence')}>{label}</button>
        : <p className="agent-evidence-chip">{label}</p>;
}
