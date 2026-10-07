import type { ToolDefinition } from '../../contract.js';

export const astrologyDefinition: ToolDefinition = {
  name: 'astrology',
  description: '西方占星命盘 - 根据出生信息计算本命盘与流运盘，输出基础坐标、命盘锚点、本命主星与流运触发。',
  inputSchema: {
    type: 'object',
    properties: {
      birthYear: { type: 'integer', minimum: 1, maximum: 9999, description: '出生年 (> 0)' },
      birthMonth: { type: 'integer', minimum: 1, maximum: 12, description: '出生月 (1-12)' },
      birthDay: { type: 'integer', minimum: 1, maximum: 31, description: '出生日 (1-31)' },
      birthHour: { type: 'integer', minimum: 0, maximum: 23, description: '出生时 (0-23)' },
      birthMinute: { type: 'integer', minimum: 0, maximum: 59, description: '出生分 (0-59)', default: 0 },
      latitude: { type: 'number', minimum: -90, maximum: 90, description: '出生地纬度 (-90 到 90)' },
      longitude: { type: 'number', minimum: -180, maximum: 180, description: '出生地经度 (-180 到 180)' },
      birthPlace: { type: 'string', description: '出生地点文本' },
      timezone: { type: 'string', description: '显式 IANA 时区；省略时按经纬度推导，零坐标为 Etc/GMT' },
      disambiguation: { type: 'string', enum: ['reject', 'earlier', 'later', 'compatible'], default: 'reject' },
      zodiac: { type: 'string', enum: ['tropical', 'sidereal'], default: 'tropical' },
      ayanamsa: { type: 'number', minimum: 0, maximum: 360, description: '恒星黄道的自定义固定偏移角度；本命与行运共用' },
      aspectOrbs: { type: 'object', additionalProperties: false, properties: Object.fromEntries(['conjunction', 'opposition', 'trine', 'square', 'sextile'].map(type => [type, { type: 'number', minimum: 0, maximum: 15 }])) },
      transitDateTime: { type: 'string', description: '流运时刻（YYYY-MM-DDTHH:mm[:ss] 或带时区偏移的 ISO 时间；省略时取当前时刻）' },
      houseSystem: { type: 'string', enum: ['placidus', 'equal-house', 'whole-sign', 'koch', 'campanus', 'regiomontanus', 'topocentric'], description: '宫制；高纬度使用等宫或整宫', default: 'placidus' },
      detailLevel: {
        type: 'string',
        enum: ['default', 'more', 'full'],
        description: '输出细节级别。',
        default: 'default',
      },
    },
    required: ['birthYear', 'birthMonth', 'birthDay', 'birthHour'],
    allOf: [
      { if: { properties: { zodiac: { const: 'sidereal' } }, required: ['zodiac'] }, then: { required: ['ayanamsa'] } },
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
