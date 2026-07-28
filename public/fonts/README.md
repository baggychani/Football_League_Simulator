# Bundled fonts

- `PretendardVariable.woff2` is the local Korean UI font.
- `SpaceGroteskVariable.woff2` is the Latin variable subset served by Google
  Fonts for Space Grotesk 400–700. Its license is stored in
  `OFL-SpaceGrotesk.txt`. Recreate both with `npm run fonts:sync`.

Keeping both files under `/public/fonts` removes font-CDN requests from the
application's first render.
