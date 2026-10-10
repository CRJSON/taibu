import { arr, num, obj, str, type OutputSchema } from '../../schema-builders.js';

const factorSnapshotSchema = obj({
  标识: str('原始星体标识'),
  黄经度: num('原始黄经度，用于盘面定位'),
  星座: str('星座'),
  黄经: str('黄经'),
  宫位: str("所在宫位（如“第9宫”）"),
  逆行: str('逆行'),
});

const compactAspectSchema = obj({
  对象标识: str('原始相位对象标识'),
  对象: str("构成相位的另一星体或点"),
  相位: str('相位'),
  容许度: num('容许度'),
});

const factorWithAspectsSchema = obj({
  标识: str('原始星体标识'),
  黄经度: num('原始黄经度'),
  因素: str("星体"),
  星座: str('星座'),
  黄经: str('黄经'),
  宫位: str("所在宫位（如“第9宫”）"),
  逆行: str('逆行'),
  关键相位: arr(compactAspectSchema, "容许度内的主要相位"),
});

const transitTriggerSchema = obj({
  标识: str('原始流运星体标识'),
  黄经度: num('原始黄经度'),
  流运星体: str('流运星体'),
  星座: str('星座'),
  黄经: str('黄经'),
  宫位: str("所在宫位（如“第9宫”）"),
  逆行: str('逆行'),
  触发相位: arr(compactAspectSchema, "对本命星体或点形成的紧密相位"),
});

const pointPairSchema = obj({
  因素: str("附加点或交点（如北交点、莉莉丝）"),
  本命: factorSnapshotSchema,
  流运: factorSnapshotSchema,
});

const aspectSchema = obj({
  起点标识: str('原始起点标识'),
  终点标识: str('原始终点标识'),
  相位: str('相位'),
  起点: str("相位起点（星体或点）"),
  终点: str("相位终点（星体或点）"),
  容许度: num('容许度'),
  实际夹角: num('实际夹角'),
});

const houseSchema = obj({
  宫位序号: num('原始宫位序号'),
  宫头黄经度: num('原始宫头黄经度'),
  宫位: str("宫位（第1宫至第12宫）"),
  宫头星座: str('宫头星座'),
  宫头黄经: str("宫头黄经（绝对黄经 / 星座内度数）"),
});

export const astrologyOutputSchema: OutputSchema = obj({
  基础坐标: obj({
    计算模式: str("计算模式（精准盘/近似盘）"),
    说明: str("近似盘的计算说明"),
    出生地: str('出生地'),
    坐标: str("纬度, 经度"),
    本命时区: str("本命时区（IANA 时区名）"),
    本命时刻: str("本命当地时间"),
    流运时刻: str("流运时刻（按本命时区）"),
    黄道体系: str('黄道体系'),
    宫制: str("宫位制"),
  }, "计算模式、坐标、时区与时刻"),
  命盘锚点: obj({
    太阳: factorSnapshotSchema,
    月亮: factorSnapshotSchema,
    上升: factorSnapshotSchema,
    天顶: factorSnapshotSchema,
    上升说明: str("上升未计算的原因（缺少经纬度时输出）"),
    天顶说明: str("天顶未计算的原因（缺少经纬度时输出）"),
  }, "太阳、月亮、上升与天顶的位置"),
  本命主星: arr(factorWithAspectsSchema, "本命主要星体及其关键相位"),
  当前流运触发: arr(transitTriggerSchema, "与本命形成紧密相位的流运慢行星"),
  扩展信息: obj({
    附加点与交点: arr(pointPairSchema, "附加点与交点的本命及流运位置"),
    宫位宫头: arr(houseSchema, "十二宫宫头"),
    完整相位矩阵: obj({
      本命: arr(aspectSchema, "本命盘全部主要相位"),
      流运: arr(aspectSchema, "流运星体对本命的全部主要相位"),
    }),
    黄道分界: arr(obj({
      星座: str('星座'),
      起点黄经: str("星座起点黄经"),
    }), "十二星座的起点黄经"),
  }, "附加点、宫头、完整相位矩阵与黄道分界"),
});
