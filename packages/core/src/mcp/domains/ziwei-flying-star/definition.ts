import type { ToolDefinition } from '../../contract.js';
import { ziweiRuleInputs } from '../../rule-input-schemas.js';

export const ziweiFlyingStarDefinition: ToolDefinition = {
  name: 'ziwei_flying_star',
  description: "紫微斗数飞星 - 按查询逐条分析命盘宫位的四化飞入、自化、四化落宫与三方四正。",
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
      queries: {
        type: 'array',
        description: "查询列表（至少 1 条，结果按顺序返回）。宫位名可用：命宫、兄弟、夫妻、子女、财帛、疾厄、迁移、交友、官禄、田宅、福德、父母",
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['fliesTo', 'selfMutaged', 'mutagedPlaces', 'surroundedPalaces'], description: "查询类型（fliesTo=判断 from 宫的四化是否飞入 to 宫，selfMutaged=判断 palace 宫是否自化，mutagedPlaces=列出 palace 宫干四化的落宫，surroundedPalaces=列出 palace 宫的三方四正）" },
            from: { type: 'string', description: "起飞宫位（fliesTo 时必填）" },
            to: { type: 'string', description: "目标宫位（fliesTo 时必填）" },
            palace: { type: 'string', description: "查询宫位（fliesTo 以外的类型必填）" },
            mutagens: { type: 'array', items: { type: 'string', enum: ['禄', '权', '科', '忌'] }, description: '要判断的四化（省略或空数组时检查全部四化）' },
          },
          required: ['type'],
          allOf: [
            { if: { properties: { type: { const: 'fliesTo' } }, required: ['type'] }, then: { required: ['from', 'to'] } },
            { if: { properties: { type: { enum: ['selfMutaged', 'mutagedPlaces', 'surroundedPalaces'] } }, required: ['type'] }, then: { required: ['palace'] } },
          ],
        },
      },
      detailLevel: {
        type: 'string',
        enum: ['default', 'full'],
        description: "输出详略（本工具各档输出相同）",
        default: 'default',
      },
    },
    required: ['gender', 'birthYear', 'birthMonth', 'birthDay', 'birthHour', 'queries'],
    examples: [
      {
        gender: 'male', birthYear: 1990, birthMonth: 1, birthDay: 15, birthHour: 9,
        queries: [
          { type: 'mutagedPlaces', palace: '命宫' },
          { type: 'surroundedPalaces', palace: '命宫' },
        ],
      },
    ],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
