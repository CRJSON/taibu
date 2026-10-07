'use client';

import { useId, useRef, useState } from 'react';
import { CircleDashed, Layers, X } from 'lucide-react';
import type { AgentRuntimeInfo } from '@/lib/agent/types';
import { FloatingPanel } from '@/components/ui/FloatingPanel';

const number = (value: number) => value.toLocaleString('en-US');
const compact = (value: number) => value < 1000 ? number(value) : `${(value / 1000).toFixed(1)}k`;

export function AgentContextUsage({ runtime }: { runtime?: AgentRuntimeInfo }) {
    const id = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const context = runtime?.context;
    const capacity = runtime?.model.contextWindow;
    const percent = context && capacity && capacity > 0 ? Math.round(context.tokens / capacity * 100) : null;
    const estimated = context?.source !== 'usage';
    const label = context ? `${estimated ? '≈ ' : ''}${compact(context.tokens)}` : '—';
    return <div className="agent-context-usage" data-context-source={context?.source ?? 'unavailable'}>
        <button ref={triggerRef} type="button" className="agent-context-trigger" aria-label="上下文用量" title={`上下文 ${label}${percent === null ? ' · 容量未知' : ` · ${percent}%`}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
            {percent === null ? <CircleDashed size={17} aria-hidden="true" /> : <span aria-hidden="true" className={`agent-context-ring${percent >= 85 ? ' is-high' : ''}`} style={{ background: `conic-gradient(currentColor ${Math.min(percent, 100)}%, var(--background-tertiary) 0)` }} />}
            <span className="agent-context-label">{percent === null ? label : `${estimated ? '≈' : ''}${percent}%`}</span>
        </button>
        <FloatingPanel open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} id={id} role="dialog" label="Pi 上下文统计" side="top" align="end" className="agent-context-panel">
            <div className="agent-context-heading"><h3><Layers size={15} />上下文用量</h3><button type="button" aria-label="关闭上下文统计" className="agent-icon-button" onClick={() => setOpen(false)}><X size={15} /></button></div>
            <p className="agent-context-model">最近任务 · {runtime?.model.name ?? '尚未调用模型'}</p>
            <p className="agent-context-total">{context ? `${estimated ? '≈ ' : ''}${number(context.tokens)}` : '—'}<span> / {capacity ? number(capacity) : '容量未知'} tokens</span></p>
            <p className="agent-context-note">{!context ? '任务开始后显示 Pi 的上下文数据。' : context.source === 'usage' ? '服务商回传的最近一次模型用量。' : context.source === 'mixed' ? '最近模型用量，加上 Pi 对后续消息的估算。' : '尚无服务商用量，Pi 根据实际上下文估算。'}</p>
            {context && <dl className="agent-context-stats">
                <div><dt>已测上下文</dt><dd>{context.measuredTokens > 0 ? number(context.measuredTokens) : '未回传'}</dd></div>
                <div><dt>后续内容估算</dt><dd>{number(context.estimatedTokens)}</dd></div>
                {context.input !== undefined && <div><dt>非缓存输入</dt><dd>{number(context.input)}</dd></div>}
                {context.output !== undefined && <div><dt>输出</dt><dd>{number(context.output)}</dd></div>}
                {context.cacheRead !== undefined && <div><dt>缓存读取</dt><dd>{number(context.cacheRead)}</dd></div>}
                {context.cacheWrite !== undefined && <div><dt>缓存写入</dt><dd>{number(context.cacheWrite)}</dd></div>}
                {context.reasoning !== undefined && <div><dt>推理（包含在输出中）</dt><dd>{number(context.reasoning)}</dd></div>}
                <div><dt>上下文压缩</dt><dd>{context.compactions} 次</dd></div>
            </dl>}
            <p className="agent-context-note">{capacity ? '窗口上限来自应用的模型配置。' : '此模型未配置窗口上限，因此不显示占比。'}</p>
        </FloatingPanel>
    </div>;
}
