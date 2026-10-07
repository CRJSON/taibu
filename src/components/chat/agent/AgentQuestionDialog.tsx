'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CircleHelp, LoaderCircle, X } from 'lucide-react';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { Modal } from '@/components/ui/Modal';
import { normalizeQuestions, validateAnswers, formatQuestionAnswers, type AgentQuestion, type AgentAnswers } from '@/lib/agent/questions';
import type { AttachmentState } from '@/types';
import { usePrivateAttachments } from '@/lib/chat/use-private-attachments';
import { PrivateAttachments } from './PrivateAttachments';
type Draft = { answers: AgentAnswers; custom: Record<string, string> };
export function AgentQuestionDialog({ question, questions: supplied, questionId, scopeKey, onAnswer, onStop, disabled, attachmentState, onAttachmentChange }: {
    question: string; questions?: AgentQuestion[]; questionId: string; scopeKey: string;
    onAnswer: (answer: string, answers: AgentAnswers) => Promise<void>; onStop: () => void; disabled: boolean;
    attachmentState: AttachmentState; onAttachmentChange: (state: AttachmentState) => void;
}) {
    const id = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const questions = normalizeQuestions(supplied, question);
    const storageKey = `taibu.question:${scopeKey}:${questionId}`;
    const readDraft = (): Draft => { try { const value = JSON.parse(localStorage.getItem(storageKey) ?? '{}'); return { answers: Object.fromEntries(questions.map(q => [q.id, value.answers?.[q.id] === null ? null : Array.isArray(value.answers?.[q.id]) ? value.answers[q.id].filter((v: unknown) => typeof v === 'string').slice(0, 31) : []])), custom: Object.fromEntries(questions.map(q => [q.id, typeof value.custom?.[q.id] === 'string' ? value.custom[q.id].slice(0, 8000) : ''])) }; } catch { return { answers: {}, custom: {} }; } };
    const [draft, setDraft] = useState<Draft>(readDraft);
    const [open, setOpen] = useState(true);
    const [step, setStep] = useState(0);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const uploads = usePrivateAttachments({ scopeKey, state: attachmentState, change: onAttachmentChange, onError: setError });
    useEffect(() => {
        const change = (event: StorageEvent) => { if (event.key === storageKey) setDraft(readDraft()); };
        window.addEventListener('storage', change);
        return () => window.removeEventListener('storage', change);
        // Keyed by owner, conversation, run and tool call.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey]);
    const update = (next: Draft) => { setDraft(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* optional */ } };
    const effective: AgentAnswers = Object.fromEntries(questions.map(q => [q.id, draft.answers[q.id] === null ? null : [...draft.answers[q.id] ?? [], ...(draft.custom[q.id]?.trim() ? [draft.custom[q.id].trim()] : [])]]));
    const current = questions[step];
    const summary = step === questions.length;
    let ready = false; try { validateAnswers(questions, effective); ready = true; } catch { /* incomplete */ }
    const dismiss = () => { if (!sending) setOpen(false); };
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!summary) { setStep(Math.min(step + 1, questions.length)); return; }
        if (sending || uploads.uploading || disabled || !ready) return;
        setSending(true); setError(null);
        try { await onAnswer(formatQuestionAnswers(questions, effective), effective); try { localStorage.removeItem(storageKey); } catch { /* optional draft cache */ } }
        catch (cause) { setError(cause instanceof Error ? cause.message : '回答发送失败，请重试'); }
        finally { setSending(false); }
    };
    return <><div className="agent-question-notice"><CircleHelp size={16} /><span>Agent 需要你补充信息</span><button ref={triggerRef} type="button" className="agent-secondary-button" onClick={() => setOpen(true)}>回答问题</button><button type="button" className="agent-secondary-button" disabled={sending || disabled} onClick={onStop}>停止任务</button></div>
        <Modal open={open} onClose={dismiss} busy={sending} initialFocusRef={inputRef} returnFocusRef={triggerRef} className="agent-question-dialog" labelledBy={`${id}-title`}>
            <div className="agent-question-dialog-header"><div><CircleHelp size={20} /><h2 id={`${id}-title`}>{summary ? '确认回答' : '需要你的补充'}</h2></div><button type="button" className="agent-icon-button" aria-label="稍后回答" disabled={sending} onClick={dismiss}><X size={18} /></button></div>
            <nav className="agent-question-steps" aria-label="问题导航">{questions.map((q, index) => <button key={q.id} type="button" aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}>{index + 1}{effective[q.id] === null ? ' · 跳过' : effective[q.id]?.length ? ' ✓' : ''}</button>)}<button type="button" aria-current={summary ? 'step' : undefined} onClick={() => setStep(questions.length)}>汇总</button></nav>
            <form onSubmit={submit}>{summary ? <div className="my-4 max-h-[45dvh] overflow-auto">{questions.map((q, index) => <div key={q.id} className="mb-4"><button type="button" className="text-sm font-medium" onClick={() => setStep(index)}>{q.question} · 修改</button><p className="text-sm text-foreground-secondary">{effective[q.id] === null ? '已跳过' : effective[q.id]?.length ? (effective[q.id] ?? []).map(value => q.options?.find(option => option.id === value)?.label ?? value).join('、') : '尚未回答'}</p></div>)}</div> : <>
                <div className="agent-question-prompt"><MarkdownContent content={current.question} className="text-sm leading-relaxed" /></div>
                {current.options?.map(option => <label key={option.id} className="agent-question-option"><input type={current.multiple ? 'checkbox' : 'radio'} name={`${id}-${current.id}`} checked={draft.answers[current.id]?.includes(option.id) ?? false} disabled={sending || disabled} onChange={() => {
                    const previous = draft.answers[current.id] ?? [];
                    const next = current.multiple ? previous.includes(option.id) ? previous.filter(value => value !== option.id) : [...previous, option.id] : [option.id];
                    update({ answers: { ...draft.answers, [current.id]: next }, custom: current.multiple ? draft.custom : { ...draft.custom, [current.id]: '' } });
                }} />{option.label}</label>)}
                {current.allowCustom && <><label htmlFor={`${id}-answer`}>{current.options?.length ? '自行填写' : '你的回答'}</label><textarea id={`${id}-answer`} ref={inputRef} value={draft.custom[current.id] ?? ''} onChange={event => update({ answers: { ...draft.answers, [current.id]: current.multiple ? draft.answers[current.id] ?? [] : [] }, custom: { ...draft.custom, [current.id]: event.target.value } })} disabled={sending || disabled} placeholder="填写补充信息…" rows={3} maxLength={8000} /></>}
            </>}<PrivateAttachments items={attachmentState.uploaded} disabled={uploads.uploading || sending} onRemove={id => onAttachmentChange({ ...attachmentState, uploaded: attachmentState.uploaded?.filter(item => item.id !== id) })} /><label className="my-3 inline-flex text-sm">{uploads.uploading ? '正在保存资料…' : '添加图片或文本资料'}<input className="ml-2 max-w-[180px]" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.txt,.md" disabled={sending || uploads.uploading || disabled} onChange={event => { void uploads.upload(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>{error && <p className="agent-error" role="alert">{error}</p>}
                <div className="agent-question-dialog-actions">{step > 0 && <button type="button" className="agent-secondary-button" disabled={sending} onClick={() => setStep(step - 1)}>返回</button>}{!summary && current.allowSkip && <button type="button" className="agent-secondary-button" disabled={sending || disabled} onClick={() => { update({ answers: { ...draft.answers, [current.id]: null }, custom: { ...draft.custom, [current.id]: '' } }); setStep(step + 1); }}>跳过</button>}<button type="submit" disabled={sending || disabled || (summary && !ready)} className="agent-answer-button">{sending && <LoaderCircle size={15} className="animate-spin" />}<span>{sending ? '正在发送' : summary ? '提交并继续' : '下一步'}</span></button></div>
            </form>
        </Modal></>;
}
