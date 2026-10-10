import test from 'node:test';
import assert from 'node:assert/strict';
import * as mcpCore from 'taibu-core';

test('liuyao retains an explicit later-fold instant across the winter-start boundary', async () => {
  const input = { question: 'fold regression', yongShenTargets: ['官鬼'], method: 'coins', yaoValues: [7, 7, 7, 7, 7, 7], date: '2021-11-07T04:59:47Z' };
  const utc = await mcpCore.calculateLiuyao({ ...input, timezone: 'UTC' });
  const local = await mcpCore.calculateLiuyao({ ...input, timezone: 'America/St_Johns' });
  assert.deepEqual(local.ganZhiTime.month, { gan: '己', zhi: '亥' });
  assert.deepEqual(local.ganZhiTime.month, utc.ganZhiTime.month);
});

test('liuyao uses the same fixed-eight solar-term basis as Bazi during Shanghai DST', async () => {
  for (const [date, minute, expected] of [['1990-06-06T07:16:00+09:00', 16, '辛巳'], ['1990-06-06T07:47:00+09:00', 47, '壬午']]) {
    const result = await mcpCore.calculateLiuyao({ question: 'historical term regression', yongShenTargets: ['官鬼'], method: 'coins', yaoValues: [7, 7, 7, 7, 7, 7], date, timezone: 'Asia/Shanghai' });
    const bazi = mcpCore.calculateBazi({ gender: 'male', birthYear: 1990, birthMonth: 6, birthDay: 6, birthHour: 7, birthMinute: minute, timezone: 'Asia/Shanghai' });
    assert.equal(result.ganZhiTime.month.gan + result.ganZhiTime.month.zhi, expected);
    assert.equal(bazi.fourPillars.month.stem + bazi.fourPillars.month.branch, expected);
  }
});

test('liuyao should accept ISO timestamps with timezone offsets', async () => {
  const result = await mcpCore.calculateLiuyao({
    question: '这个计划能推进吗',
    yongShenTargets: ['官鬼'],
    method: 'select',
    hexagramName: '天火同人',
    date: '2024-01-02T10:00:00+08:00',
  });

  assert.equal(typeof result.hexagramName, 'string');
  assert.equal(Array.isArray(result.fullYaos), true);
});
