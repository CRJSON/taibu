import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConversationDraftStore, parseConversationDraft } from '../lib/chat/conversation-drafts';

function storageFixture() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() { return values.size; },
        values,
    } as Storage & { values: Map<string, string> };
}

test('conversation drafts retain text, valid mentions and web selection, but never serialize a File', () => {
    const storage = storageFixture();
    const store = createConversationDraftStore(() => storage);
    store.update('alice:one', () => ({
        inputValue: '请继续分析',
        mentions: [{ type: 'bazi_chart', id: 'chart', name: '本命盘', preview: '甲子' }],
        attachmentState: { file: { name: 'private.pdf' } as File, webSearchEnabled: true },
    }));
    const raw = storage.values.get('alice:one') ?? '';
    assert.equal(raw.includes('private.pdf'), false);
    const reloaded = createConversationDraftStore(() => storage).read('alice:one');
    assert.deepEqual(reloaded, {
        inputValue: '请继续分析',
        mentions: [{ type: 'bazi_chart', id: 'chart', name: '本命盘', preview: '甲子' }],
        attachmentState: { webSearchEnabled: true },
    });
});

test('creating a conversation moves the exact pending draft before acknowledgement clears it', () => {
    const storage = storageFixture();
    const store = createConversationDraftStore(() => storage);
    store.update('alice:new', () => ({ inputValue: '新任务', mentions: [], attachmentState: { webSearchEnabled: false } }));
    const clear = store.capture('alice:new', true);
    store.move('alice:new', 'alice:created');
    clear();
    assert.deepEqual(store.read('alice:new'), { inputValue: '', mentions: [], attachmentState: { webSearchEnabled: false } });
    assert.deepEqual(store.read('alice:created'), { inputValue: '', mentions: [], attachmentState: { webSearchEnabled: false } });
    assert.equal(storage.values.has('alice:new'), false);
    assert.equal(storage.values.has('alice:created'), false);
});

test('a later edit wins over an older send acknowledgement and malformed storage is ignored', () => {
    const storage = storageFixture();
    const store = createConversationDraftStore(() => storage);
    store.update('alice:one', () => ({ inputValue: 'first', mentions: [], attachmentState: { webSearchEnabled: false } }));
    const clear = store.capture('alice:one', false);
    store.update('alice:one', current => ({ ...current, inputValue: 'later edit' }));
    clear();
    assert.equal(store.read('alice:one').inputValue, 'later edit');
    assert.deepEqual(parseConversationDraft('{bad json'), { inputValue: '', mentions: [], attachmentState: { webSearchEnabled: false } });
    assert.deepEqual(parseConversationDraft(JSON.stringify({ version: 1, inputValue: 'x', mentions: [{ type: 'unknown', name: 'x', preview: 'x' }] })), { inputValue: 'x', mentions: [], attachmentState: { webSearchEnabled: false } });
});
