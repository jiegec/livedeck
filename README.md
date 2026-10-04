# LiveDeck

**Interactive web slides.** Write your content as normal HTML — LiveDeck turns it into a full-screen,
keyboard-driven, two-column deck you can click, swipe and embed live demos in.

- 📑 Content left, media right, both auto-scaled to fit any screen
- 🖱️ Live, interactive `<iframe>` embeds (simulators, demos, widgets, anything)
- 🖼️ Click-to-zoom lightbox, overview grid, fullscreen, keyboard & touch navigation
- 🌍 i18n with built-in `en` / `zh-CN` and easy overrides
- 🧩 No dependencies, no build step — one CSS file, `livedeck.js`, and an optional `livedeck-live.js`
- 📄 Slides can be declared in HTML **or** passed to `LiveDeck.mount()`

▶ **Live tutorial (an example deck):** <https://jia.je/livedeck/>

---

## Quick start

```html
<link rel="stylesheet" href="livedeck.css">

<!-- Config: read from data-* attributes -->
<div id="presentation-config" hidden
     data-title="My deck"
     data-accent="#2563eb"
     data-lang="en"></div>

<!-- Slides: one .slide-source per step -->
<template id="deck-source">
  <section class="slide-source" data-section="Intro" data-title="Hello">
    <div data-content>
      <p>Anything you like: text, notes, tables, formulas…</p>
    </div>
    <div data-media>
      <img src="diagram.svg" data-caption="A caption">
      <iframe src="page.html" data-height="420"
              data-caption="A live, interactive page"></iframe>
    </div>
  </section>
</template>

<script src="livedeck.js"></script>
```

If a `#deck-source` template is present, LiveDeck auto-initialises on load.
Opt out with `<script src="livedeck.js" data-auto="false"></script>` and call
`LiveDeck.mount()` yourself.

## The content contract

| Piece | Markup |
|------|--------|
| Config | `#presentation-config` with `data-*` attributes |
| Slides | `<section class="slide-source" data-section data-title>` inside `<template id="deck-source">` |
| Content (left) | `[data-content]` — free-form HTML |
| Media (right) | children of `[data-media]`: `<img>` or `<iframe>` |

**Config attributes** (all optional):

| Attribute | Meaning |
|-----------|---------|
| `data-title`, `data-subtitle` | document title |
| `data-accent`, `data-accent2` | theme colors |
| `data-lang` | UI language (`en`, `zh-CN`, or your own) |
| `data-fullscreen-on-load` | `"true"` to request fullscreen on load |
| `data-overview-on-load` | `"true"` to open the overview on load |

**Media items**

```html
<!-- image / svg -->
<img src="pic.png" alt="…" data-caption="Shown under the image">

<!-- live iframe; data-height is optional, see the live-embed notes below -->
<iframe src="page.html" data-height="420"
        data-caption="Shown under the frame"></iframe>
```

Media cards are laid out in a grid. Only the media itself is sized to fit its cell — the
card hugs it, so the caption is exactly as wide as the media and no pale bar is left beside
it. A caption is text and is never scaled with the media; a live embed keeps its own layout
size and is scaled visually, so an embedded page is never reflowed to fit. The rules the
deck holds itself to are below.

### How a media panel is laid out

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
4. **The caption's height follows its content, inside a ceiling and a floor.** Its text takes
   at most a fifth of the card's height and, whenever the content allows, at least a tenth.
   Inside that range the deck takes the largest font that fits the text under the ceiling,
   never stepping down past the floor (nor below a legible 11px). A caption still over the
   ceiling is clipped to whole lines rather than allowed to grow — on a very wide, short cell
   a caption that gains a line as the card narrows is a card the width solve can only answer
   by squeezing to a sliver. The caption's padding is not text, so a caption is never clipped
   away entirely.
5. **The caption is never covered.** It sits below the media, no line of it is shortened, and
   nothing is laid over it: the enlarge button belongs to the media, in the media's own
   bottom-right corner, which is the one thing that can cover a corner of the media itself.
6. **A live embed owns its own box.** Its frame is never reflowed: the deck lays it out at
   the size it reports and scales that box to fit. If the embed's aspect ratio changes, the
   card re-fits around it and the grid arrangement stays as it was.

Nothing has to be declared up front: an image's ratio is read from the image, an embed
reports its own size, and a card whose media has not given the deck a size yet stays out of
sight — keeping its place in the grid — until it has. A step is therefore laid out once, in
the same frame it is switched to, and never corrected in front of the reader; the card then
fades in. `data-height` on a frame is the one thing worth writing, and only for an embed
that will never report (see below).

Loading the page with `?fit-debug` in the URL prints every fit to the console: the grid it
measured, the arrangement it kept, what each caption became, and each round of the width
solve. That is the log to attach to a report like "four cards on a 1920x444 screen come out
wrong".

Every media card carries an **enlarge button** in the bottom-right corner of the media
itself, so the caption below the media is never asked to make room for it. It fades in when
you point at the card (and stays visible where there is no hover). An image opens the
lightbox overlay; a live embed is enlarged by promoting its card to the top layer instead,
so the embedded page is never copied, reloaded or moved, and it keeps its state, its input
and its scroll position. Either way the media is scaled up as far as its own aspect ratio
allows and the box around it follows that size, so no black bars are left over. Esc, a
click outside, or the × closes it again.

## Live embeds & `livedeck-live.js`

The embed is an ordinary iframe, so anything works — a simulator, a demo, a widget. For
auto-sizing, include the tiny helper in the embedded page and call
`LiveDeck.live.autoResize()`. It reports the page size to the deck via `postMessage`, and
LiveDeck lays the frame out at its natural size before scaling it into the cell.

```html
<!-- page.html -->
<script src="../livedeck-live.js"></script>
<script>LiveDeck.live.autoResize();</script>
```

`data-height` on the source `<iframe>` is the height the frame is given before the embed
reports its own size, and the height it keeps if nothing ever reports. Include
`livedeck-live.js` and you do not need it — the report replaces it, and the card waits for
that report rather than being drawn at a height that then changes. Without the helper,
nothing reports, so the frame is fitted at `data-height` once it has loaded; leave that out
too and the deck falls back to the panel's own size, so pick a value that matches the
embedded page if you want it exact from the first paint.

The same page can be embedded several times — every frame is measured and scaled on its
own. An embed needs no name: the deck recognises a report by the window it came from, your
`src` is emitted exactly as written, and every copy of a page shares one URL and one cache
entry.

`LiveDeck.live` measures the page's **own box**, so give the embedded page an explicit
content width (e.g. `body { width: 520px }`). To measure something else, pass a custom
function:

```js
LiveDeck.live.autoResize({
  measure: function () { return { width: el.offsetWidth, height: el.scrollHeight }; }
});
```

## Programmatic use

```html
<script src="livedeck.js" data-auto="false"></script>
<script>
  var deck = LiveDeck.mount({
    lang: 'en',
    config: { title: 'My deck', accent: '#2563eb' },
    slides: [
      {
        section: 'Intro',
        title: 'Hello',
        content: '<p>Inline HTML</p>',
        media: [
          { type: 'img', src: 'pic.png', caption: 'An image' },
          { type: 'live', src: 'page.html', height: 420, caption: 'A demo' }
        ]
      }
    ]
  });

  deck.on('change', function (e) { console.log(e.index, e.slide.title); });
  deck.next();
  deck.go(3);
  deck.openOverview();
</script>
```

### `LiveDeck.mount(options)`

| Option | Default | Description |
|--------|---------|-------------|
| `config` | — | Overrides the `data-*` config. |
| `slides` | — | Array of slide objects (instead of the template). |
| `lang` | `en` | UI language key. |
| `i18n` | — | Per-language string overrides, e.g. `{ en: { next: 'Next ▶' } }`. |
| `renderers` | `{ img, live }` | Media renderers keyed by `type`, `(media, T) => htmlString`. Add an `empty` renderer to fully control the empty state. |
| `configSelector` | `#presentation-config, [data-livedeck-config]` | Where to read config. |
| `sourceSelector` | `#deck-source, template[data-livedeck-source]` | Where to read slides. |
| `mountTo` | `document.body` | Element the chrome is appended to. |
| `onReady` | — | Called with the instance as soon as it is mounted (the `ready` event is also emitted on the next tick). |

The returned instance exposes `go(i)`, `next()`, `prev()`, `openOverview()`,
`closeOverview()`, `toggleOverview()`, `toggleFullscreen()`, `refit()`, `on()`, `off()`
and `destroy()`, plus `index`, `total`, `config`, `slides` and `element`.

> **Note:** the framework builds a single set of UI elements (top bar, nav, overview, …),
> so one deck per page is supported.

## Keyboard & touch

| Key | Action |
|-----|--------|
| `→` / `PageDown` / `Space` | Next |
| `←` / `PageUp` | Previous |
| `Home` / `End` | First / last |
| `G` / `Esc` | Overview |
| `F` | Fullscreen |

Swipe left/right on touch devices; portrait phones get a "rotate" hint.

Every step is a URL (`#step-3`), and moving to one pushes a history entry, so the browser's
Back and Forward walk through the steps you visited and any step can be linked to. A move
that does not actually change the step — `←` on the first step, say — adds no entry.

## i18n

Built-in languages: `en`, `zh-CN`. Add or override any string:

```js
LiveDeck.i18n.fr = {
  next: 'Suivant ▶',
  prev: '◀ Précédent',
  overviewHead: '📑 Aller à une étape',
  emptyTitle: 'Aucun média',
  emptyHint: ''
};
```

The empty state is intentionally author-controlled: `emptyHint` is empty by default, and you
can replace the whole state with a custom `renderers.empty`. Keys you don't define in a
custom language fall back to the built-in `en` strings.

## Theming

Set `data-accent` / `data-accent2`, or override the CSS variables in `livedeck.css`:

```css
:root {
  --accent: #2563eb;
  --accent2: #7c3aed;
  --bg: #eef1f7;
  --panel-left: #ffffff;
  --panel-right: #f7f9fd;
  --text: #1f2937;
  --muted: #6b7280;
}
```

The content components (`.note`, `.code-block`, `.formula-block`, `.table-wrap`,
`.checklist`, …) are part
of the bundled stylesheet; replace that section with your own theme if you like.

`.code-block` and `.formula-block` are dedented automatically: when the block's
text starts on its own line, the common leading indentation is removed. So you can
indent the markup naturally without that indentation showing up in the rendered
code. (Starting the text right after the opening tag opts out and preserves it
verbatim.)

## Project layout

```
livedeck.js          # framework (UMD)
livedeck.css         # framework + default content components
livedeck-live.js     # helper for live iframe embeds
examples/
  build.sh           # assembles the example site into _site/
  site/
    index.html       # the tutorial deck (also the site's home page)
    assets/          # example images
    live/            # example embedded page
```

## Build the example

```sh
sh examples/build.sh _site      # copies livedeck.* + examples/site into _site/
# then serve _site/ with any static server
python3 -m http.server -d _site 8080
```

## Browser support

Evergreen browsers (Chrome, Edge, Firefox, Safari). Requires `ResizeObserver` (for live
embeds) and standard ES2015+ DOM APIs (`Object.assign`, `Element.append`/`Element.closest`,
`NodeList.forEach`, `String.padStart`, …).

Enlarging a live embed additionally needs the Popover API (Chrome 114+, Safari 17+,
Firefox 125+); without it those cards simply have no enlarge button. Images use the
lightbox overlay and enlarge everywhere.

## License

[MIT](LICENSE) © 2026 Jiajie Chen
