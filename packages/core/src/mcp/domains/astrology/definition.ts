import type { ToolDefinition } from '../../contract.js';

export const astrologyDefinition: ToolDefinition = {
  name: 'astrology',
  description: '西方占星命盘 - 根据出生信息计算本命盘与流运盘，输出基础坐标、命盘锚点、本命主星与流运触发。',
  inputSchema: {
    type: 'object',
    properties: {
      birthYear: { type: 'number', description: '出生年（1-9999）' },
      birthMonth: { type: 'number', description: '出生月（1-12）' },
      birthDay: { type: 'number', description: '出生日（1-31）' },
      birthHour: { type: 'number', description: '出生时（0-23）' },
      birthMinute: { type: 'number', description: '出生分（0-59）', default: 0 },
      latitude: { type: 'number', description: '出生地纬度（-90 到 90；须与 longitude 同时提供，用于确定当地时区、上升、天顶与宫位）' },
      longitude: { type: 'number', description: '出生地经度（-180 到 180；须与 latitude 同时提供）' },
      birthPlace: { type: 'string', description: '出生地点文本' },
      transitDateTime: { type: 'string', description: '流运时刻（YYYY-MM-DDTHH:mm[:ss] 按出生地时区解释，也可用带时区偏移的 ISO 时间；省略时取当前时刻）' },
      houseSystem: { type: 'string', enum: ['placidus'], description: '宫位制（目前仅支持 placidus）', default: 'placidus' },
      detailLevel: {
        type: 'string',
        enum: ['default', 'more', 'full'],
        description: '输出详略（default=核心盘面；more=追加附加点与交点、宫位宫头；full=再追加完整相位矩阵与黄道分界，需出生地坐标）',
        default: 'default',
      },
    },
    required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour'],
    allOf: [
      {
        if: {
          required: ['latitude'],
        },
        then: {
          required: ['longitude'],
        },
      },
      {
        if: {
          required: ['longitude'],
        },
        then: {
          required: ['latitude'],
        },
      },
      {
        if: {
          properties: {
            detailLevel: { const: 'full' },
          },
          required: ['detailLevel'],
        },
        then: {
          required: ['latitude', 'longitude'],
        },
      },
    ],
    examples: [
      {
        birthYear: 1990,
        birthMonth: 1,
        birthDay: 1,
        birthHour: 12,
        birthMinute: 30,
        latitude: 40.7128,
        longitude: -74.006,
        transitDateTime: '2026-04-10T09:30:00',
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
