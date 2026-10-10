import type { ToolDefinition } from '../../contract.js';
import { ziweiRuleInputs } from '../../rule-input-schemas.js';

export const ziweiCalculateDefinition: ToolDefinition = {
  name: 'ziwei',
  description: '紫微斗数命盘 - 根据出生信息计算紫微命盘，输出十二宫位、星曜分布、四化、大限等信息。',
  inputSchema: {
    type: 'object',
    properties: {
      ...ziweiRuleInputs,
      gender: {
        type: 'string',
        enum: ['male', 'female'],
        description: '性别',
      },
      birthYear: {
        type: 'integer', minimum: 1900, maximum: 2100,
        description: "出生年（1900-2100）",
      },
      birthMonth: {
        type: 'integer', minimum: 1, maximum: 12,
        description: "出生月（1-12）",
      },
      birthDay: {
        type: 'integer', minimum: 1, maximum: 31,
        description: "出生日（公历 1-31，农历 1-30）",
      },
      birthHour: {
        type: 'integer', minimum: 0, maximum: 23,
        description: "出生时（0-23）",
      },
      birthMinute: {
        type: 'integer', minimum: 0, maximum: 59,
        description: "出生分（0-59）",
        default: 0,
      },
      calendarType: {
        type: 'string',
        enum: ['solar', 'lunar'],
        description: "出生日期的历法（solar=公历，lunar=农历）",
        default: 'solar',
      },
      isLeapMonth: {
        type: 'boolean',
        description: "是否农历闰月（仅 calendarType=lunar 时有效）",
        default: false,
      },
      longitude: {
        type: 'number', minimum: -180, maximum: 180,
        description: "出生地经度（-180 到 180；提供时按真太阳时校正出生时间）",
      },
      detailLevel: {
        type: 'string',
        enum: ['default', 'full'],
        description: "输出详略（default=核心盘面；full=追加杂曜、神煞、小限、斗君、命主星与身主星等）",
        default: 'default',
      },
    },
    required: ['gender', 'birthYear', 'birthMonth', 'birthDay', 'birthHour'],
    examples: [
      { gender: 'male', birthYear: 1990, birthMonth: 1, birthDay: 15, birthHour: 9 },
      { gender: 'female', birthYear: 1995, birthMonth: 6, birthDay: 20, birthHour: 23, calendarType: 'lunar' },
      { gender: 'male', birthYear: 1990, birthMonth: 1, birthDay: 15, birthHour: 9, longitude: 116.4 },
    ],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
export const ziweiDefinition = ziweiCalculateDefinition;
