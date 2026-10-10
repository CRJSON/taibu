import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createStorageConformance } from "@earendil-works/pi-durable/testing";
import { createSession, type ConversationId, type StorageWrite } from "@earendil-works/pi-durable";
import { AgentDurableStorage, type DurableCommitPersistence, type DurableStoredCommit } from "../lib/agent/durable-storage.server";

class CommitLog implements DurableCommitPersistence {
  rows: DurableStoredCommit[] = [];
  pageSize = 3;
  async read(after: number) { return structuredClone(this.rows.filter(r => r.sequence > after).slice(0, this.pageSize)); }
  async append(sequence: number, writes: readonly StorageWrite[]) {
    const old = this.rows.find(r => r.sequence === sequence);
    if (old) assert.deepEqual(old.writes, writes);
    else {
      assert.equal(sequence, this.rows.length + 1);
      this.rows.push({ sequence, writes: structuredClone([...writes]) });
    }
    return sequence;
  }
}

for (const example of createStorageConformance({
  assertions: {
    ok: assert.ok, strictEqual: assert.strictEqual, deepEqual: assert.deepStrictEqual,
    partialDeepEqual: (actual, expected) => (assert as typeof assert & { partialDeepStrictEqual(a: unknown, b: unknown): void }).partialDeepStrictEqual(actual, expected),
    greaterThan: (actual, expected) => assert.ok(actual > expected),
    rejects: async (operation, text) => { await assert.rejects(operation, error => error instanceof Error && error.message.includes(text)); },
  },
  withStorage: async exercise => {
    const storage = await AgentDurableStorage.open(new CommitLog(), BACKGROUND_CONTEXT);
    try { await exercise(storage); } finally { await storage.close(BACKGROUND_CONTEXT); }
  },
})) test(`Pi storage conformance: ${example.name}`, example.run);

test("reopen replays paginated acknowledged batches and preserves fresh IDs", async () => {
  const log = new CommitLog();
  const first = await AgentDurableStorage.open(log, BACKGROUND_CONTEXT);
  const session = createSession(first);
  const conversation = await session.commit(tx => tx.createConversation({ ownership: { kind: "ownerless" } }), BACKGROUND_CONTEXT);
  for (let i = 0; i < 9; i++) await session.commit(tx => tx.appendEntry(conversation.id, { kind: "fixture", data: { i } }), BACKGROUND_CONTEXT);
  await session.close(BACKGROUND_CONTEXT);
  const reopened = await AgentDurableStorage.open(log, BACKGROUND_CONTEXT);
  const entries = await reopened.scanEntries({ conversationId: conversation.id }, 100, undefined, BACKGROUND_CONTEXT);
  assert.equal(entries.items.length, 9);
  assert.ok(Number(await reopened.mintId()) > Math.max(...entries.items.map(e => Number(e.id))));
});

test("an ambiguous commit is invisible locally, poisons later writes, and is recovered from the log", async () => {
  const log = new CommitLog();
  const store = await AgentDurableStorage.open({
    read: after => log.read(after),
    append: async (sequence, writes) => { await log.append(sequence, writes); throw new Error("receipt lost"); },
  }, BACKGROUND_CONTEXT);
  const id = await store.mintId<ConversationId>();
  const writes: StorageWrite[] = [{ type: "conversation", value: { id } }];
  await assert.rejects(store.commit(writes, BACKGROUND_CONTEXT), /receipt lost/);
  assert.equal(await store.conversation(id, BACKGROUND_CONTEXT), undefined);
  await assert.rejects(store.commit(writes, BACKGROUND_CONTEXT), /STORAGE_UNAVAILABLE/);
  const recovered = await AgentDurableStorage.open(log, BACKGROUND_CONTEXT);
  assert.ok(await recovered.conversation(id, BACKGROUND_CONTEXT));
});
