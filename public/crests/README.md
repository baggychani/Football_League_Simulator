# Club crest cache

The application serves club crests from this directory so table and chart
rendering do not wait for third-party requests.

- Stable browser path: `/crests/{country}/{club-id}.png`
- Source URL and verification date: `src/data/league-catalog/*.ts`
- Refresh command: `npm run crests:sync`
- Narrow refresh example:
  `npm run crests:sync -- --competition eng-premier-league,esp-la-liga,ita-serie-a`

The images are club marks fetched from football-data.org's public crest cache.
Club marks remain the property of their respective owners. They are included
here as application data, not licensed as original project artwork.

For clubs unavailable from the configured football-data.org source, the
optional `npm run crests:discover` command resolves the club through Wikidata,
then locates the crest used by the linked Wikipedia article. Exact entity,
article and file-page sources are written to `sources.json`; uncertain matches
remain pending instead of being downloaded.
