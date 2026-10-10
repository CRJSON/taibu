import type { ToolDefinition } from '../../contract.js';

export const daliurenDefinition: ToolDefinition = {
  name: 'daliuren',
  description: '大六壬排盘 - 根据日期时间起课，输出天地盘、四课、三传、神将、课体与时空信息。',
  inputSchema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: "公历日期（YYYY-MM-DD）" },
      hour: { type: 'integer', minimum: 0, maximum: 23, description: "小时（0-23）" },
      minute: { type: 'integer', minimum: 0, maximum: 59, description: "分钟（0-59）", default: 0 },
      timezone: { type: 'string', description: "IANA 时区名（如 Asia/Shanghai）", default: 'Asia/Shanghai' },
      question: { type: 'string', description: "占问事项" },
      birthYear: { type: 'integer', minimum: 1, maximum: 9999, description: "出生年（与 gender 同时提供时推算本命与行年）" },
      gender: { type: 'string', enum: ['male', 'female'], description: "性别（与 birthYear 同时提供时推算本命与行年）" },
      monthGeneral: { type: 'string', enum: Array.from('子丑寅卯辰巳午未申酉戌亥'), description: '手工月将；省略时按中气交接的实际时刻' },
      dayNight: { type: 'string', enum: ['shichen', 'day', 'night', 'sunrise'], default: 'shichen', description: '卯至申为昼，或强制昼夜，或按太阳高度选择贵人盘' },
      latitude: { type: 'number', minimum: -90, maximum: 90 },
      longitude: { type: 'number', minimum: -180, maximum: 180 },
      detailLevel: {
        type: 'string',
        enum: ['default', 'full'],
        description: "输出详略（default=核心课盘；full=追加月将名称、附加课体、建除、本命与行年）",
        default: 'default',
      },
    },
    required: ['date', 'hour'],
    allOf: [
      { if: { required: ['birthYear'] }, then: { required: ['gender'] } },
      { if: { required: ['gender'] }, then: { required: ['birthYear'] } },
      { if: { properties: { dayNight: { const: 'sunrise' } }, required: ['dayNight'] }, then: { required: ['latitude', 'longitude'] } },
    ],
    examples: [
      { date: '2026-03-15', hour: 16, minute: 53, timezone: 'Asia/Shanghai', question: '今日运势如何' },
      { date: '2026-03-15', hour: 16, timezone: 'Asia/Shanghai', birthYear: 1990, gender: 'male' },
    ],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
