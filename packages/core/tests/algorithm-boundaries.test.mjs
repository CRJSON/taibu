import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CoreInputError, calculateBazi, calculateBaziDayun, calculateDailyAlmanac, calculateXiaoliurenData } from 'taibu-core';
import { zonedTimeToUtc, getTimeZoneOffsetMinutes, getZonedDateTimeParts } from 'taibu-core/timezone-utils';

test('Gregorian validity and years 1–99 are preserved independently of Date.UTC conventions', () => {
  assert.equal(zonedTimeToUtc({ year: 1, month: 6, day: 15, hour: 12 }, 'UTC').toISOString(), '0001-06-15T12:00:00.000Z');
  assert.equal(zonedTimeToUtc({ year: 99, month: 6, day: 15, hour: 12 }, 'UTC').getUTCFullYear(), 99);
  assert.throws(() => zonedTimeToUtc({ year: 1900, month: 2, day: 29, hour: 12 }, 'UTC'), CoreInputError);
  assert.throws(() => zonedTimeToUtc({ year: 2100, month: 2, day: 29, hour: 12 }, 'UTC'), CoreInputError);
  assert.equal(zonedTimeToUtc({ year: 2000, month: 2, day: 29, hour: 12 }, 'UTC').getUTCDate(), 29);
  assert.equal(getTimeZoneOffsetMinutes('UTC', new Date('2024-01-01T00:00:00.123Z')), 0);
});

test('timezone sampling and era decoding remain correct at both supported year boundaries', () => {
  assert.equal(zonedTimeToUtc({year:9999,month:12,day:31,hour:23},'UTC').toISOString(),'9999-12-31T23:00:00.000Z');
  assert.equal(getZonedDateTimeParts(new Date('0000-12-31T12:00:00Z'),'UTC').year,0);
  assert.equal(getTimeZoneOffsetMinutes('UTC',new Date('0000-12-31T12:00:00Z')),0);
  for(const year of [1,9999]) for(const zone of ['UTC','Asia/Shanghai','America/New_York','Pacific/Kiritimati']) {
    const input={year,month:year===1?1:12,day:year===1?1:31,hour:year===1?0:23,minute:0,second:0};
    assert.deepEqual(getZonedDateTimeParts(zonedTimeToUtc(input,zone),zone),input,`${year} ${zone}`);
  }
  assert.throws(()=>zonedTimeToUtc({year:0,month:1,day:1,hour:0},'UTC'),CoreInputError);
});

test('DST overlaps and gaps have explicit, testable resolution policies', () => {
  const overlap = { year: 2024, month: 11, day: 3, hour: 1, minute: 30 };
  assert.throws(() => zonedTimeToUtc(overlap, 'America/New_York'), { code: 'AMBIGUOUS_LOCAL_TIME' });
  assert.equal(zonedTimeToUtc(overlap, 'America/New_York', 'earlier').toISOString(), '2024-11-03T05:30:00.000Z');
  assert.equal(zonedTimeToUtc(overlap, 'America/New_York', 'later').toISOString(), '2024-11-03T06:30:00.000Z');
  const gap = { year: 2024, month: 3, day: 10, hour: 2, minute: 30 };
  assert.throws(() => zonedTimeToUtc(gap, 'America/New_York'), { code: 'NONEXISTENT_LOCAL_TIME' });
  assert.equal(zonedTimeToUtc(gap, 'America/New_York', 'earlier').toISOString(), '2024-03-10T06:30:00.000Z');
  assert.equal(zonedTimeToUtc(gap, 'America/New_York', 'later').toISOString(), '2024-03-10T07:30:00.000Z');
  const halfHour = { year: 2024, month: 10, day: 6, hour: 2, minute: 15 };
  assert.equal(zonedTimeToUtc(halfHour, 'Australia/Lord_Howe', 'earlier').toISOString(), '2024-10-05T15:15:00.000Z');
  assert.equal(zonedTimeToUtc(halfHour, 'Australia/Lord_Howe', 'later').toISOString(), '2024-10-05T15:45:00.000Z');
});

test('true solar correction is invariant across server DST and respects civil timezone', () => {
  const script = `import { resolveTrueSolarDateTime } from './packages/core/dist/domains/shared/true-solar.js';
    console.log(JSON.stringify(resolveTrueSolarDateTime({ birthYear: 2024, birthMonth: 3, birthDay: 11, birthHour: 12 }, 120)));`;
  const results = ['UTC', 'America/Los_Angeles', 'America/New_York', 'Asia/Shanghai'].map(TZ => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('../../../', import.meta.url), env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  });
  results.forEach(result => assert.deepEqual(result, results[0]));
});

test('almanac cache cannot be mutated by SDK callers and hourly boundaries are explicit', async () => {
  const chart = await calculateDailyAlmanac({ date: '2024-03-20' });
  assert.equal(chart.almanac.hourlyFortune.length, 13);
  assert.equal(chart.almanac.hourlyFortune[0].startTime, '00:00');
  assert.equal(chart.almanac.hourlyFortune.at(-1).endTime, '23:59');
  chart.almanac.hourlyFortune.length = 0;
  assert.equal((await calculateDailyAlmanac({ date: '2024-03-20' })).almanac.hourlyFortune.length, 13);
  await assert.rejects(calculateDailyAlmanac({ birthYear: 2000 }), CoreInputError);
  await assert.rejects(calculateDailyAlmanac({ date: '2024-01-01', dayMaster: '无效' }), CoreInputError);
});

test('bazi and dayun share strict calendar validation and configurable late-zi rules', () => {
  const birth = { gender: 'male', birthYear: 2000, birthMonth: 1, birthDay: 1, birthHour: 23 };
  const midnight = calculateBazi(birth);
  const zi = calculateBazi({ ...birth, dayBoundary: 'zi' });
  assert.equal(midnight.fourPillars.day.stem + midnight.fourPillars.day.branch, '戊午');
  assert.equal(zi.fourPillars.day.stem + zi.fourPillars.day.branch, '己未');
  for (const calculate of [calculateBazi, calculateBaziDayun]) {
    assert.throws(() => calculate({ ...birth, birthHour: 24 }), CoreInputError);
    assert.throws(() => calculate({ ...birth, birthMonth: 2, birthDay: 30 }), CoreInputError);
    assert.throws(() => calculate({ ...birth, gender: 'invalid' }), CoreInputError);
  }
  const solar = calculateBaziDayun({ gender: 'male', birthYear: 1990, birthMonth: 1, birthDay: 1, birthHour: 12 });
  const lunar = calculateBaziDayun({ gender: 'male', birthYear: 1989, birthMonth: 12, birthDay: 5, birthHour: 12, calendarType: 'lunar' });
  assert.deepEqual(lunar, solar);
  assert.equal(solar.direction, 'backward');
  assert.throws(() => calculateBaziDayun({ ...birth, yunSect: 3 }), CoreInputError);
});

test('xiaoliuren rejects invalid counters and separates clock hours from shichen', () => {
  const lunar = { lunarMonth: 1, lunarDay: 1 };
  for (const hour of [24, -1, 1.5, NaN]) assert.throws(() => calculateXiaoliurenData({ ...lunar, hour }), CoreInputError);
  for (const lunarMonth of [0, 13, 1.5]) assert.throws(() => calculateXiaoliurenData({ ...lunar, lunarMonth, hour: 1 }), CoreInputError);
  assert.equal(calculateXiaoliurenData({ ...lunar, hour: 1, hourType: 'clock' }).input.shichen, '丑时');
  assert.equal(calculateXiaoliurenData({ ...lunar, hour: 1, hourType: 'shichen' }).input.shichen, '子时');
  assert.equal(calculateXiaoliurenData({ ...lunar, hour: 23, hourType: 'clock' }).hourStatus, '大安');
  const leap = calculateXiaoliurenData({ date: '2023-03-22', hour: 0 });
  assert.equal(leap.input.lunarMonth, 2);
  assert.equal(leap.input.lunarDay, 1);
  assert.equal(leap.input.isLeapMonth, true);
  assert.equal(leap.monthStatus, '留连');
  assert.equal(calculateXiaoliurenData({ date: '2023-03-22', hour: 0, leapMonthStrategy: 'advance' }).monthStatus, '速喜');
});
