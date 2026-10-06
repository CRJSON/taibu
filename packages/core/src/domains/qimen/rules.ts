import { Solar } from 'lunar-javascript';
import { DI_ZHI, TIAN_GAN } from '../../data/ganzhi.js';
import { CoreInputError, createUtcDateTime } from '../../shared/validation.js';
import type { QimenInput } from './types.js';

// Traditional seasonal bureau table. Cross-reference: qimen-go, MIT,
// 4d3f58fa0f401b5b3a337f119138e99e90685dda, xuan/qimen_defs.go.
const BUREAUS: Record<string, readonly number[]> = {
  冬至: [1, 7, 4], 小寒: [2, 8, 5], 大寒: [3, 9, 6],
  立春: [8, 5, 2], 雨水: [9, 6, 3], 惊蛰: [1, 7, 4],
  春分: [3, 9, 6], 清明: [4, 1, 7], 谷雨: [5, 2, 8],
  立夏: [4, 1, 7], 小满: [5, 2, 8], 芒种: [6, 3, 9],
  夏至: [-9, -3, -6], 小暑: [-8, -2, -5], 大暑: [-7, -1, -4],
  立秋: [-2, -5, -8], 处暑: [-1, -4, -7], 白露: [-9, -3, -6],
  秋分: [-7, -1, -4], 寒露: [-6, -9, -3], 霜降: [-5, -8, -2],
  立冬: [-6, -9, -3], 小雪: [-5, -8, -2], 大雪: [-4, -7, -1],
};

export const QIMEN_STARS = ['天蓬星', '天芮星', '天冲星', '天辅星', '天禽星', '天心星', '天柱星', '天任星', '天英星'];
export const QIMEN_GATES = ['休门', '死门', '伤门', '杜门', '', '开门', '惊门', '生门', '景门'];
const INSTRUMENTS = ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙'];
export const QIMEN_HIDDEN_JIA: Record<string, string> = { 甲子: '戊', 甲戌: '己', 甲申: '庚', 甲午: '辛', 甲辰: '壬', 甲寅: '癸' };
const YANG_GODS = ['值符', '腾蛇', '太阴', '六合', '勾陈', '太常', '朱雀', '九地', '九天'];
const YIN_GODS = ['值符', '腾蛇', '太阴', '六合', '白虎', '太常', '玄武', '九地', '九天'];
const cycle = (value: number) => (value % 9 + 9) % 9;

function termInstant(solar: Solar): Date {
  const wall = createUtcDateTime({ year: solar.getYear(), month: solar.getMonth(), day: solar.getDay(),
    hour: solar.getHour(), minute: solar.getMinute(), second: solar.getSecond() });
  return new Date(wall.getTime() - 8 * 3600000);
}

export function getQimenBureau(input: QimenInput, instant: Date, dayGan: string, dayZhi: string) {
  const beijing = new Date(instant.getTime() + 8 * 3600000);
  const lunar = Solar.fromYmdHms(beijing.getUTCFullYear(), beijing.getUTCMonth() + 1, beijing.getUTCDate(),
    beijing.getUTCHours(), beijing.getUTCMinutes(), beijing.getUTCSeconds()).getLunar();
  const previous = lunar.getPrevJieQi();
  const next = lunar.getNextJieQi();
  if (!previous || !next || !BUREAUS[previous.getName()]) throw new Error('奇门节气区间不可用');
  const start = termInstant(previous.getSolar());
  const end = termInstant(next.getSolar());
  const method = input.juMethod ?? 'chaibu';
  let yuan: number;
  if (method === 'maoshan') {
    yuan = Math.min(2, Math.floor((instant.getTime() - start.getTime()) / (5 * 86400000)));
  } else if (method === 'equal') {
    yuan = Math.min(2, Math.floor(3 * (instant.getTime() - start.getTime()) / (end.getTime() - start.getTime())));
  } else {
    const stemIndex = TIAN_GAN.indexOf(dayGan as typeof TIAN_GAN[number]);
    const branchIndex = DI_ZHI.indexOf(dayZhi as typeof DI_ZHI[number]);
    const headBranch = (branchIndex - stemIndex % 5 + 12) % 12;
    yuan = [0, 3, 6, 9].includes(headBranch) ? 0 : [2, 5, 8, 11].includes(headBranch) ? 1 : 2;
  }
  if (yuan < 0 || yuan > 2) throw new Error('奇门三元计算失败');
  let round = BUREAUS[previous.getName()][yuan];
  if (input.juNumber !== undefined || input.dunType !== undefined) {
    if (input.juNumber === undefined || input.dunType === undefined) throw new CoreInputError('juNumber', '手工定局需同时提供局数和阴阳遁');
    round = input.juNumber * (input.dunType === 'yin' ? -1 : 1);
  }
  return { round, yuan, solarTerm: previous.getName(), start, end };
}

export function calculateFlyingBoard(round: number, hourGan: string, xunShou: string, flyStarMethod: 'forward' | 'yin-reverse') {
  const direction = round > 0 ? 1 : -1;
  const earth = new Array<string>(9);
  INSTRUMENTS.forEach((stem, offset) => { earth[cycle(Math.abs(round) - 1 + direction * offset)] = stem; });
  const hidden = QIMEN_HIDDEN_JIA[xunShou];
  const duty = earth.indexOf(hidden);
  const starPalace = earth.indexOf(hourGan === '甲' ? hidden : hourGan);
  const elapsedHours = TIAN_GAN.indexOf(hourGan as typeof TIAN_GAN[number]);
  if (duty < 0 || starPalace < 0 || elapsedHours < 0) throw new Error('飞盘旬首或时干不可用');
  const gatePalace = cycle(duty + direction * elapsedHours);
  const starDirection = flyStarMethod === 'yin-reverse' ? direction : 1;
  const stars = new Array<string>(9);
  const gates = new Array<string>(9);
  const heaven = new Array<string>(9);
  const gods = new Array<string>(9);
  const hiddenIndex = INSTRUMENTS.indexOf(hidden);
  for (let offset = 0; offset < 9; offset++) {
    stars[cycle(starPalace + starDirection * offset)] = QIMEN_STARS[cycle(duty + offset)];
    gates[cycle(gatePalace + offset)] = QIMEN_GATES[cycle(duty + offset)];
    heaven[cycle(starPalace + direction * offset)] = INSTRUMENTS[cycle(hiddenIndex + offset)];
    gods[cycle(starPalace + direction * offset)] = (round > 0 ? YANG_GODS : YIN_GODS)[offset];
  }
  return { earth, heaven, stars, gates, gods,
    zhiFu: { star: QIMEN_STARS[duty], palace: starPalace + 1 },
    zhiShi: { gate: QIMEN_GATES[duty] || '虚中', palace: gatePalace + 1 } };
}
