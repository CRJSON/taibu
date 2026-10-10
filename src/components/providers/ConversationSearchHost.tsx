'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { requestBrowserJson } from '@/lib/browser-api';
type Result = { conversationId: string; messageId: string | null; title: string; preview: string };
export function ConversationSearchHost({ userId }: { userId: string | null }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [result, setResult] = useState<{ owner: string; query: string; results: Result[] } | null>(null);
    const [failure, setFailure] = useState<{ owner: string; query: string; message: string } | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const router = useRouter();
    useEffect(() => {
        const show = () => setOpen(true);
        const key = (event: KeyboardEvent) => { if (!event.isComposing && event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); show(); } };
        window.addEventListener('keydown', key); window.addEventListener('taibu:search', show);
        return () => { window.removeEventListener('keydown', key); window.removeEventListener('taibu:search', show); };
    }, []);
    useEffect(() => {
        if (!open || !query.trim() || !userId) return;
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            void requestBrowserJson<{ results: Result[] }>(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) }).then(response => {
                if (controller.signal.aborted) return;
                setFailure({ owner: userId, query, message: response.error?.message ?? '' });
                setResult({ owner: userId, query, results: response.data?.results ?? [] });
            }).catch(() => { if (!controller.signal.aborted) setFailure({ owner: userId, query, message: '搜索超时，请重试' }); });
        }, 250);
        return () => { clearTimeout(timeout); controller.abort(); };
    }, [open, query, userId]);
    const results = result?.owner === userId && result.query === query ? result.results : [];
    const error = failure?.owner === userId && failure.query === query ? failure.message : '';
    return <Modal open={open} onClose={() => setOpen(false)} initialFocusRef={input} labelledBy="search-title" className="agent-question-dialog"><div className="flex justify-between"><h2 id="search-title"><Search size={17} className="inline mr-2" />搜索对话</h2><button type="button" aria-label="关闭搜索" onClick={() => setOpen(false)}><X size={18} /></button></div><input ref={input} value={query} maxLength={200} aria-label="搜索对话内容" placeholder="搜索标题和当前分支的消息…" onChange={event => setQuery(event.target.value)} className="my-4 w-full rounded border border-border bg-background p-3 text-sm" /><div className="max-h-[50dvh] overflow-auto" onKeyDown={event => {
        if (event.nativeEvent.isComposing || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault(); buttons[(at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }}>{!userId ? <p>登录后搜索自己的对话。</p> : error ? <p role="alert">{error}</p> : results.map(item => <button type="button" key={`${item.conversationId}:${item.messageId}`} className="w-full border-b border-border p-3 text-left hover:bg-background-secondary" onClick={() => { setOpen(false); router.push(`/chat?id=${item.conversationId}${item.messageId ? `&message=${encodeURIComponent(item.messageId)}` : ''}`); }}><strong className="block text-sm">{item.title || '对话'}</strong><span className="block mt-1 text-xs text-foreground-secondary whitespace-pre-wrap">{item.preview}</span></button>)}{userId && !error && query.trim() && result?.query === query && !results.length && <p className="text-sm text-foreground-secondary">没有找到相关消息。</p>}</div></Modal>;
}
