import cycleData from '../market-cycle.json';
import anchorData from '../data/anchor.json';
import marketData from '../data/markets.json';
export { Mycal } from 'mycal';
export { createHolidayCalendar, getMarketDayWithHolidays } from './holidays';
export type { HolidayDataset, Holiday, HolidaySource, ClosureOverride, MarketHolidayStatus, HolidayDecision, HolidayMarket, HolidayMarketDayResult } from './holidays';

export type Locale = 'en' | 'my';
export type GroupId = 'tgi_z' | 'tnn_z' | 'snn_z' | 'nns_z' | 'hh_z';
export type Group = 'taunggyi' | 'taungni' | 'shwenyaung' | 'nyaungshwe' | 'heho';

export interface LocalizedName {
  readonly en: string;
  readonly my: string;
}

export interface Market {
  readonly id: string;
  readonly group: Group;
  readonly groupOrder: number;
  readonly town: LocalizedName;
  readonly name: LocalizedName;
  readonly cycleDay: number;
}

export interface MarketDayResult {
  readonly jdn: number;
  readonly groupId: GroupId;
  readonly group: Group;
  readonly groupOrder: number;
  readonly cycleDay: number;
  readonly markets: readonly Market[];
  readonly scheduleOnly: true;
  readonly datasetStatus: 'approved';
}

const slugs: Readonly<Record<GroupId, Group>> = Object.freeze({
  tgi_z: 'taunggyi',
  tnn_z: 'taungni',
  snn_z: 'shwenyaung',
  nns_z: 'nyaungshwe',
  hh_z: 'heho',
});

function isGroupId(value: string): value is GroupId {
  return Object.hasOwn(slugs, value);
}

export const marketCycle = Object.freeze(cycleData.groups.map((entry, index) => {
  if (!isGroupId(entry.id)) throw new Error(`Unknown cycle group: ${entry.id}`);
  return Object.freeze({
    id: entry.id,
    group: slugs[entry.id],
    index,
    calendarRepresentativeMarketId: entry.calendarRepresentativeMarketId,
  });
}));

if (cycleData.cycleLengthDays !== 5 || marketCycle.length !== 5 ||
    new Set(marketCycle.map(group => group.id)).size !== 5 ||
    cycleData.resetAtMonthBoundary || cycleData.resetAtYearBoundary) {
  throw new Error('Invalid five-day cycle definition');
}

export const marketAnchor = Object.freeze({ ...anchorData });
const anchorIndex = marketCycle.findIndex(group => group.id === marketAnchor.groupId);
if (anchorIndex < 0 || !Number.isSafeInteger(marketAnchor.jdn)) {
  throw new Error('Invalid market anchor');
}

const seenIds = new Set<string>();
const markets: readonly Market[] = Object.freeze(marketData.map(entry => {
  const group = marketCycle.find(group => group.group === entry.group);
  if (!group || entry.groupOrder !== group.index || entry.cycleDay !== group.index ||
      !entry.id.startsWith(`${group.id}_`) || seenIds.has(entry.id)) {
    throw new Error(`Invalid market identity or cycle mapping: ${entry.id}`);
  }
  for (const label of [entry.town.en, entry.town.my, entry.name.en, entry.name.my]) {
    if (!label.trim()) throw new Error(`Empty market label: ${entry.id}`);
  }
  seenIds.add(entry.id);
  return Object.freeze({
    ...entry,
    group: group.group,
    town: Object.freeze({ ...entry.town }),
    name: Object.freeze({ ...entry.name }),
  });
}));

const marketsByGroup = Object.freeze(marketCycle.map(group => {
  const members = Object.freeze(markets.filter(market => market.group === group.group));
  if (!members.some(market => market.id === group.calendarRepresentativeMarketId)) {
    throw new Error(`Missing calendar representative for ${group.id}`);
  }
  return members;
}));

/**
 * Resolve the scheduled group for an integer civil-date JDN.
 * This does not indicate whether a market is actually open.
 */
export function getMarketDay(jdn: number): MarketDayResult {
  if (!Number.isSafeInteger(jdn)) {
    throw new TypeError('jdn must be a safe integer civil-date Julian Day Number');
  }
  // Reduce before subtracting to avoid precision loss at safe-integer extremes.
  const length = marketCycle.length;
  const index = ((anchorIndex + jdn % length - marketAnchor.jdn % length) % length + length) % length;
  const group = marketCycle[index];
  const members = marketsByGroup[index];
  if (!group || !members) throw new Error('Invalid cycle lookup');
  return Object.freeze({
    jdn,
    groupId: group.id,
    group: group.group,
    groupOrder: group.index,
    cycleDay: group.index,
    markets: members,
    scheduleOnly: true,
    datasetStatus: 'approved',
  });
}

export function getMarketName(market: Market, locale: Locale): string {
  if (locale !== 'en' && locale !== 'my') {
    throw new RangeError('locale must be en or my');
  }
  return market.name[locale];
}

/**
   * Convert an explicit Gregorian civil date, without timezone or Date parsing.
   * Supported years are 1–9999 in the proleptic Gregorian calendar.
   */
  export function gregorianToJdn(year: number, month: number, day: number): number {
    if (!Number.isInteger(year) || year < 1 || year > 9999 ||
        !Number.isInteger(month) || month < 1 || month > 12 ||
        !Number.isInteger(day)) {
      throw new RangeError('Expected a valid Gregorian date with year 1–9999');
    }
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const length = lengths[month - 1];
    if (!length || day < 1 || day > length) {
      throw new RangeError('Expected a valid Gregorian date with year 1–9999');
    }
    const a = Math.floor((14 - month) / 12);
    const y = year + 4800 - a;
    const m = month + 12 * a - 3;
    return day + Math.floor((153 * m + 2) / 5) + 365 * y +
      Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  }
