'use client';
import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { FloatingPanel } from '@/components/ui/FloatingPanel';
import { useToast } from '@/components/ui/Toast';
import { getCurrentUserSettings } from '@/lib/user/settings';
import { applyPromptTemplate, type AgentPromptTemplate } from '@/lib/agent/prompt-templates';

export function ComposerDomainControls({ userId, value, onChange, disabled }: { userId?: string | null; value: string; onChange: (value: string) => void; disabled: boolean }) {
    const [open, setOpen] = useState(false), [templates, setTemplates] = useState<AgentPromptTemplate[]>([]);
    const anchor = useRef<HTMLButtonElement>(null), current = useRef(value), lifecycle = useRef<AbortController | null>(null);
    useEffect(() => { current.current = value; }, [value]);
    const { showToast } = useToast();
    useEffect(() => {
        const abort = new AbortController(); lifecycle.current = abort;
        return () => { abort.abort(); };
    }, []);
    const loadTemplates = () => {
        setOpen(!open);
        if (open || !userId) return;
        const signal = lifecycle.current?.signal;
        void getCurrentUserSettings({ expectedUserId: userId, signal }).then(result => {
            if (signal?.aborted) return;
            if (result.error) showToast('error', '读取问法模板失败');
            else setTemplates(result.settings?.chatPreferences.promptTemplates ?? []);
        }).catch(() => { if (!signal?.aborted) showToast('error', '读取问法模板失败'); });
    };
    const buttonClass = 'h-9 w-9 rounded-xl flex items-center justify-center text-foreground-secondary hover:bg-background-secondary disabled:opacity-50';
    return <>
        <button type="button" ref={anchor} disabled={disabled || !userId} onClick={loadTemplates} aria-label="问法模板" aria-expanded={open} title="问法模板" className={buttonClass}><FileText className="h-4 w-4" /></button>
        <FloatingPanel open={open} anchorRef={anchor} onClose={() => setOpen(false)} label="问法模板" side="top" className="w-72 p-2">
            {templates.map(template => <button type="button" role="menuitem" key={template.id} className="block w-full rounded-lg p-2 text-left text-sm hover:bg-background-secondary" onClick={() => { onChange(applyPromptTemplate(template, current.current)); setOpen(false); }}>{template.name}</button>)}
            {!templates.length && <p className="p-2 text-sm text-foreground-secondary">暂无模板，请在个性化设置中添加。</p>}
            <Link role="menuitem" className="block p-2 text-sm text-accent" href="/settings/personalization">管理模板</Link>
        </FloatingPanel>
    </>;
}
