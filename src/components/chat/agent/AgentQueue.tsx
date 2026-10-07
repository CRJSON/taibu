'use client';
import { useState } from 'react';
import { ArrowUp, ArrowDown, Pencil, X, CornerUpLeft, ChevronsUp } from 'lucide-react';
import type { AgentRunView } from '@/lib/agent/types';
import type { ChatMessage } from '@/types';
import { requestBrowserJson } from '@/lib/browser-api';
import { useToast } from '@/components/ui/Toast';
export function AgentQueue({ run, restoreDraft }: { run: AgentRunView; restoreDraft: (message: ChatMessage) => void }) {
    const [busy, setBusy] = useState<number | null>(null);
    const [editing, setEditing] = useState<number | null>(null);
    const [content, setContent] = useState('');
    const { showToast } = useToast();
    const items = (run.queue ?? []).filter(command => ['pending','claimed','admitted','cancelled'].includes(command.state));
    if (!items.length) return null;
    const act = async (item: typeof items[number], action: string, extra?: Record<string, unknown>) => {
        setBusy(item.sequence);
        try {
            const result = await requestBrowserJson(`/api/agent/runs/${run.id}/queue`, { method: 'PATCH', body: JSON.stringify({ sequence: item.sequence, revision: item.revision, action, ...extra }) });
            if (result.error) showToast('error', result.error.message);
            else setEditing(null);
        } finally { setBusy(null); }
    };
    return <section className="agent-queue" aria-label="待执行输入"><header>续问队列 <span>{items.filter(item => item.state !== 'cancelled').length}</span></header>{items.map((item, index) => <div key={item.sequence} className="agent-queue-item">{editing === item.sequence ? <><textarea aria-label="编辑待发送输入" value={content} onChange={event => setContent(event.target.value)} maxLength={32000} /><button type="button" disabled={busy !== null || !content.trim()} onClick={() => void act(item,'edit',{ content })}>保存</button><button type="button" onClick={() => setEditing(null)}>取消</button></> : <><p>{item.message.content}</p><span>{item.state === 'pending' ? item.mode === 'follow_up' ? '任务结束后继续' : '下个安全边界补充' : item.state === 'cancelled' ? '已撤回' : '已交给 Agent'}</span>{item.state === 'cancelled' ? <button type="button" aria-label="恢复为草稿" onClick={() => restoreDraft(item.message)}><CornerUpLeft size={13} /></button> : item.state === 'pending' && <><button type="button" aria-label="编辑待发送输入" disabled={busy !== null} onClick={() => { setEditing(item.sequence); setContent(item.message.content); }}><Pencil size={13} /></button><button type="button" aria-label="撤回待发送输入" disabled={busy !== null} onClick={() => void act(item,'withdraw')}><X size={13} /></button><button type="button" aria-label="提高输入优先级" disabled={busy !== null || item.mode === 'reply'} onClick={() => void act(item,'promote')}><ChevronsUp size={13} /></button><button type="button" aria-label="队列上移" disabled={busy !== null || index === 0} onClick={() => void act(item,'order',{ sortOrder: items[index-1].sortOrder - 1 })}><ArrowUp size={13} /></button><button type="button" aria-label="队列下移" disabled={busy !== null || index === items.length-1} onClick={() => void act(item,'order',{ sortOrder: items[index+1].sortOrder + 1 })}><ArrowDown size={13} /></button></>}</>}</div>)}</section>;
}
