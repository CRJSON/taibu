# 紫微斗数飞星（`ziwei_flying_star`）

紫微斗数飞星 - 分析命盘中的四化飞布、自化、落宫与三方四正关系。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `timezone` | string | 否 | `"Asia/Shanghai"` | 出生钟表时间的 IANA 时区 |
| `disambiguation` | enum | 否 | `"reject"` | 夏令时跳时/重复时刻的解析策略；可选值: `reject` / `earlier` / `later` / `compatible` |
| `calculationOptions` | object | 否 | — | — |
| `calculationOptions.algorithm` | enum | 否 | `"default"` | 可选值: `default` / `zhongzhou` |
| `calculationOptions.yearDivide` | enum | 否 | `"normal"` | 本命年界：正月初一或立春日；采用 iztro 的日级年界口径；可选值: `normal` / `exact` |
| `calculationOptions.horoscopeDivide` | enum | 否 | `"exact"` | 运限年/月界采用 iztro 规则；exact 使用代表时辰，非分钟级天文交节；可选值: `normal` / `exact` |
| `calculationOptions.ageDivide` | enum | 否 | `"normal"` | 可选值: `normal` / `birthday` |
| `calculationOptions.dayDivide` | enum | 否 | `"forward"` | 可选值: `current` / `forward` |
| `calculationOptions.fixLeap` | boolean | 否 | `true` | 闰月十五日后按下月安星 |
| `calculationOptions.mutagens` | object | 否 | — | 按禄权科忌覆盖对应天干的四化星 |
| `calculationOptions.mutagens.甲` | string[] | 否 | — | — |
| `calculationOptions.mutagens.乙` | string[] | 否 | — | — |
| `calculationOptions.mutagens.丙` | string[] | 否 | — | — |
| `calculationOptions.mutagens.丁` | string[] | 否 | — | — |
| `calculationOptions.mutagens.戊` | string[] | 否 | — | — |
| `calculationOptions.mutagens.己` | string[] | 否 | — | — |
| `calculationOptions.mutagens.庚` | string[] | 否 | — | — |
| `calculationOptions.mutagens.辛` | string[] | 否 | — | — |
| `calculationOptions.mutagens.壬` | string[] | 否 | — | — |
| `calculationOptions.mutagens.癸` | string[] | 否 | — | — |
| `gender` | enum | 是 | — | 性别；可选值: `male` / `female` |
| `birthYear` | integer | 是 | — | 出生年 (1900-2100) |
| `birthMonth` | integer | 是 | — | 出生月 (1-12) |
| `birthDay` | integer | 是 | — | 出生日 (1-31) |
| `birthHour` | integer | 是 | — | 出生时 (0-23) |
| `birthMinute` | integer | 否 | `0` | 出生分 (0-59) |
| `calendarType` | enum | 否 | `"solar"` | 历法类型（solar=公历，lunar=农历）；可选值: `solar` / `lunar` |
| `isLeapMonth` | boolean | 否 | `false` | 农历闰月标记 |
| `longitude` | number | 否 | — | 出生地经度 |
| `queries` | object[] | 是 | — | 查询列表 |
| `queries[].type` | enum | 是 | — | 查询类型（fliesTo=飞到，selfMutaged=自化，mutagedPlaces=四化落宫，surroundedPalaces=三方四正）；可选值: `fliesTo` / `selfMutaged` / `mutagedPlaces` / `surroundedPalaces` |
| `queries[].from` | string | 否 | — | 起飞宫位 |
| `queries[].to` | string | 否 | — | 目标宫位 |
| `queries[].palace` | string | 否 | — | 查询宫位 |
| `queries[].mutagens` | string[] | 否 | — | 四化类型列表 |
| `detailLevel` | enum | 否 | `"default"` | 输出细节级别。；可选值: `default` / `full` |

## 调用示例

```bash
echo '{"gender":"male","birthYear":1990,"birthMonth":1,"birthDay":15,"birthHour":9,"queries":[{"type":"mutagedPlaces","palace":"命宫"},{"type":"surroundedPalaces","palace":"命宫"}]}' | node "$TB/scripts/taibu.mjs" call ziwei_flying_star -
```

## 输出结构（structuredContent 顶层键）

- `查询结果`
- `计算规则`

