/**
 * Chat 主布局：消息区域 + 输入组件
 *
 * 对话侧边栏已合并到全局 Sidebar，此组件仅渲染聊天内容。
 *
 * 'use client' 标记说明：
 * - 使用 React hooks 和交互状态
 */
'use client';

import { useMemo, useRef, useState, useEffect, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { scrollToMessageId } from '@/lib/chat/message-navigation';
import { requestBrowserJson } from '@/lib/browser-api';
import { useToast } from '@/components/ui/Toast';
import { ConversationExportDialog } from './ConversationExportDialog';
import { AgentQueue } from './agent/AgentQueue';
import { AnalysisMethodPicker } from './agent/AnalysisMethodPicker';
import Link from 'next/link';
import { Files, Globe, Lock, Sparkles } from 'lucide-react';
import type { ChatMessage, AttachmentState, Mention, PrivateAttachment } from '@/types';
import { ChatMessageList } from '@/components/chat/ChatMessageList';
import { VirtualizedChatMessageList } from '@/components/chat/VirtualizedChatMessageList';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MobileChatDrawer } from '@/components/chat/MobileChatDrawer';
import { SoundWaveLoader } from '@/components/ui/SoundWaveLoader';
import type { ChatBootstrapKnowledgeBase } from '@/lib/chat/bootstrap';
import type { MembershipType } from '@/lib/user/membership';
import type { ChatMode } from '@/lib/chat/use-chat-state';
import { getSettingsCenterRouteTarget, openSettingsCenter } from '@/lib/settings-center';
import { AgentStatus } from './agent/AgentStatus';
import { AgentHeaderStatus } from './agent/AgentHeaderStatus';
import { AgentWorkspacePanel } from './agent/AgentWorkspacePanel';
import { AgentResultContext } from './agent/AgentResultContext';
import { getAgentUnrepresentedArtifacts } from '@/lib/agent/tool-presentation';
import { getChartResources } from '@/lib/agent/chart-interaction';
import { getAgentQuestionAnswers, getAgentWorkspaceAutoOpenEvent } from '@/lib/agent/workspace';
import { AgentQuestionDialog } from './agent/AgentQuestionDialog';
import { collectAgentArtifacts } from './agent/presentation';
import type { AgentPart } from '@/lib/agent/types';
import { useTranscriptScroll } from '@/lib/chat/use-transcript-scroll';
import { orderAgentMessagesForDisplay } from '@/lib/agent/browser-client';
import { JumpToLatest } from './JumpToLatest';
import { ConversationMinimap } from './ConversationMinimap';
import { useReadingPreferences } from '@/lib/chat/use-reading-preferences';
import type { CSSProperties } from 'react';
import './chat-workspace.css';
import type { ModelSettingsProps } from '@/lib/chat/model-settings';

interface ChatLayoutProps extends ModelSettingsProps {
    agent?: ReturnType<typeof import('@/lib/agent/use-agent-chat').useAgentChat>;
    onQueueMessage?: () => Promise<void>;
    // Active conversation
    activeConversationId: string | null;
    conversationTitle?: string;
    conversationLoading: boolean;
    conversationError?: string | null;

    // Messages
    messages: ChatMessage[];
    isLoading: boolean;
    isSendingToList: boolean;
    messagesEndRef: React.MutableRefObject<HTMLDivElement | null>;
    messageScrollContainerRef: React.MutableRefObject<HTMLDivElement | null>;
    shouldAutoScrollRef: React.MutableRefObject<boolean>;
    onMessageListScroll: () => void;
    // Handlers
    onEditMessage: (messageId: string, newContent: string, nextMentions?: Mention[]) => Promise<void>;
    onRegenerateResponse: (messageId: string) => Promise<void>;
    onSwitchVersion: (messageId: string, versionIndex: number) => void;
    onArchiveMessage?: (message: ChatMessage) => void;
    onSend: () => Promise<void>;
    onStop: () => void;
    onRetryConversationLoad?: () => Promise<void>;

    // Composer props
    inputValue: string;
    onInputChange: (value: string) => void;
    disabled: boolean;
    chatMode: ChatMode;
    onChatModeChange: (mode: ChatMode) => void;
    selectedModel: string;
    onModelChange: (model: string) => void;
    reasoningEnabled: boolean;
    onReasoningChange: (enabled: boolean) => void;
    customProviderActive: boolean;
    customProviderLabel: string | null;
    userId: string | null;
    membershipType: MembershipType;
    attachmentState: AttachmentState;
    onAttachmentChange: (state: AttachmentState) => void;
    mentions: Mention[];
    onMentionsChange: (mentions: Mention[]) => void;
    promptKnowledgeBases: ChatBootstrapKnowledgeBase[];
    dreamContext?: { baziChartName?: string; dailyFortune?: string };
    dreamContextLoading: boolean;
    knowledgeBaseEnabled: boolean;
    aiPersonalizationEnabled: boolean;

    // Credit lock
    isCreditLocked: boolean;
    onAuthRequired?: () => void;

    // Modals (rendered by parent)
    children?: ReactNode;
}

export function ChatLayout(props: ChatLayoutProps) {
    const {
        activeConversationId, conversationLoading,
        conversationError,
        messages, isLoading, isSendingToList,
        messagesEndRef, messageScrollContainerRef, onMessageListScroll,
        onEditMessage, onRegenerateResponse, onSwitchVersion, onArchiveMessage,
        onSend, onStop, onRetryConversationLoad,
        inputValue, onInputChange, disabled,
        chatMode, onChatModeChange,
        selectedModel, onModelChange, reasoningEnabled, onReasoningChange,
        customProviderActive, customProviderLabel,
        userId, membershipType, attachmentState, onAttachmentChange,
        mentions, onMentionsChange, promptKnowledgeBases,
        dreamContext, dreamContextLoading,
        knowledgeBaseEnabled, aiPersonalizationEnabled,
        isCreditLocked,
        onAuthRequired,
        children,
    } = props;

    const contentRef = useRef<HTMLDivElement>(null);
    const greeting = useGreeting();
    const { preferences, update: updatePreferences } = useReadingPreferences(props.userId);
    const workspaceButtonRef = useRef<HTMLButtonElement>(null);
    const [openWorkspaceKey, setOpenWorkspaceKey] = useState<string | null>(null);
    const workspaceKey = `${userId ?? 'anonymous'}:${activeConversationId ?? 'new'}`;
    const [resourceRequest, setResourceRequest] = useState<{ scope: string; id: string; version: number } | null>(null);
    const autoWorkspace = useRef<{ scope: string; action: string | null }>({ scope: '', action: null });
    const openResource = useCallback((id: string) => {
        setResourceRequest(previous => ({ scope: workspaceKey, id, version: (previous?.version ?? 0) + 1 }));
        setOpenWorkspaceKey(workspaceKey);
        try { sessionStorage.setItem(`taibu.workspace-open:${workspaceKey}`, '1'); } catch { /* optional */ }
    }, [workspaceKey]);
    const resultWorkspace = useMemo(() => ({ openResource }), [openResource]);
    useEffect(() => {
        let current = true;
        queueMicrotask(() => {
            if (!current) return;
            try { setOpenWorkspaceKey(sessionStorage.getItem(`taibu.workspace-open:${workspaceKey}`) === '1' ? workspaceKey : null); } catch { setOpenWorkspaceKey(null); }
        });
        return () => { current = false; };
    }, [workspaceKey]);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { showToast } = useToast();
    const targetMessageId = searchParams.get('message');
    const locatedTarget = useRef('');
    useEffect(() => {
        if (!targetMessageId || conversationLoading || !messages.some(message => message.id === targetMessageId)) return;
        const target = `${workspaceKey}:${targetMessageId}`;
        if (locatedTarget.current === target) return;
        const frame = requestAnimationFrame(() => { if (scrollToMessageId(workspaceKey, targetMessageId)) locatedTarget.current = target; });
        return () => cancelAnimationFrame(frame);
    }, [targetMessageId, conversationLoading, messages, workspaceKey]);
    useEffect(() => {
        let current = true;
        const fork = async (event: Event) => {
            if (!activeConversationId || !userId) return;
            const result = await requestBrowserJson<{ conversationId: string }>(`/api/conversations/${activeConversationId}/fork`, { method: 'POST', body: JSON.stringify({ messageId: (event as CustomEvent<string>).detail }) });
            if (!current) return;
            if (result.error || !result.data) showToast('error', result.error?.message ?? '分叉失败');
            else router.push(`/chat?id=${result.data.conversationId}`);
        };
        window.addEventListener('taibu:fork-message', fork);
        return () => { current = false; window.removeEventListener('taibu:fork-message', fork); };
    }, [activeConversationId, userId, router, showToast]);
    const currentRun = props.agent?.run?.conversationId === activeConversationId ? props.agent.run : undefined;
    const transcriptMessages = useMemo(() => {
        const hidden = new Set(currentRun?.queue?.filter(command => command.state === 'pending' || command.state === 'cancelled').map(command => command.message.id));
        return orderAgentMessagesForDisplay(messages.filter(message => !hidden.has(message.id)), currentRun);
    }, [messages, currentRun]);
    const { showJump, jumpToLatest } = useTranscriptScroll({ scrollRef: messageScrollContainerRef, followRef: props.shouldAutoScrollRef, conversationKey: workspaceKey, messages: transcriptMessages, enabled: !conversationLoading && transcriptMessages.length > 0, virtualized: transcriptMessages.length > 20 });
    const latestAgentData = useMemo(() => [...messages].reverse().find(message => message.agent)?.agent, [messages]);
    const artifacts = useMemo(() => collectAgentArtifacts(messages), [messages]);
    const agentParts = useMemo(() => messages.flatMap(message => message.agent?.parts ?? []), [messages]);
    const historyTools = useMemo(() => agentParts.filter((part): part is Extract<AgentPart, { type: 'tool' }> => part.type === 'tool'), [agentParts]);
    const questionAnswers = useMemo(() => getAgentQuestionAnswers(messages), [messages]);
    const attachmentIds = useMemo(() => [...new Set(messages.flatMap(message => message.attachments?.ids ?? []))], [messages]);
    const draftScope = useRef(workspaceKey);
    useEffect(() => { draftScope.current = workspaceKey; }, [workspaceKey]);
    const restoreDraft = async (message: ChatMessage) => {
        const ownerScope = workspaceKey;
        const restored: PrivateAttachment[] = [];
        for (const id of message.attachments?.ids ?? []) {
            const response = await requestBrowserJson<{ attachment: PrivateAttachment }>(`/api/agent/attachments/${id}`);
            if (draftScope.current !== ownerScope) return;
            if (!response.data?.attachment) { showToast('error', '部分资料无法恢复，请重新添加'); continue; }
            restored.push(response.data.attachment);
        }
        if (draftScope.current !== ownerScope) return;
        const merged = [...new Map([...(attachmentState.uploaded ?? []), ...restored].map(item => [item.id, item])).values()];
        if (merged.length > 12 || merged.filter(item => item.kind === 'image').length > 4) { showToast('error', '请先移除部分草稿资料再恢复'); return; }
        onAttachmentChange({ ...attachmentState, uploaded: merged });
        onInputChange(inputValue.trim() ? `${inputValue}\n\n${message.content}` : message.content);
    };
    const isAgentMode = props.agent?.mode === 'agent';
    const waitingQuestion = userId && props.agent?.run?.conversationId === activeConversationId && props.agent.run.status === 'awaiting_input'
        ? [...props.agent.run.message.agent?.parts ?? []].reverse().find((part): part is Extract<AgentPart, { type: 'question' }> => part.type === 'question') : undefined;
    const hasWorkspace = isAgentMode || Boolean(latestAgentData);
    const workspaceOpen = hasWorkspace && openWorkspaceKey === workspaceKey;
    const chartCount = getChartResources(historyTools).length;
    const resultCount = chartCount + getAgentUnrepresentedArtifacts(historyTools, artifacts).length;
    const closeWorkspace = () => {
        const previous = document.activeElement;
        setOpenWorkspaceKey(null);
        setResourceRequest(null);
        try { sessionStorage.removeItem(`taibu.workspace-open:${workspaceKey}`); if (currentRun) sessionStorage.setItem('taibu.workspace-dismissed:' + workspaceKey, currentRun.id); } catch { /* optional */ }
        requestAnimationFrame(() => {
            const active = document.activeElement;
            if (!active || active === document.body || active === previous) workspaceButtonRef.current?.focus();
        });
    };
    // Chart readings, questions and collaborations open the panel on desktop until it is closed for this task.
    const autoOpenEvent = getAgentWorkspaceAutoOpenEvent(currentRun?.message.agent?.parts ?? []);
    const workspaceRun = currentRun && currentRun.id === latestAgentData?.runId ? { billing: currentRun.billing, configuration: currentRun.configuration } : undefined;
    useEffect(() => {
        const action = autoOpenEvent;
        if (autoWorkspace.current.scope !== workspaceKey) { autoWorkspace.current = { scope: workspaceKey, action }; return; }
        if (!action || autoWorkspace.current.action === action || !currentRun || props.agent?.restoring) return;
        autoWorkspace.current.action = action;
        if (!window.matchMedia('(min-width: 1280px)').matches) return;
        try { if (sessionStorage.getItem('taibu.workspace-dismissed:' + workspaceKey) === currentRun.id) return; } catch { /* optional */ }
        queueMicrotask(() => {
            if (autoWorkspace.current.scope !== workspaceKey) return;
            setOpenWorkspaceKey(workspaceKey);
            try { sessionStorage.setItem('taibu.workspace-open:' + workspaceKey, '1'); } catch { /* optional */ }
        });
    }, [autoOpenEvent, currentRun, props.agent?.restoring, workspaceKey]);
    const title = props.conversationTitle || messages.find(message => message.role === 'user')?.content.slice(0, 60) || (isAgentMode ? '新任务' : '新对话');
    const suggest = (text: string) => {
        onInputChange(text);
        requestAnimationFrame(() => contentRef.current?.querySelector<HTMLTextAreaElement>('[data-chat-composer] textarea')?.focus());
    };
    const askAboutChart = (text: string) => {
        const scope = workspaceKey;
        onInputChange(inputValue.trim() ? inputValue + '\n\n' + text : text);
        if (!window.matchMedia('(min-width: 1280px)').matches) closeWorkspace();
        requestAnimationFrame(() => {
            if (draftScope.current === scope) contentRef.current?.querySelector<HTMLTextAreaElement>('[data-chat-composer] textarea')?.focus();
        });
    };
    // Mode and web search sit with the composer; the task status lives in the header.
    const taskControls = props.agent && (
        <div data-agent-ready={!props.agent.restoring && !props.agent.syncing} className="chat-task-toolbar">
            <div className="chat-mode-switch" role="group" aria-label="对话方式">
                <button type="button" aria-pressed={isAgentMode} disabled={!props.agent.capabilities.ready || props.agent.active} onClick={() => props.agent?.setMode('agent')}>Agent</button>
                <button type="button" aria-pressed={props.agent.mode === 'plain'} disabled={props.agent.active} onClick={() => props.agent?.setMode('plain')}>普通对话</button>
            </div>
            {isAgentMode && <label className="chat-web-switch" title={!props.agent.capabilities.webAvailable ? '当前环境未配置联网搜索' : membershipType === 'free' ? '联网搜索需要 Plus 会员' : props.agent.active ? '下个独立任务使用此配置' : 'Agent 会在需要时搜索网络'}><Globe size={14} aria-hidden="true" /><span>{props.agent.active ? '下次联网' : '按需联网'}</span><input type="checkbox" aria-label="按需联网" checked={props.agent.webEnabled && props.agent.capabilities.webAvailable && membershipType !== 'free'} disabled={!props.agent.capabilities.webAvailable || membershipType === 'free'} onChange={e => props.agent?.setWebEnabled(e.target.checked)} /></label>}
            {props.agent.active ? <span className="chat-task-note" role="status">{props.agent.reconnecting ? '正在重新连接任务' : props.agent.run?.status === 'awaiting_input' ? '补充信息后继续同一任务' : '后台执行中，离开页面后仍会继续'}</span> : !props.agent.capabilities.ready && userId ? <span className="chat-task-note">后台任务暂不可用，可使用普通对话</span> : null}
        </div>
    );
    const composerProps = {
        draftKey: workspaceKey,
        reasoningEffort: props.reasoningEffort, onReasoningEffortChange: props.onReasoningEffortChange,
        collaborators: props.collaborators, onCollaboratorsChange: props.onCollaboratorsChange,
        agentMode: isAgentMode,
        agentRuntime: (props.agent?.run?.conversationId === activeConversationId ? props.agent.run.message.agent?.runtime : undefined) ?? latestAgentData?.runtime,
        awaitingInput: props.agent?.run?.status === 'awaiting_input',
        allowDuringRun: props.agent?.active,
        onQueueMessage: props.onQueueMessage,
        inputValue, isLoading, isSendingToList,
        onInputChange, onSend, onStop, onAuthRequired, disabled,
        chatMode, onChatModeChange,
        selectedModel, onModelChange, reasoningEnabled, onReasoningChange,
        customProviderActive, customProviderLabel,
        userId, membershipType, attachmentState, onAttachmentChange,
        mentions, onMentionsChange, promptKnowledgeBases,
        contextMessages: messages,
        dreamContext, dreamContextLoading,
        knowledgeBaseEnabled,
    };

    return (
        <AgentResultContext.Provider value={resultWorkspace}><div className="chat-workspace flex bg-background" style={{ '--chat-column': `${preferences.width}px` } as CSSProperties}>
            {/* 移动端对话抽屉 */}
            <MobileChatDrawer />

            <div ref={contentRef} className="chat-main flex-1 flex flex-col min-w-0 min-h-0 relative bg-background">
                <ChatHeader
                    title={title}
                    badge={isAgentMode ? 'Agent' : undefined}
                    status={currentRun ? <AgentHeaderStatus status={currentRun.status} createdAt={currentRun.createdAt} reconnecting={props.agent?.reconnecting} />
                        : isAgentMode && latestAgentData ? <AgentStatus status={latestAgentData.status} /> : null}
                    membershipType={membershipType}
                    knowledgeBaseEnabled={knowledgeBaseEnabled}
                    aiPersonalizationEnabled={aiPersonalizationEnabled}
                >
                    {activeConversationId && <ConversationExportDialog conversationId={activeConversationId} />}
                    <label className="chat-reading-width" title="调整阅读宽度"><span>列宽</span><input type="range" aria-label="阅读列宽" min="560" max="1200" step="20" value={preferences.width} onChange={event => updatePreferences({ width: Number(event.target.value) })} /></label>
                    {hasWorkspace && <button type="button" ref={workspaceButtonRef} className="chat-workspace-toggle" aria-label="任务工作区" aria-expanded={workspaceOpen} aria-controls="agent-workspace-panel" onClick={() => {
                        if (workspaceOpen) closeWorkspace();
                        else { setOpenWorkspaceKey(workspaceKey); try { sessionStorage.setItem(`taibu.workspace-open:${workspaceKey}`, '1'); sessionStorage.removeItem('taibu.workspace-dismissed:' + workspaceKey); } catch { /* optional */ } }
                    }}>
                        <Files size={16} aria-hidden="true" /><span>工作区</span>{resultCount > 0 && <span className="chat-result-count">{resultCount}</span>}
                    </button>}
                </ChatHeader>

                {waitingQuestion && props.agent && <AgentQuestionDialog key={`${workspaceKey}:${props.agent.run?.id}:${waitingQuestion.id}`} question={waitingQuestion.question} questions={waitingQuestion.questions} questionId={waitingQuestion.id} scopeKey={`${workspaceKey}:${props.agent.run?.id}`} attachmentState={attachmentState} onAttachmentChange={onAttachmentChange} onAnswer={async (answer, answers) => { await props.agent!.sendCommand(answer, false, { questionId: waitingQuestion.id, answers }); onAttachmentChange({ ...attachmentState, uploaded: undefined }); }} onStop={props.agent.stop} disabled={props.agent.restoring || props.agent.syncing} />}

                {conversationError ? (
                    <div className="border-b border-[#ead9bf] bg-[#fcf8ee] px-4 py-3 text-sm text-[#946c21]">
                        <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 flex-1">{conversationError}</span>
                            {onRetryConversationLoad ? (
                                <button
                                    type="button"
                                    onClick={() => void onRetryConversationLoad()}
                                    className="shrink-0 rounded-md px-2 py-1 font-medium text-[#7c5f1c] transition-colors hover:bg-[#f4ead3]"
                                >
                                    重试
                                </button>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                {conversationLoading ? (
                    <SoundWaveLoader variant="block" text="" />
                ) : messages.length === 0 ? (
                    <div className="chat-empty-state">
                        <div className="chat-empty-intro">
                            <span className="chat-empty-symbol" aria-hidden="true">卜</span>
                            <h2>{greeting}，想问些什么？</h2>
                            <p>{isAgentMode ? '描述你关心的事，太卜会排盘、查阅资料，并在右侧工作区展示每一步。' : '聊聊命盘、运势，或最近让你困惑的事。'}</p>
                        </div>
                        {isCreditLocked && (
                            <CreditLockBanner />
                        )}
                        <div className="chat-empty-composer">
                            {taskControls}
                            <ChatComposer {...composerProps} hideDisclaimer />
                        </div>
                        {isAgentMode && <section className="chat-suggestions" aria-label="任务建议">
                            <h3>可以这样开始</h3>
                            <div>{AGENT_SUGGESTIONS.map(item => <button key={item.title} type="button" disabled={disabled} onClick={() => suggest(item.prompt)}>
                                <strong>{item.title}</strong><span>{item.description}</span>
                            </button>)}</div>
                        </section>}
                        {isAgentMode && <p className="chat-empty-note">任务在后台执行，关闭页面不会中断，完成后会提醒你 · 平台模型每个任务计 1 次积分</p>}
                    </div>
                ) : (
                    <>
                        {transcriptMessages.length > 20 ? (
                            <div className="chat-transcript-virtual flex-1 min-h-0 relative bg-background">
                                <VirtualizedChatMessageList
                                    scrollContainerRef={messageScrollContainerRef}
                                    messages={transcriptMessages} isLoading={isLoading || isSendingToList}
                                    onEditMessage={onEditMessage} onRegenerateResponse={onRegenerateResponse}
                                    onSwitchVersion={onSwitchVersion}
                                    onArchiveMessage={activeConversationId ? onArchiveMessage : undefined}
                                    disabled={isCreditLocked || props.agent?.restoring || props.agent?.syncing}
                                />
                            </div>
                        ) : (
                            <div ref={messageScrollContainerRef} onScroll={onMessageListScroll} aria-label="聊天记录" tabIndex={0} className="chat-transcript-scroll flex-1 min-h-0 overflow-y-auto relative bg-background">
                                <ChatMessageList
                                    messages={transcriptMessages} isLoading={isLoading || isSendingToList} messagesEndRef={messagesEndRef}
                                    onEditMessage={onEditMessage} onRegenerateResponse={onRegenerateResponse}
                                    onSwitchVersion={onSwitchVersion}
                                    onArchiveMessage={activeConversationId ? onArchiveMessage : undefined}
                                    disabled={isCreditLocked || props.agent?.restoring || props.agent?.syncing}
                                />
                            </div>
                        )}
                        {showJump && <div className="chat-jump-dock"><JumpToLatest onClick={jumpToLatest} /></div>}
                        <ConversationMinimap messages={transcriptMessages} conversationKey={workspaceKey} />
                        {isCreditLocked && (
                            <CreditLockBanner inline />
                        )}
                        <div className="chat-composer-stack">
                            {taskControls}
                            {currentRun && <AgentQueue key={`${workspaceKey}:${currentRun.id}`} run={currentRun} restoreDraft={message => void restoreDraft(message)} />}
                        </div>
                        <ChatComposer {...composerProps} />
                    </>
                )}
            </div>
            {workspaceOpen && <AgentWorkspacePanel key={workspaceKey} workspaceKey={workspaceKey} parts={agentParts} artifacts={artifacts} attachmentIds={attachmentIds}
                data={latestAgentData} run={workspaceRun} answers={questionAnswers} userId={userId} canExport={Boolean(activeConversationId)}
                onClose={closeWorkspace} onChartQuestion={askAboutChart} requestedResource={resourceRequest?.scope === workspaceKey ? resourceRequest : undefined} />}

            {children}
            <AnalysisMethodPicker onSelect={text => onInputChange(inputValue.trim() ? `${inputValue}\n${text}` : text)} />
        </div></AgentResultContext.Provider>
    );
}

const AGENT_SUGGESTIONS = [
    { title: '了解我的命盘', description: '读取已存命盘，分析性格与优势；资料不足会先问你', prompt: '请先查看我保存的命盘，帮我分析性格与优势。资料不足时请向我询问。' },
    { title: '对比两份命盘', description: '合盘看相处方式与互补，缺对方信息时会询问', prompt: '请对比我保存的两份命盘，分析相处中的特点。信息不足时先询问我。' },
    { title: '看看明年的工作方向', description: '排大运与流年，判断变动时机', prompt: '请结合我的命盘，排大运与流年，分析明年的工作方向和变动时机。需要出生信息时先询问我。' },
    { title: '挑一个好日子', description: '结合黄历与你的命盘，选日期和时辰', prompt: '请结合黄历和我的命盘，帮我挑一个适合签约的日子和时辰。需要信息时先询问我。' },
] as const;

function subscribeToHour(onChange: () => void) {
    const timer = window.setInterval(onChange, 60_000);
    return () => window.clearInterval(timer);
}
/** Time-of-day greeting; the server renders a neutral one so hydration matches. */
function useGreeting() {
    const hour = useSyncExternalStore(subscribeToHour, () => new Date().getHours(), () => -1);
    return hour < 0 ? '你好' : hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
}

function CreditLockBanner({ inline }: { inline?: boolean }) {
    const wrapperClass = inline
        ? 'px-4 py-3 bg-amber-500/10 border-t border-amber-500/20'
        : 'w-full max-w-3xl mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl';
    return (
        <div className={wrapperClass}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-amber-600">
                    <Lock className="w-4 h-4" />
                    <span className="text-sm">积分已用完</span>
                </div>
                <Link
                    href={getSettingsCenterRouteTarget('upgrade')}
                    onClick={(event) => {
                        event.preventDefault();
                        openSettingsCenter('upgrade');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-on-accent rounded-lg text-sm hover:bg-accent/90 transition-colors"
                >
                    <Sparkles className="w-3.5 h-3.5" />
                    获取积分
                </Link>
            </div>
        </div>
    );
}
