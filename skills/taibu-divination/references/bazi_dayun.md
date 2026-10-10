# 八字大运（`bazi_dayun`）

八字大运 - 根据出生信息计算起运时间、大运列表、小运与流年链路。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `timezone` | string | 否 | `"Asia/Shanghai"` | 出生钟表时间的 IANA 时区 |
| `disambiguation` | enum | 否 | `"reject"` | 夏令时跳时/重复时刻的解析策略；可选值: `reject` / `earlier` / `later` / `compatible` |
| `dayBoundary` | enum | 否 | `"midnight"` | 日柱换日：午夜或23点；时干沿用历法库的子时规则；可选值: `midnight` / `zi` |
| `longitude` | number | 否 | — | 经度；提供时校正真太阳时 |
| `yunSect` | enum | 否 | `1` | 起运换算法1或2；可选值: `1` / `2` |
| `gender` | enum | 是 | — | 性别；可选值: `male` / `female` |
| `birthYear` | integer | 是 | — | 出生年 (1-9999) |
| `birthMonth` | integer | 是 | — | 出生月 (1-12) |
| `birthDay` | integer | 是 | — | 出生日 (1-31) |
| `birthHour` | integer | 是 | — | 出生时 (0-23) |
| `birthMinute` | integer | 否 | `0` | 出生分 (0-59) |
| `calendarType` | enum | 否 | `"solar"` | 历法类型（solar=公历，lunar=农历）；可选值: `solar` / `lunar` |
| `isLeapMonth` | boolean | 否 | `false` | 农历闰月标记 |
| `detailLevel` | enum | 否 | `"default"` | 输出细节级别。；可选值: `default` / `full` |

## 调用示例

```bash
echo '{"gender":"male","birthYear":1990,"birthMonth":1,"birthDay":15,"birthHour":9}' | node "$TB/scripts/taibu.mjs" call bazi_dayun -
```

```bash
echo '{"gender":"female","birthYear":1995,"birthMonth":6,"birthDay":20,"birthHour":23,"calendarType":"lunar"}' | node "$TB/scripts/taibu.mjs" call bazi_dayun -
```

## 输出结构（structuredContent 顶层键）

- `起运信息`
- `小运`：小运列表
- `大运列表`：大运列表
- `计算规则`

