import type { ToolDefinition } from '../../contract.js';

export const taiyiDefinition: ToolDefinition = {
  name: 'taiyi',
  description: '太乙九星观测 - 根据问卜时间生成时空底盘、九星阵列与核心关系。',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['year', 'month', 'day', 'hour', 'minute'],
        description: '观测尺度（year=年盘，month=月盘，day=日盘，hour=时盘，minute=在时盘基础上按 10 分钟细化）',
      },
      date: {
        type: 'string',
        description: '观测日期（公历 YYYY-MM-DD）',
      },
      hour: {
        type: 'number',
        description: '小时（0-23；mode 为 hour 或 minute 时必填）',
        default: 12,
      },
      minute: {
        type: 'number',
        description: '分钟（0-59；mode=minute 时必填）',
        default: 0,
      },
      timezone: {
        type: 'string',
        description: 'IANA 时区名（如 Asia/Shanghai）',
        default: 'Asia/Shanghai',
      },
      question: {
        type: 'string',
        description: '占问事项',
      },
      detailLevel: {
        type: 'string',
        enum: ['default', 'full'],
        description: '输出详略（本工具各档输出相同）',
        default: 'default',
      },
    },
    required: ['mode', 'date'],
    allOf: [
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
