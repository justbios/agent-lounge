# The games' lab

A page for development only (`next dev`; a production build answers 404). It puts one game on the whole window,
straight into a match against an agent, with no café around it and nothing sent anywhere. Use it to look at a game
and to drive it from Playwright.

## Addresses

| Address | What it opens |
| --- | --- |
| `/lab` | the list of games, with a link for each level |
| `/lab?game=<kind>&level=<easy\|normal\|hard>` | that game against an agent; you sit in the first seat |
| `&auto=1` | agents in both seats; four seconds after a game ends the next one starts |
| `&seed=<n>` | the agents choose the same way every time (see below) |
| `&side=o` | you sit in the second seat, so the agent moves first |
| `&clock=<seconds>` | chess and draughts on a clock |
| `&speed=<n>` | board agents think `n` times quicker |

`<kind>` is one of `ttt`, `four`, `checkers`, `chess`, `pong`, `hockey`, `sumo`. Without `level` it is `normal`.

With a seed, a board game is the same game every time for the same moves from you: each agent move depends only on
the seed, the position and the move number. A real-time game with a seed starts the same way, and plays out the same
only on Playwright's made-up clock, since the agent answers what it sees frame by frame.

## What the page tells you

On `main.lab`:

- `data-game`, `data-level`, `data-side` (`x` or `o`: your seat);
- board games: `data-turn` (`x` or `o`, gone once the game is decided) and `data-ply` (moves made so far);
- `data-over` when the match has ended, and `data-result`: `won`, `lost` or `drawn`, from your seat.

On `.duel` (in the café too): `data-solo="<level>"` for a game against an agent, and `data-thinking` while an agent
is looking for its move on a board.

`window.__lab`:

- `state()` is the game as plain data: the board of a board game (`cells`, `turn`, `winner`, ...) or the state of a
  real-time one (ball or puck, paddles, bodies, `score`, `over`);
- `legal()` is every move the side to move may make (board games);
- `hint(level = "hard", seed = 1)` resolves to the move an agent of that level would make for the side to move. It
  is handy as "the person": play `hint("easy")` against a hard agent and the agent should win.

## Making a move as a person

Boards are disabled while it is not your turn, so wait for `main.lab[data-turn=<your side>]` first.

| Game | How |
| --- | --- |
| `ttt` | click `.ttt-grid button` number `cell` (0 to 8, row by row) |
| `four` | click `.four-grid .four-col` number `column` (0 to 6) |
| `checkers` | click `.chk-grid button[data-sq="N"]` for every square of the path in turn: from, then each landing |
| `chess` | click `.chess-grid button[data-sq="from"]`, then `[data-sq="to"]`; squares run a8 = 0 to h1 = 63. A pawn reaching the last rank opens `.promo`: its buttons `.promo div .btn` are queen, rook, bishop, knight in that order |

A move from `legal()` or `hint()` is already in these terms: a cell, a column, a path of squares, or `[from, to, promo?]`.

The real-time games are one `<canvas>` inside `.duel-board`, steered by the pointer or the keys:

| Game | Keys | Pointer |
| --- | --- | --- |
| `pong` | `ArrowUp` / `ArrowDown` or `w` / `s`, held | only the height counts |
| `hockey` | arrows or WASD, held | the mallet follows it |
| `sumo` | arrows or WASD, held; `Space`, `Enter` or `Shift` dashes | the wrestler walks to it; pressing dashes |

To aim at a point of the game's own field, turn it into a place on the canvas:

```js
// field: pong 160 x 100, pad 0; hockey 100 x 160, pad 5 (the rink itself is 90 x 150); sumo 140 x 140, pad 0
const r = await page.locator(".duel-board canvas").boundingBox();
const at = (gx, gy) => [r.x + ((gx + pad) / fullW) * r.width, r.y + ((gy + pad) / fullH) * r.height];
await page.mouse.move(...at(x, y));
```

Each player sees their own end at the bottom, so from the second seat (`side=o`) mirror the point first: hockey
`(90 - x, 150 - y)`, sumo `(140 - x, 140 - y)`. Pong is never turned.

## Ending, again, closing

- the end shows in `.duel` and as `main.lab[data-over]`;
- «ще раз» is `.duel-tools .ask-yes`; against an agent it starts at once and the seats swap;
- full screen is `.duel-tools [aria-label="на весь екран"]`. Headless Chromium refuses the Fullscreen API
  ("not granted"), so that one needs a browser with a window.

## Going faster

- board games: `&speed=20` cuts the agents' pauses;
- real-time games and clocks: `await page.clock.install()` before `goto`, then `await page.clock.runFor(ms)` plays
  that much of the game at once.

## A whole game in a few lines

```js
await page.goto("/lab?game=four&level=hard&seed=7&speed=20");
const lab = page.locator("main.lab");
while ((await lab.getAttribute("data-over")) === null) {
  await page.waitForSelector('main.lab[data-turn="x"], main.lab[data-over]');
  if ((await lab.getAttribute("data-over")) !== null) break;
  const ply = await lab.getAttribute("data-ply");
  const col = await page.evaluate(() => window.__lab.hint("normal", 3));
  await page.locator(".four-grid .four-col").nth(col).click();
  await page.waitForFunction((p) => document.querySelector("main.lab").dataset.ply !== p, ply);
}
console.log(await lab.getAttribute("data-result"));
```
