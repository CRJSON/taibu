import type {
  BranchRelation,
  HiddenStemInfo,
  LiunianInfo,
  TrueSolarTimeInfo,
  XiaoyunInfo
} from '../shared/types.js';
import type { BaziInput } from '../bazi/types.js';

// ===== 大运相关类型 =====

export interface DayunInput extends BaziInput {
  yunSect?: 1 | 2;
}

export interface DayunOutput {
  startAge: number;
  startAgeDetail: string;
  startSolar?: string;
  direction?: 'forward' | 'backward';
  yunSect?: 1 | 2;
  dayBoundary?: 'midnight' | 'zi';
  trueSolarTimeInfo?: TrueSolarTimeInfo;
  calculationOptions?: { timezone: string; startSolarTimezone: string; longitude?: number; yunSect: 1 | 2; dayBoundary: 'midnight' | 'zi'; disambiguation?: BaziInput['disambiguation']; ageConvention: 'nominal'; ruleVersion?: string; };
  xiaoYun: XiaoyunInfo[];
  list: Array<{
    startYear: number;
    startAge: number;
    ganZhi: string;
    stem: string;
    branch: string;
    tenGod: string;
    branchTenGod: string;
    hiddenStems: HiddenStemInfo[];
    naYin: string;
    diShi: string;
    shenSha: string[];
    branchRelations: BranchRelation[];
    liunianList: LiunianInfo[];
  }>;
}
