import { astro, star, util, type Horoscope } from 'iztro';
import * as iztroI18n from 'iztro/lib/i18n/index.js';
import { getHeavenlyStemAndEarthlyBranchBySolarDate, normalizeDateStr, solar2lunar } from 'lunar-lite';
import { LunarMonth, LunarYear } from 'lunar-javascript';
import { DI_ZHI } from '../../data/ganzhi.js';
import { assertInteger, CoreInputError, resolveEnum, validateCivilDateTime } from '../../shared/validation.js';
import { DEFAULT_DIVINATION_TIMEZONE, getZonedDateTimeParts, type LocalTimeDisambiguation } from '../../shared/timezone-utils.js';
import { hourToTimeIndex } from '../shared/true-solar.js';
import type { ZiweiCalculationOptions } from './types.js';

type Config = Parameters<typeof astro.config>[0];
type Astrolabe = ReturnType<typeof astro.bySolar>;
const profiles = new WeakMap<object, ZiweiCalculationOptions>();
const birthTimeOptions = new WeakMap<object, { timezone: string; disambiguation: LocalTimeDisambiguation; }>();
const ARRAY_CALLBACK_METHODS = new Set(['forEach', 'map', 'flatMap', 'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'some', 'every', 'reduce', 'reduceRight', 'sort', 'toSorted']);
const CHILDHOOD_PALACES = ['命宫', '财帛', '疾厄', '夫妻', '福德', '官禄'];
// Node CJS interop and browser bundlers expose iztro's default i18next export differently.
const localeExport = iztroI18n.default as unknown as { language?: string; default?: { language?: string; }; };
const locale = localeExport.default ?? localeExport;
export const ZIWEI_MUTAGEN_STARS = ['廉贞', '破军', '武曲', '太阳', '天机', '天梁', '紫微', '太阴', '天同', '文昌', '巨门', '贪狼', '右弼', '文曲', '左辅', '天府', '天相', '七杀'];

export function resolveZiweiOptions(options: ZiweiCalculationOptions = {}): ZiweiCalculationOptions {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new CoreInputError('calculationOptions', '必须是对象');
  for (const key of Object.keys(options)) if (!['algorithm', 'yearDivide', 'horoscopeDivide', 'ageDivide', 'dayDivide', 'fixLeap', 'mutagens'].includes(key)) throw new CoreInputError(`calculationOptions.${key}`, '未知配置项');
  const result: ZiweiCalculationOptions = {
    algorithm: resolveEnum(options.algorithm, ['default', 'zhongzhou'] as const, 'default', 'calculationOptions.algorithm'),
    yearDivide: resolveEnum(options.yearDivide, ['normal', 'exact'] as const, 'normal', 'calculationOptions.yearDivide'),
    horoscopeDivide: resolveEnum(options.horoscopeDivide, ['normal', 'exact'] as const, 'exact', 'calculationOptions.horoscopeDivide'),
    ageDivide: resolveEnum(options.ageDivide, ['normal', 'birthday'] as const, 'normal', 'calculationOptions.ageDivide'),
    dayDivide: resolveEnum(options.dayDivide, ['current', 'forward'] as const, 'forward', 'calculationOptions.dayDivide'),
    fixLeap: options.fixLeap ?? true,
  };
  if (typeof result.fixLeap !== 'boolean') throw new CoreInputError('calculationOptions.fixLeap', '必须是布尔值');
  if (options.mutagens !== undefined) {
    if (!options.mutagens || typeof options.mutagens !== 'object' || Array.isArray(options.mutagens)) throw new CoreInputError('calculationOptions.mutagens', '必须是十干四化表');
    result.mutagens = {};
    const stars = new Set(ZIWEI_MUTAGEN_STARS);
    for (const [stem, values] of Object.entries(options.mutagens)) {
      if (!'甲乙丙丁戊己庚辛壬癸'.includes(stem) || stem.length !== 1 || !Array.isArray(values) || values.length !== 4 || new Set(values).size !== 4 || values.some(value => !stars.has(value))) {
        throw new CoreInputError(`calculationOptions.mutagens.${stem}`, '必须按禄权科忌提供四颗不同的四化星');
      }
      result.mutagens[stem] = [...values] as [string, string, string, string];
    }
  }
  return result;
}

/** iztro configuration is process global and merges maps. Restore maps exactly, including removed keys. */
export function withZiweiOptions<T>(profile: ZiweiCalculationOptions, operation: () => T): T {
  const previous = structuredClone(astro.getConfig());
  const previousLanguage = locale.language ?? 'zh-CN';
  const replace = (config: Config) => {
    const current = astro.getConfig();
    for (const key of Object.keys(current.mutagens)) delete current.mutagens[key as keyof typeof current.mutagens];
    for (const key of Object.keys(current.brightness)) delete current.brightness[key as keyof typeof current.brightness];
    astro.config(config);
  };
  try {
    iztroI18n.setLanguage('zh-CN');
    replace({ ...profile, mutagens: profile.mutagens as Config['mutagens'], brightness: {} });
    return operation();
  } finally {
    try {
      replace(previous);
    } finally {
      iztroI18n.setLanguage(previousLanguage as Parameters<typeof iztroI18n.setLanguage>[0]);
    }
  }
}

function periodFields(index: number, heavenlyStem: string, earthlyBranch: string) {
  return { index, heavenlyStem, earthlyBranch, palaceNames: astro.getPalaceNames(index),
    mutagen: util.getMutagensByHeavenlyStem(heavenlyStem) };
}

function birthdayAge(birthday: ReturnType<typeof solar2lunar>, target: ReturnType<typeof solar2lunar>): number {
  const leapAnniversary = birthday.isLeap && LunarYear.fromYear(target.lunarYear).getLeapMonth() === birthday.lunarMonth;
  const month = LunarMonth.fromYm(target.lunarYear, leapAnniversary ? -birthday.lunarMonth : birthday.lunarMonth);
  if (!month) throw new CoreInputError('targetDate', '无法确定农历生日');
  // Retain iztro's next-day boundary. Missing leap months use the ordinary month;
  // a short anniversary month uses its last day, so age never goes backwards.
  const anniversaryDay = Math.min(birthday.lunarDay, month.getDayCount());
  const targetMonth = target.lunarMonth * 2 + Number(target.isLeap);
  const anniversaryMonth = birthday.lunarMonth * 2 + Number(leapAnniversary);
  const passed = targetMonth > anniversaryMonth || (targetMonth === anniversaryMonth && target.lunarDay > anniversaryDay);
  return target.lunarYear - birthday.lunarYear + Number(passed);
}

function boundHoroscope(
  astrolabe: Astrolabe,
  profile: ZiweiCalculationOptions,
  timezone: string,
  targetDate?: string | Date,
  targetTimeIndex?: number,
): Horoscope {
  if (targetTimeIndex !== undefined) assertInteger(targetTimeIndex, 'targetTimeIndex', 0, 12);
  let parts;
  if (typeof targetDate === 'string') {
    const [year, month, day, hour = 0, minute = 0, second = 0] = normalizeDateStr(targetDate);
    parts = { year, month, day, hour, minute, second };
  } else {
    if (targetDate !== undefined && !(targetDate instanceof Date)) throw new CoreInputError('targetDate', '日期无效');
    parts = getZonedDateTimeParts(targetDate ?? new Date(), timezone);
  }
  validateCivilDateTime(parts, 'targetDate');
  const timeIndex = targetTimeIndex ?? hourToTimeIndex(parts.hour + parts.minute / 60);
  const civil = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  // A civil string preserves fields through lunar-lite; a nonzero seed bypasses
  // iztro's `timeIndex || dayjs(date).hour()` even when the host has a midnight gap.
  const result = astrolabe.horoscope(civil, timeIndex === 0 ? 1 : timeIndex);
  if (timeIndex === 0) {
    const { monthly, hourly } = getHeavenlyStemAndEarthlyBranchBySolarDate(civil, 0, {
      year: profile.horoscopeDivide ?? 'exact', month: profile.horoscopeDivide ?? 'exact',
    });
    result.monthly = { ...result.monthly, ...periodFields(result.monthly.index, monthly[0], monthly[1]),
      stars: star.getHoroscopeStar(monthly[0], monthly[1], 'monthly') };
    const hourlyIndex = (result.daily.index + DI_ZHI.indexOf(hourly[1]) + 12) % 12;
    result.hourly = { ...result.hourly, ...periodFields(hourlyIndex, hourly[0], hourly[1]),
      stars: star.getHoroscopeStar(hourly[0], hourly[1], 'hourly') };
  }
  if (profile.ageDivide === 'birthday' && astrolabe.solarDate) {
    const nominalAge = birthdayAge(solar2lunar(astrolabe.solarDate), solar2lunar(civil));
    if (nominalAge !== result.age.nominalAge) {
      const agePalace = astrolabe.palaces.find(palace => palace.ages.includes(nominalAge));
      result.age = { ...result.age, nominalAge, ...periodFields(agePalace?.index ?? -1,
        agePalace?.heavenlyStem ?? 'jia', agePalace?.earthlyBranch ?? 'zi') };
      let decadalPalace = astrolabe.palaces.find(palace => nominalAge >= palace.decadal.range[0] && nominalAge <= palace.decadal.range[1]);
      let childhood = false;
      if (!decadalPalace && nominalAge >= 1 && nominalAge <= CHILDHOOD_PALACES.length) {
        decadalPalace = astrolabe.palace(CHILDHOOD_PALACES[nominalAge - 1]);
        childhood = !!decadalPalace;
      }
      const stem = childhood ? decadalPalace!.heavenlyStem : decadalPalace?.decadal.heavenlyStem ?? '甲';
      const branch = childhood ? decadalPalace!.earthlyBranch : decadalPalace?.decadal.earthlyBranch ?? '子';
      result.decadal = { ...result.decadal, name: childhood ? '童限' : '大限',
        ...periodFields(decadalPalace?.index ?? -1, stem, branch), stars: star.getHoroscopeStar(stem, branch, 'decadal') };
    }
  }
  return result;
}

/** Lazy palace/star/horoscope methods also read global config. Bind the complete object graph to its profile. */
export function bindZiweiProfile(astrolabe: Astrolabe, profile: ZiweiCalculationOptions, timezone = DEFAULT_DIVINATION_TIMEZONE, disambiguation: LocalTimeDisambiguation = 'reject'): Astrolabe {
  const proxies = new WeakMap<object, object>();
  const originals = new WeakMap<object, object>();
  const bind = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || value instanceof Date) return value;
    if (originals.has(value)) return value;
    const existing = proxies.get(value);
    if (existing) return existing;
    const proxy = new Proxy(value, {
      get(target, key) {
        const member = Reflect.get(target, key, target);
        if (key === 'constructor') return member;
        if (typeof member !== 'function') return bind(member);
        return (...args: unknown[]) => withZiweiOptions(profile, () => {
          if (target === astrolabe && key === 'horoscope') {
            return bind(boundHoroscope(astrolabe, profile, timezone, args[0] as string | Date | undefined, args[1] as number | undefined));
          }
          const supplied = args.map((arg, index) => {
            if (index === 0 && typeof arg === 'function' && Array.isArray(target) && ARRAY_CALLBACK_METHODS.has(String(key))) {
              return function(this: unknown, ...callbackArgs: unknown[]) {
                return Reflect.apply(arg, this, callbackArgs.map(bind));
              };
            }
            if (index === 1 && Array.isArray(target) && ARRAY_CALLBACK_METHODS.has(String(key)) && !['reduce', 'reduceRight'].includes(String(key))) return arg;
            return arg && typeof arg === 'object' ? originals.get(arg) ?? arg : arg;
          });
          return bind(Reflect.apply(member, target, supplied));
        });
      },
    });
    proxies.set(value, proxy);
    originals.set(proxy, value);
    profiles.set(proxy, profile);
    return proxy;
  };
  const bound = bind(astrolabe) as Astrolabe;
  birthTimeOptions.set(bound, { timezone, disambiguation });
  return bound;
}

export function ensureZiweiProfile(astrolabe: Astrolabe, timezone = DEFAULT_DIVINATION_TIMEZONE): Astrolabe {
  return profiles.has(astrolabe) ? astrolabe : bindZiweiProfile(astrolabe, resolveZiweiOptions(), timezone);
}

export function getZiweiOptions(astrolabe: Astrolabe): ZiweiCalculationOptions & { timezone: string; disambiguation: LocalTimeDisambiguation; ruleVersion: string; } {
  return {
    ...structuredClone(profiles.get(astrolabe) ?? resolveZiweiOptions()),
    ...(birthTimeOptions.get(astrolabe) ?? { timezone: DEFAULT_DIVINATION_TIMEZONE, disambiguation: 'reject' }),
    ruleVersion: 'ziwei-iztro2.5.4-2026.10',
  };
}

/** SDK snapshots contain data only; never leak the lazy engine's proxy graph. */
export function snapshotZiweiResult<T extends object>(result: T): T {
  return JSON.parse(JSON.stringify(result)) as T;
}

export function getAstrolabeMutagens(astrolabe: Astrolabe, stem: string): string[] {
  return withZiweiOptions(getZiweiOptions(astrolabe), () => [...util.getMutagensByHeavenlyStem(stem as Parameters<typeof util.getMutagensByHeavenlyStem>[0])]);
}
