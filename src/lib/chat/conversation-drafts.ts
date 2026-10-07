import type { AttachmentState, Mention, PrivateAttachment } from '@/types';
import { isDataSourceType } from '@/lib/data-sources/types';

export interface ConversationDraft {
    inputValue: string;
    mentions: Mention[];
    attachmentState: AttachmentState;
}
export const EMPTY_CONVERSATION_DRAFT: ConversationDraft = { inputValue: '', mentions: [], attachmentState: { webSearchEnabled: false } };
const prefix = 'taibu:chat-draft:v1:';
export const conversationDraftKey = (owner: string | null, conversation: string | null) => `${prefix}${encodeURIComponent(owner ?? 'anonymous')}:${encodeURIComponent(conversation ?? 'new')}`;

/** Files stay in memory; serializing a filename cannot restore an uploaded File. */
export function parseConversationDraft(raw: string | null): ConversationDraft {
    if (!raw) return EMPTY_CONVERSATION_DRAFT;
    try {
        const data = JSON.parse(raw);
        if (!data || data.version !== 1 || typeof data.inputValue !== 'string' || !Array.isArray(data.mentions)) return EMPTY_CONVERSATION_DRAFT;
        const mentions = data.mentions.filter((item: unknown): item is Mention => {
            if (!item || typeof item !== 'object') return false;
            const mention = item as Partial<Mention>;
            return (mention.type === 'knowledge_base' || isDataSourceType(mention.type)) && typeof mention.name === 'string' && typeof mention.preview === 'string' && (mention.id === undefined || typeof mention.id === 'string');
        }).slice(0, 10);
        const uploaded=Array.isArray(data.uploaded) ? data.uploaded.filter((item:PrivateAttachment)=>item && typeof item.id==='string' && /^[0-9a-f-]{36}$/iu.test(item.id) && typeof item.name==='string' && ['image','text'].includes(item.kind)).slice(0,12) : undefined;
        return { inputValue: data.inputValue, mentions, attachmentState: { webSearchEnabled: data.webSearchEnabled === true,...(uploaded?.length ? {uploaded} : {}) } };
    } catch { return EMPTY_CONVERSATION_DRAFT; }
}

/** Per-tab store with stable snapshots, including when storage is unavailable. */
export function createConversationDraftStore(storage: () => Storage | undefined) {
    const drafts = new Map<string, { key: string; value: ConversationDraft }>();
    const listeners = new Set<() => void>();
    const read = (key: string) => {
        if (drafts.has(key)) return drafts.get(key)!.value;
        let draft = EMPTY_CONVERSATION_DRAFT;
        try { draft = parseConversationDraft(storage()?.getItem(key) ?? null); } catch { /* Private browsing can deny storage. */ }
        drafts.set(key, { key, value: draft });
        return draft;
    };
    const persist = (key: string, next: ConversationDraft) => {
        try {
            if (!next.inputValue && !next.mentions.length && !next.attachmentState.webSearchEnabled && !next.attachmentState.uploaded?.length) storage()?.removeItem(key);
            else storage()?.setItem(key, JSON.stringify({ version: 1, inputValue: next.inputValue, mentions: next.mentions, webSearchEnabled: next.attachmentState.webSearchEnabled,uploaded:next.attachmentState.uploaded }));
        } catch { /* Retain the draft in memory if the browser quota is full. */ }
    };
    const update = (key: string, updater: (draft: ConversationDraft) => ConversationDraft) => {
        const next = updater(read(key));
        drafts.get(key)!.value = next;
        persist(key, next);
        listeners.forEach(listener => listener());
    };
    return {
        read,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        update,
        move: (from: string, to: string) => {
            read(from);
            const entry = drafts.get(from)!;
            drafts.delete(from);
            try { storage()?.removeItem(from); } catch { /* best effort */ }
            entry.key = to;
            drafts.set(to, entry);
            persist(to, entry.value);
            listeners.forEach(listener => listener());
        },
        capture: (key: string, clearAttachment: boolean) => {
            const submitted = read(key);
            const entry = drafts.get(key)!;
            return () => {
                // A newly created conversation moves the same entry. Logout,
                // deletion or edits while admission is pending invalidate it.
                if (drafts.get(entry.key) !== entry || entry.value !== submitted) return;
                update(entry.key, current => {
                    const attachmentState = { ...current.attachmentState };
                    if (clearAttachment) { delete attachmentState.file; delete attachmentState.uploaded; }
                    return { ...current, inputValue: '', mentions: [], attachmentState };
                });
            };
        },
        remove: (key: string) => {
            drafts.delete(key);
            try { storage()?.removeItem(key); } catch { /* best effort */ }
            listeners.forEach(listener => listener());
        },
        clearOwner: (owner: string | null) => {
            const ownerPrefix = `${prefix}${encodeURIComponent(owner ?? 'anonymous')}:`;
            for (const key of drafts.keys()) if (key.startsWith(ownerPrefix)) drafts.delete(key);
            try {
                const target = storage();
                if (target) for (let index = target.length - 1; index >= 0; index--) {
                    const key = target.key(index);
                    if (key?.startsWith(ownerPrefix)) target.removeItem(key);
                }
            } catch { /* best effort */ }
            listeners.forEach(listener => listener());
        },
    };
}
