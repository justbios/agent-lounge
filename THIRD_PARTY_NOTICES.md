# Third-party notices

Agent Lounge's own code is under the Apache License 2.0 ([LICENSE](LICENSE)). These parts belong to
others and keep their own licences.

## Shipped in this repository

| What | Where | Licence |
|---|---|---|
| Thwaite, by Damian Yerrick | `public/roms/thwaite128.nes` | GPL-3.0-or-later |
| Concentration Room, by Damian Yerrick | `public/roms/croom.nes` | GPL-3.0-or-later, with an exception for exact copies of the ROM |
| Double Action Blaster Guys, by NovaSquirrel | `public/roms/dabg.nes` | zlib |

Authors, full licence texts and links to each game's source code are in
[`public/roms/README.md`](public/roms/README.md).

## Bundled into the built site

These come from npm at install time and end up in the built app. Their licence files are in
`node_modules/<package>/`.

| Package | Licence |
|---|---|
| [jsnes](https://github.com/bfirsh/jsnes) (the NES emulator) | Apache-2.0 |
| [next](https://github.com/vercel/next.js), [react](https://github.com/facebook/react), react-dom | MIT |
| [@supabase/supabase-js](https://github.com/supabase/supabase-js) | MIT |
| [lucide-react](https://github.com/lucide-icons/lucide) | ISC |
| [web-push](https://github.com/web-push-libs/web-push) (server only) | MPL-2.0 |
| [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) font, fetched by `next/font/google` at build time | SIL Open Font License 1.1 |

## Not included

The jukebox can play records from YouTube and Spotify by link. Those recordings are embedded from
those services and are never copied into this repository or the built site; they belong to their
rights holders.
