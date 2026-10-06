import type { ToolDefinition } from '../../contract.js';

export const xiaoliurenDefinition: ToolDefinition = {
  name: 'xiaoliuren',
  description: '小六壬占测 - 根据农历月日时辰起课，输出起课信息、推演链与结果信息。',
  inputSchema: {
    type: 'object',
    properties: {
      lunarMonth: { type: 'number', description: '农历月（1-12）' },
      lunarDay: { type: 'number', description: '农历日（1-30）' },
      hour: { type: 'number', description: '时辰：1-12 为时辰序号（子=1，丑=2…亥=12）；0 或 13-23 按 24 小时制钟点折算' },
      question: { type: 'string', description: '占问事项' },
      detailLevel: {
        type: 'string',
        enum: ['default', 'full'],
        description: '输出详略（default=起课结果；full=追加释义与诗诀）',
        default: 'default',
      },
    },
    required: ['lunarMonth', 'lunarDay', 'hour'],
    examples: [
      { lunarMonth: 3, lunarDay: 15, hour: 8, question: '今日运势如何' },
      { lunarMonth: 1, lunarDay: 1, hour: 1 },
    ],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
