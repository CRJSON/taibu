import {
  arr,
  num,
  obj,
  type OutputSchema,
  str
} from '../../schema-builders.js';

export const ziweiFlyingStarOutputSchema: OutputSchema = obj({
  查询结果: arr(obj({
    查询序号: num('查询序号（从1开始）'),
    查询类型: str('查询类型（自化/飞星四化/宫位飞化/因果链等）'),
    判断目标: str('判断目标描述'),
    结果: str('判断结果（是/否）'),
    发射宫位: str('发射宫位（飞化的起点宫位）'),
    发射宫干支: str('发射宫的宫干支'),
    实际飞化: arr(obj({
      四化: str('四化（禄/权/科/忌）'),
      宫位: str('飞入的目标宫位'),
      星曜: str('化出的星曜名称'),
    }), '实际发生的飞化列表'),
    四化落宫: arr(obj({
      四化: str('四化'),
      宫位: str('目标宫位'),
      星曜: str('星曜'),
    }), '四化落宫分布'),
    本宫: str('本宫（查询的起始宫位）'),
    矩阵宫位: obj({
      对宫: str('本宫的对宫'),
      三合1: str('本宫的第一个三合宫'),
      三合2: str('本宫的第二个三合宫'),
    }, '本宫的三方四正宫位'),
  }), '各查询的判断结果'),
});
