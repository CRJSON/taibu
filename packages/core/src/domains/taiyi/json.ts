import { normalizeDetailLevelBinary } from '../../shared/render-utils.js';
import { GAN_WUXING } from '../../shared/utils.js';

import type { TaiyiCanonicalTextOptions } from '../shared/text-options.js';
import type { TaiyiCanonicalJSON } from './json-types.js';
import type { TaiyiOutput, TaiyiStarSnapshot } from './types.js';

function formatMappingReference(star: TaiyiStarSnapshot): string {
  return `${star.qimenName} / ${star.xuankongName}`;
}

function formatScaleLabel(star: TaiyiStarSnapshot): string {
  return star.scale === 'minute' ? '分钟主星' : star.scaleLabel;
}

function buildEnergyInteraction(result: TaiyiOutput): string {
  if (result.traditionalBoard) return `主算${result.traditionalBoard.home.count}，客算${result.traditionalBoard.away.count}`;
  if (!result.coreBoard) throw new Error('太乙九星结果缺少 coreBoard');
  const dayStem = result.datetimeContext.dayGanZhi.charAt(0);
  const dayElement = GAN_WUXING[dayStem] || '';
  const dayStemLabel = dayElement ? `${dayStem}(${dayElement})` : dayStem;
  return `当前主星【${result.coreBoard.primaryStar.taiyiName}(${result.coreBoard.primaryStar.wuXing})】${result.derivedIndicators.elementRelation.replace('主星五行', '')}【${dayStemLabel}】`;
}

export function renderTaiyiCanonicalJSON(
  result: TaiyiOutput,
  options: { detailLevel?: TaiyiCanonicalTextOptions['detailLevel']; } = {},
): TaiyiCanonicalJSON {
  normalizeDetailLevelBinary(options.detailLevel);
  const timeLabel = `${result.datetimeContext.solarDateTime}（${result.datetimeContext.yearGanZhi}年 ${result.datetimeContext.monthGanZhi}月 ${result.datetimeContext.dayGanZhi}日 ${result.datetimeContext.hourGanZhi}时）`;
  const json: TaiyiCanonicalJSON = {
    计算规则: { 系统: result.boardMeta.systemLabel, 时区: result.boardMeta.timezone, 规则版本: result.boardMeta.ruleVersion, 计法: result.boardMeta.mode, ...(result.traditionalBoard ? { 积数口径: result.traditionalBoard.profile, 积年常数: result.traditionalBoard.yearEpoch } : {}) },
    问卜与时空底盘: {
      ...(result.question ? { 占问: result.question } : {}),
      时间: timeLabel,
      农历: result.datetimeContext.lunarDate,
      ...(result.datetimeContext.jieQi ? { 节气: result.datetimeContext.jieQi } : {}),
      四柱: `${result.datetimeContext.yearGanZhi} ${result.datetimeContext.monthGanZhi} ${result.datetimeContext.dayGanZhi} ${result.datetimeContext.hourGanZhi}`,
      ...(result.coreBoard?.minuteRefinement
        ? { 分钟段: `第 ${result.coreBoard.minuteRefinement.slot} 段（${String(result.coreBoard.minuteRefinement.startMinute).padStart(2, '0')}-${String(result.coreBoard.minuteRefinement.endMinute).padStart(2, '0')} 分）` }
        : {}),
    },
    外部时空环境: {
      星宿: `${result.datetimeContext.xiu}${result.datetimeContext.xiuLuck ? `（${result.datetimeContext.xiuLuck}）` : ''}`,
      值星: result.datetimeContext.dayOfficer,
      天神: `${result.datetimeContext.tianShen}${result.datetimeContext.tianShenLuck ? `（${result.datetimeContext.tianShenLuck}）` : ''}`,
    },
    核心物理关系: {
      能量交互: buildEnergyInteraction(result),
    },
    九星阵列: (result.coreBoard ? [
      result.coreBoard.yearStar,
      result.coreBoard.monthStar,
      result.coreBoard.dayStar,
      result.coreBoard.hourStar,
      ...(result.coreBoard.minuteRefinement ? [result.coreBoard.minuteRefinement.refinedStar] : []),
    ] : []).map((star) => ({
      观测层级: formatScaleLabel(star),
      太乙名: star.taiyiName,
      神性: star.taiyiType,
      北斗名: star.beidouName,
      映射参考: formatMappingReference(star),
      五行: star.wuXing,
      方位: star.positionDesc,
      宫位: star.position,
    })),
    古典参考: {
      主诀原文: result.judgementAnchors.primarySong,
      使用提示: '原文仅供意象联想，需结合前述时空底盘与九星阵列辩证解读。',
    },
  };

  if (result.traditionalBoard) {
    const board = result.traditionalBoard;
    json.九星阵列 = [];
    json.核心物理关系.能量交互 = `主算${board.home.count}，客算${board.away.count}`;
    json.古典参考 = { 主诀原文: '', 使用提示: result.judgementAnchors.modeNotes.join(' ') };
    json.太乙七十二局 = {
      流派: board.profile === 'jinjing' ? '金镜现代历法适配' : '统宗积数现代历法适配',
      积数: board.accumulatedNumber, 积数来源: board.accumulationSource, 局式: `${board.dun === 'yang' ? '阳' : '阴'}遁${board.bureau}局`, 太乙: board.taiyi.position, 太乙宫: board.taiyi.palace,
      文昌: board.wenChang, 始击: board.shiJi, 计神: board.jiShen, 合神: board.heShen, 太岁: board.taiSui,
      主算: board.home.count, 主大将: board.home.general, 主参将: board.home.assistant, 客算: board.away.count, 客大将: board.away.general, 客参将: board.away.assistant,
      十六宫: board.palaces.map(palace => ({ 宫位: palace.position, 宫神: palace.deity, 星将: [...palace.stars] })), 采用口径: [...result.judgementAnchors.modeNotes],
    };
  }

  return json;
}
