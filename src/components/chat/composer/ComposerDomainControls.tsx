'use client';
import { useEffect, useRef, useState } from 'react';
import { FileText, Mic, Square } from 'lucide-react';
import Link from 'next/link';
import { FloatingPanel } from '@/components/ui/FloatingPanel';
import { useToast } from '@/components/ui/Toast';
import { getCurrentUserSettings } from '@/lib/user/settings';
import { applyPromptTemplate, type AgentPromptTemplate } from '@/lib/agent/prompt-templates';
import { mergeSpeechDraft, speechConstructor, type SpeechSession } from '@/lib/agent/speech';

export function ComposerDomainControls({ userId, value, onChange, disabled }: { userId?: string | null; value: string; onChange: (value: string) => void; disabled: boolean }) {
    const [open, setOpen] = useState(false), [templates, setTemplates] = useState<AgentPromptTemplate[]>([]), [recording, setRecording] = useState(false);
    const anchor = useRef<HTMLButtonElement>(null), speech = useRef<SpeechSession | null>(null), current = useRef(value), lifecycle = useRef<AbortController | null>(null);
    useEffect(() => { current.current = value; }, [value]);
    useEffect(() => { if (disabled) speech.current?.abort(); }, [disabled]);
    const { showToast } = useToast();
    useEffect(() => {
        const abort = new AbortController(); lifecycle.current = abort;
        return () => { abort.abort(); if (speech.current) { speech.current.onresult = null; speech.current.onerror = null; speech.current.onend = null; speech.current.abort(); speech.current = null; } };
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
    const record = () => {
        if (recording) { speech.current?.stop(); return; }
        const Constructor = speechConstructor(window);
        if (!Constructor) { showToast('info', '当前浏览器不支持语音输入，请使用 Chrome 或 Edge'); return; }
        const recognition = new Constructor(), initial = current.current;
        recognition.lang = 'zh-CN'; recognition.continuous = false; recognition.interimResults = false;
        recognition.onresult = event => {
            const transcript = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join('');
            const merged = mergeSpeechDraft(initial, current.current, transcript);
            if (merged !== null) onChange(merged);
            else if (transcript) showToast('info', '输入已修改，本次语音未覆盖已有内容');
        };
        recognition.onerror = event => { if (event.error !== 'aborted') showToast('error', event.error === 'not-allowed' ? '麦克风权限被拒绝' : '语音识别未完成，请重试'); };
        recognition.onend = () => { setRecording(false); speech.current = null; };
        speech.current = recognition;
        try { recognition.start(); setRecording(true); showToast('info', '正在录音，点击停止。浏览器可能使用在线语音服务；识别结果只填入输入框。', 6000); }
        catch { speech.current = null; showToast('error', '无法启动麦克风'); }
    };
    const buttonClass = 'h-9 w-9 rounded-xl flex items-center justify-center text-foreground-secondary hover:bg-background-secondary disabled:opacity-50';
    return <>
        <button type="button" ref={anchor} disabled={disabled || !userId} onClick={loadTemplates} aria-label="问法模板" aria-expanded={open} title="问法模板" className={buttonClass}><FileText className="h-4 w-4" /></button>
        <FloatingPanel open={open} anchorRef={anchor} onClose={() => setOpen(false)} label="问法模板" side="top" className="w-72 p-2">
            {templates.map(template => <button type="button" role="menuitem" key={template.id} className="block w-full rounded-lg p-2 text-left text-sm hover:bg-background-secondary" onClick={() => { onChange(applyPromptTemplate(template, current.current)); setOpen(false); }}>{template.name}</button>)}
            {!templates.length && <p className="p-2 text-sm text-foreground-secondary">暂无模板，请在个性化设置中添加。</p>}
            <Link role="menuitem" className="block p-2 text-sm text-accent" href="/settings/personalization">管理模板</Link>
        </FloatingPanel>
        <button type="button" disabled={disabled && !recording} onClick={record} aria-label={recording ? '停止录音' : '语音输入'} aria-pressed={recording} title={recording ? '停止录音' : '语音输入'} className={`${buttonClass} ${recording ? 'text-accent' : ''}`}>{recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
    </>;
}
