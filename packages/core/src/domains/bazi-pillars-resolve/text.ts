import { withRulesText } from '../../shared/calculation-rules.js';
import type {
  BaziPillarsResolveOutput
} from './types.js';

export const renderBaziPillarsResolveCanonicalText = withRulesText(renderBaziPillarsResolveCanonicalTextBase);

function renderBaziPillarsResolveCanonicalTextBase(result: BaziPillarsResolveOutput): string {
  const lines: string[] = [
    '# 四柱反推候选时间',
    '',
    '## 原始四柱',
    `- **年柱**: ${result.pillars.yearPillar}`,
    `- **月柱**: ${result.pillars.monthPillar}`,
    `- **日柱**: ${result.pillars.dayPillar}`,
    `- **时柱**: ${result.pillars.hourPillar}`,
    '',
    '## 候选数量',
    `- **总数**: ${result.count}`,
  ];

  if (result.candidates.length === 0) {
    lines.push('');
    lines.push('## 候选列表');
    lines.push('- 无匹配候选');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('## 候选列表');
  for (const [index, candidate] of result.candidates.entries()) {
    lines.push('');
    lines.push(`### 候选 ${index + 1}`);
    lines.push(`- **农历**: ${candidate.lunarText}`);
    lines.push(`- **公历**: ${candidate.solarText}`);
    if (candidate.timeWindow) lines.push(`- **时间区间**: [${candidate.timeWindow.start}, ${candidate.timeWindow.end}) ${candidate.timeWindow.timezone}（分钟精度，结束不含）`);
    lines.push(`- **出生时间**: ${candidate.birthHour}:${String(candidate.birthMinute).padStart(2, '0')}`);
    if (candidate.isLeapMonth) lines.push('- **闰月**: 是');
    lines.push(`- **下一步**: 使用 \`bazi\` 并补充 gender${candidate.nextCall.arguments.calendarType === 'solar' ? '（该候选使用公历出生参数）' : ''}`);
  }

  return lines.join('\n');
}
