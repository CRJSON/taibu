# 紫微斗数命盘（`ziwei`）

紫微斗数命盘 - 根据出生信息计算紫微命盘，输出十二宫位、星曜分布、四化、大限等信息。

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
| `birthYear` | integer | 是 | — | 出生年（1900-2100） |
| `birthMonth` | integer | 是 | — | 出生月（1-12） |
| `birthDay` | integer | 是 | — | 出生日（公历 1-31，农历 1-30） |
| `birthHour` | integer | 是 | — | 出生时（0-23） |
| `birthMinute` | integer | 否 | `0` | 出生分（0-59） |
| `calendarType` | enum | 否 | `"solar"` | 出生日期的历法（solar=公历，lunar=农历）；可选值: `solar` / `lunar` |
| `isLeapMonth` | boolean | 否 | `false` | 是否农历闰月（仅 calendarType=lunar 时有效） |
| `longitude` | number | 否 | — | 出生地经度（-180 到 180；提供时按真太阳时校正出生时间） |
| `detailLevel` | enum | 否 | `"default"` | 输出详略（default=核心盘面；full=追加杂曜、神煞、小限、斗君、命主星与身主星等）；可选值: `default` / `full` |

## 调用示例

```bash
echo '{"gender":"male","birthYear":1990,"birthMonth":1,"birthDay":15,"birthHour":9}' | node "$TB/scripts/taibu.mjs" call ziwei -
```

```bash
echo '{"gender":"female","birthYear":1995,"birthMonth":6,"birthDay":20,"birthHour":23,"calendarType":"lunar"}' | node "$TB/scripts/taibu.mjs" call ziwei -
```

```bash
echo '{"gender":"male","birthYear":1990,"birthMonth":1,"birthDay":15,"birthHour":9,"longitude":116.4}' | node "$TB/scripts/taibu.mjs" call ziwei -
```

## 输出结构（structuredContent 顶层键）

- `基本信息`：命盘基本信息
- `十二宫位`：十二宫位详细信息
- `小限`：小限列表
- `计算规则`

