import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLiuyao, calculateMeihua, calculateTarot } from 'taibu-core';
import { HEXAGRAMS } from 'taibu-core/data/hexagrams';
import { calculateFullYaoInfo, sampleYarrowValue } from '../dist/domains/liuyao/calculate.js';

test('coin values retain the six bottom-to-top yin/yang and moving states', async () => {
  const values = [6,7,8,9,6,9];
  const result = await calculateLiuyao({ method:'coins', yaoValues:values, question:'检验',yongShenTargets:['兄弟'],date:'2024-01-01T12:00' });
  result.fullYaos.forEach((yao,index) => {
    assert.equal(yao.position,index+1);
    assert.equal(yao.type,values[index] % 2);
    assert.equal(yao.isChanging,values[index] === 6 || values[index] === 9);
    if (yao.isChanging) assert.equal(yao.changedYao.type,1-yao.type);
  });
  assert.deepEqual(result.calculationOptions.yaoValues,values);
  await assert.rejects(calculateLiuyao({ method:'coins',yaoValues:[6,7],question:'检验',yongShenTargets:['兄弟'],date:'2024-01-01T12:00' }));
  await assert.rejects(calculateLiuyao({method:'auto',question:'检验',yongShenTargets:['兄弟'],date:123}),{name:'CoreInputError',path:'date'});
  for(const date of ['2024-01-01T12:00.5','2024-01-01T12:00.5Z']) await assert.rejects(calculateLiuyao({method:'auto',question:'检验',yongShenTargets:['兄弟'],date}));
});

test('the yarrow probability model has exactly 1/5/7/3 outcomes in its 16 equal buckets', () => {
  const counts = { 6:0,7:0,8:0,9:0 };
  for (let bucket=0;bucket<16;bucket++) counts[sampleYarrowValue(() => (bucket+0.5)/16)]++;
  assert.deepEqual(counts,{6:1,7:5,8:7,9:3});
});

test('six gods depend on line position, including reordered callers', () => {
  const yaos=[6,1,5,2,4,3].map(position=>({ position,type:1,change:'stable' }));
  const gods=['青龙','朱雀','勾陈','螣蛇','白虎','玄武'];
  for(const yao of calculateFullYaoInfo(yaos,'111111','甲')) assert.equal(yao.liuShen,gods[yao.position-1]);
});

test('all 64 hexagrams and six moving lines preserve Meihua changed/opposite/reversed algebra', async () => {
  for(const hexagram of HEXAGRAMS) for(let movingLine=1;movingLine<=6;movingLine++) {
    const result=await calculateMeihua({ method:'select',hexagramName:hexagram.name,movingLine,question:'检验',date:'2024-01-01T12:00' });
    const changed=Array.from(hexagram.code);
    changed[movingLine-1]=changed[movingLine-1]==='1'?'0':'1';
    assert.equal(result.mainHexagram.code,hexagram.code);
    assert.equal(result.changedHexagram.code,changed.join(''));
    assert.equal(result.oppositeHexagram.name,HEXAGRAMS.find(h=>h.code===Array.from(hexagram.code,c=>c==='1'?'0':'1').join('')).name);
    assert.equal(result.reversedHexagram.name,HEXAGRAMS.find(h=>h.code===Array.from(hexagram.code).reverse().join('')).name);
  }
});

test('Tarot full-deck draws are unique and orientation sampling cannot alter card order', async () => {
  for(const [deck,count] of [['all',78],['major',22],['minor',56]]) {
    const input={ spreadType:'custom',customPositions:Array.from({length:count},(_,i)=>`位置${i+1}`),deck,seed:'full-deck',referenceYear:2024 };
    const upright=await calculateTarot({ ...input,reversedProbability:0 });
    const reversed=await calculateTarot({ ...input,reversedProbability:1 });
    assert.equal(new Set(upright.cards.map(card=>card.card.name)).size,count);
    assert.deepEqual(reversed.cards.map(card=>card.card.name),upright.cards.map(card=>card.card.name));
    assert.ok(upright.cards.every(card=>card.orientation==='upright'));
    assert.ok(reversed.cards.every(card=>card.orientation==='reversed'));
    upright.cards[0].card.keywords.push('mutation');
    assert.ok(!(await calculateTarot({ ...input,reversedProbability:0 })).cards[0].card.keywords.includes('mutation'));
  }
  for(const patch of [{spreadType:'unknown'},{reversedProbability:2},{birthYear:2024},{birthYear:2023,birthMonth:2,birthDay:29}]) await assert.rejects(calculateTarot({ seed:'invalid',...patch }));
});
