'use client';
import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
export function ConversationExportDialog({ conversationId }: { conversationId: string }) {
    const [open, setOpen] = useState(false);
    const [tools, setTools] = useState(false);
    const [busy, setBusy] = useState(false);
    const { showToast } = useToast();
    useEffect(() => { const show = () => setOpen(true); window.addEventListener('taibu:export', show); return () => window.removeEventListener('taibu:export', show); }, []);
    async function download(format: 'md' | 'html') {
        setBusy(true);
        try {
            const response = await fetch(`/api/conversations/${conversationId}/export?format=${format}&tools=${tools ? '1' : '0'}`);
            if (!response.ok) throw new Error('导出失败，请重试');
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement('a'); link.href = url; link.download = `太卜-对话.${format}`; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { showToast('error', error instanceof Error ? error.message : '导出失败'); }
        finally { setBusy(false); }
    }
    return <><button type="button" className="chat-workspace-toggle" aria-label="导出对话" onClick={() => setOpen(true)}><Download size={15} /></button><Modal open={open} onClose={() => setOpen(false)} busy={busy} labelledBy="export-title" className="agent-question-dialog"><div className="flex justify-between"><h2 id="export-title">导出当前对话</h2><button type="button" aria-label="关闭导出" disabled={busy} onClick={() => setOpen(false)}><X size={18} /></button></div><p className="my-4 text-sm text-foreground-secondary">包含当前分支正文、命盘依据和来源。HTML 可用浏览器打印为 PDF。</p><label className="flex gap-2"><input type="checkbox" checked={tools} onChange={event => setTools(event.target.checked)} />包含原始工具参数与结果</label><div className="mt-5 flex gap-3"><button className="agent-secondary-button" disabled={busy} onClick={() => void download('md')}>Markdown</button><button className="agent-secondary-button" disabled={busy} onClick={() => void download('html')}>可打印 HTML</button></div></Modal></>;
}
