import { readFileSync } from 'node:fs';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const markets = readJson('../data/markets.json');
const reviews = readJson('../data/label-review.json');
if (!Array.isArray(markets) || !Array.isArray(reviews)) {
  throw new Error('Release metadata must contain market and review arrays');
}
const pending = markets.filter(market => {
  const matching = reviews.filter(review => review.id === market.id);
  if (matching.length !== 1 || matching[0].status !== 'approved') return true;
  const labels = matching[0].approvedLabels;
  return labels?.town?.en !== market.town.en || labels?.town?.my !== market.town.my ||
    labels?.name?.en !== market.name.en || labels?.name?.my !== market.name.my;
});
if (pending.length > 0) {
  console.error(`Release blocked: ${pending.length} market label reviews lack approval matching the current labels.`);
  process.exitCode = 1;
}
