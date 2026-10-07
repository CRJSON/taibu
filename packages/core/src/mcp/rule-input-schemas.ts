import type { ToolSchema } from './contract.js';
import { ZIWEI_MUTAGEN_STARS } from '../domains/ziwei/profile.js';

export const birthDateTogetherRule: ToolSchema = {
  if: { anyOf: ['birthYear', 'birthMonth', 'birthDay', 'birthHour'].map(field => ({ required: [field] })) },
  then: { required: ['birthYear', 'birthMonth', 'birthDay'] },
};

export const timezoneInputs: Record<string, ToolSchema> = {
  timezone: { type: 'string', description: '出生钟表时间的 IANA 时区', default: 'Asia/Shanghai' },
  disambiguation: { type: 'string', enum: ['reject', 'earlier', 'later', 'compatible'], description: '夏令时跳时/重复时刻的解析策略', default: 'reject' },
};
export const baziRuleInputs: Record<string, ToolSchema> = {
  ...timezoneInputs,
  dayBoundary: { type: 'string', enum: ['midnight', 'zi'], default: 'midnight', description: '日柱换日：午夜或23点；时干沿用历法库的子时规则' },
  longitude: { type: 'number', minimum: -180, maximum: 180, description: '经度；提供时校正真太阳时' },
};
export const ziweiRuleInputs: Record<string, ToolSchema> = {
  ...timezoneInputs,
  calculationOptions: {
    type: 'object', additionalProperties: false,
    properties: {
      algorithm: { type: 'string', enum: ['default', 'zhongzhou'], default: 'default' },
      yearDivide: { type: 'string', enum: ['normal', 'exact'], default: 'normal', description: '本命年界：正月初一或立春日；采用 iztro 的日级年界口径' },
      horoscopeDivide: { type: 'string', enum: ['normal', 'exact'], default: 'exact', description: '运限年/月界采用 iztro 规则；exact 使用代表时辰，非分钟级天文交节' },
      ageDivide: { type: 'string', enum: ['normal', 'birthday'], default: 'normal' },
      dayDivide: { type: 'string', enum: ['current', 'forward'], default: 'forward' },
      fixLeap: { type: 'boolean', default: true, description: '闰月十五日后按下月安星' },
      mutagens: { type: 'object', additionalProperties: false, description: '按禄权科忌覆盖对应天干的四化星', properties: Object.fromEntries(Array.from('甲乙丙丁戊己庚辛壬癸').map(stem => [stem, { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string', enum: ZIWEI_MUTAGEN_STARS } }])) },
    },
  },
};
