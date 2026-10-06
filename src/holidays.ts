import { getMarketDay, gregorianToJdn, marketCycle, type LocalizedName, type Market, type MarketDayResult } from './index';
import defaultData from '../data/gazetted-holidays.json';
import allMarkets from '../data/markets.json';

export interface HolidaySource {
  readonly title: string;
  readonly url: string;
  readonly retrievedOn: string;
  readonly kind: 'official' | 'thirdParty';
}
export type ClosureOverride =
  | { readonly scope: 'groups'; readonly groupIds: readonly string[]; readonly closesMarkets: boolean; readonly reason: LocalizedName; readonly sourceReference: string }
  | { readonly scope: 'markets'; readonly marketIds: readonly string[]; readonly closesMarkets: boolean; readonly reason: LocalizedName; readonly sourceReference: string };
export interface Holiday {
  readonly id: string;
  readonly name: LocalizedName;
  readonly startDate: string;
  readonly endDate: string;
  readonly confirmation: 'confirmed' | 'tentative';
  readonly source: HolidaySource;
  readonly marketClosure: {
    readonly closesMarkets: boolean;
    readonly reason: LocalizedName;
    readonly overrides: readonly ClosureOverride[];
  };
}
export interface HolidayDataset {
  readonly schemaVersion: 1;
  readonly country: 'MM';
  readonly coverage: readonly { readonly startDate: string; readonly endDate: string; readonly complete: boolean }[];
  readonly holidays: readonly Holiday[];
}
export type MarketHolidayStatus = 'scheduled' | 'closedByPolicy' | 'unknown';
export interface HolidayDecision {
  readonly holiday: Holiday;
  readonly closesMarkets: boolean;
  readonly reason: LocalizedName;
  readonly sourceReference: string;
}
export interface HolidayMarket {
  readonly market: Market;
  readonly status: MarketHolidayStatus;
  readonly decisions: readonly HolidayDecision[];
}
export interface HolidayMarketDayResult {
  readonly schedule: MarketDayResult;
  readonly coverageComplete: boolean;
  readonly holidays: readonly Holiday[];
  readonly markets: readonly HolidayMarket[];
}

function dateJdn(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('Holiday dates must use YYYY-MM-DD');
  }
  const [y, m, d] = value.split('-').map(Number);
  return gregorianToJdn(y!, m!, d!);
}
function text(value: unknown, field: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`Missing ${field}`);
}
function httpUrl(value: string): void {
  text(value, 'source URL');
  if (!['https:', 'http:'].includes(new URL(value).protocol)) throw new TypeError('Invalid source URL');
}
function localized(value: LocalizedName, field: string): void {
  keys(value, ['en', 'my'], field);
  text(value.en, `${field}.en`);
  text(value.my, `${field}.my`);
}
function keys(value: unknown, allowed: readonly string[], field: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) {
    throw new TypeError(`Invalid ${field} fields`);
  }
}
function range(start: string, end: string): [number, number] {
  const from = dateJdn(start);
  const to = dateJdn(end);
  if (from > to) throw new RangeError('Holiday range start exceeds end');
  return [from, to];
}
function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

/** Validate and snapshot a manually maintained dataset once for repeated lookups. */
export function createHolidayCalendar(input: HolidayDataset) {
  const data: HolidayDataset = structuredClone(input);
  keys(data, ['schemaVersion', 'country', 'coverage', 'holidays'], 'dataset');
  if (data.schemaVersion !== 1 || data.country !== 'MM' ||
      !Array.isArray(data.coverage) || !Array.isArray(data.holidays)) {
    throw new TypeError('Invalid holiday dataset');
  }
  const coverage = data.coverage.map((entry: HolidayDataset['coverage'][number]) => {
    keys(entry, ['startDate', 'endDate', 'complete'], 'coverage');
    if (typeof entry.complete !== 'boolean') throw new TypeError('Invalid coverage completeness');
    return { ...entry, range: range(entry.startDate, entry.endDate) };
  });
  for (let i = 0; i < coverage.length; i++) {
    for (let j = i + 1; j < coverage.length; j++) {
      const a = coverage[i]!;
      const b = coverage[j]!;
      if (a.range[0] <= b.range[1] && b.range[0] <= a.range[1]) {
        throw new Error('Overlapping coverage ranges');
      }
    }
  }
  const ids = new Set<string>();
  const holidays = data.holidays.map((holiday: Holiday) => {
    keys(holiday, ['id', 'name', 'startDate', 'endDate', 'confirmation', 'source', 'marketClosure'], 'holiday');
    text(holiday.id, 'holiday.id');
    if (ids.has(holiday.id)) throw new Error(`Duplicate holiday ID: ${holiday.id}`);
    ids.add(holiday.id);
    localized(holiday.name, 'holiday.name');
    if (!['confirmed', 'tentative'].includes(holiday.confirmation)) throw new TypeError('Invalid confirmation');
    keys(holiday.source, ['title', 'url', 'retrievedOn', 'kind'], 'source');
    if (!['official', 'thirdParty'].includes(holiday.source.kind)) throw new TypeError('Invalid source');
    text(holiday.source.title, 'source.title');
    text(holiday.source.url, 'source.url');
    httpUrl(holiday.source.url);
    dateJdn(holiday.source.retrievedOn);
    const closure = holiday.marketClosure;
    keys(closure, ['closesMarkets', 'reason', 'overrides'], 'closure');
    if (!closure || typeof closure.closesMarkets !== 'boolean' || !Array.isArray(closure.overrides)) {
      throw new TypeError('Invalid closure rule');
    }
    localized(closure.reason, 'closure.reason');
    const targets = new Map<string, boolean>();
    for (const rule of closure.overrides) {
      keys(rule, ['scope', 'groupIds', 'marketIds', 'closesMarkets', 'reason', 'sourceReference'], 'override');
      if (!['groups', 'markets'].includes(rule.scope) || typeof rule.closesMarkets !== 'boolean') {
        throw new TypeError('Invalid override');
      }
      localized(rule.reason, 'override.reason');
      text(rule.sourceReference, 'override.sourceReference');
      httpUrl(rule.sourceReference);
      const targetKeys = rule.scope === 'groups' ? rule.groupIds : rule.marketIds;
      if (!Array.isArray(targetKeys) || targetKeys.length === 0 ||
          (rule.scope === 'groups' ? 'marketIds' in rule : 'groupIds' in rule)) {
        throw new TypeError('Invalid override targets');
      }
      for (const key of targetKeys) {
        const exists = rule.scope === 'groups'
          ? marketCycle.some(group => group.id === key)
          : allMarkets.some(market => market.id === key);
        if (!exists) throw new Error(`Unknown override target: ${key}`);
        const identity = `${rule.scope}:${key}`;
        if (targets.has(identity) && targets.get(identity) !== rule.closesMarkets) {
          throw new Error(`Conflicting overrides: ${identity}`);
        }
        targets.set(identity, rule.closesMarkets);
      }
    }
    const interval = range(holiday.startDate, holiday.endDate);
    if (!coverage.some(entry => interval[0] >= entry.range[0] && interval[1] <= entry.range[1])) {
      throw new RangeError(`Holiday outside declared coverage: ${holiday.id}`);
    }
    return { holiday, range: interval };
  });
  freezeDeep(data);
  return Object.freeze({
    getMarketDay(jdn: number): HolidayMarketDayResult {
      const schedule = getMarketDay(jdn);
      const complete = coverage.some(entry => entry.complete && jdn >= entry.range[0] && jdn <= entry.range[1]);
      const matching = holidays.filter(entry => jdn >= entry.range[0] && jdn <= entry.range[1]).map(entry => entry.holiday);
      const markets: HolidayMarket[] = schedule.markets.map(market => {
        const decisions = matching.map(holiday => {
          const overrides = holiday.marketClosure.overrides;
          const selected = overrides.find(rule => rule.scope === 'markets' && rule.marketIds.includes(market.id))
            ?? overrides.find(rule => rule.scope === 'groups' && rule.groupIds.includes(schedule.groupId));
          return {
            holiday,
            closesMarkets: selected?.closesMarkets ?? holiday.marketClosure.closesMarkets,
            reason: selected?.reason ?? holiday.marketClosure.reason,
            sourceReference: selected?.sourceReference ?? holiday.source.url,
          };
        });
        const closed = decisions.some(decision => decision.closesMarkets && decision.holiday.confirmation === 'confirmed');
        const uncertain = decisions.some(decision => decision.closesMarkets && decision.holiday.confirmation === 'tentative');
        return {
          market,
          status: closed ? 'closedByPolicy' : uncertain || !complete ? 'unknown' : 'scheduled',
          decisions,
        };
      });
      return freezeDeep({ schedule, coverageComplete: complete, holidays: matching, markets });
    },
  });
}

let defaultCalendar: ReturnType<typeof createHolidayCalendar> | undefined;
export function getMarketDayWithHolidays(jdn: number) {
  defaultCalendar ??= createHolidayCalendar(defaultData as HolidayDataset);
  return defaultCalendar.getMarketDay(jdn);
}
