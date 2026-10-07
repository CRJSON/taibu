import {
  arr,
  bool,
  num,
  obj,
  type OutputSchema,
  str
} from '../../schema-builders.js';

export const baziPillarsResolveOutputSchema: OutputSchema = obj({
  原始四柱: obj({
    年柱: str('年柱'),
    月柱: str('月柱'),
    日柱: str('日柱'),
    时柱: str('时柱'),
  }),
  候选数量: num('候选总数'),
  候选列表: arr(obj({
    候选序号: num('候选序号'),
    农历: str('农历文本'),
    公历: str('公历文本'),
    出生时间: str('出生时间'),
    是否闰月: str('是否闰月'),
    时间区间: obj({ 开始: str(), 结束: str(), 结束不含: bool(), 精度: str(), 时区: str() }),
    下一步排盘建议: obj({
      工具: str('工具名'),
      参数: obj({
        出生年: num('出生年，按历法字段解释'),
        出生月: num('出生月，按历法字段解释'),
        出生日: num('出生日，按历法字段解释'),
        出生时: num('出生时'),
        出生分: num('出生分'),
        历法: str('历法'),
        是否闰月: str('是否闰月'),
        时区: str(), 换日: str(), 经度: num(), 夏令时策略: str(),
      }),
      缺少信息: arr(str(), '缺少信息'),
    }),
  })),
});
