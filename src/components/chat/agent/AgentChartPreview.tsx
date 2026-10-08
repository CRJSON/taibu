'use client';

import type { AgentToolPart } from '@/lib/agent/tool-presentation';
import { getAgentToolArtifactId } from '@/lib/agent/tool-presentation';
import type { AgentArtifact } from './presentation';
import { AgentArtifactCard } from './AgentArtifactCard';
import { AgentToolCard } from './AgentToolCard';

/** Saved resource tabs use the original persisted tool result, including after refresh. */
export function AgentChartPreview({ artifact, tools }: { artifact: AgentArtifact; tools: AgentToolPart[] }) {
    const tool = tools.find(tool => tool.status === 'completed' && getAgentToolArtifactId(tool) === artifact.id);
    if (tool) return <AgentToolCard tool={tool} runStatus="completed" fullResult />;
    return <div className="space-y-3">
        <p className="text-sm text-foreground-secondary">此历史成果未附完整工具结果，请通过保存记录查看。</p>
        <AgentArtifactCard artifact={artifact} />
    </div>;
}
