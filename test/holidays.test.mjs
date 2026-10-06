import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createHolidayCalendar, getMarketDay, getMarketDayWithHolidays, gregorianToJdn } from '../dist/index.js';

const jdn = gregorianToJdn(2026, 10, 5);
const name = { en: 'Manual policy', my: 'ဈေးပိတ်မူဝါဒ' };
const source = { title: 'Reference', url: 'https://example.com/holidays', retrievedOn: '2026-10-06', kind: 'official' };
function holiday(id = 'festival', closesMarkets = true, confirmation = 'confirmed') {
  return structuredClone({
    id, name, startDate: '2026-10-05', endDate: '2026-10-05', confirmation, source,
    marketClosure: { closesMarkets, reason: name, overrides: [] },
  });
}
function dataset(holidays = [holiday()], complete = true) {
  return {
    schemaVersion: 1, country: 'MM',
    coverage: [{ startDate: '2026-01-01', endDate: '2027-12-31', complete }],
    holidays,
  };
}
const lookup = data => createHolidayCalendar(data).getMarketDay(jdn);
const groupRule = closesMarkets => ({
  scope: 'groups', groupIds: ['hh_z'], closesMarkets, reason: name, sourceReference: source.url,
});
const marketRule = closesMarkets => ({
  scope: 'markets', marketIds: ['hh_z_hh_z'], closesMarkets, reason: name, sourceReference: source.url,
});

test('holiday lookup preserves the original schedule and both module exports', () => {
  const commonjs = createRequire(import.meta.url)('../dist/index.cjs');
  for (const value of [jdn, 0, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) {
    const result = getMarketDayWithHolidays(value);
    assert.deepEqual(result.schedule, getMarketDay(value));
    assert.deepEqual(commonjs.getMarketDayWithHolidays(value), result);
  }
  assert.throws(() => getMarketDayWithHolidays('2026-10-05'), TypeError);
});

test('confirmed festival ranges close every listed day without shifting the cycle', () => {
  const ranges = [
    [2026, 4, 11, 19], [2026, 5, 30, 30], [2026, 7, 29, 29],
    [2026, 10, 25, 27], [2026, 11, 23, 24],
  ];
  for (const [year, month, from, to] of ranges) {
    for (let day = from; day <= to; day++) {
      const value = gregorianToJdn(year, month, day);
      const result = getMarketDayWithHolidays(value);
      assert.deepEqual(result.schedule, getMarketDay(value));
      assert.ok(result.markets.length > 0);
      assert.ok(result.markets.every(entry => entry.status === 'closedByPolicy'));
      assert.ok(result.markets.every(entry => entry.decisions.some(decision => decision.closesMarkets)));
    }
    for (const day of [from - 1, to + 1]) {
      const value = gregorianToJdn(year, month, 1) + day - 1;
      assert.ok(getMarketDayWithHolidays(value).markets.every(entry => entry.status !== 'closedByPolicy'));
    }
  }
});

test('market overrides beat group overrides which beat the holiday default', () => {
  const record = holiday();
  record.marketClosure.overrides = [groupRule(false), marketRule(true)];
  const result = lookup(dataset([record]));
  assert.equal(result.markets.find(entry => entry.market.id === 'hh_z_hh_z').status, 'closedByPolicy');
  assert.ok(result.markets.filter(entry => entry.market.id !== 'hh_z_hh_z').every(entry => entry.status === 'scheduled'));
  record.marketClosure.closesMarkets = false;
  record.marketClosure.overrides = [groupRule(true), marketRule(false)];
  const reversed = lookup(dataset([record]));
  assert.equal(reversed.markets.find(entry => entry.market.id === 'hh_z_hh_z').status, 'scheduled');
  assert.ok(reversed.markets.filter(entry => entry.market.id !== 'hh_z_hh_z').every(entry => entry.status === 'closedByPolicy'));
});

test('overlap exemptions cannot cancel another confirmed closure and retain reasons', () => {
  const exempt = holiday('exempt');
  exempt.marketClosure.overrides = [groupRule(false)];
  const result = lookup(dataset([exempt, holiday('confirmed'), holiday('forecast', true, 'tentative')], false));
  assert.ok(result.markets.every(entry => entry.status === 'closedByPolicy'));
  for (const entry of result.markets) {
    assert.deepEqual(entry.decisions.map(decision => decision.closesMarkets), [false, true, true]);
    assert.deepEqual(entry.decisions.map(decision => decision.holiday.id), ['exempt', 'confirmed', 'forecast']);
    assert.deepEqual(entry.decisions[0].reason, name);
    assert.equal(entry.decisions[0].sourceReference, source.url);
  }
});

test('tentative closure yields unknown; confirmed closures win', () => {
  const tentative = holiday('tentative', true, 'tentative');
  assert.ok(lookup(dataset([tentative])).markets.every(entry => entry.status === 'unknown'));
  assert.ok(lookup(dataset([tentative, holiday()])).markets.every(entry => entry.status === 'closedByPolicy'));
  tentative.marketClosure.overrides = [marketRule(false)];
  const result = lookup(dataset([tentative]));
  assert.equal(result.markets.find(entry => entry.market.id === 'hh_z_hh_z').status, 'scheduled');
  assert.ok(result.markets.filter(entry => entry.market.id !== 'hh_z_hh_z').every(entry => entry.status === 'unknown'));
});

test('complete coverage means scheduled not open; absent or incomplete coverage means unknown', () => {
  for (const holidays of [[], [holiday('unrelated', false)], [holiday('tentative', false, 'tentative')]]) {
    assert.ok(lookup(dataset(holidays)).markets.every(entry => entry.status === 'scheduled'));
    assert.ok(lookup(dataset(holidays, false)).markets.every(entry => entry.status === 'unknown'));
  }
  const result = createHolidayCalendar(dataset([])).getMarketDay(gregorianToJdn(2028, 1, 1));
  assert.equal(result.coverageComplete, false);
  assert.ok(result.markets.every(entry => entry.status === 'unknown'));
  assert.ok(result.markets.every(entry => !Object.hasOwn(entry, 'isOpen')));
});

test('inclusive holiday and coverage boundaries work across years', () => {
  const record = holiday();
  record.startDate = '2026-12-31';
  record.endDate = '2027-01-01';
  const data = dataset([record]);
  data.coverage = [{ startDate: record.startDate, endDate: record.endDate, complete: true }];
  const calendar = createHolidayCalendar(data);
  const start = gregorianToJdn(2026, 12, 31);
  for (const offset of [-1, 0, 1, 2]) {
    const result = calendar.getMarketDay(start + offset);
    assert.equal(result.coverageComplete, offset === 0 || offset === 1);
    assert.ok(result.markets.every(entry => entry.status === (offset === 0 || offset === 1 ? 'closedByPolicy' : 'unknown')));
    assert.deepEqual(result.schedule, getMarketDay(start + offset));
  }
});

test('invalid schemas dates identities sources coverage and contradictory rules are rejected', () => {
  const changes = [
    data => { data.schemaVersion = 2; },
    data => { data.extra = true; },
    data => { data.coverage[0].complete = 'true'; },
    data => { data.coverage.push({ ...data.coverage[0], complete: false }); },
    data => { data.holidays.push(structuredClone(data.holidays[0])); },
    data => { data.holidays[0].startDate = '2026-02-30'; },
    data => { data.holidays[0].endDate = '2026-10-04'; },
    data => { data.holidays[0].startDate = '2025-12-31'; },
    data => { data.holidays[0].name.my = ''; },
    data => { data.holidays[0].confirmation = 'maybe'; },
    data => { data.holidays[0].source.kind = 'gazette'; },
    data => { data.holidays[0].source.url = 'javascript:alert(1)'; },
    data => { data.holidays[0].source.retrievedOn = '2026-1-1'; },
    data => { data.holidays[0].marketClosure.closesMarkets = 'true'; },
    data => { data.holidays[0].marketClosure.overrides = [{ ...groupRule(true), groupIds: ['missing'] }]; },
    data => { data.holidays[0].marketClosure.overrides = [{ ...marketRule(true), marketIds: ['missing'] }]; },
    data => { data.holidays[0].marketClosure.overrides = [{ ...groupRule(true), groupIds: [] }]; },
    data => { data.holidays[0].marketClosure.overrides = [{ ...groupRule(true), marketIds: ['hh_z_hh_z'] }]; },
    data => { data.holidays[0].marketClosure.overrides = [{ ...groupRule(true), sourceReference: 'javascript:alert(1)' }]; },
    data => { data.holidays[0].marketClosure.overrides = [groupRule(true), groupRule(false)]; },
    data => { data.holidays[0].marketClosure.overrides = [marketRule(true), marketRule(false)]; },
  ];
  for (const change of changes) {
    const data = dataset();
    change(data);
    assert.throws(() => createHolidayCalendar(data), undefined, change.toString());
  }
});

test('calendar snapshots inputs and freezes nested results', () => {
  const data = dataset();
  const calendar = createHolidayCalendar(data);
  data.holidays[0].marketClosure.closesMarkets = false;
  const result = calendar.getMarketDay(jdn);
  assert.equal(result.markets[0].status, 'closedByPolicy');
  assert.throws(() => { result.markets[0].status = 'scheduled'; }, TypeError);
  assert.throws(() => { result.holidays[0].name.en = 'changed'; }, TypeError);
  assert.throws(() => { result.markets[0].decisions.push({}); }, TypeError);
});

test('bundled evidence remains incomplete with official and tentative sources distinguished', () => {
  const data = JSON.parse(readFileSync(new URL('../data/gazetted-holidays.json', import.meta.url), 'utf8'));
  assert.deepEqual(data.coverage.map(entry => entry.complete), [false, false]);
  assert.ok(data.holidays.some(entry => entry.source.kind === 'official' && entry.confirmation === 'confirmed'));
  for (const date of [[2026, 10, 24], [2026, 11, 21], [2027, 4, 10], [2027, 4, 18], [2027, 5, 21], [2027, 7, 18]]) {
    const result = getMarketDayWithHolidays(gregorianToJdn(...date));
    assert.ok(result.holidays.some(entry => entry.confirmation === 'tentative'));
    assert.ok(result.markets.every(entry => entry.status === 'unknown'));
  }
});
