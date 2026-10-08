'use client';

import { useState } from 'react';
import { Calculator, Check, ChevronRight, CircleAlert, CircleHelp, Copy, Database, ListChecks, LoaderCircle, Search, Wrench } from 'lucide-react';
import type { AgentRunStatus } from '@/lib/agent/types';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { useToast } from '@/components/ui/Toast';
import { formatAgentValue, getAgentToolState, summarizeAgentTool, type AgentTool } from './presentation';
import { AgentToolResult } from './AgentToolResult';

function ToolValue({ value }: { value: unknown }) {
    if (Array.isArray(value) && value.length > 0 && value.every(item => item?.type === 'text' && typeof item.text === 'string')) {
        return <MarkdownContent content={value.map(item => item.text).join('\n\n')} className="text-sm" />;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return <dl className="agent-tool-fields">
            {Object.entries(value).map(([key, field]) => <div key={key}>
                <dt>{key}</dt>
                <dd><pre>{formatAgentValue(field)}</pre></dd>
            </div>)}
        </dl>;
    }
    return <pre className="agent-tool-raw">{formatAgentValue(value)}</pre>;
}

function ToolSection({ label, value }: { label: string; value: unknown }) {
    const [copied, setCopied] = useState(false);
    const { showToast } = useToast();
    return <section className="agent-tool-section">
        <div className="agent-tool-section-heading">
            <h4>{label}</h4>
            <button type="button" aria-label={`复制${label}`} onClick={async () => {
                try {
                    await navigator.clipboard.writeText(formatAgentValue(value));
                    setCopied(true);
                } catch {
                    showToast('error', '复制失败，请重试');
                }
            }}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? '已复制' : '复制'}</span>
            </button>
        </div>
        <div className="agent-tool-value" tabIndex={0} aria-label={label}><ToolValue value={value} /></div>
    </section>;
}

export function AgentToolCard({ tool, runStatus, showResult = true, fullResult = false }: { tool: AgentTool; runStatus: AgentRunStatus; showResult?: boolean; fullResult?: boolean }) {
    const [expanded, setExpanded] = useState<boolean | null>(null);
    const state = getAgentToolState(tool, runStatus);
    const summary = summarizeAgentTool(tool);
    const ToolIcon = tool.name === 'bazi' || tool.name === 'ziwei' ? Calculator : tool.name === 'ask_user' ? CircleHelp
        : tool.name.includes('search') ? Search : tool.name === 'select_final_artifacts' ? ListChecks : tool.name.includes('user') ? Database : Wrench;
    const Icon = state.status === 'running' ? LoaderCircle : state.status === 'failed' ? CircleAlert
        : state.status === 'completed' ? Check : ToolIcon;
    const open = expanded ?? state.status === 'failed';
    return <div><details className={`agent-tool-card agent-tool-card--${state.status}`} open={open}>
        <summary onClick={event => { event.preventDefault(); setExpanded(!open); }}>
            <span className="agent-tool-indicator">
                <Icon size={14} className={state.status === 'running' ? 'animate-spin motion-reduce:animate-none' : undefined} aria-hidden="true" />
            </span>
            <span className="agent-tool-label"><span>{tool.title}</span>{summary && <small>{summary}</small>}</span>
            <span className="agent-tool-state">{state.label}</span>
            <ChevronRight size={14} className="agent-tool-chevron" aria-hidden="true" />
        </summary>
        {open && <div className="agent-tool-details">
            {tool.input !== undefined && <ToolSection label="调用参数" value={tool.input} />}
            {tool.output !== undefined && <ToolSection label="工具结果" value={tool.output} />}
            {tool.input === undefined && tool.output === undefined && <p className="p-3 text-xs text-foreground-secondary">{state.status === 'running' ? '正在等待工具返回结果…' : '该步骤没有返回详情。'}</p>}
        </div>}
    </details>{showResult && <AgentToolResult tool={tool} full={fullResult} />}</div>;
}
