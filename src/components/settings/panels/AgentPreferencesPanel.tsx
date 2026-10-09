'use client';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { getCurrentUserSettings, updateCurrentUserSettings } from '@/lib/user/settings';
import { requestBrowserJson } from '@/lib/browser-api';
import type { ChatPreferences } from '@/lib/chat/preferences';
import type { AgentPromptTemplate } from '@/lib/agent/prompt-templates';
import type { AgentMemory } from '@/lib/agent/memory';
import { useUnsavedSettingsGuard } from '@/lib/hooks/useUnsavedSettingsGuard';

export function AgentPreferencesPanel({ userId }: { userId: string }) {
    const [preferences, setPreferences] = useState<ChatPreferences | null>(null), [templates, setTemplates] = useState<AgentPromptTemplate[]>([]), [memoryEnabled, setMemoryEnabled] = useState(false);
    const [memories, setMemories] = useState<AgentMemory[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [title, setTitle] = useState(''), [content, setContent] = useState('');
    const controller = useRef<AbortController | null>(null);
    const { showToast } = useToast();
    useUnsavedSettingsGuard(!!preferences && (memoryEnabled !== (preferences.memoryEnabled === true) || JSON.stringify(templates) !== JSON.stringify(preferences.promptTemplates ?? []) || !!title || !!content));
    const request = <T,>(method: string, body?: unknown) => requestBrowserJson<T>('/api/user/agent-memory', { method, headers: { 'Content-Type': 'application/json', 'X-Expected-User-Id': userId }, ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.current?.signal });
    useEffect(() => {
        const abort = new AbortController(); controller.current = abort;
        void Promise.all([getCurrentUserSettings({ expectedUserId: userId, signal: abort.signal }), requestBrowserJson<{ memories: AgentMemory[] }>('/api/user/agent-memory', { headers: { 'X-Expected-User-Id': userId }, signal: abort.signal })]).then(([settings, memory]) => {
            if (abort.signal.aborted) return;
            if (settings.error || !settings.settings) { setError('读取任务助手设置失败，请刷新后重试'); return; }
            const prefs = settings.settings.chatPreferences;
            setPreferences(prefs); setTemplates(prefs.promptTemplates ?? []); setMemoryEnabled(prefs.memoryEnabled === true);
            if (memory.error) setError('读取长期记忆失败，请刷新后重试');
            else setMemories(memory.data?.memories ?? []);
        }).catch(() => { if (!abort.signal.aborted) setError('读取任务助手设置失败，请刷新后重试'); });
        return () => { abort.abort(); controller.current = null; };
    }, [userId]);
    const save = async () => {
        const active = controller.current;
        if (!preferences) return;
        if (templates.some(template => !template.name.trim() || !template.content.trim())) { showToast('error', '请填写模板名称和正文'); return; }
        setBusy(true);
        try {
            const result = await updateCurrentUserSettings({ chatPreferences: { promptTemplates: templates, memoryEnabled } }, undefined, { expectedUserId: userId, signal: controller.current?.signal });
            if (!active || active.signal.aborted) return;
            if (!result) showToast('error', '保存任务助手设置失败');
            else { setPreferences(result.chatPreferences); setTemplates(result.chatPreferences.promptTemplates ?? []); setMemoryEnabled(result.chatPreferences.memoryEnabled === true); showToast('success', '任务助手设置已保存'); }
        } catch { if (active && !active.signal.aborted) showToast('error', '保存任务助手设置失败'); }
        finally { if (active && !active.signal.aborted) setBusy(false); }
    };
    const mutateMemory = async (method: 'POST' | 'DELETE', body: unknown) => {
        const active = controller.current;
        setBusy(true);
        try {
            const result = await request<{ memory?: AgentMemory }>(method, body);
            if (!active || active.signal.aborted) return;
            if (result.error) { showToast('error', result.error.message); return; }
            const refreshed = await request<{ memories: AgentMemory[] }>('GET');
            if (!active.signal.aborted && !refreshed.error) setMemories(refreshed.data?.memories ?? []);
            if (method === 'POST') { setTitle(''); setContent(''); }
        } catch { if (active && !active.signal.aborted) showToast('error', '更新长期记忆失败'); }
        finally { if (active && !active.signal.aborted) setBusy(false); }
    };
    const field = 'w-full rounded-lg border border-border bg-background p-2 text-sm';
    return <section className="mt-6 space-y-4 rounded-xl border border-border p-4" aria-label="任务助手设置">
        <h2 className="text-sm font-semibold">任务助手</h2>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="space-y-3"><h3 className="text-sm font-medium">问法模板</h3><p className="text-sm text-foreground-secondary">输入框可插入模板。使用 {'{{question}}'} 放置当前问题；每人最多 20 个。</p>
            {templates.map((template, index) => <div key={template.id} className="space-y-2 rounded-lg border border-border p-3">
                <input disabled={busy} aria-label={`模板 ${index + 1} 名称`} maxLength={60} className={field} placeholder="模板名称" value={template.name} onChange={event => setTemplates(templates.map(item => item.id === template.id ? { ...item, name: event.target.value } : item))} />
                <textarea disabled={busy} aria-label={`模板 ${index + 1} 正文`} maxLength={4000} className={field} rows={3} placeholder="请结合实际盘面分析：{{question}}" value={template.content} onChange={event => setTemplates(templates.map(item => item.id === template.id ? { ...item, content: event.target.value } : item))} />
                <button type="button" disabled={busy} className="text-sm text-foreground-secondary" onClick={() => setTemplates(templates.filter(item => item.id !== template.id))}>删除模板</button>
            </div>)}
            <button type="button" disabled={busy || !preferences || templates.length >= 20} className="text-sm text-accent" onClick={() => setTemplates([...templates, { id: crypto.randomUUID(), name: '', content: '' }])}>添加模板</button>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={memoryEnabled} disabled={busy || !preferences} onChange={event => setMemoryEnabled(event.target.checked)} />允许任务助手读取和保存长期记忆</label>
        <p className="text-sm text-foreground-secondary">默认关闭。开启后，助手只能依据你明确表达的内容保存长期偏好或事实。关闭不删除已保存内容，你可以随时查看和删除。</p>
        <button type="button" disabled={busy || !preferences} onClick={() => void save()} className="rounded-lg bg-accent px-3 py-2 text-sm text-on-accent disabled:opacity-50">保存任务助手设置</button>
        <div className="space-y-3"><h3 className="text-sm font-medium">已保存记忆（{memories.length}/128）</h3>
            {memories.map(memory => <div key={memory.id} className="rounded-lg border border-border p-3"><div className="flex justify-between gap-3"><strong className="text-sm">{memory.title}</strong><button type="button" disabled={busy} className="text-sm text-accent" onClick={() => void mutateMemory('DELETE', { id: memory.id })} aria-label={`删除记忆 ${memory.title}`}>删除</button></div><p className="mt-1 whitespace-pre-wrap text-sm text-foreground-secondary">{memory.content}</p></div>)}
            {!memories.length && <p className="text-sm text-foreground-secondary">尚未保存记忆。</p>}
            <input disabled={busy} className={field} aria-label="新记忆标题" placeholder="记忆标题" maxLength={80} value={title} onChange={event => setTitle(event.target.value)} />
            <textarea disabled={busy} className={field} aria-label="新记忆正文" placeholder="主动保存希望长期保留的偏好或事实" maxLength={2000} value={content} onChange={event => setContent(event.target.value)} rows={2} />
            <button type="button" disabled={busy || !preferences || !title.trim() || !content.trim()} className="text-sm text-accent disabled:opacity-50" onClick={() => void mutateMemory('POST', { title, content, kind: 'context' })}>保存这条记忆</button>
        </div>
    </section>;
}
