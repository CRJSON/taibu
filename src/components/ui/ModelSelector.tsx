'use client';

import { useMemo, useEffect, useRef, useState, useId, type ReactNode } from 'react';
import { Check, ChevronDown, Cpu, Plus, Trash2, Users } from 'lucide-react';
import { SoundWaveLoader } from './SoundWaveLoader';
import { FloatingPanel } from './FloatingPanel';
import { getVendorIcon } from '@/lib/ai/vendor-config';
import { DEFAULT_MODEL_ID } from '@/lib/ai/ai-config';
import { useAvailableModels } from '@/lib/hooks/useAvailableModels';
import { CUSTOM_PROVIDER_CHANGED_EVENT, getCustomProvider, getCustomProviderDisplayName } from '@/lib/chat/custom-provider';
import { AI_REASONING_EFFORTS, type AIVendor, type AIReasoningEffort } from '@/types';
import { REASONING_EFFORT_LABELS, type ModelSettingsProps, type AgentCollaborator } from '@/lib/chat/model-settings';
import type { MembershipType } from '@/lib/user/membership';

interface ClientModelConfig {
    id: string; name: string; vendor: AIVendor; supportsReasoning: boolean;
    reasoningEffortFormat?: 'reasoning_object' | 'reasoning_effort' | null;
    isReasoningDefault?: boolean; allowed?: boolean; blockedReason?: string | null; reasoningAllowed?: boolean;
}
interface ModelSelectorProps extends ModelSettingsProps {
    selectedModel?: string; onModelChange?: (modelId: string) => void;
    reasoningEnabled?: boolean; onReasoningChange?: (enabled: boolean) => void;
    userId?: string | null; membershipType?: MembershipType; disabled?: boolean;
    compact?: boolean; toolbarStyle?: boolean; contextDetails?: ReactNode;
}

function ReasoningSelect({ model, reasoning, effort, onChange, label, disabled, levels = true }: {
    model: ClientModelConfig; reasoning: boolean; effort?: AIReasoningEffort | null;
    onChange: (enabled: boolean, effort: AIReasoningEffort | null) => void;
    label: string; disabled?: boolean; levels?: boolean;
}) {
    const allowed = model.supportsReasoning && (model.reasoningAllowed ?? true);
    const effortSupported = levels && !!model.reasoningEffortFormat;
    return <label className="chat-model-setting"><span>{label}</span>
        <select aria-label={label} disabled={disabled || !allowed} value={allowed && reasoning ? (effortSupported ? effort : null) ?? 'default' : 'off'}
            onChange={event => onChange(event.target.value !== 'off', event.target.value === 'off' || event.target.value === 'default' ? null : event.target.value as AIReasoningEffort)}>
            {!model.isReasoningDefault && <option value="off">关闭</option>}
            {!allowed && model.isReasoningDefault && <option value="off">不可用</option>}
            <option value="default">{effortSupported ? '模型默认' : '开启'}</option>
            {effortSupported && AI_REASONING_EFFORTS.map(level => <option key={level} value={level}>{REASONING_EFFORT_LABELS[level]}</option>)}
        </select>
    </label>;
}

export function ModelSelector({ selectedModel = DEFAULT_MODEL_ID, onModelChange, reasoningEnabled = false, onReasoningChange,
    reasoningEffort, onReasoningEffortChange, collaborators = [], onCollaboratorsChange, contextDetails,
    userId, membershipType = 'free', disabled = false, compact = false, toolbarStyle = false }: ModelSelectorProps) {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLButtonElement>(null);
    const menuId = useId();
    const query = useAvailableModels(userId ?? null, { enabled: !!onModelChange, membershipType });
    const models = useMemo(() => (query.data ?? []) as ClientModelConfig[], [query.data]);
    const [custom, setCustom] = useState<ReturnType<typeof getCustomProvider>>(null);
    useEffect(() => {
        const sync = () => setCustom(getCustomProvider()); sync();
        window.addEventListener(CUSTOM_PROVIDER_CHANGED_EVENT, sync); window.addEventListener('storage', sync);
        return () => { window.removeEventListener(CUSTOM_PROVIDER_CHANGED_EVENT, sync); window.removeEventListener('storage', sync); };
    }, []);
    useEffect(() => {
        if (!models.length || !onModelChange) return;
        if (models.some(model => model.id === selectedModel && model.allowed !== false)) return;
        const next = models.find(model => model.allowed !== false);
        if (next && next.id !== selectedModel) onModelChange(next.id);
    }, [models, onModelChange, selectedModel]);
    const current = models.find(model => model.id === selectedModel) ?? models[0];
    const reasoningAllowed = current?.supportsReasoning && (current.reasoningAllowed ?? true);
    useEffect(() => {
        if (!current || !onReasoningChange) return;
        if (!reasoningAllowed) {
            if (reasoningEnabled) onReasoningChange(false);
            if (reasoningEffort) onReasoningEffortChange?.(null);
        } else if (current.isReasoningDefault && !reasoningEnabled) onReasoningChange(true);
    }, [current, reasoningAllowed, reasoningEnabled, reasoningEffort, onReasoningChange, onReasoningEffortChange]);
    if (!onModelChange && !onReasoningChange) return null;
    if (custom && !toolbarStyle) return <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm text-foreground-secondary"><Cpu size={16} /><span>{getCustomProviderDisplayName(custom) || custom.modelId}</span></div>;
    const locked = disabled || query.isLoading || !current;
    const available = models.filter(model => model.allowed !== false);
    const update = (index: number, change: Partial<AgentCollaborator>) => onCollaboratorsChange?.(collaborators.map((member, position) => position === index ? { ...member, ...change } : member));
    const member = (index: number): AgentCollaborator => ({ id: crypto.randomUUID(), name: index === 0 ? '专项分析' : index === 1 ? '独立复核' : `协作 ${index + 1}`,
        model: available[index % available.length]?.id ?? selectedModel, focus: index === 1 ? '独立核对依据、分歧和不确定性' : '',
        reasoning: !!available[index % available.length]?.isReasoningDefault && available[index % available.length]?.reasoningAllowed !== false, reasoningEffort: null });
    return <div className={`flex items-center ${toolbarStyle ? 'chat-model-selector' : ''}`}>
        <button ref={anchorRef} type="button" onClick={() => setOpen(value => !value)} disabled={locked}
            className={`chat-model-picker flex items-center gap-1.5 rounded-xl px-2 transition-colors ${compact ? 'py-1 text-xs' : 'h-9 text-sm'} ${locked ? 'cursor-not-allowed opacity-50' : 'text-foreground-secondary hover:bg-background-secondary hover:text-foreground'}`}
            aria-label={`选择模型：${current?.name ?? '暂无可用模型'}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? menuId : undefined}>
            {query.isLoading ? <SoundWaveLoader variant="inline" /> : current ? getVendorIcon(current.vendor) : <Cpu size={16} />}
            <span className={`chat-model-name truncate ${compact ? 'max-w-[104px]' : 'max-w-[125px]'}`}>{current?.name ?? '暂无可用模型'}</span>
            {!!collaborators.length && <Users size={14} aria-label={`${collaborators.length} 个协作 Agent`} />}
            <ChevronDown size={16} className={open ? 'rotate-180' : undefined} />
        </button>
        <FloatingPanel open={open && !locked} anchorRef={anchorRef} onClose={() => setOpen(false)} id={menuId}
            role="dialog" label="模型与分析设置" side="top" align={toolbarStyle ? 'end' : 'start'} className="chat-model-menu chat-model-settings">
            <div className="chat-model-options" role="menu" aria-label="选择模型" onKeyDown={event => {
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !(event.target instanceof HTMLButtonElement)) return;
                event.preventDefault();
                const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
                const index = items.indexOf(event.target);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                items[next]?.focus();
            }}>
                {models.map(model => <button key={model.id} type="button" role="menuitemradio" aria-checked={selectedModel === model.id}
                    disabled={model.allowed === false} onClick={() => { onModelChange?.(model.id); anchorRef.current?.focus(); setOpen(false); }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${model.allowed === false ? 'cursor-not-allowed opacity-50' : 'hover:bg-background-secondary'} ${selectedModel === model.id ? 'text-accent' : ''}`}>
                    {getVendorIcon(model.vendor)}<span className="min-w-0 flex-1 truncate">{model.name}</span>
                    {selectedModel === model.id && <Check size={15} />}
                    {model.allowed === false && <small>{model.blockedReason ?? '会员限制'}</small>}
                </button>)}
            </div>
            {current && onReasoningChange && <div className="chat-model-section"><ReasoningSelect model={current} reasoning={reasoningEnabled} effort={reasoningEffort}
                disabled={disabled} levels={!!onReasoningEffortChange} label="推理档位" onChange={(enabled, effort) => { onReasoningChange(enabled); onReasoningEffortChange?.(effort); }} />
                {!reasoningAllowed && <p className="chat-model-note">{current.supportsReasoning ? '当前会员不可使用推理。' : '此模型不支持推理。'}</p>}
            </div>}
            {onCollaboratorsChange && <details className="chat-model-section chat-collaboration-settings">
                <summary><Users size={15} />多模型协作<span>{collaborators.length ? `${collaborators.length} 个 Agent` : '关闭'}</span></summary>
                <label className="chat-model-setting"><span>启用协作</span><input type="checkbox" aria-label="启用多模型协作" checked={!!collaborators.length} disabled={disabled || !available.length}
                    onChange={event => onCollaboratorsChange(event.target.checked ? [member(0), member(1)] : [])} /></label>
                {collaborators.map((item, index) => {
                    const selected = models.find(model => model.id === item.model);
                    return <fieldset key={item.id} className="chat-collaborator">
                        <legend>Agent {index + 1}</legend>
                        <div className="chat-collaborator-heading"><input aria-label={`Agent ${index + 1} 名称`} maxLength={60} value={item.name} disabled={disabled} onChange={event => update(index, { name: event.target.value })} />
                            <button type="button" aria-label={`移除 Agent ${index + 1}`} disabled={disabled} onClick={() => onCollaboratorsChange(collaborators.length === 2 ? [] : collaborators.filter((_, position) => position !== index))}><Trash2 size={14} /></button></div>
                        <label className="chat-model-setting"><span>模型</span><select aria-label={`Agent ${index + 1} 模型`} value={item.model} disabled={disabled} onChange={event => {
                            const next = models.find(model => model.id === event.target.value);
                            update(index, { model: event.target.value, reasoning: !!next?.isReasoningDefault && next.reasoningAllowed !== false, reasoningEffort: null });
                        }}>{!selected && <option value={item.model}>模型已不可用</option>}{models.map(model => <option key={model.id} value={model.id} disabled={model.allowed === false}>{model.name}{model.allowed === false ? '（会员限制）' : ''}</option>)}</select></label>
                        {selected && <ReasoningSelect model={selected} reasoning={item.reasoning} effort={item.reasoningEffort} disabled={disabled} label={`Agent ${index + 1} 推理档位`} onChange={(reasoning, reasoningEffort) => update(index, { reasoning, reasoningEffort })} />}
                        <textarea aria-label={`Agent ${index + 1} 分工`} placeholder="分析角度或复核重点" rows={2} maxLength={1200} disabled={disabled} value={item.focus} onChange={event => update(index, { focus: event.target.value })} />
                    </fieldset>;
                })}
                {!!collaborators.length && <button type="button" className="chat-collaborator-add" disabled={disabled || collaborators.length >= 4} onClick={() => onCollaboratorsChange([...collaborators, member(collaborators.length)])}><Plus size={14} />添加 Agent</button>}
                <p className="chat-model-note">主模型汇总各成员的分析，整项任务计一次费用。设置用于下一项任务。</p>
            </details>}
            {contextDetails && <div className="chat-model-section">{contextDetails}</div>}
            {query.error && <p className="chat-model-note text-rose-500">{query.error instanceof Error ? query.error.message : '模型列表加载失败'}</p>}
        </FloatingPanel>
    </div>;
}
