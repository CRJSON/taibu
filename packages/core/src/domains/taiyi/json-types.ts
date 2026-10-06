export interface TaiyiCanonicalJSON {
  计算规则?: { 系统: string; 时区?: string; 规则版本?: string; 计法?: string; 积数口径?: string; 积年常数?: number; };
  太乙七十二局?: {
    流派: string; 积数: number; 积数来源: string; 局式: string; 太乙: string; 太乙宫: number;
    文昌: string; 始击: string; 计神: string; 合神: string; 太岁: string;
    主算: number; 主大将: number; 主参将: number; 客算: number; 客大将: number; 客参将: number;
    十六宫: { 宫位: string; 宫神: string; 星将: string[]; }[]; 采用口径: string[];
  };
  问卜与时空底盘: {
    占问?: string;
    时间: string;
    农历: string;
    节气?: string;
    四柱: string;
    分钟段?: string;
  };
  外部时空环境: {
    星宿: string;
    值星: string;
    天神: string;
  };
  核心物理关系: {
    能量交互: string;
  };
  九星阵列: Array<{
    观测层级: string;
    太乙名: string;
    神性: string;
    北斗名: string;
    映射参考: string;
    五行: string;
    方位: string;
    宫位: string;
  }>;
  古典参考: {
    主诀原文: string;
    使用提示: string;
  };
}
