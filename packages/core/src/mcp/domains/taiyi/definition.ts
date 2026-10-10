import type { ToolDefinition } from '../../contract.js';

export const taiyiDefinition: ToolDefinition = {
  name: 'taiyi',
  description: '太乙排盘 - 支持九星观测，以及采用四库本金镜七十二局立成的现代历法适配年/月/日/时计。',
  inputSchema: {
    type: 'object',
    properties: {
      system: { type: 'string', enum: ['nine-star', 'traditional'], default: 'nine-star', description: '九星观测或七十二局' },
      tradition: { type: 'string', enum: ['jinjing', 'tongzong'], description: '传统分支的积数历元：金镜或统宗，默认金镜；立成表均用四库本金镜' },
      accumulatedNumber: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER, description: '手工积数，覆写历元自动计算' },
      dunType: { type: 'string', enum: ['yang', 'yin'], description: '覆写遁向；时计默认按冬夏至实际时刻，其他计默认阳遁' },
      mode: {
        type: 'string',
        enum: ['year', 'month', 'day', 'hour', 'minute'],
        description: "观测尺度（year=年盘，month=月盘，day=日盘，hour=时盘，minute=在时盘基础上按 10 分钟细化）",
      },
      date: {
        type: 'string',
        description: "观测日期（公历 YYYY-MM-DD）",
      },
      hour: {
        type: 'integer', minimum: 0, maximum: 23,
        description: "小时（0-23；mode 为 hour 或 minute 时必填）",
        default: 12,
      },
      minute: {
        type: 'integer', minimum: 0, maximum: 59,
        description: "分钟（0-59；mode=minute 时必填）",
        default: 0,
      },
      timezone: {
        type: 'string',
        description: "IANA 时区名（如 Asia/Shanghai）",
        default: 'Asia/Shanghai',
      },
      question: {
        type: 'string',
        description: '占问事项',
      },
      detailLevel: {
        type: 'string',
        enum: ['default', 'full'],
        description: "输出详略（本工具各档输出相同）",
        default: 'default',
      },
    },
    required: ['mode', 'date'],
    allOf: [
      { if: { properties: { system: { const: 'traditional' } }, required: ['system'] }, then: { properties: { mode: { enum: ['year', 'month', 'day', 'hour'] } } } },
      {
        if: {
          properties: {
            mode: { const: 'hour' },
          },
          required: ['mode'],
        },
        then: {
          required: ['hour'],
        },
      },
      {
        if: {
          properties: {
            mode: { const: 'minute' },
          },
          required: ['mode'],
        },
        then: {
          required: ['hour', 'minute'],
        },
      },
    ],
    examples: [
      { mode: 'day', date: '2026-04-10', timezone: 'Asia/Shanghai', question: '此事能否顺利推进？' },
      { mode: 'minute', date: '2026-04-10', hour: 13, minute: 37, timezone: 'Asia/Shanghai' },
    ],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
