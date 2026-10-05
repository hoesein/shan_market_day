import library = require('shan-market-day');

const result: library.MarketDayResult = library.getMarketDay(2461319);
const names: readonly string[] = result.markets.map(market => library.getMarketName(market, 'en'));
void names;
// @ts-expect-error Only the two agreed locales are supported.
library.getMarketName(result.markets[0]!, 'shn');
