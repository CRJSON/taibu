export function backgroundCompactionTokens(contextWindow: number | null, reserveTokens: number): number {
    const blocking = (contextWindow ?? 0) - reserveTokens;
    return blocking > 0 ? Math.min(32768, Math.floor(blocking / 2)) : 0;
}
