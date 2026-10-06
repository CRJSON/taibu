import type { ToolDefinition } from '../../contract.js';

export const tarotDefinition: ToolDefinition = {
  name: 'tarot',
  description: '塔罗抽牌 - 按牌阵抽取塔罗牌，输出各牌位的牌面、正逆位、核心基调、元素与星象；可选输出求问者的人格牌、灵魂牌与年度牌。',
  inputSchema: {
    type: 'object',
    properties: {
      spreadType: {
        type: 'string',
        enum: ['single', 'three-card', 'love', 'celtic-cross', 'horseshoe', 'decision', 'mind-body-spirit', 'situation', 'yes-no'],
        description: '牌阵类型（single=单牌，three-card=三牌，love=爱情，celtic-cross=凯尔特十字，horseshoe=马蹄，decision=抉择，mind-body-spirit=身心灵，situation=处境，yes-no=是否）',
        default: 'single',
      },
      question: {
        type: 'string',
        description: '占问事项',
      },
      allowReversed: {
        type: 'boolean',
        description: '是否允许逆位',
        default: true,
      },
      seed: {
        type: 'string',
        description: '随机种子（相同种子与牌阵可复现同一抽牌结果；省略时按牌阵、问题与当天日期生成）',
      },
      birthYear: {
        type: 'number',
        description: '出生年（出生年、月、日齐全时用于计算人格牌、灵魂牌与年度牌）',
      },
      birthMonth: {
        type: 'number',
        description: '出生月（1-12；用途同 birthYear）',
      },
      birthDay: {
        type: 'number',
        description: '出生日（1-31；用途同 birthYear）',
      },
      detailLevel: {
        type: 'string',
        enum: ['default', 'full'],
        description: '输出详略（default=牌阵结果；full=追加随机种子、出生日期及人格牌、灵魂牌与年度牌）',
        default: 'default',
      },
    },
    required: [],
    examples: [
      { spreadType: 'three-card', question: '本月运势如何？' },
      { spreadType: 'love', question: '我和他的未来发展？', allowReversed: true },
      { spreadType: 'celtic-cross', question: '事业发展', birthYear: 1990, birthMonth: 5, birthDay: 15 },
    ],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};
