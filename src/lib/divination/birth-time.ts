import { DEFAULT_DIVINATION_TIMEZONE, getZonedDateTimeParts, type LocalTimeDisambiguation } from 'taibu-core/timezone-utils';

export interface BirthTimeResolution {
    timezone?: string;
    disambiguation?: LocalTimeDisambiguation;
}

const DISAMBIGUATIONS: readonly LocalTimeDisambiguation[] = ['reject', 'earlier', 'later', 'compatible'];

export function resolveBirthTimeOptions(input: { timezone?: unknown; disambiguation?: unknown }): Required<BirthTimeResolution> {
    if (input.timezone != null && typeof input.timezone !== 'string') throw new Error('时区必须为 IANA 时区名称');
    const timezone = typeof input.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : DEFAULT_DIVINATION_TIMEZONE;
    if (timezone.length > 100) throw new Error('时区名称过长');
    getZonedDateTimeParts(new Date(0), timezone);
    const disambiguation = input.disambiguation ?? 'reject';
    if (typeof disambiguation !== 'string' || !DISAMBIGUATIONS.includes(disambiguation as LocalTimeDisambiguation)) {
        throw new Error('夏令时策略必须为 reject、earlier、later 或 compatible');
    }
    return { timezone, disambiguation: disambiguation as LocalTimeDisambiguation };
}

/** URL values remain editable; calculation and persistence validate them before use. */
export function readBirthTimeOptions(params: { get(name: string): string | null }): BirthTimeResolution {
    return {
        ...(params.get('timezone') ? { timezone: params.get('timezone')! } : {}),
        ...(params.get('disambiguation') ? { disambiguation: params.get('disambiguation') as LocalTimeDisambiguation } : {}),
    };
}

export function writeBirthTimeOptions(params: URLSearchParams, input: BirthTimeResolution): void {
    const options = resolveBirthTimeOptions(input);
    params.set('timezone', options.timezone);
    params.set('disambiguation', options.disambiguation);
}

export function isValidBirthTimeString(value: unknown): value is string {
    if (typeof value !== 'string') {
        return false;
    }

    const trimmed = value.trim();
    if (!/^\d{2}:\d{2}$/.test(trimmed)) {
        return false;
    }

    const [hour, minute] = trimmed.split(':').map(Number);
    return (
        Number.isInteger(hour)
        && hour >= 0
        && hour <= 23
        && Number.isInteger(minute)
        && minute >= 0
        && minute <= 59
    );
}

export function parseBirthTimeString(value: string): { hour: number; minute: number } | null {
    if (!isValidBirthTimeString(value)) {
        return null;
    }

    const [hour, minute] = value.split(':').map(Number);
    return { hour, minute };
}
