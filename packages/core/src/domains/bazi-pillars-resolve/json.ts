import { withRulesJSON } from '../../shared/calculation-rules.js';
import type {
  BaziPillarsResolveCanonicalJSON
} from './json-types.js';
import type {
  BaziPillarsResolveOutput
} from './types.js';

export const renderBaziPillarsResolveCanonicalJSON = withRulesJSON(renderBaziPillarsResolveCanonicalJSONBase);

function renderBaziPillarsResolveCanonicalJSONBase(
  result: BaziPillarsResolveOutput,
): BaziPillarsResolveCanonicalJSON {
  return {
    原始四柱: {
      年柱: result.pillars.yearPillar,
      月柱: result.pillars.monthPillar,
      日柱: result.pillars.dayPillar,
      时柱: result.pillars.hourPillar,
    },
    候选数量: result.count,
    候选列表: result.candidates.map((c, index) => ({
      候选序号: index + 1,
      农历: c.lunarText,
      公历: c.solarText,
      出生时间: `${c.birthHour}:${String(c.birthMinute).padStart(2, '0')}`,
      是否闰月: c.isLeapMonth ? '是' : '否',
      ...(c.timeWindow ? { 时间区间: { 开始: c.timeWindow.start, 结束: c.timeWindow.end, 结束不含: true as const, 精度: c.timeWindow.precision, 时区: c.timeWindow.timezone } } : {}),
      下一步排盘建议: {
        工具: c.nextCall.tool,
        参数: {
          出生年: c.nextCall.arguments.birthYear,
          出生月: c.nextCall.arguments.birthMonth,
          出生日: c.nextCall.arguments.birthDay,
          出生时: c.nextCall.arguments.birthHour,
          出生分: c.nextCall.arguments.birthMinute,
          历法: c.nextCall.arguments.calendarType,
          是否闰月: c.nextCall.arguments.isLeapMonth ? '是' : '否',
          ...(c.nextCall.arguments.timezone ? { 时区: c.nextCall.arguments.timezone } : {}),
          ...(c.nextCall.arguments.dayBoundary ? { 换日: c.nextCall.arguments.dayBoundary } : {}),
          ...(c.nextCall.arguments.disambiguation ? { 夏令时策略: c.nextCall.arguments.disambiguation } : {}),
          ...(c.nextCall.arguments.longitude === undefined ? {} : { 经度: c.nextCall.arguments.longitude }),
        },
        缺少信息: [...c.nextCall.missing],
      },
    })),
  };
}

// ===== 紫微运限 =====
