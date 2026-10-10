# 塔罗抽牌（`tarot`）

塔罗抽牌 - 按牌阵抽取塔罗牌，输出各牌位的牌面、正逆位、核心基调、元素与星象；可选输出求问者的人格牌、灵魂牌与年度牌。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `spreadType` | enum | 否 | `"single"` | 牌阵类型（single=单牌，three-card=三牌，love=爱情，celtic-cross=凯尔特十字，horseshoe=马蹄，decision=抉择，mind-body-spirit=身心灵，situation=处境，yes-no=是否）；可选值: `single` / `three-card` / `love` / `celtic-cross` / `horseshoe` / `decision` / `mind-body-spirit` / `situation` / `yes-no` / `custom` |
| `question` | string | 否 | — | 占问事项 |
| `allowReversed` | boolean | 否 | `true` | 是否允许逆位 |
| `seed` | string | 否 | — | 随机种子（相同种子与牌阵可复现同一抽牌结果；省略时按牌阵、问题与当天日期生成） |
| `seedScope` | string | 否 | — | 种子隔离范围 |
| `deck` | enum | 否 | `"all"` | 完整牌库、大阿卡纳或小阿卡纳；可选值: `all` / `major` / `minor` |
| `reversedProbability` | number | 否 | — | 逆位概率，默认允许逆位时为 0.5，禁用时为 0 |
| `referenceYear` | integer | 否 | — | 年度牌基准年，默认当前 UTC 年份 |
| `customPositions` | string[] | 否 | — | 自定义牌阵各位置名称 |
| `birthYear` | integer | 否 | — | 出生年（出生年、月、日齐全时用于计算人格牌、灵魂牌与年度牌） |
| `birthMonth` | integer | 否 | — | 出生月（1-12；用途同 birthYear） |
| `birthDay` | integer | 否 | — | 出生日（1-31；用途同 birthYear） |
| `detailLevel` | enum | 否 | `"default"` | 输出详略（default=牌阵结果；full=追加随机种子、出生日期及人格牌、灵魂牌与年度牌）；可选值: `default` / `full` |

## 调用示例

```bash
echo '{"spreadType":"three-card","question":"本月运势如何？"}' | node "$TB/scripts/taibu.mjs" call tarot -
```

```bash
echo '{"spreadType":"love","question":"我和他的未来发展？","allowReversed":true}' | node "$TB/scripts/taibu.mjs" call tarot -
```

```bash
echo '{"spreadType":"celtic-cross","question":"事业发展","birthYear":1990,"birthMonth":5,"birthDay":15}' | node "$TB/scripts/taibu.mjs" call tarot -
```

## 输出结构（structuredContent 顶层键）

- `问卜设定`：问卜设定
- `牌阵展开`：牌阵展开的各位置牌
- `求问者生命数字`：求问者生命数字（需提供出生日期）
- `计算规则`

