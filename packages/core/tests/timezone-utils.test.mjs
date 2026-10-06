import test from 'node:test';
import assert from 'node:assert/strict';
import { CALENDAR_TIMEZONE, getZonedDateTimeParts, zonedInstantToSystemDate, zonedTimeToUtc } from 'taibu-core/timezone-utils';

test('calendar time keeps UTC+8 during historical Shanghai daylight saving', () => {
  const instant = new Date('1990-06-06T00:00:00Z');
  assert.equal(getZonedDateTimeParts(instant, CALENDAR_TIMEZONE).hour, 8);
  assert.equal(getZonedDateTimeParts(instant, 'Asia/Shanghai').hour, 9);
});

test('instant adapters preserve both occurrences of a DST fold and milliseconds', () => {
  const early = new Date('2021-11-07T03:59:47.123Z');
  const late = new Date('2021-11-07T04:59:47.123Z');
  for (const instant of [early, late]) {
    const adapted = zonedInstantToSystemDate(instant, 'America/St_Johns');
    assert.equal(adapted.getTime(), instant.getTime());
    assert.equal(adapted.getHours(), 1);
    assert.equal(adapted.getMinutes(), 29);
    assert.equal(adapted.getMilliseconds(), 123);
  }
});

test('timezone formatter caching does not allow an invalid zone or leak the previous zone', () => {
  const instant = new Date('2024-01-01T00:00:00Z');
  for (let index = 0; index < 3; index++) {
    assert.equal(getZonedDateTimeParts(instant, 'Asia/Shanghai').hour, 8);
    assert.throws(() => getZonedDateTimeParts(instant, 'invalid/timezone'), { code: 'INVALID_TIMEZONE' });
    assert.equal(getZonedDateTimeParts(instant, 'UTC').hour, 0);
  }
});

test('zonedTimeToUtc converts Asia/Shanghai local time to UTC', () => {
  const date = zonedTimeToUtc({
    year: 2024,
    month: 1,
    day: 1,
    hour: 8,
    minute: 0,
    second: 0,
  }, 'Asia/Shanghai');

  assert.equal(date.getUTCFullYear(), 2024);
  assert.equal(date.getUTCMonth(), 0);
  assert.equal(date.getUTCDate(), 1);
  assert.equal(date.getUTCHours(), 0);
  assert.equal(date.getUTCMinutes(), 0);
});
