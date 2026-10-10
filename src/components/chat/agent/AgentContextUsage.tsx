'use client';

import type { AgentRuntimeInfo } from '@/lib/agent/types';

const number = (value: number) => value.toLocaleString('en-US');
const compact = (value: number) => value < 1000 ? number(value) : `${(value / 1000).toFixed(1)}k`;

export function AgentContextDetails({ runtime }: { runtime?: AgentRuntimeInfo }) {
    const context = runtime?.context;
    const capacity = runtime?.model.contextWindow;
    const percent = context && capacity && capacity > 0 ? Math.round(context.tokens / capacity * 100) : null;
    const estimated = context?.source !== 'usage';
    const label = context ? `${estimated ? '≈ ' : ''}${compact(context.tokens)}` : '—';
    return <details className="agent-context-details" data-context-source={context?.source ?? 'unavailable'}>
        <summary aria-label="上下文用量">上下文<span>{percent === null ? label : `${estimated ? '≈' : ''}${percent}%`}</span></summary>
        <div className="agent-context-panel">
            <p className="agent-context-model">最近任务 · {runtime?.model.name ?? '尚未调用模型'}</p>
            <p className="agent-context-total">{context ? `${estimated ? '≈ ' : ''}${number(context.tokens)}` : '—'}<span> / {capacity ? number(capacity) : '容量未知'} tokens</span></p>
            <p className="agent-context-note">{!context ? '任务开始后显示上下文数据。' : context.source === 'usage' ? '服务商回传的最近一次模型用量。' : context.source === 'mixed' ? '最近模型用量，加上后续消息的估算。' : '尚无服务商用量，根据实际上下文估算。'}</p>
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
            {runtime?.usage && <details>
                <summary className="agent-context-note">任务累计用量 · {number(runtime.usage.totalTokens)} tokens</summary>
                <dl className="agent-context-stats">
                    {Object.entries(runtime.usage.models).map(([model, usage]) => <div key={model}><dt>{model}</dt><dd>{number(usage.totalTokens ?? 0)}</dd></div>)}
                    {Object.entries(runtime.usage.tools).map(([tool, usage]) => <div key={tool}><dt>{tool}</dt><dd>{number(usage.totalTokens ?? 0)}</dd></div>)}
                </dl>
                <p className="agent-context-note">按服务商回传统计。未回传 token 的本地计算不计入；金额未配置。</p>
            </details>}
            <p className="agent-context-note">{capacity ? '窗口上限来自应用的模型配置。' : '此模型未配置窗口上限，因此不显示占比。'}</p>
        </div>
    </details>;
}
