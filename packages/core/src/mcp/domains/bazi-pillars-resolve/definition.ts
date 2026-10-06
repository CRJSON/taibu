import type { ToolDefinition } from '../../contract.js';

export const baziPillarsResolveDefinition: ToolDefinition = {
  name: 'bazi_pillars_resolve',
  description: '四柱反推 - 根据年、月、日、时四柱干支，在 1900-2100 年范围内反推可能的出生时间，输出候选列表。',
  inputSchema: {
    type: 'object',
    properties: {
      yearPillar: { type: 'string', description: '年柱干支（两个字，如“甲子”）' },
      monthPillar: { type: 'string', description: '月柱干支（两个字，如“乙丑”）' },
      dayPillar: { type: 'string', description: '日柱干支（两个字，如“丙寅”）' },
      hourPillar: { type: 'string', description: '时柱干支（两个字，如“丁卯”）' },
    },
    required: ['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar'],
    examples: [
      { yearPillar: '甲子', monthPillar: '丙寅', dayPillar: '己巳', hourPillar: '丁卯' },
      { yearPillar: '戊子', monthPillar: '庚申', dayPillar: '辛卯', hourPillar: '癸巳' },
    ],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
