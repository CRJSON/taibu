'use client';
import { useEffect, useRef, useState, type RefObject, type KeyboardEvent } from 'react';
import { WandSparkles, Undo2, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { useToast } from '@/components/ui/Toast';
import { requestBrowserJson } from '@/lib/browser-api';
import { CHAT_NEW_EVENT } from '@/lib/chat/ConversationListContext';
type Command = { id: string; label: string; run: () => void };
export function useComposerCommands({ userId, draftKey, text, change, textarea, mentionsOpen, model }: {
    draftKey?: string;
    userId?: string | null; text: string; change: (value: string) => void; textarea: RefObject<HTMLTextAreaElement | null>; mentionsOpen: boolean; model: string;
}) {
    const { showToast } = useToast();
    const [selected, setSelected] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const historyCursor = useRef(-1);
    const historyDraft = useRef('');
    const [polish, setPolish] = useState<{ owner: string; draftKey?: string; before: string; after: string } | null>(null);
    const [polishing, setPolishing] = useState(false);
    const [undo, setUndo] = useState<{ owner: string; draftKey?: string; before: string; after: string } | null>(null);
    const scope = useRef({ userId, draftKey, text }); scope.current = { userId, draftKey, text };
    const history = () => { try { const value = JSON.parse(localStorage.getItem(`taibu.input-history:${userId ?? 'visitor'}`) ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 50) : []; } catch { return []; } };
    const remember = () => {
        if (!text.trim() || /^[\/、]/u.test(text)) return;
        try { localStorage.setItem(`taibu.input-history:${userId ?? 'visitor'}`, JSON.stringify([text, ...history().filter(item => item !== text)].slice(0, 50))); } catch { /* optional */ }
        historyCursor.current = -1;
    };
    const enhance = async () => {
        if (!userId || !text.trim() || polishing) return;
        const owner = userId; const before = text; const key = draftKey;
        setPolishing(true);
        try {
            const result = await requestBrowserJson<{ text: string }>('/api/chat/enhance', { method: 'POST', body: JSON.stringify({ text: before, model }) });
            if (scope.current.userId !== owner || scope.current.draftKey !== key || scope.current.text !== before) return;
            if (result.error || !result.data) showToast('error', result.error?.message ?? '润色失败');
            else setPolish({ owner, draftKey: key, before, after: result.data.text });
        } finally { setPolishing(false); }
    };
    const dispatch = (name: string) => window.dispatchEvent(new Event(name));
    const commands: Command[] = [
        { id: 'new', label: '新对话', run: () => dispatch(CHAT_NEW_EVENT) },
        { id: 'search', label: '搜索对话', run: () => dispatch('taibu:search') },
        { id: 'model', label: '选择下次模型', run: () => textarea.current?.closest('[data-chat-composer]')?.querySelector<HTMLButtonElement>('button[aria-label^="选择模型"]')?.click() },
        { id: 'export', label: '导出当前对话', run: () => dispatch('taibu:export') },
        { id: 'clear', label: '清空输入草稿', run: () => change('') },
        { id: 'methods', label: '选择分析方法', run: () => dispatch('taibu:methods') },
    ];
    const prefix = /^[\/、]([^\s]*)$/u.exec(text);
    const matches = prefix ? commands.filter(command => command.id.includes(prefix[1].toLowerCase()) || command.label.includes(prefix[1])) : [];
    const open = Boolean(prefix && !mentionsOpen && !dismissed && matches.length);
    const execute = (command: Command) => { change(''); setDismissed(true); setSelected(0); requestAnimationFrame(command.run); };
    const changed = () => { setDismissed(false); setSelected(0); historyCursor.current = -1; };
    const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || mentionsOpen) return false;
        if (open && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
            event.preventDefault();
            if (event.key === 'Escape') setDismissed(true);
            else if (event.key === 'Enter') execute(matches[selected % matches.length]);
            else setSelected(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
            return true;
        }
        if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.shiftKey && (event.altKey || (!text.trim() || historyCursor.current >= 0))) {
            const entries = history();
            if (!entries.length) return false;
            event.preventDefault();
            if (historyCursor.current < 0) historyDraft.current = text;
            historyCursor.current = Math.min(entries.length - 1, Math.max(-1, historyCursor.current + (event.key === 'ArrowUp' ? 1 : -1)));
            change(historyCursor.current < 0 ? historyDraft.current : entries[historyCursor.current]);
            return true;
        }
        return false;
    };
    useEffect(() => { historyCursor.current = -1; setPolish(null); setUndo(null); }, [userId, draftKey]);
    const ui = <>
        {open && <div role="listbox" aria-label="输入命令" className="composer-commands">{matches.map((command, index) => <button type="button" role="option" aria-selected={selected === index} key={command.id} onMouseDown={event => event.preventDefault()} onClick={() => execute(command)}><code>/{command.id}</code><span>{command.label}</span></button>)}</div>}
        <div className="composer-enhance"><button type="button" disabled={!userId || !text.trim() || polishing} onClick={() => void enhance()}><WandSparkles size={13} />{polishing ? '正在润色…' : '润色问题'}</button>{undo && undo.owner === userId && undo.draftKey === draftKey && text === undo.after && <button type="button" onClick={() => { change(undo.before); setUndo(null); }}><Undo2 size={13} />撤销润色</button>}</div>
        <Modal open={Boolean(polish && polish.owner === userId && polish.draftKey === draftKey)} onClose={() => setPolish(null)} labelledBy="polish-title" className="agent-question-dialog"><div className="flex justify-between"><h2 id="polish-title">润色预览</h2><button type="button" aria-label="关闭润色预览" onClick={() => setPolish(null)}><X size={18} /></button></div><div className="my-4 max-h-[50dvh] overflow-auto"><MarkdownContent content={polish?.after ?? ''} /></div><button type="button" className="agent-answer-button" disabled={polish?.before !== text} onClick={() => { if (!polish || polish.before !== text) return; change(polish.after); setUndo({ owner: polish.owner, draftKey: polish.draftKey, before: polish.before, after: polish.after }); setPolish(null); }}>替换输入</button>{polish?.before !== text && <p className="text-sm">草稿已改变，请重新润色。</p>}</Modal>
    </>;
    return { keyDown, changed, remember, ui };
}
