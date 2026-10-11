'use client';
// 需要 useState（删除确认、展开）与浏览器请求（删除长期记忆）

import { useState, type ReactNode } from 'react';
import { ArrowUpRight, CircleAlert, Database, Globe, LoaderCircle, Lock, Trash2, Users } from 'lucide-react';
import type { AgentRunStatus } from '@/lib/agent/types';
import type { AgentQuestionAnswer } from '@/lib/agent/workspace';
import {
    getAgentAttachmentRead, getAgentCalculation, getAgentDataResults, getAgentMemories, getAgentMethod, getAgentMethodCatalog,
    getAgentProfile, getAgentSearchResults, getAgentToolQuestions, getAgentToolText, type AgentCalculation, type AgentToolPart,
} from '@/lib/agent/tool-presentation';
import { parallelAnalysisResults } from '@/lib/agent/parallel-results';
import { REASONING_EFFORT_LABELS } from '@/lib/chat/model-settings';
import { AI_REASONING_EFFORTS, type AIReasoningEffort } from '@/types';
import { requestBrowserJson } from '@/lib/browser-api';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { useToast } from '@/components/ui/Toast';
import { mentionTypeLabels } from '@/components/chat/mentionStyles';
import { formatAgentToolDuration, getAgentToolState } from './presentation';
import { PrivateAttachmentPreview } from './PrivateAttachments';
import './agent-workspace.css';

type ToolViewProps = { tool: AgentToolPart; runStatus: AgentRunStatus };

const inputText = (tool: AgentToolPart, key: string) => {
    const value = tool.input && typeof tool.input === 'object' ? (tool.input as Record<string, unknown>)[key] : undefined;
    return typeof value === 'string' ? value : null;
};
const latestCompleted = (tools: AgentToolPart[]) => [...tools].reverse().find(tool => tool.status === 'completed');
const hostname = (url: string) => { try { return new URL(url).hostname; } catch { return null; } };

/** Name, measured duration and state of the call a view is showing. Durations are never estimated. */
export function WorkspaceToolMeta({ tool, runStatus, children }: ToolViewProps & { children?: ReactNode }) {
    const state = getAgentToolState(tool, runStatus);
    const measured = typeof tool.durationMs === 'number' && Number.isFinite(tool.durationMs) && tool.durationMs >= 0;
    return <p className="agent-ws-meta">
        <code>{tool.name}</code>
        {measured && <span>{formatAgentToolDuration(tool.durationMs!)}</span>}
        <span data-state={state.status}>{state.label}</span>
        {children}
    </p>;
}

/** Canonical text the tool returned; raw JSON only when a call has no text at all. */
export function WorkspaceTextFallback({ tool, note }: { tool: AgentToolPart; note: string }) {
    const text = getAgentToolText(tool);
    return <div className="agent-ws-fallback">
        <p>{note}</p>
        <div className="agent-result-text" tabIndex={0} aria-label="工具返回文本">
            {text ? <MarkdownContent content={text} /> : <pre>{JSON.stringify(tool.output, null, 2) ?? '工具没有返回内容。'}</pre>}
        </div>
    </div>;
}

/** Running, failed or interrupted calls share one presentation in every view. */
export function WorkspaceToolPending({ tool, runStatus, running }: ToolViewProps & { running: string }) {
    const state = getAgentToolState(tool, runStatus);
    if (state.status === 'failed') return <p className="agent-error" role="alert">{getAgentToolText(tool) ?? '工具执行失败，未返回说明。'}</p>;
    if (state.status === 'interrupted') return <p className="agent-ws-note">任务结束时这一步仍未完成，没有可显示的结果。</p>;
    return <p className="agent-ws-running" role="status"><LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{running}</p>;
}

function CanonicalTextDetails({ tool }: { tool: AgentToolPart }) {
    const text = getAgentToolText(tool);
    if (!text) return null;
    return <details className="agent-ws-canonical">
        <summary>Core 规范文本</summary>
        <div className="agent-result-text" tabIndex={0} aria-label="Core 规范文本"><MarkdownContent content={text} /></div>
    </details>;
}

function DayunTimeline({ data }: { data: Extract<AgentCalculation, { kind: 'bazi_dayun' }>['data'] }) {
    const year = new Date().getFullYear();
    const start = data.起运信息;
    return <>
        <dl className="agent-ws-facts">
            <div><dt>起运</dt><dd>{start.起运详情}（{start.起运年龄} 岁）</dd></div>
            {start.起运时刻 && <div><dt>起运时刻</dt><dd>{start.起运时刻}{start.时区 ? ` · ${start.时区}` : ''}</dd></div>}
            {start.顺逆 && <div><dt>排列</dt><dd>{start.顺逆}</dd></div>}
        </dl>
        <ol className="agent-ws-timeline" aria-label="大运列表">
            {data.大运列表.map((item, index) => {
                const next = data.大运列表[index + 1];
                const current = year >= item.起运年份 && (!next || year < next.起运年份);
                return <li key={item.起运年份} aria-current={current ? 'step' : undefined}>
                    <span className="agent-ws-glyph">{item.干支}</span>
                    <span className="agent-ws-timeline-body">
                        <strong>{item.起运年份}{next ? `–${next.起运年份 - 1}` : ' 起'} · {item.起运年龄 !== undefined ? `${item.起运年龄} 岁` : ''}{current && <em>当前</em>}</strong>
                        <small>天干{item.十神} · 藏干 {item.藏干.map(stem => `${stem.天干}${stem.十神}`).join('、') || '无'}</small>
                    </span>
                </li>;
            })}
        </ol>
    </>;
}

function ResolveCandidates({ data }: { data: Extract<AgentCalculation, { kind: 'bazi_pillars_resolve' }>['data'] }) {
    const rules = data.计算规则 ?? {};
    const range = typeof rules.startYear === 'number' && typeof rules.endYear === 'number' ? `${rules.startYear}–${rules.endYear} 年内` : '计算范围内';
    const pillars = data.原始四柱;
    return <>
        <p className="agent-ws-pillars" aria-label="原始四柱">{[pillars.年柱, pillars.月柱, pillars.日柱, pillars.时柱].map((pillar, index) => <span key={index}>{pillar}</span>)}</p>
        {data.候选列表.length ? <ol className="agent-ws-list" aria-label="候选出生时间">
            {data.候选列表.map(candidate => <li key={candidate.候选序号}>
                <strong>{candidate.公历} {candidate.出生时间}</strong>
                <small>农历 {candidate.农历}{candidate.是否闰月 === '是' ? ' · 闰月' : ''}{candidate.时间区间 ? ` · ${candidate.时间区间.开始} 至 ${candidate.时间区间.结束}（不含）` : ''}</small>
            </li>)}
        </ol> : <p className="agent-ws-note">{range}没有与这组四柱匹配的出生时间。请核对四柱是否抄录正确。</p>}
    </>;
}

function HoroscopeTable({ data }: { data: Extract<AgentCalculation, { kind: 'ziwei_horoscope' }>['data'] }) {
    return <>
        <p className="agent-ws-note">目标日期 {data.基本信息.目标日期} · {data.基本信息.五行局}</p>
        <div className="agent-ws-table-scroll" tabIndex={0} aria-label="运限叠宫">
            <table className="agent-ws-table">
                <thead><tr><th scope="col">层次</th><th scope="col">时间</th><th scope="col">干支</th><th scope="col">落入本命</th><th scope="col">运限四化</th></tr></thead>
                <tbody>{data.运限叠宫.map(layer => <tr key={layer.层次}>
                    <th scope="row">{layer.层次}</th><td>{layer.时间段备注}</td><td>{layer.干支}</td><td>{layer.落入本命宫位}</td><td>{layer.运限四化.join(' ')}</td>
                </tr>)}</tbody>
            </table>
        </div>
        {data.流年星曜 && <dl className="agent-ws-facts">
            {(['吉星分布', '煞星分布', '桃花/文星'] as const).map(key => <div key={key}><dt>{key}</dt><dd>{data.流年星曜![key].join('、') || '无'}</dd></div>)}
        </dl>}
    </>;
}

function FlyingStars({ data }: { data: Extract<AgentCalculation, { kind: 'ziwei_flying_star' }>['data'] }) {
    return <ol className="agent-ws-list" aria-label="飞星查询">
        {data.查询结果.map(result => {
            const flights = result.四化落宫 ?? result.实际飞化;
            return <li key={result.查询序号}>
                <strong>{result.查询类型}{result.发射宫位 ? ` · ${result.发射宫位}${result.发射宫干支 ? `（${result.发射宫干支}）` : ''}` : result.本宫 ? ` · ${result.本宫}` : ''}</strong>
                {flights && <small>{flights.map(flight => `化${flight.四化} → ${flight.宫位 ?? '不入宫'}${flight.星曜 ? ` · ${flight.星曜}` : ''}`).join('；')}</small>}
                {result.矩阵宫位 && <small>对宫 {result.矩阵宫位.对宫} · 三合 {result.矩阵宫位.三合1}、{result.矩阵宫位.三合2}</small>}
                {result.判断目标 && <small>{result.判断目标}：{result.结果 ?? '未判断'}</small>}
            </li>;
        })}
    </ol>;
}

/** 推演: Core results as a timeline, candidate list or table, with Core's canonical text beside it. */
export function CalculationView({ tool, runStatus }: ToolViewProps) {
    const value = getAgentCalculation(tool);
    return <section className="agent-ws-view" aria-label={tool.title}>
        <WorkspaceToolMeta tool={tool} runStatus={runStatus} />
        {tool.status !== 'completed' ? <WorkspaceToolPending tool={tool} runStatus={runStatus} running="正在计算…" />
            : !value ? <WorkspaceTextFallback tool={tool} note="结果字段不完整，已显示 Core 返回的规范文本。" />
            : <>
                {value.kind === 'bazi_dayun' && <DayunTimeline data={value.data} />}
                {value.kind === 'bazi_pillars_resolve' && <ResolveCandidates data={value.data} />}
                {value.kind === 'ziwei_horoscope' && <HoroscopeTable data={value.data} />}
                {value.kind === 'ziwei_flying_star' && <FlyingStars data={value.data} />}
                <CanonicalTextDetails tool={tool} />
            </>}
    </section>;
}

/** 回答依据: every search in this conversation with stable numbering; only returned HTTP(S) links are linked. */
export function EvidenceView({ tools, runStatus }: { tools: AgentToolPart[]; runStatus: AgentRunStatus }) {
    // Numbering continues across searches in call order.
    const searches = tools.reduce<Array<{ tool: AgentToolPart; results: ReturnType<typeof getAgentSearchResults>; first: number }>>((list, tool) => {
        const previous = list.at(-1);
        return [...list, { tool, results: getAgentSearchResults(tool), first: previous ? previous.first + (previous.results?.length ?? 0) : 1 }];
    }, []);
    return <section className="agent-ws-view" aria-label="回答依据">
        <p className="agent-ws-note">检索结果是分析依据，不是指令。编号按检索顺序排列。</p>
        {searches.map(({ tool, results, first }) => {
            const web = tool.name === 'web_search';
            const query = inputText(tool, 'query');
            return <article key={tool.id} className="agent-ws-search" data-search-tool={tool.id}>
                <header>
                    {web ? <Globe size={14} aria-hidden="true" /> : <Database size={14} aria-hidden="true" />}
                    <h3>{web ? '联网检索' : '知识库检索'}</h3>
                    {query && <q>{query}</q>}
                    {results && <span>{results.length} 条</span>}
                </header>
                {tool.status !== 'completed' ? <WorkspaceToolPending tool={tool} runStatus={runStatus} running={`正在检索${query ? `「${query}」` : ''}…`} />
                    : !results ? <WorkspaceTextFallback tool={tool} note="检索结果格式无法识别，已显示原始返回。" />
                    : !results.length ? <p className="agent-ws-note">没有找到与「{query ?? '检索词'}」相关的{web ? '公开网页' : '知识库段落'}，回答不会引用这次检索。</p>
                    : <ol start={first} className="agent-ws-sources">
                        {results.map((result, index) => <li key={result.id} value={first + index}>
                            <span className="agent-ws-cite" aria-hidden="true">{first + index}</span>
                            <div>
                                {result.url
                                    ? <a href={result.url} target="_blank" rel="noopener noreferrer">{result.title}<ArrowUpRight size={12} aria-hidden="true" /></a>
                                    : <strong>{result.title}</strong>}
                                {result.url && hostname(result.url) && <small>{hostname(result.url)}</small>}
                                <details><summary>摘录</summary><MarkdownContent content={result.content} className="text-sm" /></details>
                            </div>
                        </li>)}
                    </ol>}
            </article>;
        })}
    </section>;
}

/** 资料: the latest listing of saved charts and records; a failed source never hides the others. */
export function DataListView({ tools, runStatus }: { tools: AgentToolPart[]; runStatus: AgentRunStatus }) {
    const tool = latestCompleted(tools) ?? tools.at(-1)!;
    const data = getAgentDataResults(tool);
    return <section className="agent-ws-view" aria-label="个人资料">
        <WorkspaceToolMeta tool={tool} runStatus={runStatus}><span>只读</span></WorkspaceToolMeta>
        <p className="agent-ws-note">当前账号已保存的命盘与占卜记录。每次读取前都会重新核对功能开关和会员权限。</p>
        {tool.status !== 'completed' ? <WorkspaceToolPending tool={tool} runStatus={runStatus} running="正在读取资料列表…" />
            : !data ? <WorkspaceTextFallback tool={tool} note="资料列表格式无法识别，已显示原始返回。" />
            : <>
                {data.items.length ? <ul className="agent-ws-list" aria-label="已保存资料">
                    {data.items.map(item => <li key={`${item.type}:${item.id}`}>
                        <strong>{item.name}</strong>
                        <small>{mentionTypeLabels[item.type as keyof typeof mentionTypeLabels] ?? mentionTypeLabels.default} · {item.preview}</small>
                    </li>)}
                </ul> : <p className="agent-ws-note">当前账号还没有已保存的资料。</p>}
                {data.errors.map((error, index) => <p key={index} className="agent-ws-warning"><CircleAlert size={13} aria-hidden="true" />{error}</p>)}
            </>}
    </section>;
}

export function RecordView({ tools, runStatus, onOpenChart }: { tools: AgentToolPart[]; runStatus: AgentRunStatus; onOpenChart?: () => void }) {
    const tool = latestCompleted(tools) ?? tools.at(-1)!;
    const type = inputText(tool, 'type');
    return <section className="agent-ws-view" aria-label="资料记录">
        <WorkspaceToolMeta tool={tool} runStatus={runStatus}>
            {type && <span>{mentionTypeLabels[type as keyof typeof mentionTypeLabels] ?? mentionTypeLabels.default}</span>}
            <span>只读</span>
        </WorkspaceToolMeta>
        {tool.status !== 'completed' ? <WorkspaceToolPending tool={tool} runStatus={runStatus} running="正在读取资料…" />
            : <WorkspaceTextFallback tool={tool} note="资料提供方返回的规范文本：" />}
        {onOpenChart && <button type="button" className="agent-secondary-button" onClick={onOpenChart}>在命盘中查看</button>}
    </section>;
}

export function ProfileView({ tool, runStatus }: ToolViewProps) {
    const profile = getAgentProfile(tool);
    return <section className="agent-ws-view" aria-label="个性化档案">
        <WorkspaceToolMeta tool={tool} runStatus={runStatus}><span>只读</span></WorkspaceToolMeta>
        {tool.status !== 'completed' ? <WorkspaceToolPending tool={tool} runStatus={runStatus} running="正在读取个性化档案…" />
            : !profile ? <WorkspaceTextFallback tool={tool} note="档案格式无法识别，已显示原始返回。" />
            : <dl className="agent-ws-facts">
                <div><dt>身份描述</dt><dd>{profile.identity ?? '未填写'}</dd></div>
                <div><dt>默认八字命盘</dt><dd>{profile.defaultBaziChartId ? '已设置' : '未设置'}</dd></div>
                <div><dt>默认紫微命盘</dt><dd>{profile.defaultZiweiChartId ? '已设置' : '未设置'}</dd></div>
            </dl>}
    </section>;
}

/** Private attachments: how far the Agent has read (8000 characters per call), then the owner's preview. */
export function AttachmentView({ id, tools }: { id: string; tools: AgentToolPart[] }) {
    const reads = tools.flatMap(tool => getAgentAttachmentRead(tool) ?? []);
    const furthest = reads.reduce<number | null>((max, read) => read.readUntil === null ? max : Math.max(max ?? 0, read.readUntil), null);
    const total = reads.findLast(read => read.total !== null)?.total ?? null;
    const note = reads.findLast(read => read.note)?.note;
    return <section className="agent-ws-view" aria-label="对话资料">
        {reads.length > 0 && <p className="agent-ws-note">
            {furthest !== null && total !== null ? <>Agent 已读到第 {furthest.toLocaleString('zh-CN')} 字，共 {total.toLocaleString('zh-CN')} 字。<progress max={total} value={furthest} aria-label="已读位置" /></> : note ?? 'Agent 已查看这份资料。'}
        </p>}
        <PrivateAttachmentPreview key={id} id={id} inline />
    </section>;
}

export function MethodCatalogView({ tool, runStatus }: ToolViewProps) {
    const methods = getAgentMethodCatalog(tool);
    return <section className="agent-ws-view" aria-label="分析方法">
        <WorkspaceToolMeta tool={tool} runStatus={runStatus} />
        {tool.status !== 'completed' ? <WorkspaceToolPending tool={tool} runStatus={runStatus} running="正在读取方法目录…" />
            : !methods ? <WorkspaceTextFallback tool={tool} note="方法目录格式无法识别，已显示原始返回。" />
            : <ul className="agent-ws-list">{methods.map(method => <li key={method.id}><strong>{method.title}<code>{method.version}</code></strong><small>{method.description}</small></li>)}</ul>}
    </section>;
}

/** 解读指引: a built-in, versioned guide. It shapes the reading steps and grants no tools or membership. */
export function MethodView({ tools, runStatus }: { tools: AgentToolPart[]; runStatus: AgentRunStatus }) {
    const tool = latestCompleted(tools) ?? tools.at(-1)!;
    const guide = getAgentMethod(tool);
    return <section className="agent-ws-view" aria-label={guide?.title ?? '解读指引'}>
        <WorkspaceToolMeta tool={tool} runStatus={runStatus}>{guide && <span>版本 {guide.version}</span>}</WorkspaceToolMeta>
        <p className="agent-ws-callout"><Lock size={13} aria-hidden="true" />方法只规定解读步骤；排盘仍由太卜 Core 计算，不增加任何执行权限。</p>
        {tool.status !== 'completed' ? <WorkspaceToolPending tool={tool} runStatus={runStatus} running="正在加载解读指引…" />
            : !guide ? <WorkspaceTextFallback tool={tool} note="指引格式无法识别，已显示原始返回。" />
            : <>
                {guide.whenToUse && <p className="agent-ws-note">适用：{guide.whenToUse}</p>}
                {guide.tools.length > 0 && <p className="agent-ws-chips" aria-label="对应工具">{guide.tools.map(name => <code key={name}>{name}</code>)}</p>}
                <div className="agent-ws-document"><MarkdownContent content={guide.instructions} /></div>
            </>}
    </section>;
}

/** 补充信息: the checklist mirrors the answer panel above the composer, including stored replies. */
export function QuestionView({ tool, runStatus, answer }: ToolViewProps & { answer?: AgentQuestionAnswer }) {
    const questions = getAgentToolQuestions(tool);
    const waiting = getAgentToolState(tool, runStatus).status === 'awaiting_input' && !answer;
    return <section className="agent-ws-view" aria-label="补充信息">
        <p className={waiting ? 'agent-ws-callout' : 'agent-ws-note'}>
            {waiting ? '任务已暂停，在问题面板中回答后继续。' : answer ? '已收到回答，任务按这些信息继续。' : 'Agent 在这一步向你确认信息。'}
        </p>
        <ol className="agent-ws-questions">
            {questions.map(question => {
                const reply = answer?.answers?.[question.id];
                const labels = reply?.map(value => question.options?.find(option => option.id === value)?.label ?? value);
                return <li key={question.id} data-answered={reply === undefined ? 'false' : 'true'}>
                    <MarkdownContent content={question.question} className="text-sm" />
                    {question.options?.length ? <p className="agent-ws-chips">{question.options.map(option => <span key={option.id} data-selected={reply?.includes(option.id) ? 'true' : undefined}>{option.label}</span>)}</p> : null}
                    <small>{reply === null ? '已跳过' : labels?.length ? `回答：${labels.join('、')}` : answer ? '已回答' : waiting ? '待回答' : '未回答'}</small>
                </li>;
            })}
        </ol>
        {answer && !answer.answers && <div className="agent-ws-document"><MarkdownContent content={answer.content} /></div>}
    </section>;
}

const effortLabel = (value?: string) => value === 'off' ? '不推理' : value && (AI_REASONING_EFFORTS as readonly string[]).includes(value) ? `推理 ${REASONING_EFFORT_LABELS[value as AIReasoningEffort]}` : null;

/** 协作: each member's actual model, effort, progress and conclusion; only finished analyses reach the answer. */
export function CollaborationView({ tool, runStatus }: ToolViewProps) {
    const members = parallelAnalysisResults(tool.output);
    const ended = getAgentToolState(tool, runStatus).status === 'interrupted';
    return <section className="agent-ws-view" aria-label="协作分析">
        <WorkspaceToolMeta tool={tool} runStatus={runStatus} />
        <p className="agent-ws-note">只有完整结束的子分析会汇入主回答；子分析不能联网、提问或保存记忆，整项任务只计一次费用。</p>
        {!members.length ? <WorkspaceToolPending tool={tool} runStatus={runStatus} running="正在分派协作成员…" />
            : <div className="agent-ws-members">
                {members.map(member => {
                    const status = member.status === 'completed' ? '已完成' : member.status === 'failed' || tool.status === 'failed' ? '未完成' : ended ? '已结束' : '分析中';
                    return <article key={member.conversationId} className="agent-ws-member" data-status={member.status}>
                        <header>
                            <Users size={14} aria-hidden="true" />
                            <h3>{member.name ?? member.system}</h3>
                            <span>{status}</span>
                        </header>
                        <p className="agent-ws-chips">
                            <span>{member.modelName ?? member.model ?? '主模型'}</span>
                            {effortLabel(member.reasoningEffort) && <span>{effortLabel(member.reasoningEffort)}</span>}
                            <span>{member.system}</span>
                        </p>
                        {member.focus && <p className="agent-ws-note">分工：{member.focus}</p>}
                        {member.answer ? <div className="agent-ws-member-answer"><MarkdownContent content={member.answer} className="chat-prose" /></div>
                            : status === '分析中' && <p className="agent-ws-running" role="status"><LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />正在分析</p>}
                    </article>;
                })}
            </div>}
        {tool.status === 'failed' && <p className="agent-error" role="alert">{getAgentToolText(tool) ?? '协作分析未完成。'}</p>}
    </section>;
}

/** 长期记忆: facts saved from the user's own words, deletable by the owner. */
export function MemoryView({ tools, runStatus, userId }: { tools: AgentToolPart[]; runStatus: AgentRunStatus; userId: string | null }) {
    const { showToast } = useToast();
    const [deleted, setDeleted] = useState<ReadonlySet<string>>(() => new Set());
    const [confirming, setConfirming] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const entries = new Map<string, { memory: NonNullable<ReturnType<typeof getAgentMemories>>[number]; written: boolean }>();
    for (const tool of tools) for (const memory of getAgentMemories(tool) ?? [])
        entries.set(memory.id, { memory, written: tool.name === 'remember_user_fact' || entries.get(memory.id)?.written === true });
    const remove = async (id: string) => {
        if (!userId) return;
        setBusy(id);
        try {
            const result = await requestBrowserJson('/api/user/agent-memory', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Expected-User-Id': userId }, body: JSON.stringify({ id }) });
            // A memory deleted elsewhere is already gone; both outcomes leave it deleted here.
            if (result.error && result.status !== 404) showToast('error', result.error.message || '删除记忆失败');
            else setDeleted(current => new Set(current).add(id));
        } finally {
            setBusy(null);
            setConfirming(null);
        }
    };
    const failed = tools.filter(tool => getAgentToolState(tool, runStatus).status === 'failed');
    const running = tools.find(tool => ['pending', 'running'].includes(getAgentToolState(tool, runStatus).status));
    return <section className="agent-ws-view" aria-label="长期记忆">
        <p className="agent-ws-note">只保存你明确说过的原话，不保存推断。删除后，之后的任务不会再读取它。</p>
        {running && <WorkspaceToolPending tool={running} runStatus={runStatus} running="正在读取或保存记忆…" />}
        {entries.size ? <ul className="agent-ws-list" aria-label="记忆">
            {[...entries.values()].map(({ memory, written }) => <li key={memory.id} data-deleted={deleted.has(memory.id) ? 'true' : undefined}>
                <strong>{memory.title}<small>{memory.kind === 'preference' ? '偏好' : '背景'} · {written ? '本任务记住' : '已读取'}</small></strong>
                <blockquote>{memory.content}</blockquote>
                {deleted.has(memory.id) ? <small>已删除</small> : userId && (confirming === memory.id
                    ? <span className="agent-ws-actions">
                        <button type="button" className="agent-secondary-button" disabled={busy !== null} onClick={() => void remove(memory.id)}>{busy === memory.id ? '正在删除' : '确认删除'}</button>
                        <button type="button" className="agent-secondary-button" disabled={busy !== null} onClick={() => setConfirming(null)}>取消</button>
                    </span>
                    : <button type="button" className="agent-secondary-button" aria-label={`删除记忆：${memory.title}`} onClick={() => setConfirming(memory.id)}><Trash2 size={12} aria-hidden="true" />删除</button>)}
            </li>)}
        </ul> : !running && !failed.length && <p className="agent-ws-note">没有已保存的记忆。</p>}
        {failed.map(tool => <p key={tool.id} className="agent-error" role="alert">{getAgentToolText(tool) ?? '记忆操作失败。'}</p>)}
    </section>;
}

