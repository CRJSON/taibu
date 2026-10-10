import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { Lunar } from 'lunar-javascript';
import { getHeavenlyStemAndEarthlyBranchBySolarDate } from 'lunar-lite';
import { createAstrolabeWithTrueSolar, calculateZiwei, calculateZiweiFlyingStar, calculateZiweiHoroscopeDataWithAstrolabe, calculateZiweiDecadalListWithAstrolabe, toZiweiHoroscopeJson, toZiweiJson, toZiweiText } from 'taibu-core';
import { resolveZiweiOptions, withZiweiOptions } from '../dist/domains/ziwei/profile.js';

const require=createRequire(new URL('../package.json',import.meta.url));
const { astro }=require('iztro');
const birth={ gender:'male',birthYear:1990,birthMonth:1,birthDay:15,birthHour:9 };
const replacements=['太阳','太阴','天同','巨门'];

test('Ziwei zero/default flow hours are independent of host timezone, including midnight DST gaps', () => {
  const script = `
    import { createAstrolabeWithTrueSolar, calculateZiweiHoroscopeDataWithAstrolabe } from 'taibu-core';
    const { astrolabe } = createAstrolabeWithTrueSolar({ gender:'male', birthYear:1990, birthMonth:6, birthDay:15, birthHour:12, timezone:'Asia/Shanghai' });
    const results = ['2025-05-01','2018-11-04'].map(targetDate => {
      const explicit = calculateZiweiHoroscopeDataWithAstrolabe(astrolabe,{targetDate,targetTimeIndex:0,timezone:'Asia/Shanghai'});
      const implicit = calculateZiweiHoroscopeDataWithAstrolabe(astrolabe,{targetDate,timezone:'Asia/Shanghai'});
      const lazy = astrolabe.horoscope(targetDate,0);
      return { explicit:explicit.hourly, implicit:implicit.hourly, lazy:lazy.hourly.earthlyBranch };
    });
    console.log(JSON.stringify(results));
  `;
  const run = timezone => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(), env: { ...process.env, TZ: timezone }, encoding: 'utf8',
  }));
  const expected = run('Asia/Shanghai');
  for (const result of expected) {
    assert.equal(result.explicit.earthlyBranch, '子');
    assert.deepEqual(result.implicit, result.explicit);
    assert.equal(result.lazy, '子');
  }
  for (const zone of ['UTC', 'America/New_York', 'America/Sao_Paulo']) assert.deepEqual(run(zone), expected, zone);
});

test('bound horoscope helpers retain the birth timezone without an explicit override', () => {
  const input = { ...birth, timezone: 'America/New_York', disambiguation: 'later' };
  const { astrolabe } = createAstrolabeWithTrueSolar(input);
  const output = calculateZiwei(input);
  assert.equal(output.calculationOptions.timezone, input.timezone);
  assert.equal(output.calculationOptions.disambiguation, 'later');
  const targetDate = new Date('2024-06-01T02:00:00Z');
  const implicit = calculateZiweiHoroscopeDataWithAstrolabe(astrolabe, { targetDate });
  const explicit = calculateZiweiHoroscopeDataWithAstrolabe(astrolabe, { targetDate, timezone: input.timezone });
  assert.deepEqual(implicit, explicit);
  assert.equal(implicit.targetDate, '2024-05-31');
  assert.equal(implicit.hourly.earthlyBranch, astrolabe.horoscope(targetDate).hourly.earthlyBranch);
});

test('all flow-hour layers retain lunar-lite representative-hour calendar semantics', () => {
  const { astrolabe } = createAstrolabeWithTrueSolar(birth);
  for (const date of ['2001-04-05', '2002-05-06', '2002-08-08', '2024-02-05', '2024-06-01', '2024-12-06']) for (let timeIndex = 0; timeIndex <= 12; timeIndex++) {
    const expected = getHeavenlyStemAndEarthlyBranchBySolarDate(date, timeIndex, { year: 'exact', month: 'exact' });
    const result = calculateZiweiHoroscopeDataWithAstrolabe(astrolabe, { targetDate: date, targetTimeIndex: timeIndex });
    for (const period of ['yearly', 'monthly', 'daily', 'hourly']) {
      assert.deepEqual([result[period].heavenlyStem, result[period].earthlyBranch], expected[period], `${date} ${timeIndex} ${period}`);
    }
  }
});

test('horoscope helper also adapts a plain upstream astrolabe before selecting explicit zero', () => {
  const raw = astro.bySolar('1990-06-15', 6, '男', true, 'zh-CN');
  const output = calculateZiweiHoroscopeDataWithAstrolabe(raw, { targetDate: new Date('2024-06-01T04:00:00Z'), targetTimeIndex: 0, timezone: 'Asia/Shanghai' });
  assert.equal(output.hourly.earthlyBranch, '子');
  assert.throws(() => calculateZiweiHoroscopeDataWithAstrolabe(raw, { targetDate: '2024-06-01', timezone: 'invalid/timezone' }), { code: 'INVALID_TIMEZONE' });
});

test('birthday age updates small and childhood limits after later-year lunar birthdays', () => {
  const { astrolabe } = createAstrolabeWithTrueSolar({ gender:'male',birthYear:2023,birthMonth:9,birthDay:1,birthHour:9,calendarType:'lunar',calculationOptions:{ageDivide:'birthday'} });
  for (const [targetDate, nominalAge] of [['2024-10-02',1],['2024-10-03',1],['2024-10-04',2],['2024-10-15',2],['2024-11-01',2]]) {
    const output = calculateZiweiHoroscopeDataWithAstrolabe(astrolabe, { targetDate, targetTimeIndex:5 });
    assert.equal(output.age.nominalAge, nominalAge, targetDate);
    const lazy = astrolabe.horoscope(targetDate, 5);
    assert.equal(lazy.agePalace().index, output.age.index);
    assert.equal(lazy.palace('命宫', 'decadal').index, output.decadal.index);
    if (nominalAge === 2) {
      assert.equal(output.age.index, 0);
      assert.equal(output.decadal.index, 11);
      assert.equal(output.decadal.name, '童限');
      assert.equal(output.decadal.stars.length, 12);
    }
  }
});

test('birthday age stays monotonic across leap months and supports missing leap anniversaries', () => {
  const target = (year, month, day) => Lunar.fromYmd(year, month, day).getSolar().toYmd();
  const normal = createAstrolabeWithTrueSolar({ gender:'male',birthYear:2022,birthMonth:2,birthDay:10,birthHour:9,calendarType:'lunar',calculationOptions:{ageDivide:'birthday'} }).astrolabe;
  for (const [month, day] of [[2,11],[2,29],[-2,1],[-2,11],[3,1]]) {
    assert.equal(normal.horoscope(target(2023, month, day), 5).age.nominalAge, 2);
  }
  const leap = createAstrolabeWithTrueSolar({ gender:'male',birthYear:2023,birthMonth:2,birthDay:16,birthHour:9,calendarType:'lunar',isLeapMonth:true,calculationOptions:{ageDivide:'birthday'} }).astrolabe;
  assert.equal(leap.horoscope(target(2024, 2, 16), 5).age.nominalAge, 1);
  assert.equal(leap.horoscope(target(2024, 2, 17), 5).age.nominalAge, 2);
});

test('Ziwei Doujun uses the same normalized gap hour as the natal chart', () => {
  const input = { gender:'male',birthYear:2024,birthMonth:3,birthDay:10,birthHour:2,birthMinute:30,timezone:'America/New_York',disambiguation:'later' };
  const gap = calculateZiwei(input);
  const resolved = calculateZiwei({ ...input, birthHour:3 });
  assert.deepEqual(gap.fourPillars, resolved.fourPillars);
  assert.deepEqual(gap.palaces, resolved.palaces);
  assert.equal(gap.douJun, resolved.douJun);
});

test('canonical lunar years remain distinct from the selected Li-Chun year pillar', () => {
  const result = calculateZiwei({ gender:'male',birthYear:2024,birthMonth:2,birthDay:5,birthHour:12,calculationOptions:{yearDivide:'exact'} });
  assert.equal(result.fourPillars.year.gan + result.fourPillars.year.zhi, '甲辰');
  assert.match(JSON.stringify(toZiweiJson(result)), /癸卯年腊月/u);
  assert.match(toZiweiText(result), /癸卯年腊月/u);
  assert.doesNotMatch(JSON.stringify(toZiweiJson(result)), /甲辰年腊月/u);
});

test('standalone decadal lists are independent cloneable data', () => {
  const { astrolabe } = createAstrolabeWithTrueSolar(birth);
  const list = calculateZiweiDecadalListWithAstrolabe(astrolabe);
  assert.deepEqual(structuredClone(list), list);
  list[0].palace.name = 'changed';
  assert.notEqual(calculateZiweiDecadalListWithAstrolabe(astrolabe)[0].palace.name, 'changed');
});

test('Ziwei isolates and restores external locale for construction, lazy methods, and exceptions', () => {
  const { default: locale, setLanguage } = require('iztro/lib/i18n/index.js');
  const previous = locale.language;
  try {
    setLanguage('zh-CN');
    const expected = calculateZiwei(birth);
    const { astrolabe } = createAstrolabeWithTrueSolar(birth);
    const expectedPlaces = astrolabe.palace('命宫').mutagedPlaces().map(palace => palace?.name);
    setLanguage('en-US');
    assert.deepEqual(calculateZiwei(birth), expected);
    assert.equal(locale.language, 'en-US');
    assert.deepEqual(astrolabe.palace('命宫').mutagedPlaces().map(palace => palace?.name), expectedPlaces);
    assert.equal(locale.language, 'en-US');
    assert.throws(() => withZiweiOptions(resolveZiweiOptions(), () => { throw new Error('locale regression'); }), /locale regression/u);
    assert.equal(locale.language, 'en-US');
  } finally {
    setLanguage(previous);
  }
});

test('sort and toSorted comparator escapes keep the owning Ziwei profile', () => {
  const initial = structuredClone(astro.getConfig());
  try {
    for (const method of ['sort', 'toSorted']) {
      const { astrolabe } = createAstrolabeWithTrueSolar({ ...birth, calculationOptions:{mutagens:{壬:replacements}} });
      let escaped;
      const sorted = astrolabe.palaces[method]((left, right) => {
        if (left.name === '命宫') escaped = left;
        if (right.name === '命宫') escaped = right;
        return 0;
      });
      assert.ok(escaped, method);
      if (method === 'sort') assert.equal(sorted, astrolabe.palaces);
      else assert.notEqual(sorted, astrolabe.palaces);
      const expected = escaped.mutagedPlaces().map(palace => palace?.name);
      astro.config({ mutagens:{壬:['天梁','紫微','左辅','武曲']} });
      assert.deepEqual(escaped.mutagedPlaces().map(palace => palace?.name), expected, method);
    }
  } finally {
    const config = astro.getConfig();
    for (const key of Object.keys(config.mutagens)) delete config.mutagens[key];
    for (const key of Object.keys(config.brightness)) delete config.brightness[key];
    astro.config(initial);
  }
});

test('Ziwei restores external global maps and binds escaped lazy palace methods to the chart profile', () => {
  const initial=structuredClone(astro.getConfig());
  try {
    const astrolabe=createAstrolabeWithTrueSolar({ ...birth,calculationOptions:{ mutagens:{ 壬:replacements } } }).astrolabe;
    const palace=astrolabe.palace('命宫');
    let escaped;
    astrolabe.palaces.forEach(p => { if(p.name==='命宫') escaped=p; });
    assert.equal(palace.heavenlyStem,'壬');
    const before=palace.mutagedPlaces().map(p=>p?.name);
    const external={ ...initial,algorithm:'zhongzhou',dayDivide:'current',mutagens:{ ...initial.mutagens,壬:['天梁','紫微','左辅','武曲'] } };
    astro.config(external);
    const expected=structuredClone(astro.getConfig());
    calculateZiwei({ ...birth,calculationOptions:{ algorithm:'default',yearDivide:'normal' } });
    assert.deepEqual(astro.getConfig(),expected);
    assert.deepEqual(palace.mutagedPlaces().map(p=>p?.name),before);
    assert.deepEqual(escaped.mutagedPlaces().map(p=>p?.name),before);
    assert.deepEqual(astro.getConfig(),expected);
  } finally {
    const config=astro.getConfig();
    for(const key of Object.keys(config.mutagens)) delete config.mutagens[key];
    for(const key of Object.keys(config.brightness)) delete config.brightness[key];
    astro.config(initial);
  }
});

test('custom four-transformation choices can include any principal star and remain aligned with birth-year labels',()=>{
  const chart=calculateZiwei({...birth,birthMonth:6,birthDay:15,calculationOptions:{mutagens:{庚:['天府','天相','七杀','太阴']}}});
  for(const [index,starName] of ['天府','天相','七杀','太阴'].entries()) {
    const star=chart.palaces.flatMap(p=>p.majorStars).find(star=>star.name===starName);
    assert.equal(star.mutagen,['禄','权','科','忌'][index]);
  }
});

test('late zi in the second half of a leap month retains the selected month correction for Doujun', () => {
  const input={ ...birth,birthYear:2023,birthMonth:2,birthDay:16,birthHour:23,calendarType:'lunar',isLeapMonth:true };
  assert.equal(calculateZiwei(input).douJun,'戌');
  assert.equal(calculateZiwei({...input,calculationOptions:{fixLeap:false}}).douJun,'亥');
});

test('custom mutagens and omitted/empty flying filters agree with the actual flights', async () => {
  const input={ ...birth,calculationOptions:{ mutagens:{ 壬:replacements } } };
  const flights=await calculateZiweiFlyingStar({ ...input,queries:[{type:'mutagedPlaces',palace:'命宫'},{type:'fliesTo',from:'命宫',to:'财帛'},{type:'fliesTo',from:'命宫',to:'财帛',mutagens:[]}] });
  assert.deepEqual(flights.results[0].actualFlights.map(f=>f.starName),replacements);
  assert.deepEqual(flights.results[1],{ ...flights.results[2],queryIndex:1 });
  await assert.rejects(calculateZiweiFlyingStar({ ...birth,queries:[{type:'fliesTo',from:'命宫'}] }));
});

test('explicit flow-hour zero survives iztro fallback and all transit layers contain plain stars', () => {
  const { astrolabe }=createAstrolabeWithTrueSolar(birth);
  const midnight=calculateZiweiHoroscopeDataWithAstrolabe(astrolabe,{ targetDate:'2024-06-01',targetTimeIndex:0 });
  const noon=calculateZiweiHoroscopeDataWithAstrolabe(astrolabe,{ targetDate:new Date('2024-06-01T04:00:00Z'),targetTimeIndex:0 });
  assert.deepEqual(noon.hourly,midnight.hourly);
  assert.doesNotThrow(()=>structuredClone(midnight));
  assert.doesNotThrow(()=>structuredClone(calculateZiwei(birth)));
  for(const layer of ['decadal','yearly','monthly','daily','hourly']) {
    assert.equal(midnight[layer].stars.length,12,layer);
    for(const star of midnight[layer].stars.flat()) {
      assert.equal(typeof star.name,'string');
      assert.equal(typeof star.type,'string');
      assert.ok(Object.values(star).every(value=>typeof value!=='function'));
    }
  }
  assert.doesNotThrow(()=>JSON.stringify(toZiweiHoroscopeJson(midnight,{detailLevel:'full'})));
  assert.throws(()=>calculateZiweiHoroscopeDataWithAstrolabe(astrolabe,{ targetDate:'2024-02-31' }));
  assert.throws(()=>calculateZiweiHoroscopeDataWithAstrolabe(astrolabe,{ targetTimeIndex:13 }));
});
