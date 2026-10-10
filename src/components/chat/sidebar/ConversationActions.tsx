'use client';

import type { RefObject } from 'react';
import { Archive, SquarePen, Trash2 } from 'lucide-react';
import type { ConversationListItem } from '@/types';
import { formatConversationMenuTitle } from '@/lib/chat/conversation-title-display';
import { FloatingPanel } from '@/components/ui/FloatingPanel';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/** Desktop sidebar and mobile drawer share the same action/confirmation surface. */
export function ConversationActions({ conversation, anchorRef, view, onViewChange, onClose, onRename, onArchive, onDelete, deleting, knowledgeBaseEnabled, withinModal = false }: {
    conversation: ConversationListItem | null;
    anchorRef: RefObject<HTMLElement | null>;
    view: 'menu' | 'rename' | 'delete';
    onViewChange: (view: 'menu' | 'rename' | 'delete') => void;
    onClose: () => void;
    onRename: () => void;
    onArchive: () => void;
    onDelete: () => Promise<unknown>;
    deleting: boolean;
    knowledgeBaseEnabled: boolean;
    withinModal?: boolean;
}) {
    return <>
        <FloatingPanel open={Boolean(conversation) && view === 'menu'} anchorRef={anchorRef} onClose={onClose} label="会话操作" className="w-52" portaled={!withinModal}>
            {conversation && <>
                <p className="mb-1 truncate border-b border-border px-2 py-2 text-xs text-foreground-secondary">{formatConversationMenuTitle(conversation)}</p>
                {conversation.sourceType === 'chat' && <button type="button" role="menuitem" onClick={onRename} className="flex w-full items-center gap-2 px-2 py-2 text-sm"><SquarePen size={15} />重命名</button>}
                {knowledgeBaseEnabled && <button type="button" role="menuitem" onClick={onArchive} className="flex w-full items-center gap-2 px-2 py-2 text-sm"><Archive size={15} />{conversation.isArchived ? '已归档' : '归档'}</button>}
                <button type="button" role="menuitem" onClick={() => onViewChange('delete')} className="flex w-full items-center gap-2 px-2 py-2 text-sm text-red-500"><Trash2 size={15} />删除</button>
            </>}
        </FloatingPanel>
        <ConfirmDialog isOpen={Boolean(conversation) && view === 'delete'} onClose={onClose} onConfirm={async () => { await onDelete(); }} loading={deleting} title="删除此聊天" description={`删除“${conversation ? formatConversationMenuTitle(conversation) : ''}”后无法恢复。`} confirmText="确认删除" />
    </>;
}
