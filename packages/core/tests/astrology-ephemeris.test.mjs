import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAstrology, CoreInputError } from 'taibu-core';

const base = { birthYear: 2000, birthMonth: 1, birthDay: 1, birthHour: 12, timezone: 'UTC', latitude: 0, longitude: 0, transitDateTime: '2000-01-01T12:00:00Z' };
const distance = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('apparent geocentric longitudes agree with independent JPL Horizons J2000 samples', () => {
  // Horizons OBSERVER, center 500@399, quantity 31, apparent IAU76/80 ecliptic of date.
  // https://ssd-api.jpl.nasa.gov/doc/horizons.html ; 2000-01-01 12:00 UT.
  const expected = { sun: 280.3689092, moon: 223.3237860, mercury: 271.8892699, jupiter: 25.2530685 };
  const chart = calculateAstrology(base);
  for (const [key, longitude] of Object.entries(expected)) {
    const body = chart.natal.bodies.find(body => body.key === key);
    assert.ok(distance(body.position.decimal, longitude) < 0.02, `${key}: ${body.position.decimal} vs ${longitude}`);
  }
  assert.match(chart.chartMeta.ephemeris, /astronomy-engine/);
});

test('the Sun crosses zero longitude at the independently sampled 2024 equinox', () => {
  const before = calculateAstrology({ ...base, transitDateTime: '2024-03-20T03:06:00Z' }).transit.bodies[0];
  const after = calculateAstrology({ ...base, transitDateTime: '2024-03-20T03:07:00Z' }).transit.bodies[0];
  assert.ok(distance(before.position.decimal, 359.9997093) < 0.02);
  assert.ok(distance(after.position.decimal, 0.0003992) < 0.02);
  assert.ok(before.position.decimal > 359.99);
  assert.ok(after.position.decimal < 0.01);
});

test('all seven house systems partition 360 degrees and assign every factor once', () => {
  for (const houseSystem of ['placidus', 'equal-house', 'whole-sign', 'koch', 'campanus', 'regiomontanus', 'topocentric']) {
    const { natal } = calculateAstrology({ ...base, latitude: 35, longitude: 120, houseSystem });
    let total = 0;
    natal.houses.forEach((house, index) => {
      assert.deepEqual(house.end, natal.houses[(index + 1) % 12].start);
      total += (house.end.decimal - house.start.decimal + 360) % 360;
    });
    assert.ok(Math.abs(total - 360) < 0.001, houseSystem);
    for (const factor of [...natal.bodies, ...natal.points, ...natal.angles]) assert.ok(factor.house >= 1 && factor.house <= 12, `${houseSystem} ${factor.key}`);
  }
});

test('a fixed sidereal offset also aligns whole-sign boundaries, and polar alternatives are explicit', () => {
  const tropical = calculateAstrology({ ...base, houseSystem: 'whole-sign' });
  const sidereal = calculateAstrology({ ...base, houseSystem: 'whole-sign', zodiac: 'sidereal', ayanamsa: 24 });
  assert.ok(distance(sidereal.natal.bodies[0].position.decimal, tropical.natal.bodies[0].position.decimal - 24) < 0.001);
  assert.ok(sidereal.natal.houses.every(house => house.start.decimal % 30 === 0));
  assert.equal(sidereal.natal.angles[0].house, 1);
  assert.throws(() => calculateAstrology({ ...base, zodiac: 'sidereal' }), CoreInputError);
  assert.throws(() => calculateAstrology({ ...base, latitude: 75 }), { code: 'UNDEFINED_HOUSES' });
  assert.equal(calculateAstrology({ ...base, latitude: 75, houseSystem: 'equal-house' }).natal.houses.length, 12);
});

test('explicit offsets preserve the instant across DST folds and same-body returns are retained', () => {
  const a = calculateAstrology({ ...base, timezone: 'America/New_York', transitDateTime: ' 2024-11-03T01:30:00-04:00 ' });
  const b = calculateAstrology({ ...base, transitDateTime: '2024-11-03T05:30:00Z' });
  assert.equal(a.transit.origin.utcDateTime, b.transit.origin.utcDateTime);
  assert.deepEqual(a.transit.bodies.map(body => body.position), b.transit.bodies.map(body => body.position));
  assert.throws(() => calculateAstrology({ ...base, timezone: 'America/New_York', birthYear: 2024, birthMonth: 11, birthDay: 3, birthHour: 1, birthMinute: 30 }), { code: 'AMBIGUOUS_LOCAL_TIME' });
  const same = calculateAstrology(base).transitToNatalAspects;
  assert.equal(same.filter(aspect => aspect.from.key === aspect.to.key && aspect.type === 'conjunction').length, 13);
  assert.throws(() => calculateAstrology({ ...base, aspectOrbs: { trine: 16 } }), CoreInputError);
});
