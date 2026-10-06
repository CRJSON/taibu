import type { ToolDefinition } from '../../contract.js';

export const liuyaoDefinition: ToolDefinition = {
  name: 'liuyao',
  description: '六爻排卦 - 根据问题与起卦信息排出六爻盘面，输出卦象、爻位、用神体系、关系判断与时机提示。',
  inputSchema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        minLength: 1,
        description: '占问事项',
      },
      yongShenTargets: {
        type: 'array',
        minItems: 1,
        description: '用神六亲（按占问主题选择，如求财取妻财、问工作取官鬼）',
        items: {
          type: 'string',
          enum: ['父母', '兄弟', '子孙', '妻财', '官鬼'],
        },
      },
      method: {
        type: 'string',
        enum: ['auto', 'select', 'time', 'number'],
        description: '起卦方式（auto=模拟铜钱摇卦，select=指定卦，time=按时间起卦，number=按数字起卦）',
        default: 'auto',
      },
      numbers: {
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 3,
        description: '起卦数字（2-3 个正整数：第一数取上卦，第二数取下卦，第三数取动爻，只给两数时以两数之和取动爻；method=number 时必填）',
      },
      hexagramName: {
        type: 'string',
        description: '本卦卦名或 6 位卦码（卦码自初爻至上爻，1=阳爻，0=阴爻；method=select 时必填）',
      },
      changedHexagramName: {
        type: 'string',
        description: '变卦卦名或卦码（method=select 时可选，用于确定动爻）',
      },
      date: {
        type: 'string',
        description: '起卦时间（YYYY-MM-DDTHH:MM[:SS]、YYYY-MM-DD HH:MM[:SS] 或带时区偏移的 ISO 时间；决定月建与日辰）',
      },
      detailLevel: {
        type: 'string',
        enum: ['default', 'more', 'full'],
        description: '输出详略（default=核心盘面；more=追加卦身、互错综卦与神煞；full=再追加旺衰、动静、空亡、化变及冲合、反伏等细项）',
        default: 'default',
      },
    },
    required: ['question', 'yongShenTargets', 'date'],
    allOf: [
      {
        if: {
          properties: {
            method: { const: 'number' },
          },
          required: ['method'],
        },
        then: {
          required: ['numbers'],
        },
      },
      {
        if: {
          properties: {
            method: { const: 'select' },
          },
          required: ['method'],
        },
        then: {
          required: ['hexagramName'],
        },
      },
    ],
    examples: [
      { question: '本月事业运势如何？', yongShenTargets: ['官鬼'], method: 'auto', date: '2026-02-10T09:30:00' },
      { question: '财运怎么样？', yongShenTargets: ['妻财'], method: 'select', hexagramName: '天火同人', date: '2026-02-10 14:00:00' },
    ],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};
