# Working on LiveDeck

LiveDeck is a dependency-free UMD component in three files, with no build step and no test
framework:

| File | What it is |
|------|------------|
| `livedeck.js` | the deck: reads the template, draws its own chrome, lays the steps out |
| `livedeck.css` | everything the deck draws, plus the default content components |
| `livedeck-live.js` | the helper an *embedded* page includes so the deck can size it |

Keep it that way: no dependencies, no bundler, no framework, and no vestigial markup,
attributes or styles. `README.md` is for people using the deck; this file is for the layout
and the invariants behind it. `examples/site/` exercises every feature — assemble it with
`sh examples/build.sh _site` and serve `_site/`.

## The rules the media panel is laid out by

1. **The grid arrangement is chosen, not assumed.** Every column count is a candidate — four
   cards mean 1x4, 2x2 and 4x1; three mean 1x3, 2x2 and 3x1; two mean 2x1 and 1x2 — with the
   fewest rows that hold the cards, and the deck keeps the one whose cells waste least of the
   cards' own aspect ratios, so the media on screen is as large as it can be. On a 1920x444
   panel four wide cards are half again as large in one row as in a 2x2 grid, while four tall
   ones on a portrait panel do want the 2x2.
2. **The arrangement is settled once, and then left alone.** It is decided from the cards'
   ratios and the room a caption may take; a card whose media changes size later — an image
   that finally loads, an embed that reflows or reports a new size — re-sizes inside its own
   cell, and the grid does not shuffle under the reader. Only a change in the room the panel
   offers (a window resize, a rotation) decides the arrangement again.
3. **Every card gets a cell of the same size.** Inside it the media keeps its own aspect
   ratio and, together with the caption, fills the cell as far as one of the two dimensions
   allows; the card then hugs what came out of that, so its sides are the media's sides.
4. **The caption's height follows its content, under a ceiling the media sets.** A card the
   cell's *height* pins — the media at the cell's full width would not fit — may spare the
   caption only a fifth of the cell, which is what keeps the media its room. A card the
   *width* pins has whatever the media does not use: the caption keeps the size its words
   want and the media keeps the size its ratio wants, so neither pays for the other. Under
   the ceiling the height is the font's own — a short caption is exactly as tall as its
   words, never padded out to fill a share. The text is never clipped: the padding is a share
   of the font, exactly the proportion the theme gives it, so text and padding come down
   together and the caption keeps its shape. The font steps down until the caption's whole box
   fits the ceiling — no floor under it — so the ceiling always holds.
5. **The caption is never covered.** It sits below the media, no line of it is shortened, and
   nothing is laid over it: the enlarge button belongs to the media, in the media's own
   bottom-right corner, which is the one thing that can cover a corner of the media itself.
6. **A live embed owns its own box.** Its frame is never reflowed: the deck lays it out at
   the size it reports and scales that box to fit. If the embed's aspect ratio changes, the
   card re-fits around it and the grid arrangement stays as it was.

## How that is implemented

* **One settle/fit loop per card.** A caption's own size depends on the width its card ends
  up with, and the card's size depends on how tall the caption is. `layoutMedia()` therefore
  runs `settleCaption()` and `fitCard()` round and round (six rounds at most) until a fit
  reproduces the width its caption was settled for. Two rounds are the usual case; the bound
  is a backstop, and because the caption's box is bounded by its ceiling the layout stays inside
  the cell even where the rounds do not fully settle.
* **`captionCeiling()` says how tall a caption may be.** It compares the cell's width times
  the media's ratio — the height the media would want at full width — with the cell, less
  `CAPTION_MAX` of it: if the media wants more than that, the cell's height is the binding
  constraint and the caption gets `CAPTION_MAX`; otherwise the cell's width is, and the
  caption gets everything the media leaves. The ratio's unknown case takes the tight one.
* **`settleCaption()` decides the caption from its own text**, with `--cap-size` and the
  padding it set last time reset first: what the last settle left must not colour the
  measurement. It rewrites the theme's padding as a share of the font size — the proportion
  the theme itself uses, all four sides — so the padding follows `--cap-size` instead of being
  spent on its own: a large font in a box with no room around it looks like a mistake just as
  a gap above the media does, and padding outside the ceiling would narrow the card by exactly
  that much. It then binary-searches the largest font whose whole box fits the ceiling, with no
  floor under the search, so the ceiling always holds. A caption shorter than the ceiling keeps
  the height its words need: padding one out to fill a share leaves a gap that reads as a
  mistake.
* **`fitCardWidth()` sizes the media, never the card.** The card hugs it, so the caption is
  exactly as wide as the media and no pale bar appears beside it. `room = cellH - caption`
  and the media takes `min(cellW, room / ratio)`, so it is as large as the cell allows in one
  of the two dimensions.
* **No guessed size is ever painted.** A card whose media has not given the deck a size stays
  `pending` (hidden, still measurable) and fades in when a fit with real numbers has run;
  `PENDING_MS` is the last resort, since an embed is free to say nothing at all. The fit
  itself runs in the frame the step is switched in, not a frame later, so a step is laid out
  once rather than twice.
* **The grid arrangement is the panel's memory** (`arrangeGrid()`, kept in `data-cols` and
  `data-grid-size` on the grid): keyed on the room the panel offers, so a card that changes
  its own size cannot reshuffle it. Ratios that arrive after the first fit settle an
  arrangement that was made without them.
* **An embed is measured, never guessed.** A live card learns its size from the page's
  `postMessage({type: 'resize', width, height})` report, matched by `e.source` against the
  frames the deck owns (so nothing needs an id, a name or a URL parameter), or from the
  frame's own `load`; a page that never reports is laid out in its cell. Nothing about a
  media's size is declared anywhere — the deck measures, and sizes that do not exist yet
  are simply not drawn.
* **Both lightboxes bound their caption** (`capBand()`, `LIGHTBOX_CAP` of the box) and let it
  scroll inside that band: the media keeps the rest of the box, the box stays inside the
  viewport, and a caption too long for the screen is still all reachable — the same reason the
  grid caption is never clipped. The band is cleared when a card leaves the lightbox, so it
  never follows the caption back into the grid.
* **A lightbox can be zoomed further by gesture** (`bindZoomGestures()`, `VIEW_MAX`): a
  trackpad pinch (a ctrl-wheel, taken with `preventDefault` or the page zooms instead), a
  two-finger pinch, a drag or a wheel to pan, and a double click to toggle. The media is
  transformed and never laid out again — the same rule the embed's fit follows — and
  `zoomAt()` keeps the point under the fingers where it is, which is the difference between
  a gesture and a slider. The box grows with the zoom as well (`sizeBox()`), up to the `max`
  the CSS allowed it when it was fitted: zooming into a detail should show more of it, not the
  same slice magnified, and a box already at the page's height grows in width alone. The media
  is transformed either way, so the extra room is room to see. Where the box did grow to match
  the media, the whole media is visible and the anchor has nothing to hold; where the viewport
  capped it, the anchor is what keeps the content under the fingers. Every re-fit (opening, a
  resize) goes back through `setView()`, so neither a transform nor a grown box is left on a
  size it was not measured against. An embedded page owns the
  pointer events over its own surface, so there the deck sees the gestures only outside the
  frame.
* **The live lightbox promotes the card in place** with the Popover API instead of moving it,
  so the iframe is never reloaded and keeps its state, input and scroll position. `Esc` and
  a press outside are handled by the deck (`popover="manual"`), and the fit is restored
  synchronously when it closes.
* **A step is two panels until it says otherwise.** Every `.slide-source` renders a content
  panel and a media panel; `data-full` on `[data-content]`, with no `[data-media]`, renders
  the content panel alone across the slide (`full: true` through `mount()`). It is opt-in
  because a short step reads better in a narrow measure even when there is nothing to put
  beside it.
* **History carries the step**: each step pushes `#step-N`, Back/Forward walk the steps, and
  a step the reader did not ask for is recorded only when the deck itself moved.

## Debugging a fit

Load the page with `?fit-debug` in the URL and every fit prints its numbers to the console:
the grid it measured, the arrangement it kept or picked, what each caption became, and each
round of the width solve. It is the log to ask for on a report like "four cards on a
1920x444 screen come out wrong".

## Verifying a change

* `node --check livedeck.js` and `node --check livedeck-live.js`.
* `sh examples/build.sh _site`, then serve `_site/` and walk the example deck, with
  `?fit-debug` when the change touches the fit.
* The fit is pure arithmetic over measured boxes, so it is worth reasoning about the numbers
  (`?fit-debug`) rather than eyeballing a single case: a caption that grows as the card
  narrows is a solve that has no answer inside the cell.
