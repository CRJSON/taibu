import { Solar } from 'lunar-javascript';
import { DI_ZHI } from '../../data/ganzhi.js';
import { assertInteger, CoreInputError, createUtcDateTime, resolveEnum } from '../../shared/validation.js';
import { CALENDAR_TIMEZONE, DEFAULT_DIVINATION_TIMEZONE, getZonedDateTimeParts, zonedTimeToUtc } from '../../shared/timezone-utils.js';
import type { TaiyiInput, TaiyiTraditionalBoard } from './types.js';

// 《太乙金鏡式經》四庫全書本卷三，陽/陰七十二局立成。
// This edition differs from kintaiyi's tables at several entries; do not replace it with that implementation's data.
const YANG_HOME = [7,6,1,25,25,25,8,1,3,1,4,37,18,10,9,1,7,7,8,7,2,16,16,16,39,32,31,14,13,10,33,25,24,26,25,25,1,6,25,27,27,27,8,33,32,5,4,1,24,6,15,39,38,38,16,15,10,12,12,12,33,26,25,16,15,12,25,17,16,30,29,29];
const YANG_AWAY = [13,1,40,17,14,10,25,22,15,12,4,1,19,9,7,33,27,26,32,26,17,30,23,17,40,31,28,9,39,32,10,8,3,4,28,27,7,35,34,19,16,12,17,14,7,16,8,5,25,15,13,31,25,24,3,34,25,26,19,13,34,25,22,11,1,34,2,8,32,4,32,31];
const YIN_HOME = [5,4,1,25,25,17,2,1,7,1,6,35,12,12,11,1,3,3,14,13,10,24,24,16,21,31,39,8,7,2,27,27,26,26,25,25,1,4,37,33,33,25,2,39,38,7,6,1,16,16,15,33,32,32,16,15,12,18,18,10,27,26,25,16,15,10,25,25,24,22,31,31];
const YIN_AWAY = [29,17,16,33,30,26,3,7,33,34,36,23,37,27,29,15,9,8,16,10,1,14,7,1,16,7,4,25,15,8,28,26,18,22,10,9,25,13,12,1,38,34,38,31,31,2,32,29,1,31,29,7,1,8,18,12,3,8,1,35,12,3,4,33,23,16,26,24,16,28,16,15];
const POSITIONS = Array.from('子丑艮寅卯辰巽巳午未坤申酉戌乾亥');
const GOD_NAMES = ['地主','阳德','和德','吕申','高丛','太阳','大炅','大神','大威','天道','大武','武德','太簇','阴主','阴德','大义'];
const NUMBER_POSITION: Record<number, string> = { 1: '乾', 2: '午', 3: '艮', 4: '卯', 5: '中', 6: '酉', 7: '坤', 8: '子', 9: '巽' };
const TAIYI_CYCLE = [1,2,3,4,6,7,8,9];
const YANG_EYES = Array.from('申酉戌乾乾亥子丑艮寅卯辰巽巳午未坤坤');
const YIN_EYES = Array.from('寅卯辰巽巽巳午未坤申酉戌乾亥子丑艮艮');
const STRIKE = Array.from('坤戌亥丑寅辰巳坤酉乾丑寅辰午坤酉亥子艮辰巳未申戌亥艮卯巽未申酉子艮卯巳午坤戌亥丑寅辰巳坤酉乾丑寅辰午坤戌亥子艮辰巳未申戌亥艮卯巽未申乾子艮卯巳午');
const positiveMod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

export function calculateTraditionalTaiyi(input: TaiyiInput, solar: ReturnType<typeof Solar.fromYmdHms>): TaiyiTraditionalBoard {
  if (input.mode === 'minute') throw new CoreInputError('mode', '传统七十二局支持年、月、日、时计；分钟细化属于九星分支');
  const profile = resolveEnum(input.tradition, ['jinjing', 'tongzong'] as const, 'jinjing', 'tradition');
  const lunar = solar.getLunar();
  const yearEpoch = profile === 'jinjing' ? 1936557 : 10153917;
  const yearAccumulation = yearEpoch + lunar.getYear();
  const civilDay = createUtcDateTime({ year: solar.getYear(), month: solar.getMonth(), day: solar.getDay() });
  const daysFrom = (year: number, month: number, day: number) => Math.floor((civilDay.getTime() - createUtcDateTime({ year, month, day }).getTime()) / 86400000);
  // Modern calendar adaptation: lunar months repeat in leap months; civil days use midnight.
  // Epochs follow kintaiyi 11f7855, without its later day-index adjustment or zero-valued hourly bureau override.
  const accumulations = {
    year: yearAccumulation,
    month: (yearAccumulation - 1) * 12 + 2 + Math.abs(lunar.getMonth()),
    day: 708010920 - (profile === 'jinjing' ? 1 : 0) + daysFrom(1900, 6, 19),
    hour: (708011104 + daysFrom(1900, 12, 21)) * 12 + Math.floor((solar.getHour() + 1) / 2) + 1,
  };
  const accumulatedNumber = input.accumulatedNumber ?? accumulations[input.mode];
  assertInteger(accumulatedNumber, 'accumulatedNumber', 1, Number.MAX_SAFE_INTEGER);
  const bureau = positiveMod(accumulatedNumber - 1, 72) + 1;
  let dun: 'yang' | 'yin' = 'yang';
  if (input.mode === 'hour') {
    const timezone = input.timezone ?? DEFAULT_DIVINATION_TIMEZONE;
    const instant = zonedTimeToUtc({ year: solar.getYear(), month: solar.getMonth(), day: solar.getDay(), hour: solar.getHour(), minute: solar.getMinute() }, timezone);
    const beijing = getZonedDateTimeParts(instant, CALENDAR_TIMEZONE);
    const terms = Solar.fromYmdHms(beijing.year, beijing.month, beijing.day, beijing.hour, beijing.minute, 0).getLunar().getJieQiTable();
    const solstices = Object.entries(terms).filter(([name]) => ['冬至', 'DONG_ZHI', '夏至'].includes(name)).map(([name, value]) => ({ name, date: zonedTimeToUtc({ year: value.getYear(), month: value.getMonth(), day: value.getDay(), hour: value.getHour(), minute: value.getMinute(), second: value.getSecond() }, CALENDAR_TIMEZONE) })).filter(term => term.date <= instant).sort((a, b) => b.date.getTime() - a.date.getTime());
    if (!solstices.length) throw new Error('无法确定最近冬夏至');
    dun = solstices[0].name === '夏至' ? 'yin' : 'yang';
  }
  if (input.dunType !== undefined) dun = resolveEnum(input.dunType, ['yang', 'yin'] as const, 'yang', 'dunType');
  const index = bureau - 1;
  const taiyiPalace = (dun === 'yang' ? TAIYI_CYCLE : [...TAIYI_CYCLE].reverse())[Math.floor(index % 24 / 3)];
  const wenChang = (dun === 'yang' ? YANG_EYES : YIN_EYES)[index % 18];
  // The SKQS yin table has these distinct strike positions.
  const yinStrikeOverrides: Record<number, string> = { 37: '午', 43: '坤', 44: '酉' };
  const shiJi = dun === 'yin' ? yinStrikeOverrides[bureau] ?? STRIKE[index] : STRIKE[index];
  const homeCount = (dun === 'yang' ? YANG_HOME : YIN_HOME)[index];
  const awayCount = (dun === 'yang' ? YANG_AWAY : YIN_AWAY)[index];
  const generals = (count: number) => {
    const general = count % 10 || 1;
    return { count, general, assistant: general * 3 % 10 || 5 };
  };
  const pillars = lunar.getEightChar();
  const taiSui = ({ year: lunar.getYearInGanZhi(), month: pillars.getMonth(), day: pillars.getDay(), hour: pillars.getTime() }[input.mode])[1];
  const jiShen = DI_ZHI[positiveMod((dun === 'yang' ? 2 : 8) - positiveMod(accumulatedNumber - 1, 12), 12)];
  const heShen = DI_ZHI[positiveMod(1 - DI_ZHI.indexOf(taiSui as typeof DI_ZHI[number]), 12)];
  const home = generals(homeCount);
  const away = generals(awayCount);
  const stars: Record<string, string[]> = {};
  for (const [name, position] of Object.entries({ 太乙: NUMBER_POSITION[taiyiPalace], 文昌: wenChang, 始击: shiJi, 计神: jiShen, 合神: heShen, 太岁: taiSui, 主大将: NUMBER_POSITION[home.general], 主参将: NUMBER_POSITION[home.assistant], 客大将: NUMBER_POSITION[away.general], 客参将: NUMBER_POSITION[away.assistant] })) (stars[position] ??= []).push(name);
  return {
    profile, accumulatedNumber, accumulationSource: input.accumulatedNumber === undefined ? 'calendar-epoch' : 'manual', bureau, dun,
    ruleVersion: 'taiyi-skqs-modern-calendar-2026.10', yearEpoch,
    taiyi: { palace: taiyiPalace, position: NUMBER_POSITION[taiyiPalace] },
    wenChang, shiJi, jiShen, heShen, taiSui, home, away,
    palaces: [...POSITIONS, '中'].map((position, index) => ({ position, deity: GOD_NAMES[index] ?? '', stars: stars[position] ?? [] })),
  };
}
