# 四柱反推（`bazi_pillars_resolve`）

四柱反推 - 根据四柱搜索分钟级出生时间区间，默认1900-2100，单次最多1200年。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `timezone` | string | 否 | `"Asia/Shanghai"` | 出生钟表时间的 IANA 时区 |
| `disambiguation` | enum | 否 | `"reject"` | 夏令时跳时/重复时刻的解析策略；可选值: `reject` / `earlier` / `later` / `compatible` |
| `dayBoundary` | enum | 否 | `"midnight"` | 日柱换日：午夜或23点；时干沿用历法库的子时规则；可选值: `midnight` / `zi` |
| `longitude` | number | 否 | — | 经度；提供时校正真太阳时 |
| `startYear` | integer | 否 | `1900` | — |
| `endYear` | integer | 否 | `2100` | — |
| `yearPillar` | string | 是 | — | 年柱干支（如“甲子”） |
| `monthPillar` | string | 是 | — | 月柱干支（如“乙丑”） |
| `dayPillar` | string | 是 | — | 日柱干支（如“丙寅”） |
| `hourPillar` | string | 是 | — | 时柱干支（如“丁卯”） |

## 调用示例

```bash
echo '{"yearPillar":"甲子","monthPillar":"乙丑","dayPillar":"丙寅","hourPillar":"丁卯"}' | node "$TB/scripts/taibu.mjs" call bazi_pillars_resolve -
```

```bash
echo '{"yearPillar":"戊子","monthPillar":"乙丑","dayPillar":"辛卯","hourPillar":"癸巳"}' | node "$TB/scripts/taibu.mjs" call bazi_pillars_resolve -
```

## 输出结构（structuredContent 顶层键）

- `原始四柱`
- `候选数量`：候选数量
- `候选列表`
- `计算规则`

