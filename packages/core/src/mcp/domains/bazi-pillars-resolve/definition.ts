import type { ToolDefinition } from '../../contract.js';
import { baziRuleInputs } from '../../rule-input-schemas.js';

export const baziPillarsResolveDefinition: ToolDefinition = {
  name: 'bazi_pillars_resolve',
  description: '四柱反推 - 根据四柱搜索分钟级出生时间区间，默认1900-2100，单次最多1200年。',
  inputSchema: {
    type: 'object',
    properties: {
      ...baziRuleInputs,
      startYear: { type: 'integer', minimum: 1, maximum: 9998, default: 1900 },
      endYear: { type: 'integer', minimum: 1, maximum: 9998, default: 2100 },
      yearPillar: { type: 'string', description: '年柱干支（如“甲子”）' },
      monthPillar: { type: 'string', description: '月柱干支（如“乙丑”）' },
      dayPillar: { type: 'string', description: '日柱干支（如“丙寅”）' },
      hourPillar: { type: 'string', description: '时柱干支（如“丁卯”）' },
    },
    required: ['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar'],
    examples: [
      { yearPillar: '甲子', monthPillar: '乙丑', dayPillar: '丙寅', hourPillar: '丁卯' },
      { yearPillar: '戊子', monthPillar: '乙丑', dayPillar: '辛卯', hourPillar: '癸巳' },
    ],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
