export type BriefingPreferences = { timezone: string; time: string };
export const DEFAULT_BRIEFING_PREFERENCES: BriefingPreferences = { timezone: 'Asia/Shanghai', time: '08:00' };
export function validBriefingPreferences(value: unknown): value is BriefingPreferences {
    if (!value || typeof value !== 'object') return false;
    const row = value as BriefingPreferences;
    if (typeof row.timezone !== 'string' || row.timezone.length > 100 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time)) return false;
    try { new Intl.DateTimeFormat('en', { timeZone: row.timezone }); return true; } catch { return false; }
}
export function normalizeBriefingPreferences(value: unknown): BriefingPreferences {
    return validBriefingPreferences(value) ? { timezone: value.timezone, time: value.time } : { ...DEFAULT_BRIEFING_PREFERENCES };
}
export function initialBriefingPreferences(value: unknown, configured: boolean, browserTimezone?: string): BriefingPreferences {
    return normalizeBriefingPreferences(configured ? value : { ...DEFAULT_BRIEFING_PREFERENCES, timezone: browserTimezone || DEFAULT_BRIEFING_PREFERENCES.timezone });
}
export function briefingLocalDate(now: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const value = (type: string) => parts.find(part => part.type === type)!.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
}
