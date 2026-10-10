/** 四柱反推的 Web 适配层；历法、逐分钟核验和候选文本统一来自 Core。 */
import { resolveBaziPillars } from 'taibu-core/bazi-pillars-resolve';
import { resolveBirthTimeOptions, type BirthTimeResolution } from '@/lib/divination/birth-time';

interface CompletePillarData {
    stem: string;
    branch: string;
}

export interface ReversedDateTime {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    solarDate: string;
    lunarDate: string;
}

interface FourPillars {
    year: CompletePillarData;
    month: CompletePillarData;
    day: CompletePillarData;
    hour: CompletePillarData;
}

export async function reversePillars(
    pillars: FourPillars,
    options: BirthTimeResolution & { longitude?: number } = {},
): Promise<ReversedDateTime[]> {
    const result = await resolveBaziPillars({
        yearPillar: `${pillars.year.stem}${pillars.year.branch}`,
        monthPillar: `${pillars.month.stem}${pillars.month.branch}`,
        dayPillar: `${pillars.day.stem}${pillars.day.branch}`,
        hourPillar: `${pillars.hour.stem}${pillars.hour.branch}`,
        startYear: 1900,
        endYear: 2100,
        longitude: options.longitude,
        ...resolveBirthTimeOptions(options),
    });
    return result.candidates.map(candidate => {
        // solarText is the original civil-minute window start, not corrected solar time.
        const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(candidate.solarText);
        if (!match) throw new Error('反推候选时间格式无效');
        const [year, month, day, hour, minute] = match.slice(1).map(Number);
        return { year, month, day, hour, minute, solarDate: candidate.solarText, lunarDate: candidate.lunarText };
    });
}
