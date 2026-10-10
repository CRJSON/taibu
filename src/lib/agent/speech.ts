export interface SpeechSession {
    lang: string; continuous: boolean; interimResults: boolean;
    onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
    start(): void; stop(): void; abort(): void;
}
export type SpeechConstructor = new () => SpeechSession;
export function speechConstructor(surface: Window): SpeechConstructor | undefined {
    const browser = surface as Window & { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor };
    return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
/** Never overwrite text that the user edited after recording began. */
export function mergeSpeechDraft(initial: string, current: string, transcript: string): string | null {
    if (current !== initial || !transcript.trim()) return null;
    return `${initial}${initial.trim() ? '\n' : ''}${transcript.trim()}`;
}
