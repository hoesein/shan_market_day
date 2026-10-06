import { getMarketDay, getMarketName, getMarketDayWithHolidays, createHolidayCalendar, gregorianToJdn, Mycal, type MarketDayResult, type HolidayDataset, type MarketHolidayStatus } from 'shan-market-day';

const result: MarketDayResult = getMarketDay(2461319);
const names: readonly string[] = result.markets.map(market => getMarketName(market, 'my'));
void names;
const status: MarketHolidayStatus | undefined = getMarketDayWithHolidays(2461319).markets[0]?.status;
const holidayData: HolidayDataset = { schemaVersion: 1, country: 'MM', coverage: [], holidays: [] };
createHolidayCalendar(holidayData).getMarketDay(2461319);
void status;
// @ts-expect-error Holiday policy results are immutable.
getMarketDayWithHolidays(2461319).markets[0]!.status = 'scheduled';
getMarketDay(gregorianToJdn(2026, 10, 5));
new Mycal('2026-10-05').year;
// @ts-expect-error The public API accepts JDN numbers, not date strings.
getMarketDay('2026-10-05');
