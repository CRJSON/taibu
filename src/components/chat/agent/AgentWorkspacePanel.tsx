'use client';
// 需要 useState/useEffect、拖拽调整宽度与 sessionStorage 恢复标签

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, lazy, Suspense, type ReactNode } from 'react';
import { Files, ListChecks, LoaderCircle, ScanEye, X } from 'lucide-react';
import type { AgentMessageData, AgentPart } from '@/lib/agent/types';
import { getAgentChart, getAgentUnrepresentedArtifacts } from '@/lib/agent/tool-presentation';
import { getAgentChartReference, getLatestChartFocus, parseChartReference } from '@/lib/agent/chart-interaction';
import {
    AGENT_WORKSPACE_SECTIONS, buildAgentWorkspace, getAgentToolQuestionIds, getAgentWorkspaceFollowTarget, resolveAgentWorkspaceLocation,
    type AgentQuestionAnswer, type AgentWorkspaceModel, type AgentWorkspaceResource, type AgentWorkspaceSection,
} from '@/lib/agent/workspace';
import { ChartErrorBoundary } from '@/components/visualization/ChartRenderer';
import { Modal } from '@/components/ui/Modal';
import { AgentToolCard } from './AgentToolCard';
import { getAgentToolState, type AgentArtifact } from './presentation';
import {
    AttachmentView, CalculationView, CollaborationView, DataListView, EvidenceView, MemoryView, MethodCatalogView, MethodView,
    ProfileView, QuestionView, RecordView, WorkspaceTextFallback, WorkspaceToolMeta, WorkspaceToolPending,
} from './AgentWorkspaceViews';
import { WORKSPACE_ICONS, WorkspaceProcessSection, WorkspaceResultsSection, type WorkspaceRunInfo } from './AgentWorkspaceSections';
const ChartPreview = lazy(() => import('./AgentChartPreview').then(module => ({ default: module.AgentChartPreview })));
const InteractiveChart = lazy(() => import('./AgentInteractiveChart').then(module => ({ default: module.AgentInteractiveChart })));

const desktopQuery = '(min-width: 1280px)';
const MAX_TABS = 20;
const SECTION_LABELS: Record<AgentWorkspaceSection, string> = { results: '成果', process: '过程' };
const isSection = (id: string | null): id is AgentWorkspaceSection => id !== null && (AGENT_WORKSPACE_SECTIONS as readonly string[]).includes(id);

function subscribeToViewport(onChange: () => void) {
    const media = window.matchMedia(desktopQuery);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
}

type SavedWorkspace = { tabs: string[]; selected: string | null; followModel: boolean };
function readSavedWorkspace(workspaceKey: string): Partial<SavedWorkspace> {
    try {
        const saved = JSON.parse(sessionStorage.getItem(`taibu.workspace:${workspaceKey}`) ?? 'null');
        if (!saved || typeof saved !== 'object') return {};
        return {
            tabs: Array.isArray(saved.tabs) ? saved.tabs.filter((id: unknown): id is string => typeof id === 'string').slice(0, MAX_TABS) : undefined,
            selected: typeof saved.selected === 'string' ? saved.selected : undefined,
            followModel: typeof saved.followModel === 'boolean' ? saved.followModel : undefined,
        };
    } catch {
        return {};
    }
}

/** One resource's view, chosen by its tool family. Any rendering error falls back to the tool's canonical text. */
function ResourceView({ resource, model, data, answers, questionIds, userId, artifacts, followModel, onManual, onOpen, onChartQuestion }: {
    resource: AgentWorkspaceResource; model: AgentWorkspaceModel; data?: AgentMessageData;
    answers: ReadonlyMap<string, AgentQuestionAnswer>; questionIds: ReadonlyMap<string, string>; userId: string | null;
    artifacts: AgentArtifact[]; followModel: boolean; onManual: () => void; onOpen: (id: string) => void; onChartQuestion?: (text: string) => void;
}) {
    const tools = resource.toolIds.flatMap(id => model.toolsById.get(id) ?? []);
    const latest = tools.at(-1);
    const runStatus = data?.status ?? 'completed';
    let body: ReactNode;
    switch (resource.view) {
        case 'chart': {
            const reading = tools.findLast(tool => getAgentChart(tool));
            const value = reading && getAgentChart(reading);
            const reference = reading ? getAgentChartReference(reading) : null;
            body = value && reading
                ? <Suspense fallback={<p role="status">加载命盘…</p>}>
                    <InteractiveChart key={reference ?? reading.id} value={value} tool={reading} reference={reference}
                        focus={reference ? getLatestChartFocus(model.tools, reference) : null} followModel={followModel} onManual={onManual} onAsk={onChartQuestion} />
                </Suspense>
                : latest && latest.status === 'completed' ? <WorkspaceTextFallback tool={latest} note="命盘数据不完整，已保留工具返回内容。" />
                : latest && <><WorkspaceToolMeta tool={latest} runStatus={runStatus} /><WorkspaceToolPending tool={latest} runStatus={runStatus} running="正在排盘…" /></>;
            break;
        }
        case 'saved': {
            const artifact = artifacts.find(item => 'chart:' + item.id === resource.id);
            body = artifact && <Suspense fallback={<p>加载预览…</p>}>
                <ChartPreview artifact={artifact} tools={model.tools} followModel={followModel} onManual={onManual} onAsk={onChartQuestion} />
            </Suspense>;
            break;
        }
        case 'calculation': body = latest && <CalculationView tool={latest} runStatus={runStatus} />; break;
        case 'evidence': body = <EvidenceView tools={tools} runStatus={runStatus} />; break;
        case 'data': body = <DataListView tools={tools} runStatus={runStatus} />; break;
        case 'record': {
            const reference = parseChartReference(latest?.output && typeof latest.output === 'object' ? (latest.output as { chartReference?: unknown }).chartReference : undefined);
            const chart = reference ? model.chartResources.get(reference.source + ':' + reference.id) : undefined;
            body = <RecordView tools={tools} runStatus={runStatus} onOpenChart={chart ? () => onOpen(chart) : undefined} />;
            break;
        }
        case 'profile': body = latest && <ProfileView tool={latest} runStatus={runStatus} />; break;
        case 'attachment': body = <AttachmentView id={resource.id.slice('attachment:'.length)} tools={tools} />; break;
        case 'methods': body = latest && <MethodCatalogView tool={latest} runStatus={runStatus} />; break;
        case 'method': body = <MethodView tools={tools} runStatus={runStatus} />; break;
        case 'question': {
            const questionId = latest && questionIds.get(latest.id);
            body = latest && <QuestionView tool={latest} runStatus={runStatus} answer={questionId ? answers.get(questionId) : undefined} />;
            break;
        }
        case 'collaboration': body = latest && <CollaborationView tool={latest} runStatus={runStatus} />; break;
        case 'memory': body = <MemoryView tools={tools} runStatus={runStatus} userId={userId} />; break;
        case 'tool': body = latest && <AgentToolCard tool={latest} runStatus={runStatus} fullResult defaultOpen />; break;
    }
    return latest ? <ChartErrorBoundary resetKey={latest} fallback={<WorkspaceTextFallback tool={latest} note="这个视图暂时无法显示，已改为工具返回的规范文本。" />}>{body}</ChartErrorBoundary> : <>{body}</>;
}

export function AgentWorkspacePanel({ parts, artifacts, data, run, attachmentIds, answers, userId, canExport = false, onClose, workspaceKey, requestedResource, onChartQuestion }: {
    workspaceKey: string;
    /** Agent parts of the visible conversation branch, in transcript order. */
    parts: AgentPart[];
    artifacts: AgentArtifact[];
    data?: AgentMessageData;
    run?: WorkspaceRunInfo;
    attachmentIds: string[];
    answers?: ReadonlyMap<string, AgentQuestionAnswer>;
    userId?: string | null;
    canExport?: boolean;
    onClose: () => void;
    requestedResource?: { id: string; version: number };
    onChartQuestion?: (text: string) => void;
}) {
    const desktop = useSyncExternalStore(subscribeToViewport, () => window.matchMedia(desktopQuery).matches, () => false);
    const panelRef = useRef<HTMLElement>(null);
    const dragRef = useRef<{ start: number; width: number } | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(660);
    const model = useMemo(() => buildAgentWorkspace({ parts, artifacts, attachmentIds }), [parts, artifacts, attachmentIds]);
    const questionIds = useMemo(() => getAgentToolQuestionIds(parts), [parts]);
    const resolve = (id: string | null | undefined) => id ? resolveAgentWorkspaceLocation(model, id) : null;
    const [followModel, setFollowModel] = useState(() => !requestedResource && readSavedWorkspace(workspaceKey).followModel !== false);
    const [tabs, setTabs] = useState<string[]>(() => readSavedWorkspace(workspaceKey).tabs ?? []);
    const [selected, setSelected] = useState<string | null>(() => requestedResource ? resolve(requestedResource.id) ?? requestedResource.id : readSavedWorkspace(workspaceKey).selected ?? null);
    const followTarget = getAgentWorkspaceFollowTarget(model);
    const requested = followModel ? followTarget ?? selected : selected;
    const location = resolve(requested) ?? 'results';
    const activeResource = isSection(location) ? undefined : model.resources.find(resource => resource.id === location);
    const section: AgentWorkspaceSection = isSection(location) ? location : 'results';
    const tabIds = [...new Set([...tabs.flatMap(id => resolve(id) ?? []), ...(activeResource ? [activeResource.id] : [])])].filter(id => !isSection(id));
    const visibleTabs = tabIds.flatMap(id => model.resources.find(resource => resource.id === id) ?? []);
    const followTitle = followTarget ? isSection(followTarget) ? SECTION_LABELS[followTarget] : model.resources.find(resource => resource.id === followTarget)?.title : null;

    const open = (id: string) => {
        const target = resolve(id) ?? id;
        setFollowModel(false);
        if (!isSection(target)) setTabs(current => current.includes(target) ? current : [...current.slice(-(MAX_TABS - 1)), target]);
        setSelected(target);
    };
    useEffect(() => {
        if (!requestedResource) return;
        let current = true;
        queueMicrotask(() => { if (current) open(requestedResource.id); });
        return () => { current = false; };
        // A new request version is a new instruction; the resolver reads the current model.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestedResource]);
    useEffect(() => {
        try { sessionStorage.setItem(`taibu.workspace:${workspaceKey}`, JSON.stringify({ tabs, selected: location, followModel } satisfies SavedWorkspace)); } catch { /* Storage may be unavailable. */ }
    }, [tabs, location, followModel, workspaceKey]);
    useEffect(() => {
        const element = scrollRef.current;
        if (!element) return;
        const key = `taibu.workspace-scroll:${workspaceKey}:${location}`;
        try { element.scrollTop = Number(sessionStorage.getItem(key) ?? 0); } catch { /* optional */ }
        const remember = () => { try { sessionStorage.setItem(key, String(element.scrollTop)); } catch { /* optional */ } };
        element.addEventListener('scroll', remember);
        return () => element.removeEventListener('scroll', remember);
    }, [workspaceKey, location]);
    const adjustWidth = (next: number) => setWidth(Math.max(280, Math.min(next, Math.min(780, (panelRef.current?.parentElement?.clientWidth ?? 1040) - 360))));
    // Results count readings once per tab plus saved results that have no reading in this branch.
    const sectionCount = (id: AgentWorkspaceSection) => id === 'process' ? model.tools.length
        : model.resources.filter(resource => resource.view === 'chart' && resource.toolIds.some(toolId => getAgentChart(model.toolsById.get(toolId)!))).length
            + getAgentUnrepresentedArtifacts(model.tools, artifacts).length;
    const running = (resource: AgentWorkspaceResource) => resource.toolIds.some(id => {
        const tool = model.toolsById.get(id);
        return tool !== undefined && ['pending', 'running', 'awaiting_input'].includes(getAgentToolState(tool, data?.status ?? 'completed').status);
    });

    const content = <div className="agent-panel-content">
        <div className="agent-panel-header">
            <div>
                <Files size={16} aria-hidden="true" />
                <h2 id="agent-workspace-heading">任务工作区</h2>
                <span className="agent-ws-subtitle">随任务实时更新</span>
            </div>
            <div className="agent-ws-header-actions">
                <button type="button" className="agent-follow-chart" aria-pressed={followModel} disabled={!followTarget} title={followModel ? '跟随中：显示模型最新调用的工具' : '已暂停跟随'} onClick={() => {
                    if (followModel) setSelected(location);
                    setFollowModel(!followModel);
                }}><ScanEye size={14} aria-hidden="true" />跟随模型</button>
                <button type="button" onClick={onClose} aria-label="关闭任务工作区" className="agent-icon-button"><X size={18} /></button>
            </div>
        </div>
        {followModel && followTitle && <p className="agent-ws-following" role="status">模型正在看：{followTitle}</p>}
        <div className="agent-panel-tabs" role="group" aria-label="工作区内容">
            {AGENT_WORKSPACE_SECTIONS.map(id => {
                const Icon = id === 'results' ? Files : ListChecks;
                return <button key={id} type="button" aria-pressed={!activeResource && section === id} onClick={() => open(id)}>
                    <Icon size={14} aria-hidden="true" />{SECTION_LABELS[id]}<span>{sectionCount(id)}</span>
                </button>;
            })}
        </div>
        {visibleTabs.length > 0 && <div className="agent-resource-tabs" role="tablist" aria-label="资源标签页">{visibleTabs.map((resource, index) => {
            const Icon = WORKSPACE_ICONS[resource.family];
            const selectedTab = activeResource?.id === resource.id;
            return <div key={resource.id} draggable onDragStart={event => event.dataTransfer.setData('text/plain', resource.id)} onDragOver={event => event.preventDefault()} onDrop={event => {
                event.preventDefault();
                const from = event.dataTransfer.getData('text/plain');
                if (!tabs.includes(from)) return;
                setTabs(current => { const next = current.filter(item => item !== from); next.splice(index, 0, from); return next; });
            }}>
                <button type="button" role="tab" aria-selected={selectedTab} tabIndex={selectedTab || (!activeResource && index === 0) ? 0 : -1} onClick={() => open(resource.id)} onKeyDown={event => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? visibleTabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + visibleTabs.length) % visibleTabs.length;
                    if (event.altKey) setTabs(current => {
                        const result = [...current], from = result.indexOf(resource.id), to = result.indexOf(visibleTabs[next].id);
                        if (from >= 0 && to >= 0) [result[from], result[to]] = [result[to], result[from]];
                        return result;
                    });
                    else { open(visibleTabs[next].id); event.currentTarget.closest('[role=tablist]')?.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus(); }
                }}>
                    {running(resource) ? <LoaderCircle size={11} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Icon size={11} aria-hidden="true" />}
                    {resource.title}
                </button>
                <button type="button" aria-label={`关闭${resource.title}标签`} onClick={() => {
                    setFollowModel(false);
                    setTabs(current => current.filter(item => item !== resource.id));
                    if (selectedTab) setSelected(visibleTabs[index - 1]?.id ?? visibleTabs[index + 1]?.id ?? section);
                }}><X size={12} /></button>
            </div>;
        })}</div>}
        <div ref={scrollRef} className="agent-panel-scroll" role={activeResource ? 'tabpanel' : undefined} aria-label={activeResource?.title} data-workspace-view={activeResource?.view ?? section}>
            {activeResource
                ? <ResourceView resource={activeResource} model={model} data={data} answers={answers ?? new Map()} questionIds={questionIds} userId={userId ?? null}
                    artifacts={artifacts} followModel={followModel} onManual={() => { setSelected(activeResource.id); setFollowModel(false); }} onOpen={open} onChartQuestion={onChartQuestion} />
                : section === 'results'
                    ? <WorkspaceResultsSection model={model} artifacts={artifacts} data={data} run={run} onOpen={open} canExport={canExport} />
                    : <WorkspaceProcessSection model={model} data={data} run={run} active={location} onOpen={open} />}
        </div>
    </div>;
    return desktop ? <aside ref={panelRef} id="agent-workspace-panel" className="agent-workspace-panel" style={{ width }} aria-labelledby="agent-workspace-heading">
        <div className="agent-panel-resizer" role="separator" tabIndex={0} aria-label="调整工作区宽度" aria-orientation="vertical" aria-valuenow={width} aria-valuemin={280} aria-valuemax={780}
            onPointerDown={event => { dragRef.current = { start: event.clientX, width: panelRef.current?.getBoundingClientRect().width ?? width }; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={event => { const drag = dragRef.current; if (drag) adjustWidth(drag.width + drag.start - event.clientX); }}
            onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}
            onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); adjustWidth((panelRef.current?.getBoundingClientRect().width ?? width) + (event.key === 'ArrowLeft' ? 24 : -24)); } }} />
        {content}</aside>
        : <Modal open id="agent-workspace-panel" onClose={onClose} className="agent-workspace-dialog" labelledBy="agent-workspace-heading">{content}</Modal>;
}
