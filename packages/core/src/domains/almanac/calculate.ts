/**
 * 每日黄历核心引擎
 */

import { Solar } from 'lunar-javascript';
import type { AlmanacInput, AlmanacOutput } from './types.js';
import type { HourlyFortuneInfo, NineStarInfo } from '../shared/types.js';
import { calculateTenGod } from '../../shared/utils.js';
import { TIAN_GAN } from '../../data/ganzhi.js';
import { CoreInputError, parseCivilDate, validateCivilDateTime } from '../../shared/validation.js';
import { DEFAULT_DIVINATION_TIMEZONE, getZonedDateTimeParts } from '../../shared/timezone-utils.js';

export type {
  AlmanacInput,
  AlmanacOutput,
} from './types.js';
export type {
  HourlyFortuneInfo,
  NineStarInfo,
} from '../shared/types.js';

// ===== 缓存配置 =====
const ALMANAC_CACHE_TTL = 60 * 60 * 1000; // 1小时
const ALMANAC_CACHE_MAX = 200;
const almanacCache = new Map<string, { data: AlmanacOutput; expire: number; }>();

function getCachedAlmanac(date: string, dayMaster?: string): AlmanacOutput | undefined {
  const key = `${date}:${dayMaster || 'none'}`;
  const cached = almanacCache.get(key);
  if (cached && cached.expire > Date.now()) {
    return structuredClone(cached.data);
  }
  if (cached) almanacCache.delete(key);
  return undefined;
}

function setCachedAlmanac(date: string, dayMaster: string | undefined, data: AlmanacOutput): void {
  const key = `${date}:${dayMaster || 'none'}`;
  if (almanacCache.size >= ALMANAC_CACHE_MAX) {
    // 淘汰最早的条目
    const firstKey = almanacCache.keys().next().value;
    if (firstKey !== undefined) almanacCache.delete(firstKey);
  }
  almanacCache.set(key, { data: structuredClone(data), expire: Date.now() + ALMANAC_CACHE_TTL });
}

export async function calculateDailyAlmanac(input: AlmanacInput): Promise<AlmanacOutput> {
  const timezone = input.timezone ?? DEFAULT_DIVINATION_TIMEZONE;
  const calculationOptions = { timezone, ruleVersion: 'almanac-2026.10' };
  const now = getZonedDateTimeParts(new Date(), timezone);
  const target = input.date === undefined ? now : parseCivilDate(input.date);
  const dateKey = `${String(target.year).padStart(4, '0')}-${String(target.month).padStart(2, '0')}-${String(target.day).padStart(2, '0')}`;

  // 获取日主
  let dayMaster = input.dayMaster;
  if (dayMaster !== undefined && !TIAN_GAN.includes(dayMaster as typeof TIAN_GAN[number])) {
    throw new CoreInputError('dayMaster', '日主必须为十天干之一');
  }
  const birthProvided = [input.birthYear, input.birthMonth, input.birthDay, input.birthHour].some(value => value !== undefined);
  if (birthProvided) {
    if (input.birthYear === undefined || input.birthMonth === undefined || input.birthDay === undefined) {
      throw new CoreInputError('birth', '出生年月日必须完整提供');
    }
    validateCivilDateTime({ year: input.birthYear, month: input.birthMonth, day: input.birthDay, hour: input.birthHour ?? 12 }, 'birth');
  }
  if (!dayMaster && birthProvided) {
    const birthSolar = Solar.fromYmdHms(
      input.birthYear!,
      input.birthMonth!,
      input.birthDay!,
      input.birthHour ?? 12,
      0,
      0
    );
    const birthLunar = birthSolar.getLunar();
    dayMaster = birthLunar.getEightChar().getDayGan();
  }

  // 检查缓存（只有当 dayMaster 相同时才能复用缓存）
  const cached = getCachedAlmanac(dateKey, dayMaster);
  if (cached) {
    return { ...cached, calculationOptions };
  }

  // 如果没有日主，尝试从缓存中获取无日主的结果
  if (!dayMaster) {
    const cachedNoDayMaster = getCachedAlmanac(dateKey, undefined);
    if (cachedNoDayMaster) {
      return { ...cachedNoDayMaster, calculationOptions };
    }
  }

  const solar = Solar.fromYmd(target.year, target.month, target.day);
  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  // 流日干支
  const dayStem = eightChar.getDayGan();
  const dayBranch = eightChar.getDayZhi();

  // 计算十神（如果有日主）
  const tenGod = dayMaster ? calculateTenGod(dayMaster, dayStem) : undefined;

  // 获取黄历信息
  const jieQi = lunar.getJieQi();

  // 安全获取数组
  const safeGetArray = (fn: () => string[]): string[] => {
    try { return fn() || []; } catch { return []; }
  };

  // 安全获取字符串
  const safeGetString = (fn: () => string): string => {
    try { return fn() || ''; } catch { return ''; }
  };

  // 方位系统 - 使用 lunar-javascript 内置方法
  const directions = {
    caiShen: safeGetString(() => lunar.getDayPositionCaiDesc()),
    xiShen: safeGetString(() => lunar.getDayPositionXiDesc()),
    fuShen: safeGetString(() => lunar.getDayPositionFuDesc()),
    yangGui: safeGetString(() => lunar.getDayPositionYangGuiDesc()),
    yinGui: safeGetString(() => lunar.getDayPositionYinGuiDesc()),
  };

  // 建除十二值星
  const dayOfficer = safeGetString(() => lunar.getZhiXing());

  // 天神（黄道黑道日）
  const tianShen = safeGetString(() => lunar.getDayTianShen());
  const tianShenType = safeGetString(() => lunar.getDayTianShenType());
  const tianShenLuck = safeGetString(() => lunar.getDayTianShenLuck());

  // 二十八星宿
  const lunarMansion = safeGetString(() => lunar.getXiu());
  const lunarMansionLuck = safeGetString(() => lunar.getXiuLuck());
  const lunarMansionSong = safeGetString(() => lunar.getXiuSong());

  // 日柱纳音
  const nayin = safeGetString(() => lunar.getDayNaYin());

  // 彭祖百忌（getPengZuGan/getPengZuZhi 返回字符串）
  const pengZuGan = safeGetString(() => lunar.getPengZuGan() as unknown as string);
  const pengZuZhi = safeGetString(() => lunar.getPengZuZhi() as unknown as string);
  const pengZuBaiJi = [pengZuGan, pengZuZhi].filter(Boolean).join(' ');

  // 日九宫飞星
  let dayNineStar: NineStarInfo | undefined;
  try {
    const nineStar = lunar.getDayNineStar();
    if (nineStar) {
      dayNineStar = {
        number: nineStar.getNumber(),
        description: nineStar.toFullString(),
        color: nineStar.getColor(),
        wuXing: nineStar.getWuXing(),
        position: nineStar.getPositionDesc(),
      };
    }
  } catch { /* getDayNineStar not available */ }

  // 胎神占方
  const taiShen = safeGetString(() => lunar.getDayPositionTai());

  // 时辰吉凶
  const hourlyFortune: HourlyFortuneInfo[] = [];
  try {
    const times = lunar.getTimes();
    for (const t of times) {
      hourlyFortune.push({
        ganZhi: safeGetString(() => t.getGanZhi()),
        startTime: safeGetString(() => t.getMinHm()),
        endTime: safeGetString(() => t.getMaxHm()),
        tianShen: safeGetString(() => t.getTianShen()),
        tianShenType: safeGetString(() => t.getTianShenType()),
        tianShenLuck: safeGetString(() => t.getTianShenLuck()),
        chong: safeGetString(() => t.getChongDesc()),
        sha: safeGetString(() => t.getSha()),
        suitable: safeGetArray(() => t.getYi()),
        avoid: safeGetArray(() => t.getJi()),
      });
    }
  } catch { /* getTimes not available */ }

  const result: AlmanacOutput = {
    date: dateKey,
    dayInfo: {
      stem: dayStem,
      branch: dayBranch,
      ganZhi: `${dayStem}${dayBranch}`,
    },
    tenGod,
    almanac: {
      lunarDate: lunar.toString(),
      lunarMonth: lunar.getMonthInChinese(),
      lunarDay: lunar.getDayInChinese(),
      zodiac: lunar.getYearShengXiao(),
      solarTerm: jieQi || undefined,
      suitable: safeGetArray(() => lunar.getDayYi()),
      avoid: safeGetArray(() => lunar.getDayJi()),
      chongSha: `冲${safeGetString(() => lunar.getDayChongDesc())} 煞${safeGetString(() => lunar.getDaySha())}`,
      pengZuBaiJi,
      jishen: safeGetArray(() => lunar.getDayJiShen()),
      xiongsha: safeGetArray(() => lunar.getDayXiongSha()),
      directions,
      dayOfficer,
      tianShen,
      tianShenType,
      tianShenLuck,
      lunarMansion,
      lunarMansionLuck,
      lunarMansionSong,
      nayin,
      dayNineStar,
      taiShen: taiShen || undefined,
      hourlyFortune,
    },
  };

  // 缓存结果
  setCachedAlmanac(dateKey, dayMaster, result);

  // 如果没有日主，同时缓存无日主版本
  if (!dayMaster) {
    setCachedAlmanac(dateKey, undefined, result);
  }

  return { ...result, calculationOptions };
}
