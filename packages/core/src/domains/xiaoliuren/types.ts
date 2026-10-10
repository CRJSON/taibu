export interface XiaoliurenInput {
  /** 农历月（1-12） */
  lunarMonth?: number;
  /** 农历日（1-30） */
  lunarDay?: number;
  /** 时辰序号（子=1, 丑=2, ..., 亥=12）或0-23的小时数 */
  hour: number;
  /** Explicit input convention; legacy retains the pre-3.6 mixed convention. */
  hourType?: 'clock' | 'shichen' | 'legacy';
  /** Gregorian alternative to the lunar month/day input. */
  date?: string;
  isLeapMonth?: boolean;
  leapMonthStrategy?: 'repeat' | 'advance';
  /** 占问事项 */
  question?: string;
}

export type XiaoliurenStatus = '大安' | '留连' | '速喜' | '赤口' | '小吉' | '空亡';

export interface XiaoliurenStatusInfo {
  name: XiaoliurenStatus;
  element: string;
  direction: string;
  nature: '吉' | '凶' | '半吉半凶';
  description: string;
  poem: string;
}

export interface XiaoliurenOutput {
  calculationOptions?: { hourType: NonNullable<XiaoliurenInput['hourType']>; leapMonthStrategy: NonNullable<XiaoliurenInput['leapMonthStrategy']>; ruleVersion: string; };
  /** 月上起的状态 */
  monthStatus: XiaoliurenStatus;
  /** 日上起的状态 */
  dayStatus: XiaoliurenStatus;
  /** 时上起的最终状态 */
  hourStatus: XiaoliurenStatus;
  /** 最终结果详情 */
  result: XiaoliurenStatusInfo;
  /** 输入参数 */
  input: {
    lunarMonth: number;
    lunarDay: number;
    hour: number;
    shichen: string;
    date?: string;
    isLeapMonth?: boolean;
    leapMonthStrategy?: 'repeat' | 'advance';
    hourType?: 'clock' | 'shichen' | 'legacy';
    clockHour?: number;
  };
  question?: string;
}
