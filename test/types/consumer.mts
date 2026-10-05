import { getMarketDay, getMarketName, gregorianToJdn, Mycal, type MarketDayResult } from 'shan-market-day';

const result: MarketDayResult = getMarketDay(2461319);
const names: readonly string[] = result.markets.map(market => getMarketName(market, 'my'));
void names;
getMarketDay(gregorianToJdn(2026, 10, 5));
new Mycal('2026-10-05').year;
// @ts-expect-error The public API accepts JDN numbers, not date strings.
getMarketDay('2026-10-05');
