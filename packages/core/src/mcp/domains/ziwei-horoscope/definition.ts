import type { ToolDefinition } from '../../contract.js';
import { ziweiRuleInputs } from '../../rule-input-schemas.js';

export const ziweiHoroscopeDefinition: ToolDefinition = {
  name: 'ziwei_horoscope',
  description: '紫微斗数运限 - 根据出生信息与目标日期计算大限、小限、流年、流月、流日、流时等运限信息。',
  inputSchema: {
    type: 'object',
    properties: {
      ...ziweiRuleInputs,
      gender: { type: 'string', enum: ['male', 'female'], description: '性别' },
      birthYear: { type: 'integer', minimum: 1900, maximum: 2100, description: "出生年（1900-2100）" },
      birthMonth: { type: 'integer', minimum: 1, maximum: 12, description: "出生月（1-12）" },
      birthDay: { type: 'integer', minimum: 1, maximum: 31, description: "出生日（公历 1-31，农历 1-30）" },
      birthHour: { type: 'integer', minimum: 0, maximum: 23, description: "出生时（0-23）" },
      birthMinute: { type: 'integer', minimum: 0, maximum: 59, description: "出生分（0-59）", default: 0 },
      calendarType: { type: 'string', enum: ['solar', 'lunar'], description: "出生日期的历法（solar=公历，lunar=农历）", default: 'solar' },
      isLeapMonth: { type: 'boolean', description: "是否农历闰月（仅 calendarType=lunar 时有效）", default: false },
      longitude: {
        type: 'number', minimum: -180, maximum: 180,
        description: "出生地经度（-180 到 180；提供时按真太阳时校正出生时间）",
      },
      targetDate: { type: 'string', description: "目标日期（公历 YYYY-MM-DD；省略时取当前日期）" },
      targetTimeIndex: { type: 'integer', minimum: 0, maximum: 12, description: "流时所用的时辰序号（0-12：0=早子，1=丑…11=亥，12=晚子）" },
      detailLevel: {
        type: 'string',
        enum: ['default', 'full'],
        description: "输出详略（default=核心运限；full=追加命主、身主、运限叠宫的十二宫重排及岁前、将前十二星）",
        default: 'default',
      },
    },
    required: ['gender', 'birthYear', 'birthMonth', 'birthDay', 'birthHour'],
    examples: [
      { gender: 'male', birthYear: 1990, birthMonth: 1, birthDay: 15, birthHour: 9, targetDate: '2026-03-13' },
    ],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
