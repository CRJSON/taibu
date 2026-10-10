'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore, type SetStateAction } from 'react';
import type { AttachmentState, Mention } from '@/types';
import { conversationDraftKey, createConversationDraftStore, EMPTY_CONVERSATION_DRAFT } from './conversation-drafts';

const store = createConversationDraftStore(() => typeof window === 'undefined' ? undefined : window.sessionStorage);
const serverSnapshot = () => EMPTY_CONVERSATION_DRAFT;
const resolve = <T,>(action: SetStateAction<T>, current: T) => typeof action === 'function' ? (action as (value: T) => T)(current) : action;

export function useConversationDraft(owner: string | null, conversation: string | null) {
    const key = conversationDraftKey(owner, conversation);
    const snapshot = useCallback(() => store.read(key), [key]);
    const draft = useSyncExternalStore(store.subscribe, snapshot, serverSnapshot);
    const previousOwner = useRef(owner);
    useEffect(() => {
        if (previousOwner.current !== owner) store.clearOwner(previousOwner.current);
        previousOwner.current = owner;
    }, [owner]);
    const setInputValue = useCallback((action: SetStateAction<string>) => store.update(key, current => ({ ...current, inputValue: resolve(action, current.inputValue) })), [key]);
    const setMentions = useCallback((action: SetStateAction<Mention[]>) => store.update(key, current => ({ ...current, mentions: resolve(action, current.mentions) })), [key]);
    const setAttachmentState = useCallback((action: SetStateAction<AttachmentState>) => store.update(key, current => ({ ...current, attachmentState: resolve(action, current.attachmentState) })), [key]);
    const removeDraft = useCallback((conversationId: string) => store.remove(conversationDraftKey(owner, conversationId)), [owner]);
    const moveDraft = useCallback((conversationId: string) => store.move(key, conversationDraftKey(owner, conversationId)), [key, owner]);
    const captureSubmittedDraft = useCallback((clearAttachment = false) => store.capture(key, clearAttachment), [key]);
    return { ...draft, setInputValue, setMentions, setAttachmentState, removeDraft, moveDraft, captureSubmittedDraft };
}
