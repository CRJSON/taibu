import type { ToolDefinition } from '../../contract.js';

export const meihuaDefinition: ToolDefinition = {
  name: 'meihua',
  description: '梅花易数起卦 - 根据时间、字占、物数、报数等方式起卦，输出起卦信息、卦盘与体用推演。',
  inputSchema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        minLength: 1,
        description: '占问事项',
      },
      date: {
        type: 'string',
        description: '起卦时间（YYYY-MM-DDTHH:MM[:SS]，按当地时间填写，不带时区偏移）',
      },
      method: {
        type: 'string',
        enum: ['time', 'count_with_time', 'text_split', 'measure', 'classifier_pair', 'select', 'number_pair', 'number_triplet'],
        description: '起卦方式（省略时为 time；time=年月日时起卦，count_with_time=物数或声数加时辰，text_split=字占，measure=丈尺或尺寸，classifier_pair=上下卦类象，select=指定卦，number_pair=两数报数，number_triplet=三数报数）',
      },
      count: {
        type: 'number',
        description: '物数或声数（count_with_time 时必填）',
      },
      countCategory: {
        type: 'string',
        enum: ['item', 'sound'],
        description: '计数来源（item=物数，sound=声数；count_with_time 时必填）',
      },
      text: {
        type: 'string',
        description: '字占文本',
      },
      textSplitMode: {
        type: 'string',
        enum: ['auto', 'count', 'sentence_pair', 'stroke'],
        description: '字占拆分方式（auto=自动，count=按字数，sentence_pair=两句分取上下卦，stroke=按左右笔画）',
      },
      multiSentenceStrategy: {
        type: 'string',
        enum: ['first', 'last'],
        description: '多句文本的取句方式（first=首句，last=末句）',
      },
      sentences: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 2,
        description: '两句文本，依次对应上卦与下卦（sentence_pair 时使用）',
      },
      leftStrokeCount: {
        type: 'number',
        description: '左（上）半部笔画数（stroke 时必填）',
      },
      rightStrokeCount: {
        type: 'number',
        description: '右（下）半部笔画数（stroke 时必填）',
      },
      measureKind: {
        type: 'string',
        enum: ['丈尺', '尺寸'],
        description: '丈量单位（丈尺=丈数取上卦、尺数取下卦；尺寸=尺数取上卦、寸数取下卦）',
      },
      majorValue: {
        type: 'number',
        description: '大单位的数（丈尺取丈数，尺寸取尺数）',
      },
      minorValue: {
        type: 'number',
        description: '小单位的数（丈尺取尺数，尺寸取寸数）',
      },
      upperCue: {
        type: 'string',
        description: '上卦类象词（如方位、颜色、人物、动物）',
      },
      upperCueCategory: {
        type: 'string',
        enum: ['direction', 'color', 'weather', 'person', 'body', 'animal', 'object', 'shape', 'trigram'],
        description: '上卦类象类别（direction=方位，color=颜色，weather=天象，person=人物，body=身体，animal=动物，object=器物，shape=形状，trigram=卦名；类象词对应多卦时用于限定）',
      },
      lowerCue: {
        type: 'string',
        description: '下卦类象词（取法同 upperCue）',
      },
      lowerCueCategory: {
        type: 'string',
        enum: ['direction', 'color', 'weather', 'person', 'body', 'animal', 'object', 'shape', 'trigram'],
        description: '下卦类象类别（取值同 upperCueCategory）',
      },
      hexagramName: {
        type: 'string',
        description: '指定本卦的卦名或卦码（select 时与上下卦二选一）',
      },
      upperTrigram: {
        type: 'string',
        description: '指定上卦（八卦名，如“乾”）',
      },
      lowerTrigram: {
        type: 'string',
        description: '指定下卦（八卦名，如“坤”）',
      },
      movingLine: {
        type: 'number',
        description: '指定动爻（1-6，自初爻起数；select 时必填）',
      },
      numbers: {
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 3,
        description: '报数（number_pair 取 2 个，number_triplet 取 3 个）',
      },
      detailLevel: {
        type: 'string',
        enum: ['default', 'full'],
        description: '输出详略（default=核心推演；full=追加象辞、错综卦、月令细项与判断参考）',
        default: 'default',
      },
    },
    required: ['question', 'date'],
    allOf: [
      {
        if: {
          properties: {
            method: { const: 'count_with_time' },
          },
          required: ['method'],
        },
        then: {
          required: ['count', 'countCategory'],
        },
      },
      {
        if: {
          properties: {
            method: { const: 'text_split' },
          },
          required: ['method'],
        },
        then: {
          anyOf: [
            {
              properties: {
                textSplitMode: { const: 'stroke' },
              },
              required: ['textSplitMode', 'leftStrokeCount', 'rightStrokeCount'],
            },
            {
              properties: {
                textSplitMode: { const: 'sentence_pair' },
              },
              required: ['textSplitMode'],
              anyOf: [
                { required: ['sentences'] },
                { required: ['text'] },
              ],
            },
            {
              required: ['text'],
            },
          ],
        },
      },
      {
        if: {
          properties: {
            method: { const: 'measure' },
          },
          required: ['method'],
        },
        then: {
          required: ['measureKind', 'majorValue', 'minorValue'],
        },
      },
      {
        if: {
          properties: {
            method: { const: 'classifier_pair' },
          },
          required: ['method'],
        },
        then: {
          required: ['upperCue', 'lowerCue'],
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
          required: ['movingLine'],
          anyOf: [
            { required: ['hexagramName'] },
            { required: ['upperTrigram', 'lowerTrigram'] },
          ],
        },
      },
      {
        if: {
          properties: {
            method: { const: 'number_pair' },
          },
          required: ['method'],
        },
        then: {
          required: ['numbers'],
          properties: {
            numbers: {
              type: 'array',
              items: { type: 'number' },
              minItems: 2,
              maxItems: 2,
            },
          },
        },
      },
      {
        if: {
          properties: {
            method: { const: 'number_triplet' },
          },
          required: ['method'],
        },
        then: {
          required: ['numbers'],
          properties: {
            numbers: {
              type: 'array',
              items: { type: 'number' },
              minItems: 3,
              maxItems: 3,
            },
          },
        },
      },
    ],
    examples: [
      { question: '这次合作能否谈成？', method: 'time', date: '2026-04-04T10:30:00' },
      { question: '丢失物品能否找回？', method: 'count_with_time', count: 7, countCategory: 'item', date: '2026-04-04T10:30:00' },
      { question: '这件事进展如何？', method: 'measure', measureKind: '丈尺', majorValue: 2, minorValue: 3, date: '2026-04-04T10:30:00' },
      { question: '此事后续如何？', method: 'number_pair', numbers: [3, 8], date: '2026-04-04T10:30:00' },
    ],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};
