/**
 * 四柱反推候选出生时间
 */

import { Solar } from 'lunar-javascript';
import { DI_ZHI, TIAN_GAN } from '../../data/ganzhi.js';
import { resolveBaziCalendarContext } from '../bazi/calculate.js';
import { assertFiniteNumber, assertInteger, CoreInputError, createUtcDateTime, resolveEnum } from '../../shared/validation.js';
import { DEFAULT_DIVINATION_TIMEZONE, getZonedDateTimeParts } from '../../shared/timezone-utils.js';
import type {
  BaziPillarsResolveCandidate,
  BaziPillarsResolveInput,
  BaziPillarsResolveOutput,
} from './types.js';

export type {
  BaziPillarsResolveCandidate,
  BaziPillarsResolveInput,
  BaziPillarsResolveOutput,
} from './types.js';

type Stem = (typeof TIAN_GAN)[number];
type Branch = (typeof DI_ZHI)[number];

type ParsedPillar = {
  stem: Stem;
  branch: Branch;
};

type ParsedPillars = {
  year: ParsedPillar;
  month: ParsedPillar;
  day: ParsedPillar;
  hour: ParsedPillar;
};

const HOUR_BRANCH_MAP: Record<Branch, number[]> = {
  '子': [23, 0],
  '丑': [1, 2],
  '寅': [3, 4],
  '卯': [5, 6],
  '辰': [7, 8],
  '巳': [9, 10],
  '午': [11, 12],
  '未': [13, 14],
  '申': [15, 16],
  '酉': [17, 18],
  '戌': [19, 20],
  '亥': [21, 22],
};

const ALL_HOURS = Array.from({ length: 24 }, (_, index) => index);

function isValidPillar(stem: Stem, branch: Branch): boolean {
  const stemIndex = TIAN_GAN.indexOf(stem);
  const branchIndex = DI_ZHI.indexOf(branch);
  return stemIndex % 2 === branchIndex % 2;
}

function parsePillar(raw: string, field: string): ParsedPillar {
  if (typeof raw !== 'string' || raw.length !== 2) {
    throw new Error(`${field} 必须是 2 字干支，例如“甲子”`);
  }

  const stem = raw[0] as Stem;
  const branch = raw[1] as Branch;

  if (!TIAN_GAN.includes(stem)) {
    throw new Error(`${field} 天干无效：${raw[0]}`);
  }
  if (!DI_ZHI.includes(branch)) {
    throw new Error(`${field} 地支无效：${raw[1]}`);
  }
  if (!isValidPillar(stem, branch)) {
    throw new Error(`${field} 不是有效干支组合：${raw}`);
  }

  return { stem, branch };
}

function toSolarText(year: number, month: number, day: number, hour: number, minute: number): string {
  const yyyy = String(year).padStart(4, '0');
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const mi = String(minute).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function toLunarText(solar: Solar, hourBranch: Branch): string {
  const lunar = solar.getLunar();
  return `农历${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()} ${hourBranch}时`;
}

type YieldControl = () => Promise<void> | undefined;

function createYieldControl(): YieldControl {
  let resumedAt = performance.now();
  return () => {
    if (performance.now() - resumedAt < 8) return undefined;
    return new Promise<void>(resolve => setTimeout(() => {
      resumedAt = performance.now();
      resolve();
    }, 0));
  };
}

async function reverseYear(yearPillar: ParsedPillar, startYear: number, endYear: number, yieldControl: YieldControl): Promise<number[]> {
  const years: number[] = [];
  for (let year = startYear; year <= endYear; year++) {
      const pause = yieldControl();
      if (pause) await pause;
      const jan = Solar.fromYmd(year, 1, 15).getLunar().getEightChar();
      if (jan.getYearGan() === yearPillar.stem && jan.getYearZhi() === yearPillar.branch) {
        years.push(year);
        continue;
      }

      const jun = Solar.fromYmd(year, 6, 15).getLunar().getEightChar();
      if (jun.getYearGan() === yearPillar.stem && jun.getYearZhi() === yearPillar.branch) {
        years.push(year);
      }
  }
  return years;
}

async function reverseMonth(year: number, yearPillar: ParsedPillar, monthPillar: ParsedPillar, yieldControl: YieldControl): Promise<number[]> {
  const months: number[] = [];
  for (let month = 1; month <= 12; month++) {
    const pause = yieldControl();
    if (pause) await pause;
    const checkDays = [1, 15, 28];
    for (const day of checkDays) {
        const ec = Solar.fromYmd(year, month, day).getLunar().getEightChar();
        if (
          ec.getYearGan() === yearPillar.stem &&
          ec.getYearZhi() === yearPillar.branch &&
          ec.getMonthGan() === monthPillar.stem &&
          ec.getMonthZhi() === monthPillar.branch
        ) {
          months.push(month);
          break;
        }
    }
  }
  return months;
}

function isCalendarReformGapError(error: unknown): boolean {
  // A valid civil minute can also map into the library's gap after timezone/solar correction.
  return error instanceof Error && /^wrong solar year 1582 month 10 day (?:[5-9]|1[0-4])$/.test(error.message);
}

async function reverseDay(year: number, month: number, dayPillar: ParsedPillar, input: BaziPillarsResolveInput, yieldControl: YieldControl): Promise<number[]> {
  const days: number[] = [];
  const nextMonth = createUtcDateTime({ year: month === 12 ? year + 1 : year, month: month === 12 ? 1 : month + 1, day: 1 });
  const maxDay = new Date(nextMonth.getTime() - 86400000).getUTCDate();
  for (let day = 1; day <= maxDay; day++) {
      const pause = yieldControl();
      if (pause) await pause;
      // lunar-javascript's mixed calendar omits these reform dates; skip only that known gap.
      if (year === 1582 && month === 10 && day >= 5 && day <= 14) continue;
      const possible = [0, 12, 23].some(hour => {
        try {
        const { lunar } = resolveBaziCalendarContext({ ...input, birthYear: year, birthMonth: month, birthDay: day, birthHour: hour, birthMinute: hour === 23 ? 59 : 0, gender: 'male' });
        const ec = lunar.getEightChar();
        ec.setSect(input.dayBoundary === 'zi' ? 1 : 2);
        return ec.getDayGan() === dayPillar.stem && ec.getDayZhi() === dayPillar.branch;
        } catch (error) {
          if (isCalendarReformGapError(error)) return false;
          if (error instanceof CoreInputError && ['AMBIGUOUS_LOCAL_TIME', 'NONEXISTENT_LOCAL_TIME'].includes(error.code)) return false;
          throw error;
        }
      });
      if (possible) {
        days.push(day);
      }
  }
  return days;
}

function buildNextCallArgs(candidate: BaziPillarsResolveCandidate['nextCall']['arguments']) {
  return {
    tool: 'bazi' as const,
    arguments: candidate,
    missing: ['gender'] as ['gender'],
  };
}

async function reversePillarsToCandidates(pillars: ParsedPillars, input: BaziPillarsResolveInput, skipped: { ambiguous: number; }): Promise<BaziPillarsResolveCandidate[]> {
  const candidates: BaziPillarsResolveCandidate[] = [];
  const accepted = new Set<number>();
  const yieldControl = createYieldControl();

  const years = await reverseYear(pillars.year, input.startYear!, input.endYear!, yieldControl);
  for (const year of years) {
    const months = await reverseMonth(year, pillars.year, pillars.month, yieldControl);
    for (const month of months) {
      const days = await reverseDay(year, month, pillars.day, input, yieldControl);
      for (const day of days) {
        // Gap policies can map raw hours outside the requested branch into it.
        const hours = input.longitude === undefined && input.disambiguation === 'reject'
          ? HOUR_BRANCH_MAP[pillars.hour.branch] : ALL_HOURS;
        for (const hour of hours) {
          for (let minute = 0; minute < 60; minute++) {
          const pause = yieldControl();
          if (pause) await pause;
          try {
            const { lunar, termLunar } = resolveBaziCalendarContext({ ...input, birthYear: year, birthMonth: month, birthDay: day, birthHour: hour, birthMinute: minute, gender: 'male' });
            const ec = lunar.getEightChar();
            ec.setSect(input.dayBoundary === 'zi' ? 1 : 2);
            const term = termLunar.getEightChar();

            // 最终强校验：年/月/日/时干支必须全部匹配
            const matches =
              term.getYearGan() === pillars.year.stem &&
              term.getYearZhi() === pillars.year.branch &&
              term.getMonthGan() === pillars.month.stem &&
              term.getMonthZhi() === pillars.month.branch &&
              ec.getDayGan() === pillars.day.stem &&
              ec.getDayZhi() === pillars.day.branch &&
              ec.getTimeGan() === pillars.hour.stem &&
              ec.getTimeZhi() === pillars.hour.branch;

            if (!matches) continue;
            accepted.add(createUtcDateTime({ year, month, day, hour, minute }).getTime());
          } catch (error) {
            if (isCalendarReformGapError(error)) continue;
            if (error instanceof CoreInputError && error.code === 'AMBIGUOUS_LOCAL_TIME') skipped.ambiguous++;
            else if (!(error instanceof CoreInputError && error.code === 'NONEXISTENT_LOCAL_TIME')) throw error;
          }
          }
        }
      }
    }
  }

  const minutes = [...accepted].sort((left, right) => left - right);
  for (let index = 0; index < minutes.length;) {
    const start = new Date(minutes[index]);
    let endIndex = index;
    while (endIndex + 1 < minutes.length && minutes[endIndex + 1] === minutes[endIndex] + 60000) endIndex++;
    const end = new Date(minutes[endIndex] + 60000);
    const solar = Solar.fromYmdHms(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), start.getUTCHours(), start.getUTCMinutes(), 0);
    const lunar = solar.getLunar();
    const calendarType = lunar.getYear() >= 1 && lunar.getYear() <= 9999 ? 'lunar' : 'solar';
    const nextArgs: BaziPillarsResolveCandidate['nextCall']['arguments'] = {
      birthYear: calendarType === 'lunar' ? lunar.getYear() : solar.getYear(),
      birthMonth: calendarType === 'lunar' ? Math.abs(lunar.getMonth()) : solar.getMonth(),
      birthDay: calendarType === 'lunar' ? lunar.getDay() : solar.getDay(),
      birthHour: solar.getHour(), birthMinute: solar.getMinute(), calendarType,
      isLeapMonth: calendarType === 'lunar' && lunar.getMonth() < 0,
      timezone: input.timezone, dayBoundary: input.dayBoundary, disambiguation: input.disambiguation, ...(input.longitude === undefined ? {} : { longitude: input.longitude }),
    };
    const endText = toSolarText(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), end.getUTCHours(), end.getUTCMinutes());
    const solarText = toSolarText(solar.getYear(), solar.getMonth(), solar.getDay(), solar.getHour(), solar.getMinute());
    candidates.push({ candidateId: `cand_${candidates.length + 1}`, calendarType, isLeapMonth: nextArgs.isLeapMonth, birthYear: nextArgs.birthYear, birthMonth: nextArgs.birthMonth, birthDay: nextArgs.birthDay, birthHour: nextArgs.birthHour, birthMinute: nextArgs.birthMinute,
      solarText, lunarText: toLunarText(solar, pillars.hour.branch), nextCall: buildNextCallArgs(nextArgs), timeWindow: { start: solarText, end: endText, endExclusive: true, precision: 'minute', timezone: input.timezone! } });
    index = endIndex + 1;
  }
  return candidates;
}

export async function calculateBaziPillarsResolve(
  input: BaziPillarsResolveInput,
): Promise<BaziPillarsResolveOutput> {
  const parsed: ParsedPillars = {
    year: parsePillar(input.yearPillar, 'yearPillar'),
    month: parsePillar(input.monthPillar, 'monthPillar'),
    day: parsePillar(input.dayPillar, 'dayPillar'),
    hour: parsePillar(input.hourPillar, 'hourPillar'),
  };

  const startYear = input.startYear ?? 1900;
  const endYear = input.endYear ?? 2100;
  assertInteger(startYear, 'startYear', 1, 9998);
  assertInteger(endYear, 'endYear', startYear, Math.min(9998, startYear + 1199));
  const timezone = input.timezone ?? DEFAULT_DIVINATION_TIMEZONE;
  getZonedDateTimeParts(new Date(0), timezone);
  const dayBoundary = resolveEnum(input.dayBoundary, ['midnight', 'zi'] as const, 'midnight', 'dayBoundary');
  const disambiguation = resolveEnum(input.disambiguation, ['reject', 'earlier', 'later', 'compatible'] as const, 'reject', 'disambiguation');
  if (input.longitude !== undefined) assertFiniteNumber(input.longitude, 'longitude', -180, 180);
  const skipped = { ambiguous: 0 };
  const candidates = await reversePillarsToCandidates(parsed, { ...input, startYear, endYear, timezone, dayBoundary, disambiguation }, skipped);

  return {
    pillars: {
      yearPillar: `${parsed.year.stem}${parsed.year.branch}`,
      monthPillar: `${parsed.month.stem}${parsed.month.branch}`,
      dayPillar: `${parsed.day.stem}${parsed.day.branch}`,
      hourPillar: `${parsed.hour.stem}${parsed.hour.branch}`,
    },
    count: candidates.length,
    candidates,
    calculationOptions: { startYear, endYear, timezone, dayBoundary, disambiguation, ...(input.longitude === undefined ? {} : { longitude: input.longitude }), precision: 'minute', excludedAmbiguousMinutes: skipped.ambiguous, ruleVersion: 'bazi-resolve-2026.10' },
  };
}
