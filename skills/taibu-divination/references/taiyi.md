# 太乙排盘（`taiyi`）

太乙排盘 - 支持九星观测，以及采用四库本金镜七十二局立成的现代历法适配年/月/日/时计。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `system` | enum | 否 | `"nine-star"` | 九星观测或七十二局；可选值: `nine-star` / `traditional` |
| `tradition` | enum | 否 | — | 传统分支的积数历元：金镜或统宗，默认金镜；立成表均用四库本金镜；可选值: `jinjing` / `tongzong` |
| `accumulatedNumber` | integer | 否 | — | 手工积数，覆写历元自动计算 |
| `dunType` | enum | 否 | — | 覆写遁向；时计默认按冬夏至实际时刻，其他计默认阳遁；可选值: `yang` / `yin` |
| `mode` | enum | 是 | — | 观测尺度（year=年盘，month=月盘，day=日盘，hour=时盘，minute=在时盘基础上按 10 分钟细化）；可选值: `year` / `month` / `day` / `hour` / `minute` |
| `date` | string | 是 | — | 观测日期（公历 YYYY-MM-DD） |
| `hour` | integer | 否 | `12` | 小时（0-23；mode 为 hour 或 minute 时必填） |
| `minute` | integer | 否 | `0` | 分钟（0-59；mode=minute 时必填） |
| `timezone` | string | 否 | `"Asia/Shanghai"` | IANA 时区名（如 Asia/Shanghai） |
| `question` | string | 否 | — | 占问事项 |
| `detailLevel` | enum | 否 | `"default"` | 输出详略（本工具各档输出相同）；可选值: `default` / `full` |

## 调用示例

```bash
echo '{"mode":"day","date":"2026-04-10","timezone":"Asia/Shanghai","question":"此事能否顺利推进？"}' | node "$TB/scripts/taibu.mjs" call taiyi -
```

```bash
echo '{"mode":"minute","date":"2026-04-10","hour":13,"minute":37,"timezone":"Asia/Shanghai"}' | node "$TB/scripts/taibu.mjs" call taiyi -
```

## 输出结构（structuredContent 顶层键）

- `太乙七十二局`
- `问卜与时空底盘`：起局基本信息
- `外部时空环境`：外部时空环境
- `核心物理关系`：核心物理关系
- `九星阵列`：九星阵列配置
- `古典参考`：古典文献参考
- `计算规则`

