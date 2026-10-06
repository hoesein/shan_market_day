import library = require('shan-market-day');

const result: library.MarketDayResult = library.getMarketDay(2461319);
const names: readonly string[] = result.markets.map(market => library.getMarketName(market, 'en'));
void names;
const status: library.MarketHolidayStatus | undefined = library.getMarketDayWithHolidays(2461319).markets[0]?.status;
library.createHolidayCalendar({ schemaVersion: 1, country: 'MM', coverage: [], holidays: [] }).getMarketDay(2461319);
void status;
// @ts-expect-error Only the two agreed locales are supported.
library.getMarketName(result.markets[0]!, 'shn');
