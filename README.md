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

Media cards are laid out in equal cells (`ceil(sqrt(n))` columns) and scaled by both
width and height, so a mixed grid of images and live embeds always fits.

Every media card carries an **enlarge button** in its bottom-right corner. It fades in when
you point at the card (and stays visible where there is no hover). An image opens the
lightbox overlay; a live embed is enlarged by promoting its card to the top layer instead,
so the embedded page is never copied, reloaded or moved, and it keeps its state, its input
and its scroll position. Esc, a click outside, or the × closes it again.

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

`data-height` on the source `<iframe>` is the height the frame is given **before** the embed
reports its own size, and the height it keeps if nothing ever reports. Include
`livedeck-live.js` and you do not need it — the report replaces it, so it only affects the
first paint (leave it out and 420 is used). Without the helper, nothing reports and the
height stays at `data-height`: the deck lays the frame out at that height and scales the
whole box into the cell, so pick a value that matches the embedded page.

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
