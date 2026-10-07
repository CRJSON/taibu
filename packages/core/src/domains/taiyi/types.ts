export type TaiyiMode = 'year' | 'month' | 'day' | 'hour' | 'minute';

export interface TaiyiInput {
  mode: TaiyiMode;
  date: string;
  hour?: number;
  minute?: number;
  timezone?: string;
  question?: string;
  system?: 'nine-star' | 'traditional';
  tradition?: 'jinjing' | 'tongzong';
  accumulatedNumber?: number;
  dunType?: 'yang' | 'yin';
}

export interface TaiyiStarSnapshot {
  scale: TaiyiMode | 'support';
  scaleLabel: string;
  index: number;
  number: number;
  color: string;
  wuXing: string;
  position: string;
  positionDesc: string;
  beidouName: string;
  xuankongName: string;
  qimenName: string;
  qimenLuck: string;
  qimenYinYang: string;
  qimenGate?: string;
  taiyiName: string;
  taiyiType: string;
  song: string;
}

export interface TaiyiMinuteRefinement {
  slot: number;
  startMinute: number;
  endMinute: number;
  refinedStar: TaiyiStarSnapshot;
  note: string;
}

export interface TaiyiBoardMeta {
  system: 'taiyi_nine_star' | 'taiyi_traditional';
  systemLabel: string;
  mode: TaiyiMode;
  modeLabel: string;
  minuteSlot?: number;
  minuteStrategy?: string;
  timezone?: string;
  ruleVersion?: string;
}

export interface TaiyiDatetimeContext {
  solarDateTime: string;
  lunarDate: string;
  jieQi?: string;
  yearGanZhi: string;
  monthGanZhi: string;
  dayGanZhi: string;
  hourGanZhi: string;
  xiu: string;
  xiuLuck: string;
  dayOfficer: string;
  tianShen: string;
  tianShenLuck: string;
}

export interface TaiyiDerivedIndicators {
  favorableSignals: string[];
  cautionSignals: string[];
  elementRelation: string;
  directionalHint: string;
}

export interface TaiyiJudgementAnchors {
  summary: string[];
  primarySong: string;
  modeNotes: string[];
}

export interface TaiyiOutput {
  question?: string;
  boardMeta: TaiyiBoardMeta;
  datetimeContext: TaiyiDatetimeContext;
  /** Present only for the nine-star system. Traditional results contain traditionalBoard. */
  coreBoard?: {
    primaryStar: TaiyiStarSnapshot;
    yearStar: TaiyiStarSnapshot;
    monthStar: TaiyiStarSnapshot;
    dayStar: TaiyiStarSnapshot;
    hourStar: TaiyiStarSnapshot;
    minuteRefinement?: TaiyiMinuteRefinement;
  };
  derivedIndicators: TaiyiDerivedIndicators;
  judgementAnchors: TaiyiJudgementAnchors;
  traditionalBoard?: TaiyiTraditionalBoard;
}

export interface TaiyiTraditionalBoard {
  profile: 'jinjing' | 'tongzong';
  accumulatedNumber: number;
  accumulationSource: 'calendar-epoch' | 'manual';
  bureau: number;
  dun: 'yang' | 'yin';
  ruleVersion: string;
  yearEpoch: number;
  taiyi: { palace: number; position: string; };
  wenChang: string;
  shiJi: string;
  jiShen: string;
  heShen: string;
  taiSui: string;
  home: { count: number; general: number; assistant: number; };
  away: { count: number; general: number; assistant: number; };
  palaces: { position: string; deity: string; stars: string[]; }[];
}
