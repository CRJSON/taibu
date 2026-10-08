'use client';

import { useEffect, useRef, useState, useSyncExternalStore, lazy, Suspense } from 'react';
import { ArrowUpRight, Files, Globe, ListChecks, X } from 'lucide-react';
import type { AgentMessageData, AgentPart } from '@/lib/agent/types';
import { AgentArtifactCard } from './AgentArtifactCard';
import { AgentStatus } from './AgentStatus';
import { AgentActivityGroup, AgentActivityIndicator } from './AgentActivityGroup';
import { getAgentArtifactHref, type AgentArtifact } from './presentation';
import { Modal } from '@/components/ui/Modal';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { AgentToolCard } from './AgentToolCard';
import { PrivateAttachmentPreview } from './PrivateAttachments';
import { getAgentChart, getAgentUnrepresentedArtifacts, isAgentChartTool } from '@/lib/agent/tool-presentation';
const ChartPreview = lazy(() => import('./AgentChartPreview').then(module => ({ default: module.AgentChartPreview })));

const desktopQuery = '(min-width: 1280px)';
function subscribeToViewport(onChange: () => void) {
    const media = window.matchMedia(desktopQuery);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
}

export function AgentWorkspacePanel({ artifacts, sources, data, historyTools, attachmentIds, onClose, workspaceKey, requestedResource }: {
    workspaceKey: string;
    artifacts: AgentArtifact[];
    sources: Extract<AgentPart, { type: 'source' }>[];
    data?: AgentMessageData;
    historyTools: Extract<AgentPart, { type: 'tool' }>[];
    attachmentIds: string[];
    onClose: () => void;
    requestedResource?: { id: string; version: number };
}) {
    const desktop = useSyncExternalStore(subscribeToViewport,
        () => window.matchMedia(desktopQuery).matches, () => false);
    const panelRef = useRef<HTMLElement>(null);
    const dragRef = useRef<{ start: number; width: number } | null>(null);
    const [width, setWidth] = useState(324);
    const [section, setSection] = useState<'results' | 'activity'>('results');
    const [tabs, setTabs] = useState<string[]>(() => {
        try { const saved = JSON.parse(sessionStorage.getItem(`taibu.workspace:${workspaceKey}`) ?? 'null'); return Array.isArray(saved?.tabs) ? saved.tabs.filter((id: unknown): id is string => typeof id === 'string').slice(0, 20) : []; } catch { return []; }
    });
    const [selected, setSelected] = useState<string | null>(() => {
        if (requestedResource) return requestedResource.id;
        try { return JSON.parse(sessionStorage.getItem(`taibu.workspace:${workspaceKey}`) ?? 'null')?.selected ?? null; } catch { return null; }
    });
    const scrollRef = useRef<HTMLDivElement>(null);
    const tools = historyTools;
    const charts = tools.filter(tool => tool.status === 'completed' && isAgentChartTool(tool.name));
    const savedOnlyArtifacts = getAgentUnrepresentedArtifacts(tools, artifacts);
    const resources = [
        ...artifacts.map(artifact => ({ id: `chart:${artifact.id}`, title: artifact.title, body: <Suspense fallback={<p>加载预览…</p>}><ChartPreview artifact={artifact} tools={tools} /></Suspense> })),
        ...sources.map(source => ({ id: `source:${source.id}`, title: source.title || '来源', body: <><a href={source.url} target="_blank" rel="noopener noreferrer" className="agent-source-link">打开原始来源 <ArrowUpRight size={14} /></a><MarkdownContent content={source.content || '此来源未提供摘要。'} /></> })),
        ...tools.map(tool => ({ id: `tool:${tool.id}`, title: getAgentChart(tool)?.title ?? tool.title, body: <AgentToolCard tool={tool} runStatus={data?.status ?? 'completed'} fullResult /> })),
        ...attachmentIds.map((id, index) => ({ id: `attachment:${id}`, title: `资料 ${index + 1}`, body: <PrivateAttachmentPreview key={id} id={id} inline /> })),
    ];
    const visibleTabs = tabs.filter(id => resources.some(resource => resource.id === id));
    const activeResource = resources.find(resource => resource.id === selected);
    const openResource = (id: string) => { setTabs(current => current.includes(id) ? current : [...current.slice(-19), id]); setSelected(id); };
    useEffect(() => {
        if (!requestedResource) return;
        let current = true;
        queueMicrotask(() => {
            if (!current) return;
            setTabs(tabs => tabs.includes(requestedResource.id) ? tabs : [...tabs.slice(-19), requestedResource.id]);
            setSelected(requestedResource.id);
        });
        return () => { current = false; };
    }, [requestedResource]);
    useEffect(() => { try { sessionStorage.setItem(`taibu.workspace:${workspaceKey}`, JSON.stringify({ tabs, selected })); } catch { /* Storage may be unavailable. */ } }, [tabs, selected, workspaceKey]);
    useEffect(() => {
        const element = scrollRef.current;
        if (!element) return;
        const key = `taibu.workspace-scroll:${workspaceKey}:${selected ?? section}`;
        try { element.scrollTop = Number(sessionStorage.getItem(key) ?? 0); } catch { /* optional */ }
        const remember = () => { try { sessionStorage.setItem(key, String(element.scrollTop)); } catch { /* optional */ } };
        element.addEventListener('scroll', remember);
        return () => element.removeEventListener('scroll', remember);
    }, [workspaceKey, selected, section]);
    const adjustWidth = (next: number) => setWidth(Math.max(280, Math.min(next, Math.min(520, (panelRef.current?.parentElement?.clientWidth ?? 1040) - 480))));

    const content = <div className="agent-panel-content">
        <div className="agent-panel-header">
            <div><Files size={16} /><h2 id="agent-workspace-heading">任务工作区</h2></div>
            <button type="button" onClick={onClose} aria-label="关闭任务工作区" className="agent-icon-button"><X size={18} /></button>
        </div>
        <div className="agent-panel-tabs" role="group" aria-label="工作区内容">
            <button type="button" aria-pressed={!activeResource && section === 'results'} onClick={() => { setSection('results'); setSelected(null); }}><Files size={14} />成果<span>{charts.length + savedOnlyArtifacts.length}</span></button>
            <button type="button" aria-pressed={!activeResource && section === 'activity'} onClick={() => { setSection('activity'); setSelected(null); }}><ListChecks size={14} />过程<span>{tools.length}</span></button>
        </div>
        {visibleTabs.length > 0 && <div className="agent-resource-tabs" role="tablist" aria-label="资源标签页">{visibleTabs.map((id, index) => {
            const resource = resources.find(item => item.id === id);
            if (!resource) return null;
            return <div key={id} draggable onDragStart={event => event.dataTransfer.setData('text/plain', id)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const from = event.dataTransfer.getData('text/plain'); if (!tabs.includes(from)) return; setTabs(current => { const next = current.filter(item => item !== from); next.splice(index, 0, from); return next; }); }}>
                <button type="button" role="tab" aria-selected={selected === id} tabIndex={selected === id || (!activeResource && index === 0) ? 0 : -1} onClick={() => setSelected(id)} onKeyDown={event => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? visibleTabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + visibleTabs.length) % visibleTabs.length;
                    if (event.altKey) setTabs(current => { const result = [...current]; const from = result.indexOf(id); const to = result.indexOf(visibleTabs[next]); [result[from], result[to]] = [result[to], result[from]]; return result; });
                    else { setSelected(visibleTabs[next]); (event.currentTarget.closest('[role=tablist]')?.querySelectorAll<HTMLElement>('[role=tab]')[next])?.focus(); }
                }}>{resource.title}</button><button type="button" aria-label={`关闭${resource.title}标签`} onClick={() => { setTabs(current => current.filter(item => item !== id)); if (selected === id) setSelected(visibleTabs[index - 1] ?? visibleTabs[index + 1] ?? null); }}><X size={12} /></button>
            </div>;
        })}</div>}
        <div ref={scrollRef} className="agent-panel-scroll" role={activeResource ? 'tabpanel' : undefined} aria-label={activeResource?.title}>
            {activeResource ? activeResource.body : section === 'results' ? <>
                <p className="agent-panel-description">本次对话的命盘与来源。分析和任务过程保留在聊天中。</p>
                {charts.length > 0 && <div className="agent-panel-artifacts">{charts.map(tool => <button type="button" key={tool.id} className="agent-workspace-chart-link" onClick={() => openResource(`tool:${tool.id}`)}><span>{getAgentChart(tool)?.title ?? tool.title}</span><small>{getAgentChart(tool)?.summary ?? '查看工具返回内容'}</small><ArrowUpRight size={14} /></button>)}</div>}
                {savedOnlyArtifacts.length ? <div className="agent-panel-artifacts">
                    {savedOnlyArtifacts.map(artifact => <div key={getAgentArtifactHref(artifact)}><AgentArtifactCard artifact={artifact} /><button type="button" className="agent-secondary-button mt-2" onClick={() => openResource(`chart:${artifact.id}`)}>预览命盘</button></div>)}
                </div> : !charts.length && <div className="agent-panel-empty"><Files size={28} /><h3>还没有成果</h3><p>任务生成的命盘会显示在这里。</p></div>}
                {sources.length > 0 && <section className="agent-panel-sources">
                    <h3>参考来源 <span>{sources.length}</span></h3>
                    {sources.map(source => <button type="button" key={source.url} onClick={() => openResource(`source:${source.id}`)} className="agent-source-link py-2"><Globe size={14} /><span>{source.title || source.url}</span><ArrowUpRight size={12} /></button>)}
                </section>}
                {attachmentIds.length > 0 && <section className="agent-panel-sources"><h3>对话资料 <span>{attachmentIds.length}</span></h3>{attachmentIds.map((id, index) => <button key={id} type="button" className="agent-secondary-button mr-2 mb-2" onClick={() => openResource(`attachment:${id}`)}>资料 {index + 1}</button>)}</section>}
            </> : <>
                {data && <div className="agent-panel-run-status"><AgentStatus status={data.status} /><span>最近任务</span></div>}
                <p className="agent-panel-description">展开步骤，查看调用参数与工具结果。</p>
                {tools.map(tool => <button type="button" key={tool.id} className="agent-secondary-button mr-2 mb-2" onClick={() => openResource(`tool:${tool.id}`)}>{tool.title}</button>)}
                {tools.length && data ? <AgentActivityGroup key={data.runId} parts={data.parts.filter(part => part.type === 'tool' || part.type === 'reasoning' || part.type === 'question')} data={data} active />
                    : <div className="agent-panel-empty"><ListChecks size={28} /><h3>尚未调用工具</h3><p>Agent 会根据问题决定需要哪些步骤。</p></div>}
                {data?.error && <p className="agent-error" role="alert">{data.error}</p>}
                {data && <AgentActivityIndicator data={data} />}
            </>}
        </div>
    </div>;
    return desktop ? <aside ref={panelRef} id="agent-workspace-panel" className="agent-workspace-panel" style={{ width }} aria-labelledby="agent-workspace-heading">
        <div className="agent-panel-resizer" role="separator" tabIndex={0} aria-label="调整工作区宽度" aria-orientation="vertical" aria-valuenow={width} aria-valuemin={280} aria-valuemax={520}
            onPointerDown={event => { dragRef.current = { start: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={event => { const drag = dragRef.current; if (drag) adjustWidth(drag.width + drag.start - event.clientX); }}
            onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}
            onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); adjustWidth(width + (event.key === 'ArrowLeft' ? 24 : -24)); } }} />
        {content}</aside>
        : <Modal open id="agent-workspace-panel" onClose={onClose} className="agent-workspace-dialog" labelledBy="agent-workspace-heading">{content}</Modal>;
}
