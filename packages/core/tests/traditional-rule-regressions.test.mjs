import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTaiyi, calculateDaliuren, calculateBazi, calculateDailyAlmanac, calculateXiaoliurenData, resolveBaziPillars, toTaiyiJson, toDaliurenJson } from 'taibu-core';
import { resolveBaziCalendarContext } from '../dist/domains/bazi/calculate.js';

test('calendar conversions match independent Hong Kong Observatory tables', async () => {
  // https://www.hko.gov.hk/en/gts/time/calendar/pdf/files/{2023,2024,2026}e.pdf
  const fixtures = [
    ['2023-03-22', 2023, 2, 1, true, '闰二月初一'],
    ['2024-02-10', 2024, 1, 1, false, '正月初一'],
    ['2024-02-29', 2024, 1, 20, false, '正月二十'],
    ['2026-02-17', 2026, 1, 1, false, '正月初一'],
  ];
  for (const [date, birthYear, birthMonth, birthDay, isLeapMonth, lunarText] of fixtures) {
    const [y, m, d] = date.split('-').map(Number);
    const solar = calculateBazi({ gender: 'male', birthYear: y, birthMonth: m, birthDay: d, birthHour: 12 });
    const lunar = calculateBazi({ gender: 'male', birthYear, birthMonth, birthDay, birthHour: 12, calendarType: 'lunar', isLeapMonth });
    assert.deepEqual(lunar.fourPillars, solar.fourPillars);
    assert.ok((await calculateDailyAlmanac({ date })).almanac.lunarDate.endsWith(lunarText));
  }
});

test('reverse windows cover every matching minute on solar-time and DST-fold/gap dates',async()=>{
  const cases=[
    {birthYear:2024,birthMonth:1,birthDay:1,birthHour:23,birthMinute:45,timezone:'Asia/Shanghai',longitude:116.4,dayBoundary:'zi'},
    {birthYear:2024,birthMonth:11,birthDay:3,birthHour:1,birthMinute:45,timezone:'America/New_York',longitude:-74,dayBoundary:'midnight',disambiguation:'earlier'},
    ...['earlier','later','compatible'].map(disambiguation=>({birthYear:2024,birthMonth:3,birthDay:10,birthHour:2,birthMinute:30,timezone:'America/New_York',disambiguation})),
    {birthYear:2024,birthMonth:10,birthDay:6,birthHour:2,birthMinute:15,timezone:'Australia/Lord_Howe',disambiguation:'later'},
  ];
  for(const input of cases) {
    const pillars=calculateBazi({...input,gender:'male'}).fourPillars;
    const expected=['year','month','day','hour'].map(key=>pillars[key].stem+pillars[key].branch);
    const result=await resolveBaziPillars({...input,startYear:2024,endYear:2024,yearPillar:expected[0],monthPillar:expected[1],dayPillar:expected[2],hourPillar:expected[3]});
    for(let minute=0;minute<1440;minute++) {
      const birthHour=Math.floor(minute/60), birthMinute=minute%60;
      const {lunar,termLunar}=resolveBaziCalendarContext({...input,birthHour,birthMinute,gender:'male'});
      const day=lunar.getEightChar(); day.setSect(input.dayBoundary==='zi'?1:2);
      const term=termLunar.getEightChar();
      const matches=[term.getYear(),term.getMonth(),day.getDay(),day.getTime()].every((pillar,index)=>pillar===expected[index]);
      const stamp=`2024-${String(input.birthMonth).padStart(2,'0')}-${String(input.birthDay).padStart(2,'0')} ${String(birthHour).padStart(2,'0')}:${String(birthMinute).padStart(2,'0')}`;
      const covered=result.candidates.some(candidate=>candidate.timeWindow.start<=stamp&&stamp<candidate.timeWindow.end);
      assert.equal(covered,matches,`${input.timezone} ${stamp}`);
    }
  }
});

test('traditional Taiyi changes dun at the physical solstice during Shanghai DST', async () => {
  for (const [minute, expected] of [[2, 'yang'], [33, 'yin']]) {
    const shanghai = calculateTaiyi({ mode: 'hour', system: 'traditional', date: '1990-06-22', hour: 0, minute, timezone: 'Asia/Shanghai' });
    const utc = calculateTaiyi({ mode: 'hour', system: 'traditional', date: '1990-06-21', hour: 15, minute, timezone: 'UTC' });
    assert.equal(shanghai.traditionalBoard.dun, expected);
    assert.equal(utc.traditionalBoard.dun, expected);
  }
});

test('Taiyi follows the SKQS epoch and selected original yin/yang table entries', async () => {
  // 太乙金鏡式經 (四庫全書本), vol.1 epoch and vol.3 72-bureau tables.
  const ancient = (await calculateTaiyi({ mode: 'year', date: '0724-06-01', system: 'traditional' })).traditionalBoard;
  assert.equal(ancient.accumulatedNumber, 1937281);
  assert.equal(ancient.bureau, 49);
  assert.equal(ancient.taiyi.position, '乾');
  assert.equal(ancient.wenChang, '巽');
  assert.equal(ancient.home.count, 24);
  assert.equal(ancient.away.count, 25);
  for (const [dunType, accumulatedNumber, home, away] of [['yang',1,7,13], ['yang',39,25,34], ['yang',44,33,14], ['yang',50,6,15], ['yin',10,1,34], ['yin',11,6,36], ['yin',25,21,16]]) {
    const board = (await calculateTaiyi({ mode: 'year', date: '2024-06-01', system: 'traditional', accumulatedNumber, dunType })).traditionalBoard;
    assert.equal(board.home.count, home);
    assert.equal(board.away.count, away);
  }
});

test('all 144 traditional Taiyi boards place ten markers exactly once and do not present a nine-star board', async () => {
  const valid = new Set(Array.from('子丑艮寅卯辰巽巳午未坤申酉戌乾亥中'));
  for (const dunType of ['yang', 'yin']) for (let accumulatedNumber = 1; accumulatedNumber <= 72; accumulatedNumber++) {
    const result = await calculateTaiyi({ mode: 'year', date: '2024-06-01', system: 'traditional', accumulatedNumber, dunType });
    const board = result.traditionalBoard;
    assert.equal(board.bureau, accumulatedNumber);
    assert.equal(board.palaces.length, 17);
    assert.equal(board.palaces.flatMap(palace => palace.stars).length, 10);
    assert.equal(result.coreBoard,undefined);
    for (const position of [board.taiyi.position, board.wenChang, board.shiJi, board.jiShen, board.heShen, board.taiSui]) assert.ok(valid.has(position), position);
    assert.equal(toTaiyiJson(result).九星阵列.length, 0);
  }
  assert.throws(() => calculateTaiyi({ mode: 'minute', date: '2024-06-01', hour: 12, minute: 0, system: 'traditional' }));
  assert.throws(() => calculateTaiyi({ mode: 'year', date: '2024-06-01', system: 'traditional', accumulatedNumber: 0 }));
});

test('Daliuren synchronizes Tianma with the corrected month in data and canonical JSON', () => {
  for (const [hour, month, expected] of [[8, '乙丑', '辰'], [9, '丙寅', '午'], [17, '丙寅', '午']]) {
    const result = calculateDaliuren({ date: '2024-02-04', hour, timezone: 'UTC' });
    assert.equal(result.dateInfo.ganZhi.month, month);
    assert.equal(result.dateInfo.tianMa, expected);
    assert.equal(result.shenSha.find(star => star.name === '天马').value, expected);
    const json = toDaliurenJson(result, { detailLevel: 'full' });
    assert.equal(json.基本信息.关键状态.天马, expected);
    assert.equal(json.神煞.find(star => star.名称 === '天马').落点, expected);
  }
  const local = calculateDaliuren({ date: '2024-02-04', hour: 17, timezone: 'Asia/Shanghai' });
  assert.equal(local.dateInfo.tianMa, '午');
});

test('Daliuren manual month general and day/night selection rebuild dependent layers', async () => {
  const input = { date: '2024-01-01', hour: 17, monthGeneral: '亥' };
  const day = await calculateDaliuren({ ...input, dayNight: 'day' });
  const night = await calculateDaliuren({ ...input, dayNight: 'night' });
  assert.equal(night.tianDiPan.tianPan['9'], '亥'); // 酉时, 月将加在酉位。
  assert.deepEqual(day.tianDiPan.tianPan, night.tianDiPan.tianPan);
  assert.notDeepEqual(day.tianDiPan.tianJiang, night.tianDiPan.tianJiang);
  assert.notDeepEqual(day.siKe, night.siKe);
  assert.notDeepEqual(day.sanChuan, night.sanChuan);
  assert.equal((await calculateDaliuren(input)).dateInfo.diurnal, false);
  assert.ok(Array.isArray(toDaliurenJson(night, { detailLevel: 'full' }).神煞));
  const polar = { hour: 12, latitude: 80, longitude: 0, timezone: 'UTC', dayNight: 'sunrise' };
  assert.equal((await calculateDaliuren({ ...polar, date: '2024-06-21' })).dateInfo.diurnal, true);
  assert.equal((await calculateDaliuren({ ...polar, date: '2024-06-21' })).calculationOptions.latitude,80);
  assert.equal((await calculateDaliuren({ ...polar, date: '2024-12-21' })).dateInfo.diurnal, false);
});

test('unique lower/upper overcoming takes the correct initial transmission throughout 720 Daliuren states', async () => {
  const stems = { 甲:0,乙:0,丙:1,丁:1,戊:2,己:2,庚:3,辛:3,壬:4,癸:4 };
  const branches = { 寅:0,卯:0,巳:1,午:1,辰:2,戌:2,丑:2,未:2,申:3,酉:3,亥:4,子:4 };
  const generals = Array.from('子丑寅卯辰巳午未申酉戌亥');
  let checked = 0;
  for (let day = 0; day < 60; day++) for (const monthGeneral of generals) {
    const date = new Date(Date.UTC(2024,0,1 + day)).toISOString().slice(0,10);
    const result = await calculateDaliuren({ date, hour: 12, monthGeneral });
    const lessons = Object.values(result.siKe).map(lesson => Array.from(lesson[0]));
    const lower = [...new Set(lessons.filter(([up, down]) => ((stems[down] ?? branches[down]) + 2) % 5 === branches[up]).map(([up]) => up))];
    const upper = [...new Set(lessons.filter(([up, down]) => (branches[up] + 2) % 5 === (stems[down] ?? branches[down])).map(([up]) => up))];
    const selected = lower.length ? lower : upper;
    if (selected.length === 1) {
      assert.equal(result.sanChuan.chu[0], selected[0], `${date} ${monthGeneral} ${JSON.stringify(lessons)}`);
      checked++;
    }
  }
  assert.ok(checked > 200, checked);
});

test('all 4320 explicit Xiaoliuren counter combinations follow the inclusive recurrence', () => {
  const states = ['大安','留连','速喜','赤口','小吉','空亡'];
  for (let lunarMonth = 1; lunarMonth <= 12; lunarMonth++) for (let lunarDay = 1; lunarDay <= 30; lunarDay++) for (let hour = 1; hour <= 12; hour++) {
    const result = calculateXiaoliurenData({ lunarMonth, lunarDay, hour, hourType: 'shichen' });
    assert.equal(result.monthStatus, states[(lunarMonth - 1) % 6]);
    assert.equal(result.dayStatus, states[(lunarMonth + lunarDay - 2) % 6]);
    assert.equal(result.hourStatus, states[(lunarMonth + lunarDay + hour - 3) % 6]);
  }
});

test('reverse Bazi skips only the 1582 calendar gap and keeps executable early-year candidates', async () => {
  for (const input of [
    { gender: 'male', birthYear: 1582, birthMonth: 10, birthDay: 20, birthHour: 12, timezone: 'UTC' },
    { gender: 'male', birthYear: 1, birthMonth: 1, birthDay: 1, birthHour: 12, timezone: 'UTC' },
  ]) {
    const forward = calculateBazi(input);
    const expected = ['year', 'month', 'day', 'hour'].map(key => forward.fourPillars[key].stem + forward.fourPillars[key].branch);
    const [yearPillar, monthPillar, dayPillar, hourPillar] = expected;
    const result = await resolveBaziPillars({ yearPillar, monthPillar, dayPillar, hourPillar, startYear: input.birthYear, endYear: input.birthYear, timezone: 'UTC' });
    const stamp = `${String(input.birthYear).padStart(4, '0')}-${String(input.birthMonth).padStart(2, '0')}-${String(input.birthDay).padStart(2, '0')} 12:00`;
    const candidate = result.candidates.find(value => value.timeWindow.start <= stamp && stamp < value.timeWindow.end);
    assert.ok(candidate, stamp);
    if (input.birthYear === 1) {
      assert.equal(candidate.calendarType, 'solar');
      assert.equal(candidate.nextCall.arguments.calendarType, 'solar');
      assert.equal(candidate.nextCall.arguments.birthYear, 1);
    }
    for (const value of result.candidates) {
      const roundTrip = calculateBazi({ ...value.nextCall.arguments, gender: 'male' });
      assert.deepEqual(['year', 'month', 'day', 'hour'].map(key => roundTrip.fourPillars[key].stem + roundTrip.fourPillars[key].branch), expected);
    }
  }
});

test('inverse minute scans yield to host timers without truncating matching windows', async () => {
  let ticks = 0;
  const timer = setInterval(() => ticks++, 0);
  try {
    const result = await resolveBaziPillars({ yearPillar: '己卯', monthPillar: '丙子', dayPillar: '戊午', hourPillar: '戊午', longitude: 120, startYear: 1999, endYear: 2000 });
    assert.ok(ticks > 0, 'a CPU-bound reverse scan must allow other requests/timers to progress');
    assert.ok(result.candidates.some(candidate => candidate.timeWindow.start === '2000-01-01 11:03' && candidate.timeWindow.end === '2000-01-01 13:03'));
  } finally {
    clearInterval(timer);
  }
});

test('reverse Bazi rejects invalid zones even with no candidates and covers late-zi windows', async () => {
  const input = { gender: 'male', birthYear: 2024, birthMonth: 1, birthDay: 1, birthHour: 23, birthMinute: 45, dayBoundary: 'zi' };
  const forward = calculateBazi(input);
  const [yearPillar,monthPillar,dayPillar,hourPillar] = ['year','month','day','hour'].map(key => forward.fourPillars[key].stem + forward.fourPillars[key].branch);
  const query = { yearPillar,monthPillar,dayPillar,hourPillar,startYear:2024,endYear:2024,dayBoundary:'zi' };
  await assert.rejects(resolveBaziPillars({ ...query, timezone: 'invalid/timezone' }), { code: 'INVALID_TIMEZONE' });
  const result = await resolveBaziPillars(query);
  assert.ok(result.candidates.some(candidate => candidate.timeWindow.start <= '2024-01-01 23:45' && candidate.timeWindow.end > '2024-01-01 23:45'));
  for (const candidate of result.candidates) {
    assert.equal(candidate.timeWindow.endExclusive, true);
    const roundTrip = calculateBazi({ ...candidate.nextCall.arguments, gender:'male' });
    assert.deepEqual(['year','month','day','hour'].map(key => roundTrip.fourPillars[key].stem + roundTrip.fourPillars[key].branch), [yearPillar,monthPillar,dayPillar,hourPillar]);
  }
});
