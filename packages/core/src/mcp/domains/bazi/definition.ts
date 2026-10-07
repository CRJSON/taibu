import type { ToolDefinition } from '../../contract.js';
import { baziRuleInputs } from '../../rule-input-schemas.js';

export const baziCalculateDefinition: ToolDefinition = {
  name: 'bazi',
  description: '八字命盘 - 根据出生信息计算四柱命盘，输出天干地支、十神、藏干、神煞、关系格局等信息。',
  inputSchema: {
    type: 'object',
    properties: {
      ...baziRuleInputs,
      gender: {
        type: 'string',
        enum: ['male', 'female'],
        description: '性别',
      },
      birthYear: {
        type: 'integer', minimum: 1, maximum: 9999,
        description: '出生年 (1-9999；公元纪年)',
      },
      birthMonth: {
        type: 'integer', minimum: 1, maximum: 12,
        description: '出生月 (1-12)',
      },
      birthDay: {
        type: 'integer', minimum: 1, maximum: 31,
        description: '出生日',
      },
      birthHour: {
        type: 'integer', minimum: 0, maximum: 23,
        description: '出生时 (0-23)',
      },
      birthMinute: {
        type: 'integer', minimum: 0, maximum: 59,
        description: '出生分 (0-59)',
        default: 0,
      },
      calendarType: {
        type: 'string',
        enum: ['solar', 'lunar'],
        description: '历法类型（solar=公历，lunar=农历）',
        default: 'solar',
      },
      isLeapMonth: {
        type: 'boolean',
        description: '农历闰月标记',
        default: false,
      },
      birthPlace: {
        type: 'string',
        description: '出生地点文本',
      },
      longitude: {
        type: 'number', minimum: -180, maximum: 180,
        description: '出生地经度',
      },
      detailLevel: {
        type: 'string',
        enum: ['default', 'full'],
        description: '输出细节级别。',
        default: 'default',
      },
    },
    required: ['gender', 'birthYear', 'birthMonth', 'birthDay', 'birthHour'],
    examples: [
      { gender: 'male', birthYear: 1990, birthMonth: 1, birthDay: 15, birthHour: 9 },
      { gender: 'female', birthYear: 1995, birthMonth: 6, birthDay: 20, birthHour: 23, calendarType: 'lunar' },
    ],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
export const baziDefinition = baziCalculateDefinition;
