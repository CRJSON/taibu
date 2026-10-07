type TranscriptTarget = { release: () => void; locate: (id: string) => boolean };
const targets = new Map<string, TranscriptTarget>();
export function registerTranscript(key: string, target: TranscriptTarget): () => void {
    targets.set(key, target);
    return () => { if (targets.get(key) === target) targets.delete(key); };
}
/** Shared by minimap, search and task notifications, including virtual rows. */
export function scrollToMessageId(key: string, id: string): boolean {
    const target = targets.get(key);
    if (!target) return false;
    target.release();
    return target.locate(id);
}
