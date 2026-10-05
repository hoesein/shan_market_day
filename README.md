# Shan Market Day

See [Technical Design](TECHNICAL.md) for architecture, calculation details,
data contracts, dependency decisions, release workflow and limitations.

An independent TypeScript library for scheduled Shan market-day lookup from
integer civil-date Julian Day Numbers (JDNs). It provides ES module and CommonJS
exports with TypeScript declarations for Node and React consumers.

**Reviewed data:** The user-corrected `demo-group.json` is authoritative for
English/Myanmar labels and group membership. Its 76 non-null demo entries are
included exactly, with `datasetStatus: "approved"`. The package version is
**1.0.0**; label approval does not imply publication or historical
verification of actual market openings.

## Development and local consumption

Requires Node 20 or later.

```powershell
npm ci
npm run typecheck
npm test
npm pack
```

Install the generated `shan-market-day-1.0.0.tgz` in a separate React
project with `npm install <path-to-tarball>`. No React dependency or server is
required by this library. Build output is in `dist`; declarations accompany both
module formats. `npm pack` creates an installable archive; `npm publish` is gated
by `npm run check:release`.

## Visual React calendar demo

The separate `demo` project displays a month grid, scheduled groups, bilingual
market lists, and the calculation steps from Gregorian date to JDN to cycle
index. It starts at October 2026 with the October 5 Heho anchor selected.

```powershell
npm run build
Set-Location demo
npm install
npm run dev
```

Open the local URL printed by Vite. Use month navigation or jump to November/
December 2025 to compare historical calendar labels. Build the demo with
`npm run build` from `demo`. After library changes, rebuild the root library and
restart Vite; the demo consumes its local package exports. React/Vite are demo
dependencies only and are not added to the library package.

## Public API

```typescript
import { getMarketDay, getMarketName, gregorianToJdn, Mycal } from 'shan-market-day';

const result = getMarketDay(gregorianToJdn(2026, 10, 5));
// result.group === "heho"; result.groupId === "hh_z"
const labels = result.markets.map(market => getMarketName(market, 'my'));
const calendar = new Mycal('2026-10-05'); // Optional Myanmar calendar features
```

CommonJS consumers can use
`const { getMarketDay } = require('shan-market-day')`.
React components can render `result.markets`, using each market's `id` as its
key. A result contains **all** markets in the scheduled group.

`getMarketDay(jdn)` accepts a safe integer civil-date JDN only. Invalid values
(including fractions, strings, `NaN`, and unsafe integers) throw `TypeError`;
the library does not coerce them or convert Gregorian strings/JavaScript dates.
`getMarketName(market, locale)` supports only `en` and `my`; unsupported locales
throw `RangeError`. Results, nested names, and exported cycle/anchor metadata
are read-only and frozen.

Results include `jdn`, `groupId`, `group`, `groupOrder`, `cycleDay`, `markets`,
`scheduleOnly: true`, and `datasetStatus: "approved"`. Market records follow:

```json
{
  "id": "tgi_z_tgi_z",
  "group": "taunggyi",
  "groupOrder": 0,
  "town": { "en": "Taunggyi", "my": "တောင်ကြီး" },
  "name": { "en": "Taunggyi Zay", "my": "တောင်ကြီး ဈေး" },
  "cycleDay": 0
}
```

Both index fields equal the CAL-2 position, not a day of month or an offset from
the anchor. Original group IDs remain stable; market IDs are prefixed with
their original group ID to eliminate collisions.

## mycal integration and Gregorian-to-JDN conversion

The dependency is now `mycal` **2.2.0**, the published npm version. Upstream
GitHub advertises 2.3.0, which was not published at integration time. mmcal has
been removed. `Mycal` is re-exported for optional Myanmar calendar features,
and bundled into both output formats to avoid requiring an ESM-only dependency
from CommonJS on older supported Node versions.

mycal does **not** publicly export a JDN getter/converter. Its GitHub internal
conversion also disagrees with our independently verified anchor, so we do not
use private imports, transformed upstream code, or a hidden two-day correction.
Myanmar calendar calculations remain upstream behavior, not validated by our
market-day schedule checks.

`gregorianToJdn(year, month, day)` is our own validated conversion, separate from
mycal. It supports integer civil-date components for years 1–9999 in the
proleptic Gregorian calendar, validates month lengths and leap years, and throws
`RangeError` for invalid dates. It performs no timestamp parsing or implicit
timezone conversion. Callers interpreting an instant must first extract the
intended civil date, such as the date in `Asia/Yangon`, themselves.

```typescript
const jdn = gregorianToJdn(2026, 10, 5); // 2461319
const result = getMarketDay(jdn);
```

The existing integer-JDN API is unchanged. No browser globals or classic-script
loading is required by the library.

## Anchor and schedule policy

`data/anchor.json` records the user-reported 2026-10-05 Heho anchor, JDN 2461319.
The anchor index is derived from the cycle, not stored as a second group order.
The calculation is equivalent to:

```text
positiveModulo(anchorGroupIndex + inputJdn - anchorJdn, cycleLengthDays)
```

It handles earlier dates and month/year transitions. Holidays, closures, and
postponements do not shift or reset this base schedule. Results **do not confirm
that a market is open**. Exception overrides and live opening status are deferred.

## Label review and release gate

`data/markets.json` uses both label values from each non-null demo entry without
spelling substitutions. Town labels remove only the trailing `Zay`/`ဈေး` suffix.
`data/label-review.json` records demo provenance and approved label snapshots.
Existing IDs are retained where matched; added records use group-prefixed IDs.
Generated-only entries are excluded. Counts are Taunggyi 12, Taung Ni 11,
Shwenyaung 16, Nyaungshwe 18, and Heho 19.

The edited demo includes Kyauk Ta Lone in both Taunggyi and Heho, and Pinlon in
both Taunggyi and Shwenyaung. These remain separate group-prefixed records;
approval of demo values does not resolve whether they are aliases or distinct
markets. The original sample remains unchanged for reference.

Publication remains blocked while any review record is not `approved`. Approval
must be an explicit user decision, not automatically inferred from a passing
build. Each approved review must include an `approvedLabels` snapshot with
`town` and `name` objects matching the current `en`/`my` labels; changing labels
invalidates that approval. Only approve after checking the associated labels.
The label gate now passes; final package publication/versioning remains a
separate action.

## Five-day cycle (CAL-2)

`market-cycle.json` defines the approved cycle. The array position is the
zero-based cycle index; group IDs refer to the top-level keys in
`shan_market_day.json`. Each group represents multiple co-scheduled markets,
not just its calendar representative.

| Index | Group ID | Group | Calendar representative ID | Representative |
|---|---|---|---|---|
| 0 | `tgi_z` | Taunggyi | `tgi_z_tgi_z` | Taunggyi |
| 1 | `tnn_z` | Taung Ni | `tnn_z_plg_z` | Pinlong |
| 2 | `snn_z` | Shwenyaung | `snn_z_klw_z` | Kalaw |
| 3 | `nns_z` | Nyaungshwe | `nns_z_nns_z` | Nyaungshwe |
| 4 | `hh_z` | Heho | `hh_z_hh_z` | Heho |

The cycle advances once per civil day and wraps from Heho to Taunggyi. It
does not restart at a Gregorian month or year boundary. The representative ID
identifies the market printed in the supplied calendars; it is not an alias
for the group ID.

## Calendar evidence

The locally supplied `november.jpg` and `december.jpg` show November and December **2025**.
These evidence images are excluded from Git and the package; the transcription
below is retained for reference.
Their 61 date cells support the approved order:

| Group | November dates | December dates |
|---|---|---|
| Taunggyi | 5, 10, 15, 20, 25, 30 | 5, 10, 15, 20, 25, 30 |
| Taung Ni (Pinlong) | 1, 6, 11, 16, 21, 26 | 1, 6, 11, 16, 21, 26, 31 |
| Shwenyaung (Kalaw) | 2, 7, 12, 17, 22, 27 | 2, 7, 12, 17, 22, 27 |
| Nyaungshwe | 3, 8, 13, 18, 23, 28 | 3, 8, 13, 18, 23, 28 |
| Heho | 4, 9, 14, 19, 24, 29 | 4, 9, 14, 19, 24, 29 |

In particular, November 29 is Heho, November 30 is Taunggyi, and December 1
is Pinlong (Taung Ni group): the cycle continues across the month boundary.
The November page places November 30 in the top-left cell; it does not show
October 29.

These are two pages of one calendar, not independent publications. Original
publication provenance remains unverified. They support the printed schedule,
not actual openings, every market's membership, or uninterrupted operation
through all historical years.

## Scope boundaries

- CAL-3 owns anchor metadata and the civil-date JDN contract.
- CAL-4 owns exception and actual-opening behavior.
- CAL-5 owns market-data normalization and localization.
- CAL-6 owns calculation APIs, Gregorian conversion and dependency packaging.

The original
`shan_market_day.json` remains an unnormalized sample and contains a comment
that prevents strict JSON parsing; it is not yet a production dataset.
