'use client';
import type { LiuyaoCanonicalJSON } from 'taibu-core/liuyao';
import { HEXAGRAMS, type Yao } from '@/lib/divination/liuyao';
import { parseTraditionalYaoPosition } from '@/lib/divination/liuyao-result-state';
import { HexagramDisplay } from './HexagramDisplay';

export function CanonicalLiuyaoChart({ chart }: { chart: LiuyaoCanonicalJSON }) {
  const hexagram = HEXAGRAMS.find(row => row.name === chart.卦盘.本卦.卦名);
  const changedHexagram = chart.卦盘.变卦 ? HEXAGRAMS.find(row => row.name === chart.卦盘.变卦?.卦名) : undefined;
  if (!hexagram || (chart.卦盘.变卦 && !changedHexagram)) throw new Error('卦名缺少对应的展示数据');
  const lines = [...chart.六爻].sort((a, b) => (parseTraditionalYaoPosition(a.爻位) ?? 0) - (parseTraditionalYaoPosition(b.爻位) ?? 0));
  if (lines.some((line, index) => parseTraditionalYaoPosition(line.爻位) !== index + 1)) throw new Error('爻位数据不完整');
  // Draw the two returned fixed patterns. This comparison does not cast another reading.
  const yaos: Yao[] = lines.map((_, index) => ({ position: index + 1, type: hexagram.code[index] === '1' ? 1 : 0, change: changedHexagram && hexagram.code[index] !== changedHexagram.code[index] ? 'changing' : 'stable' }));
  return <HexagramDisplay yaos={yaos} hexagram={hexagram} changedHexagram={changedHexagram} changedLines={yaos.filter(yao => yao.change === 'changing').map(yao => yao.position)} fullYaos={lines} showTraditional showDetails />;
}
