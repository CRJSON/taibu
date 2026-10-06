export interface XiaoliurenCanonicalJSON {
  计算规则?: Record<string, unknown>;
  起课信息: {
    占问?: string;
    农历月: number;
    农历日: number;
    时辰: string;
    时辰序号: number;
    公历日期?: string;
    闰月?: boolean;
    闰月取法?: string;
    小时输入口径?: string;
  };
  推演链: {
    月上起: string;
    日上落: string;
    时上落: string;
  };
  结果: {
    落宫: string;
    五行: string;
    方位: string;
    性质: string;
    释义?: string;
    诗诀?: string;
  };
}
