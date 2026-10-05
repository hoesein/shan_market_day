import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { getMarketDay, getMarketName, marketAnchor, marketCycle, gregorianToJdn, Mycal } from '../dist/index.js';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const dataset = readJson('../data/markets.json');

test('Heho anchor and every group wrap in the approved order', () => {
  assert.equal(marketAnchor.jdn, 2461319);
  assert.equal(marketAnchor.groupId, 'hh_z');
  const expected = ['hh_z', 'tgi_z', 'tnn_z', 'snn_z', 'nns_z', 'hh_z'];
  expected.forEach((groupId, offset) => {
    const result = getMarketDay(2461319 + offset);
    assert.equal(result.groupId, groupId);
    assert.equal(result.jdn, 2461319 + offset);
    assert.equal(result.groupOrder, marketCycle.findIndex(group => group.id === groupId));
    assert.equal(result.cycleDay, result.groupOrder);
  });
});

test('all 61 calendar dates match their independently transcribed groups', () => {
  const november = [
    1, 2, 3, 4, 0, 1, 2, 3, 4, 0,
    1, 2, 3, 4, 0, 1, 2, 3, 4, 0,
    1, 2, 3, 4, 0, 1, 2, 3, 4, 0,
  ];
  const december = [
    1, 2, 3, 4, 0, 1, 2, 3, 4, 0,
    1, 2, 3, 4, 0, 1, 2, 3, 4, 0,
    1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1,
  ];
  november.forEach((index, day) => assert.equal(getMarketDay(2460981 + day).groupOrder, index));
  december.forEach((index, day) => assert.equal(getMarketDay(2461011 + day).groupOrder, index));
  assert.equal(november.length + december.length, 61);
});

test('negative anchor offsets and month/year boundaries never reset rotation', () => {
  assert.equal(getMarketDay(2461009).groupId, 'hh_z'); // 2025-11-29
  assert.equal(getMarketDay(2461010).groupId, 'tgi_z');
  assert.equal(getMarketDay(2461011).groupId, 'tnn_z');
  assert.equal(getMarketDay(2461041).groupId, 'tnn_z'); // 2025-12-31
  assert.equal(getMarketDay(2461042).groupId, 'snn_z'); // 2026-01-01
  assert.equal(getMarketDay(2461318).groupId, 'nns_z');
});

test('safe-integer extremes do not lose cycle precision', () => {
  for (const jdn of [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0, -1]) {
    const remainder = ((4n + BigInt(jdn) - 2461319n) % 5n + 5n) % 5n;
    assert.equal(getMarketDay(jdn).groupOrder, Number(remainder));
  }
});

test('invalid JDN inputs are rejected explicitly without coercion', () => {
  for (const input of [NaN, Infinity, -Infinity, 2461319.5, '2461319', null,
    undefined, new Date(), {}, 2461319n, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => getMarketDay(input), {
      name: 'TypeError',
      message: 'jdn must be a safe integer civil-date Julian Day Number',
    });
  }
});

test('each scheduled result returns all group markets with bilingual labels and approved policy', () => {
  for (const group of marketCycle) {
    const result = getMarketDay(2461315 + group.index);
    assert.deepEqual(result.markets, dataset.filter(market => market.group === group.group));
    assert.ok(result.markets.length > 1);
    assert.equal(result.scheduleOnly, true);
    assert.equal(result.datasetStatus, 'approved');
    assert.equal(Object.hasOwn(result, 'isOpen'), false);
    for (const market of result.markets) {
      assert.equal(getMarketName(market, 'en'), market.name.en);
      assert.equal(getMarketName(market, 'my'), market.name.my);
      assert.ok(market.town.en.trim());
      assert.ok(market.town.my.trim());
      assert.throws(() => getMarketName(market, 'shn'), RangeError);
    }
  }
});

test('normalized records exactly match authoritative demo labels and membership', () => {
  const demo = readJson('../demo-group.json');
  const groupKeys = ['TaunggyiGroup', 'TaungNiGroup', 'ShweNyaungGroup', 'NyaungShweGroup', 'HehoGroup'];
  assert.equal(new Set(dataset.map(market => market.id)).size, dataset.length);
  for (const group of marketCycle) {
    const members = dataset.filter(market => market.group === group.group);
    const labels = demo[groupKeys[group.index]].filter(row => row.demo !== null).map(row => row.demo);
    assert.deepEqual(members.map(market => market.name), labels);
    assert.ok(members.some(market => market.id === group.calendarRepresentativeMarketId));
    for (const member of members) {
      assert.ok(member.id.startsWith(`${group.id}_`));
      assert.equal(member.groupOrder, group.index);
      assert.equal(member.cycleDay, group.index);
      assert.equal(member.town.en, member.name.en.replace(/\s+(?:Zay|Market)$/i, ''));
      assert.equal(member.town.my, member.name.my.replace(/\s*ဈေး$/, ''));
    }
  }
});

test('shared exported cycle and returned data cannot be mutated', () => {
  const result = getMarketDay(2461319);
  assert.throws(() => { result.markets[0].name.my = 'changed'; }, TypeError);
  assert.throws(() => { result.markets.push(result.markets[0]); }, TypeError);
  assert.throws(() => { marketCycle[0].index = 4; }, TypeError);
  assert.throws(() => { marketAnchor.jdn = 0; }, TypeError);
  assert.equal(getMarketDay(2461319).groupId, 'hh_z');
  assert.deepEqual(getMarketDay(2461319).markets, dataset.filter(market => market.group === 'heho'));
});

test('ESM and CommonJS exports work without browser globals', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const require = createRequire(import.meta.url);
  const cjs = require('../dist/index.cjs');
  assert.deepEqual(cjs.getMarketDay(2461319), getMarketDay(2461319));
  assert.deepEqual(cjs.marketCycle, marketCycle);
});

test('Gregorian conversion matches independent known JDNs and all calendar dates', () => {
  for (const [year, month, day, expected] of [
    [2000, 1, 1, 2451545], [1970, 1, 1, 2440588],
    [2026, 10, 5, 2461319], [2025, 11, 29, 2461009],
    [1, 1, 1, 1721426], [9999, 12, 31, 5373484],
  ]) assert.equal(gregorianToJdn(year, month, day), expected);
  for (const [month, count, start] of [[11, 30, 2460981], [12, 31, 2461011]]) {
    for (let day = 1; day <= count; day++) {
      assert.equal(gregorianToJdn(2025, month, day), start + day - 1);
    }
  }
  assert.equal(getMarketDay(gregorianToJdn(2026, 10, 5)).groupId, 'hh_z');
});

test('Gregorian conversion enforces leap years and rejects invalid dates without coercion', () => {
  assert.equal(gregorianToJdn(2000, 3, 1) - gregorianToJdn(2000, 2, 28), 2);
  assert.equal(gregorianToJdn(1900, 3, 1) - gregorianToJdn(1900, 2, 28), 1);
  for (const args of [[1900, 2, 29], [2025, 2, 29], [2026, 4, 31],
    [0, 1, 1], [10000, 1, 1], [2026, 0, 1], [2026, 13, 1],
    [2026, 1, 0], [2026, 1, 1.5], ['2026', 10, 5], [NaN, 1, 1]]) {
    assert.throws(() => gregorianToJdn(...args), RangeError);
  }
});

test('mycal Myanmar calendar features are available in ESM and CommonJS without a browser', () => {
  const esm = new Mycal('1948-01-04');
  assert.deepEqual(esm.year, { en: '1309', my: '၁၃၀၉' });
  const require = createRequire(import.meta.url);
  const cjs = require('../dist/index.cjs');
  assert.deepEqual(new cjs.Mycal('1948-01-04').year, esm.year);
  assert.equal(cjs.gregorianToJdn(2026, 10, 5), 2461319);
});

test('every approved demo label has a matching review snapshot and passes label gate', () => {
  const reviews = readJson('../data/label-review.json');
  assert.deepEqual(reviews.map(review => review.id).sort(), dataset.map(market => market.id).sort());
  assert.equal(new Set(reviews.map(review => review.id)).size, dataset.length);
  assert.ok(reviews.every(review => review.status === 'approved'));
  for (const market of dataset) {
    const review = reviews.find(entry => entry.id === market.id);
    assert.deepEqual(review.approvedLabels, { town: market.town, name: market.name });
  }
  const gate = spawnSync(process.execPath, ['scripts/check-release.mjs'], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(gate.status, 0, gate.stderr);
});
