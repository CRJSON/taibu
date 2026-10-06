/**
 * 紫微斗数共享工具函数
 */

import { astro } from 'iztro';
import { resolveBaziCalendarContext } from '../bazi/calculate.js';
import { assertInteger } from '../../shared/validation.js';
import type { ZiweiCalculationOptions } from './types.js';
import { bindZiweiProfile, resolveZiweiOptions, withZiweiOptions } from './profile.js';
import type { BirthTimeInput, DiZhi, Gender, StarInfo, TrueSolarTimeInfo } from '../shared/types.js';
import { hourToTimeIndex } from '../shared/true-solar.js';

export type { BirthTimeInput, DiZhi, Gender, StarInfo, TrueSolarTimeInfo } from '../shared/types.js';
export { calculateTrueSolarTime, hourToTimeIndex } from '../shared/true-solar.js';

export const MUTAGEN_NAMES = ['禄', '权', '科', '忌'] as const;
export type MutagenName = typeof MUTAGEN_NAMES[number];
type Astrolabe = ReturnType<typeof astro.bySolar>;
type IztroStar = {
  name: string;
  type?: string;
  brightness?: string;
  mutagen?: string;
};

/** 天干四化表: stem → [禄星, 权星, 科星, 忌星] */
export const STEM_MUTAGEN_TABLE: Record<string, [string, string, string, string]> = {
  '甲': ['廉贞', '破军', '武曲', '太阳'],
  '乙': ['天机', '天梁', '紫微', '太阴'],
  '丙': ['天同', '天机', '文昌', '廉贞'],
  '丁': ['太阴', '天同', '天机', '巨门'],
  '戊': ['贪狼', '太阴', '右弼', '天机'],
  '己': ['武曲', '贪狼', '天梁', '文曲'],
  '庚': ['太阳', '武曲', '太阴', '天同'],
  '辛': ['巨门', '太阳', '文曲', '文昌'],
  '壬': ['天梁', '紫微', '左辅', '武曲'],
  '癸': ['破军', '巨门', '太阴', '贪狼'],
};

import { DI_ZHI } from '../../data/ganzhi.js';
export { DI_ZHI };

/** 禄存所在地支：按年干查表 */
export const LUCUN_TABLE: Record<string, string> = {
  '甲': '寅', '乙': '卯', '丙': '巳', '丁': '午',
  '戊': '巳', '己': '午', '庚': '申', '辛': '酉',
  '壬': '亥', '癸': '子',
};

/** 计算流年虚岁列表 */
export function computeLiuNianAges(palaceBranch: DiZhi, birthYearBranch: DiZhi, max = 60): number[] {
  const pIdx = DI_ZHI.indexOf(palaceBranch);
  const bIdx = DI_ZHI.indexOf(birthYearBranch);
  if (pIdx < 0 || bIdx < 0) return [];
  const offset = (pIdx - bIdx + 12) % 12;
  const ages: number[] = [];
  for (let age = offset + 1; age <= max; age += 12) ages.push(age);
  return ages;
}

/**
 * 计算子年斗君地支
 *
 * 公式来源：iztro FunctionalAstrolabe.js 流月算法
 * 「流年地支逆数到生月所在宫位，再从该宫位顺数到生时，为正月所在宫位」
 *
 * 斗君 = 子年正月宫位地支
 *   = DI_ZHI[(13 - lunarMonth + hourBranchIdx) % 12]
 *
 * 其中 hourBranchIdx 为时辰地支绝对索引（子=0, 丑=1, ..., 亥=11）
 * timeIndex 12（晚子时）与 timeIndex 0（早子时）同为子，取 % 12
 */
export function computeDouJun(lunarMonth: number, timeIndex: number): string {
  // timeIndex: 早子时=0, 丑=1, ..., 亥=11, 晚子时=12 → 子=0
  const hourBranchIdx = timeIndex % 12;
  return DI_ZHI[(13 - lunarMonth + hourBranchIdx + 12) % 12];
}

/** 将 iztro Star 映射为 StarInfo */
export function mapStar(star: IztroStar): StarInfo {
  return {
    name: star.name,
    type: star.type,
    brightness: star.brightness,
    mutagen: star.mutagen,
  };
}

/** All birth paths share the same strict solar/lunar/timezone validation as Bazi. */
export function createAstrolabeWithTrueSolar(
  input: BirthTimeInput & { gender: Gender; longitude?: number; calculationOptions?: ZiweiCalculationOptions; },
): { astrolabe: Astrolabe; timeIndex: number; trueSolarTimeInfo?: TrueSolarTimeInfo; } {
  assertInteger(input.birthYear, 'birthYear', 1900, 2100);
  const profile = resolveZiweiOptions(input.calculationOptions);
  const { solar, trueSolarTimeInfo } = resolveBaziCalendarContext(input);
  const dateStr = `${solar.getYear()}-${solar.getMonth()}-${solar.getDay()}`;
  const timeIndex = hourToTimeIndex(solar.getHour() + solar.getMinute() / 60);
  const astrolabe = withZiweiOptions(profile, () => astro.bySolar(dateStr, timeIndex, input.gender === 'male' ? '男' : '女', profile.fixLeap, 'zh-CN'));
  return { astrolabe: bindZiweiProfile(astrolabe, profile, input.timezone, input.disambiguation), timeIndex, trueSolarTimeInfo };
}

export function createAstrolabe(input: BirthTimeInput & { gender: Gender; calculationOptions?: ZiweiCalculationOptions; }): Astrolabe {
  return createAstrolabeWithTrueSolar(input).astrolabe;
}
