/**
 * 渲染层共享工具函数
 * 消除 text.ts / json.ts 之间的重复实现
 */

import type { DetailLevel } from '../domains/shared/types.js';
import type { ZiweiOutput } from '../domains/ziwei/types.js';
import { DI_ZHI, TIAN_GAN } from '../data/ganzhi.js';

// ===== DetailLevel 归一化 =====

/**
 * 2 级归一化：将 detailLevel 映射到 'default' | 'full'
 * 适用于大多数术数的 text / json 渲染。
 */
export function normalizeDetailLevelBinary(
  detailLevel?: DetailLevel,
): 'default' | 'full' {
  if (detailLevel === 'full' || detailLevel === 'more') {
    return 'full';
  }
  return 'default';
}

/**
 * 3 级归一化：将 detailLevel 映射到 'default' | 'more' | 'full'
 * 仅用于六爻这类确实存在中间层级输出的场景。
 */
export function normalizeDetailLevel3Way(
  detailLevel?: DetailLevel,
): DetailLevel {
  if (detailLevel === 'more') return 'more';
  if (detailLevel === 'full') return 'full';
  return 'default';
}

// ===== 共享 Helper 函数 =====

/**
 * 构建神系 Map：以 targetLiuQin 为 key
 * 用于六爻渲染中快速查找用神/原神/忌神/仇神的归属
 */
export function buildShenSystemMap<T extends { targetLiuQin: string; }>(systems: T[]): Map<string, T> {
  return new Map(systems.map((system) => [system.targetLiuQin, system] as const));
}

/**
 * 六爻关系标签映射：过滤掉"平"标签
 */
export function mapLiuyaoRelationLabel(label: string | undefined): string | undefined {
  if (!label || label === '平') return undefined;
  return label;
}

/** Preserve the actual lunar year; the selected year pillar may switch at Li Chun. */
export function formatZiweiCanonicalLunarDate(result: ZiweiOutput): string {
  const raw = result.lunarDate?.trim();
  if (!raw) return '';
  const match = /^([0-9〇零一二三四五六七八九]+)年(.*)$/u.exec(raw);
  if (!match) return raw;
  const year = Number(match[1].replace(/[〇零一二三四五六七八九]/gu,
    digit => String('〇一二三四五六七八九'.indexOf(digit === '零' ? '〇' : digit))));
  if (!Number.isInteger(year) || year < 1 || year > 9999) return raw;
  const stem = TIAN_GAN[((year - 4) % 10 + 10) % 10];
  const branch = DI_ZHI[((year - 4) % 12 + 12) % 12];
  return `${stem}${branch}年${match[2].trim()}`;
}

/**
 * 紫微飞星查询类型映射：英文 key → 中文标签
 */
export function mapZiweiFlyingStarQueryType(type: string): string {
  switch (type) {
    case 'fliesTo':
      return '飞化判断';
    case 'selfMutaged':
      return '自化判断';
    case 'mutagedPlaces':
      return '四化落宫';
    case 'surroundedPalaces':
      return '三方四正';
    default:
      return type;
  }
}
