# 2026/27 league-expansion data

Verified on 2026-07-28. This document records what is authoritative, what is
provisional, and where the code expects a later seasonal refresh.

## Scope and professional boundary

| Country | Loaded competitions | Professional simulation boundary | 2026/27 roster state |
| --- | --- | --- | --- |
| England | Premier League, Championship, League One, League Two | Tiers 1–4 | 20 + 24 + 24 + 24 verified |
| Spain | LALIGA, LALIGA HYPERMOTION, Primera Federación | Tiers 1–2; tier 3 is a feeder | 20 + 22 + 40 verified |
| Italy | Serie A, Serie B, Serie C | Tiers 1–3 | 20 + 20 verified; Serie C provisional |

The EFL rules define a 72-club competition split across the Championship,
League One and League Two. LALIGA states that its 20 first-division and 22
second-division clubs are the national professional competitions. FIGC's
2026/27 registration rules treat Serie A, B and C as the professional
competitions; Serie D is managed by the LND.

## Authoritative roster sources

- Premier League:
  https://www.premierleague.com/en/news/4673099/the-202627-premier-league-season-officially-starts/
- Premier League final-table tie-break and neutral-playoff rules:
  https://www.premierleague.com/en/news/4638196/could-the-premier-league-title-be-won-on-goal-difference
- EFL 2026/27 fixture release:
  https://www.efl.com/news/2026/june/25/the-2026-27-efl-fixtures-are-here/
- EFL divisional structure:
  https://www.efl.com/documents/efl-handbook.pdf
- EFL 2026/27 Championship playoff format:
  https://www.efl.com/news/2026/march/05/efl-statement--sky-bet-championship-play-off-format/
- LALIGA 2026/27 clubs:
  https://www.laliga.com/laliga-easports/clubes
- LALIGA HYPERMOTION 2026/27 clubs:
  https://www.laliga.com/laliga-hypermotion/clubes
- Primera Federación 2026/27 groups:
  https://rfef.es/es/noticias/aprobados-los-grupos-de-primera-federacion-para-la-temporada-202627
- Serie A 2026/27 roster:
  https://en.legaseriea.it/serie-a/news/looking-forward-to-the-2026-27-serie-a-fixture-list
- Serie B 2026/27 roster:
  https://www.legab.it/seriebkt/squadre
- Serie C official announcement schedule:
  https://www.seriec.com/news-detail/nasce-la-nuova-serie-c-2026-27
- FIGC 2026/27 Serie A table/decisive-playoff rules:
  https://files.figc.it/version/c%3AZmUzYzk0MzUtMzU0Zi00%3AYTk3YzZiZGEtYmExYi00/244%20-%20Deroga%20art.%2051%20NOIF%20-%20Determinazione%20classifica%20Campionato%20Serie%20A%20ss%202026%20-%202027.pdf

The exact club arrays, Korean names, abbreviations, main/secondary display
colours, source IDs and reserve-team parent relationships are in
`src/data/league-catalog/`.

Colours are UI display metadata chosen for contrast (especially when a club's
primary colour is white), not a claim to be an official brand-guideline
palette. Identity and rule source URLs have verification dates and are
validated with the rest of the catalog.

### Serie C caveat

Lega Pro announced that the official 60-club roster and three groups would be
published on 2026-07-29, one day after this audit. The repository therefore
stores the 60 reported candidates as `rosterStatus: "provisional"`. It does not
claim that those geographic groups are final. Re-run the data audit and replace
the groups after the official announcement.

## Movement model

Promotion/relegation rules are data, not worker branches:

- England: PL 3 down; Championship 2 automatic + one 3rd–8th playoff winner,
  3 down; League One 2 + one playoff winner, 4 down; League Two 3 + one playoff
  winner, 2 down to the National League boundary.
- Spain: LALIGA 3 down; HYPERMOTION 2 + one playoff winner up and 4 down;
  Primera Federación group winners + two national playoff winners up.
- Italy: Serie A 3 down; Serie B 2 + one playoff winner up, three automatic
  relegations plus the conditional 16th/17th playout route; Serie C three group
  winners + one national playoff winner up.

The Premier League's neutral match at a consequential boundary is also stored
as data and is now simulated only when points and every configured table
tie-breaker remain equal. The production worker and both calibration paths use
the same rule and a reproducible neutral-ground draw. It cannot be triggered by
an ordinary points tie that goal difference or another table rule already
settles.

Serie A's 2026/27 rules also keep its points-tied championship decider and
17th/18th survival decider as explicit `decisivePlayoffs` data. These are not
ordinary table comparators: a future Serie A season runner must simulate the
configured single match or two legs before finalising the champion/relegated
club. The active-league guard deliberately refuses to run Serie A until that
postseason step exists, so a future switch cannot silently produce the wrong
champion.

`src/domain/promotion.ts` resolves automatic and postseason routes, validates
eligible positions, preserves roster sizes, exposes external-boundary
vacancies, and prevents a reserve/U23 side from landing at or above its parent
club's tier. Its season-roster input is carried forward after every transition;
the engine does not fall back to the original 2026/27 arrays in year two.

The current infinite simulator intentionally still runs one active top
division. Wiring multi-division match simulation is a later step; the catalog
and movement engine are ready without requiring UI work.

## Crest policy

Browser code always uses stable local paths:
`/crests/{country}/{club-id}.png`.

The current Premier League, LALIGA and Serie A rosters are fully cached.
Additional professional clubs with a verified football-data.org source ID are
also cached. Clubs whose exact source has not yet been verified remain visible
in the data audit as pending instead of silently receiving the wrong badge.
For the remainder, `crests:discover` resolves an exact Wikidata club entity,
prefers its official-logo property, then falls back to current crest/logo
images in the linked Wikipedia article. It stores the entity, article and
file-page provenance in `public/crests/sources.json`. Historical crest
filenames are penalised and uncertain matches are skipped. Unrelated civic
marks, Wikimedia project icons and generic competition logos are rejected;
some clubs do officially use their city's arms, so those cases are verified
against the club site rather than blocked by filename alone. The audit checks
every local file's PNG signature, source provenance and suspicious filename
patterns; a final contact-sheet review is still required because an external
numeric crest ID can be wrong without being technically invalid.

Commands:

```text
npm run crests:sync
npm run crests:discover
npm run data:audit
npm run data:audit -- --strict-crests
```

The first command refreshes every configured source. The strict audit is useful
before enabling a new league in the UI.

## Adding or switching a league later

1. Add/update club identities in the country file.
2. Add the season roster and rules to its `CompetitionDefinition`.
3. Provide a ratings snapshot and optional market-provider mapping.
4. Change the single `activeCompetitionId` in
   `src/data/league-catalog/active.ts`; Premier League, LALIGA and Serie A
   presets are already registered. Bind matching artifacts in
   `src/data/active-data.ts`.
5. Run `npm run data:audit`, `npm test`, and `npm run build`.

Round count, matches per round, season labels, qualification lines, chart
season boundaries, dynamic structural tiers and market title mapping are all
derived from the active definition.

## Seasonal refresh checklist

1. Replace the season roster only after its league/federation publishes it.
2. Update `season.id`, `startYear`, `verifiedAt` and every applicable rule
   source together.
3. Reconfirm promotion/playoff formats, points, tie-breakers, group draws and
   reserve/U23 eligibility; do not carry last year's regulations by accident.
4. Run crest discovery, the non-strict data audit, then a visual contact-sheet
   review. Enable a league only after its active roster has no missing crest.
5. Add ratings and a market mapping (if available), then run the full test,
   build and 1280×720 browser regression suite.
