# Football data collection contract

Verified and reviewed on 2026-07-28. This is a backend/data contract; none of
these fields need to be rendered by the current UI.

## Current coverage

| Dataset | State | Notes |
| --- | --- | --- |
| Club identity/provider mapping | Collected | Stable internal IDs; provider IDs never become primary keys |
| Competition roster and rules | Collected | Points, tie-breakers, playoffs, promotion/relegation and provenance |
| Fixtures, statuses and results | Contract ready | Normalized schema and validator exist; no live provider is connected |
| Point deductions/administrative adjustments | Contract ready | Kept separate from match scores |
| Player catalog, lineups and availability | Deferred | Must not be added until player identity can be resolved reliably |
| Team match statistics | Deferred | Shots, corners, cards, possession and rest/congestion |
| Event stream and xG | Deferred | Provider/model version must accompany every value |

`src/data/football-data/collection-policy.ts` is the machine-readable version
of this table. `npm run data:audit` reports every category, so a future
developer cannot mistake crests and rosters for complete football data.

## Normalized match identity

The provider-neutral `MatchDataSnapshot` stores:

- stable internal match, competition, season and club IDs;
- provider name and provider record ID separately;
- round, stage, leg and current status;
- kickoff in UTC plus the venue's IANA time zone;
- previous kickoff for postponement tracking;
- venue and an explicit neutral-venue flag;
- half-time, full-time, extra-time and penalty scores as distinct fields;
- attendance and referee when available;
- source URL, fetch time, provider schema/model version and license URL;
- an independent `updatedAt` timestamp for correction tracking;
- sourced administrative point changes outside match scores.

The validator rejects unknown clubs, duplicate internal/provider IDs, invalid
UTC or time-zone values, final matches without scores, extra time in an
ordinary league fixture, malformed shootouts, and incomplete schedules which
claim to be complete.

Validate any imported snapshot before persistence:

```text
npm run matches:validate -- path/to/snapshot.json
```

## Source strategy

1. League/federation publications remain authoritative for roster, rules,
   rescheduling, awarded matches and disciplinary point changes.
2. [football-data.org v4](https://www.football-data.org/documentation/quickstart)
   is suitable for basic competition fixtures, results and standings where the
   account's coverage permits it. Existing football-data club IDs are now
   stored as provider mappings rather than inferred from crest URLs.
3. A licensed richer feed such as
   [Sportmonks fixtures](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/livescores-and-fixtures/fixtures)
   can later supply lineups, events and statistics, but should be normalized
   into this contract instead of leaking provider fields into simulation code.
4. [StatsBomb Open Data](https://github.com/statsbomb/open-data) is useful for
   historical model research and includes match, lineup and event files. It is
   not treated as a complete live 2026/27 feed.

Do not scrape a visual league page into the canonical store when an official
or licensed structured feed exists. Never merge xG values from two providers:
their models are not interchangeable.

## Freshness and retention

- Scheduled fixtures: refresh daily and retain the previous kickoff.
- Live fixtures: target a 30-second poll only if the provider terms allow it.
- Finished scores: verify after the final whistle and again within six hours
  to catch corrections.
- Official disciplinary decisions: ingest as a new sourced adjustment; never
  rewrite a match score to reproduce a points deduction.
- Store raw provider responses immutably before normalization when a provider
  is connected. Rebuilding a snapshot must be reproducible from those raw
  responses and the normalizer version.

Secrets and API tokens must remain server-side. Browser code should receive
only validated normalized snapshots.
