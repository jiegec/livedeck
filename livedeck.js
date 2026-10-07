/*! LiveDeck v0.1.0 — interactive web slides.
 *  Turns a normal HTML page into a full-screen, two-column deck:
 *  content on the left, media (images / live iframes) on the right.
 *  Everything (config + slides) can be declared in HTML and read by this file,
 *  or passed programmatically to LiveDeck.mount().
 *  MIT licensed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.LiveDeck = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '0.1.0';
  var DEFAULT_LANG = 'en';

  /* ================================================================== *
   * i18n — built-in UI strings. Select with CONFIG.lang (data-lang),
   * add/override with `options.i18n` or by mutating LiveDeck.i18n.
   * ================================================================== */
  var i18n = {
    en: {
      menu: 'Overview (G)',
      fullscreen: 'Fullscreen (F)',
      prev: '◀ Prev',
      next: 'Next ▶',
      done: '🎉 Done',
      prevTitle: 'Previous (←)',
      nextTitle: 'Next (→)',
      overviewHead: '📑 Jump to a step (click, press G to close)',
      visited: 'Seen ✔',
      closeTitle: 'Close (Esc)',
      zoomTitle: 'Enlarge',
      rotateTitle: 'Please rotate your phone',
      rotateText: 'This deck uses a two-column layout.<br>Landscape looks best.',
      rotateContinue: 'Continue in portrait',
      emptyIcon: '🖼️',
      emptyTitle: 'No media on this slide',
      // emptyHint is intentionally empty and left to the author
      emptyHint: '',
    },
    'zh-CN': {
      menu: '总览 (G)',
      fullscreen: '全屏 (F)',
      prev: '◀ 上一步',
      next: '下一步 ▶',
      done: '🎉 完成',
      prevTitle: '上一步 (←)',
      nextTitle: '下一步 (→)',
      overviewHead: '📑 选择一步（点击跳转，G 键关闭）',
      visited: '已看 ✔',
      closeTitle: '关闭 (Esc)',
      zoomTitle: '放大',
      rotateTitle: '请将手机横屏',
      rotateText: '本演示采用左右双栏布局，<br>横屏观看效果最佳。',
      rotateContinue: '仍要继续（竖屏）',
      emptyIcon: '🖼️',
      emptyTitle: '本页没有媒体',
      // emptyHint 默认留空，由作者自行决定
      emptyHint: '',
    },
  };

  function resolveI18n(lang, override) {
    // Start from the default language so a partial custom language inherits
    // any keys it doesn't define.
    var base = Object.assign({}, i18n[DEFAULT_LANG], i18n[lang] || {});
    var o = override || {};
    var scoped = o[lang];
    // Accept either { next: '…' } (applies to the active language) or
    // { en: { next: '…' } } (per-language overrides).
    if (scoped && typeof scoped === 'object') return Object.assign({}, base, scoped);
    return Object.assign({}, base, o);
  }

  /* ================================================================== *
   * helpers
   * ================================================================== */
  // Escape using the browser's own HTML serializer (no regex list to keep in
  // sync). The detached node is created lazily; a regex fallback keeps this
  // usable outside a DOM (e.g. when the file is require()d in Node).
  var escapeNode = null;
  function escHtml(s) {
    s = String(s == null ? '' : s);
    if (typeof document === 'undefined') {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    if (!escapeNode) escapeNode = document.createElement('div');
    escapeNode.textContent = s;
    return escapeNode.innerHTML;
  }
  function escAttr(s) {
    // A quoted attribute additionally needs the double quote escaped.
    return escHtml(s).replace(/"/g, '&quot;');
  }

  // Remove the leading blank line and the common indentation shared by the
  // remaining lines. Applied only when a block's text starts on a new line, so
  // content written flush against the tag is left untouched. This lets authors
  // indent <pre>/code blocks inside the markup without that indentation showing.
  function dedentBlock(text) {
    var s = String(text);
    if (!/^[ \t]*\r?\n/.test(s)) return s;
    var lines = s.replace(/^[ \t]*\r?\n/, '').replace(/\s+$/, '').split('\n');
    var min = Infinity;
    lines.forEach(function (line) {
      if (!line.trim()) return;
      var n = line.match(/^[ \t]*/)[0].length;
      if (n < min) min = n;
    });
    if (!isFinite(min) || min === 0) return lines.join('\n');
    return lines.map(function (line) { return line.slice(min); }).join('\n');
  }

  /* ================================================================== *
   * default media renderers — keyed by media.type.
   * Each renderer is (media, T) => HTML string. Override or add your own
   * via `options.renderers`.
   * ================================================================== */
  var renderers = {
    img: function (m) {
      var alt = m.alt != null ? m.alt : m.caption;
      // The image gets a box of its own: the enlarge button is positioned inside it,
      // in the media's bottom-right corner, so the caption below is never asked to
      // make room for the button.
      return '<figure class="media-card image-card">' +
        '<div class="media-box">' +
        '<img src="' + escAttr(m.src) + '" alt="' + escAttr(alt) + '" loading="eager" decoding="async">' +
        '</div>' +
        (m.caption ? '<figcaption>' + escHtml(m.caption) + '</figcaption>' : '') +
        '</figure>';
    },
    live: function (m) {
      // No size is invented for an embed: the deck measures it at runtime, from the
      // report its page sends (livedeck-live.js) or, for a page that never reports,
      // from the cell it is given.
      // The src is emitted exactly as the author wrote it. An embed carries no
      // identifier at all: the deck tells reports apart by the window they came
      // from, so nothing has to name it (a slide has data-index, its media cards
      // are .media-card, if you need to target one from CSS).
      return '<div class="media-card live-card">' +
        '<div class="live-wrap">' +
        '<iframe class="live-frame"' +
        ' src="' + escAttr(m.src) + '" scrolling="no" loading="eager"' +
        ' title="' + escAttr(m.caption || '') + '"' +
        ' style="width:100%;border:0;"></iframe>' +
        '</div>' +
        (m.caption ? '<div class="caption">' + escHtml(m.caption) + '</div>' : '') +
        '</div>';
    },
  };

  /* ================================================================== *
   * read the content contract from the HTML
   * ================================================================== */
  function readConfig(options) {
    var el = document.querySelector(options.configSelector || '#presentation-config, [data-livedeck-config]');
    var d = (el && el.dataset) || {};
    var o = options.config || {};
    function pick(a, b) { return a != null ? a : b; }
    return {
      title: pick(o.title, d.title || ''),
      subtitle: pick(o.subtitle, d.subtitle || ''),
      accent: pick(o.accent, d.accent || '#2563eb'),
      accent2: pick(o.accent2, d.accent2 || o.accent || d.accent || '#7c3aed'),
      lang: options.lang || o.lang || d.lang || document.documentElement.lang || DEFAULT_LANG,
      fullScreenOnLoad: !!(pick(o.fullScreenOnLoad, d.fullscreenOnLoad === 'true')),
      showOverviewOnLoad: !!(pick(o.showOverviewOnLoad, d.overviewOnLoad === 'true')),
    };
  }

  function readSlides(options) {
    var tpl = document.querySelector(options.sourceSelector || '#deck-source, template[data-livedeck-source]');
    if (!tpl) return [];
    var root = tpl.content || tpl;
    return Array.prototype.slice.call(root.querySelectorAll('.slide-source, [data-livedeck-slide]')).map(function (sec) {
      var contentEl = sec.querySelector('[data-content]');
      var mediaWrap = sec.querySelector('[data-media]');
      var media = mediaWrap ? Array.prototype.slice.call(mediaWrap.children).map(function (el) {
        if (el.tagName === 'IFRAME') {
          return {
            type: 'live',
            src: el.getAttribute('src') || '',
            caption: el.getAttribute('data-caption') || '',
          };
        }
        var alt = el.getAttribute('alt');
        var cap = el.getAttribute('data-caption');
        return {
          type: el.getAttribute('data-type') || 'img',
          src: el.getAttribute('src') || '',
          alt: alt,
          // An image that carries no data-caption is captioned by its alt text: it is the
          // same sentence, and a page should only have to write it once. It is the
          // attribute's presence that decides, so data-caption="" still means "none".
          caption: cap !== null ? cap : (alt || ''),
        };
      }) : [];
      return {
        section: sec.getAttribute('data-section') || '',
        title: sec.getAttribute('data-title') || '',
        content: contentEl ? contentEl.innerHTML : '',
        // data-full: the step's content is meant to be read on its own, so with no media
        // it takes the whole width instead of leaving the media column empty.
        full: !!(contentEl && contentEl.hasAttribute('data-full')),
        media: media,
      };
    });
  }

  function normalizeSlide(s) {
    s = s || {};
    return {
      section: s.section || '',
      title: s.title || '',
      content: s.content != null ? s.content : '',
      full: !!s.full,
      media: (Array.isArray(s.media) ? s.media : (s.media == null ? [] : [s.media])).map(function (m) {
        if (typeof m === 'string') return { type: 'img', src: m, caption: '' };
        var type = m.type || 'img';
        var alt = m.alt != null ? m.alt : null;
        return {
          type: type,
          src: m.src || '',
          alt: alt,
          // As in the markup: an image with no caption of its own is captioned by its alt
          // text, and an explicit caption: '' still means "none".
          caption: m.caption != null ? m.caption : (type === 'img' ? (alt || '') : ''),
        };
      }),
    };
  }

  /* ================================================================== *
   * chrome — LiveDeck builds its own UI so the host page stays content-only
   * ================================================================== */
  function buildChrome(mountTo, T) {
    var topbar = document.createElement('header');
    topbar.id = 'ld-topbar';
    topbar.className = 'ld-topbar';
    topbar.innerHTML =
      '<button class="tb-btn" id="ld-btn-menu" title="' + escAttr(T.menu) + '">☰</button>' +
      '<div id="ld-section-label" class="ld-section-label"></div>' +
      '<div id="ld-progress-outer"><div id="ld-progress-inner"></div></div>' +
      '<button class="tb-btn" id="ld-btn-fullscreen" title="' + escAttr(T.fullscreen) + '">⛶</button>';

    var deck = document.createElement('main');
    deck.id = 'deck';

    var lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.innerHTML =
      '<div class="lb-box">' +
      '<button class="lb-close" title="' + escAttr(T.closeTitle) + '">×</button>' +
      '<img class="lb-img" alt="">' +
      '<div class="lb-cap"></div>' +
      '</div>';

    var navbar = document.createElement('footer');
    navbar.id = 'navbar';
    navbar.innerHTML =
      '<button class="nav-btn" id="btn-prev" title="' + escAttr(T.prevTitle) + '">' + escHtml(T.prev) + '</button>' +
      '<div id="step-indicator">1 / 1</div>' +
      '<button class="nav-btn" id="btn-next" title="' + escAttr(T.nextTitle) + '">' + escHtml(T.next) + '</button>';

    var overview = document.createElement('div');
    overview.id = 'overview';
    overview.innerHTML =
      '<h2 class="overview-head">' + T.overviewHead + '</h2>' +
      '<div class="overview-grid"></div>';

    var rotate = document.createElement('div');
    rotate.id = 'rotate-overlay';
    rotate.className = 'rotate-overlay';
    rotate.innerHTML =
      '<div class="rotate-box">' +
      '<div class="rotate-icon">📱↻</div>' +
      '<h2>' + T.rotateTitle + '</h2>' +
      '<p>' + T.rotateText + '</p>' +
      '<button id="rotate-continue" class="ghost-btn">' + T.rotateContinue + '</button>' +
      '</div>';

    mountTo.append(topbar, deck, lightbox, navbar, overview, rotate);
    return [topbar, deck, lightbox, navbar, overview, rotate];
  }

  /* ================================================================== *
   * mount(options) -> instance
   * ================================================================== */
  function mount(options) {
    options = options || {};
    var doc = document;
    var CONFIG = readConfig(options);
    var T = resolveI18n(CONFIG.lang, options.i18n);
    var SLIDES = options.slides
      ? (Array.isArray(options.slides) ? options.slides : [options.slides]).map(normalizeSlide)
      : readSlides(options);
    if (!SLIDES.length) {
      console.warn('[livedeck] no slides found (looked for .slide-source in a template)');
      return null;
    }

    var mediaRenderers = Object.assign({}, renderers, options.renderers || {});
    var mountTo = options.mountTo || doc.body;
    var total = SLIDES.length;

    // Book-keeping so destroy() can remove everything we attach.
    var listeners = [];
    function on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      listeners.push([target, type, fn, opts]);
    }
    var timers = [];
    var destroyed = false;
    function later(fn, ms) {
      var id = setTimeout(function () {
        timers = timers.filter(function (t) { return t !== id; });
        if (!destroyed) fn();
      }, ms);
      timers.push(id);
      return id;
    }
    var events = {};
    function emit(name, payload) {
      (events[name] || []).forEach(function (fn) {
        try { fn(payload); } catch (e) { console.error(e); }
      });
    }

    var chromeNodes = buildChrome(mountTo, T);
    var topbar = chromeNodes[0];
    var deck = chromeNodes[1];
    var lightbox = chromeNodes[2];
    var navbar = chromeNodes[3];
    var overview = chromeNodes[4];
    var rotateOverlay = chromeNodes[5];

    // Theme (remember previous values so destroy() can restore them)
    var rootStyle = doc.documentElement.style;
    var prevAccent = rootStyle.getPropertyValue('--accent');
    var prevAccent2 = rootStyle.getPropertyValue('--accent2');
    var prevTitle = doc.title;
    rootStyle.setProperty('--accent', CONFIG.accent);
    rootStyle.setProperty('--accent2', CONFIG.accent2);
    if (CONFIG.title || CONFIG.subtitle) {
      doc.title = [CONFIG.title, CONFIG.subtitle].filter(Boolean).join(' · ');
    }

    var current = 0;
    var visited = new Array(total).fill(false);

    // The empty state is fully author-controlled: provide a renderer called
    // `empty` (see options.renderers) and/or the i18n keys emptyTitle/emptyHint.
    function buildMedia(media) {
      if (!media || !media.length) {
        if (mediaRenderers.empty) return mediaRenderers.empty({ type: 'empty' }, T);
        return '<div class="media-empty">' +
          (T.emptyIcon ? '<div class="media-empty-icon">' + T.emptyIcon + '</div>' : '') +
          (T.emptyTitle ? '<div class="media-empty-title">' + escHtml(T.emptyTitle) + '</div>' : '') +
          (T.emptyHint ? '<div class="media-empty-sub">' + escHtml(T.emptyHint) + '</div>' : '') +
          '</div>';
      }
      return media.map(function (m) {
        var render = mediaRenderers[m.type] || mediaRenderers.img;
        return render(m, T);
      }).join('');
    }

    // Render every slide
    SLIDES.forEach(function (s, i) {
      var el = doc.createElement('section');
      el.className = 'slide';
      el.dataset.index = i;
      // A step marked data-full that has no media is read on its own: the media column is
      // not drawn at all, so no empty panel is left beside the words.
      var full = s.full && !s.media.length;
      el.innerHTML =
        '<div class="slide-inner' + (full ? ' is-full' : '') + '">' +
        '<div class="panel left-panel">' +
        '<div class="fit-wrap"><div class="panel-inner">' +
        (s.section ? '<div class="section-badge">' + escHtml(s.section) + '</div>' : '') +
        (s.title ? '<h2 class="slide-title">' + escHtml(s.title) + '</h2>' : '') +
        '<div class="ld-content">' + s.content + '</div>' +
        '</div></div></div>' +
        (full ? '' :
          '<div class="panel right-panel">' +
          '<div class="fit-wrap"><div class="panel-inner media-inner">' +
          '<div class="media-grid">' + buildMedia(s.media) + '</div>' +
          '</div></div></div>') +
        '</div>';
      deck.appendChild(el);
      // Strip the markup indentation from code/formula blocks authored on their
      // own indented lines (see dedentBlock).
      Array.prototype.slice.call(el.querySelectorAll('.code-block, .formula-block')).forEach(function (block) {
        if (!block.children.length) block.textContent = dedentBlock(block.textContent);
      });
    });

    var slides = Array.prototype.slice.call(deck.querySelectorAll('.slide'));

    /* ---------- Fit-to-panel scaling ---------- */
    function fitPanel(panel, left) {
      var wrap = panel.querySelector('.fit-wrap');
      var inner = panel.querySelector('.panel-inner');
      var W = panel.clientWidth, H = panel.clientHeight;
      if (!W || !H) return; // hidden slide
      if (!left) {
        // Right column: the grid already fills the area, just hide overflow.
        wrap.style.transform = 'scale(1)';
        wrap.style.width = '100%';
        wrap.style.height = H + 'px';
        panel.style.overflow = 'hidden';
        panel.dataset.scale = '1';
        return;
      }
      // Reset to natural size so we can measure.
      wrap.style.transform = 'scale(1)';
      wrap.style.height = 'auto';
      inner.style.width = '100%';
      // Lay the content out for a candidate scale (widen, then scale down) and
      // report how tall it then measures.
      function measure(atScale) {
        inner.style.width = (W / atScale) + 'px';
        return wrap.scrollHeight;
      }
      var scale = 1;
      for (var k = 0; k < 8; k++) {
        var contentH = measure(scale);
        if (!contentH) break; // nothing laid out yet
        var ns = Math.sqrt(H / contentH * scale); // fill the panel height
        if (Math.abs(ns - scale) < 0.006) { scale = ns; break; }
        scale = ns;
      }
      // A width change can reflow the text by a whole line, and the loop above
      // stops as soon as it is merely close — so check the final size against a
      // real measurement and shrink until it actually fits, or overflow:hidden
      // would clip the last line.
      for (var j = 0; j < 6; j++) {
        var fitted = measure(scale);
        if (!fitted || fitted * scale <= H) break;
        scale = H / fitted;
      }
      inner.style.width = (W / scale) + 'px';
      wrap.style.width = '100%';
      wrap.style.height = H + 'px';
      wrap.style.transformOrigin = 'top left';
      wrap.style.transform = 'scale(' + scale + ')';
      panel.dataset.scale = scale.toFixed(3);
      panel.style.overflow = 'hidden';
    }

    /* ---------- Right media: equal cells, fit by width & height ---------- */
    // Load the deck with ?fit-debug in the URL and every fit prints its numbers:
    // what the grid measured, what each caption became, and each round of the width
    // solve. Meant for reports like "four cards on a 1920x444 screen come out wrong".
    var DEBUG = /[?&]fit-debug/.test(location.search);
    function r1(x) { return Math.round(x * 10) / 10; }
    function fitLog(msg) { if (DEBUG) console.log('[livedeck fit] ' + msg); }

    // The ratio a card's media wants, which is all it takes to tell arrangements
    // apart; 0 means it is not known yet (an image still loading, an embed that has
    // not reported), and the caller substitutes a square, which can only mislead the
    // choice of grid, never the card's own layout.
    function mediaRatio(card) {
      var img = card.querySelector('img');
      if (img) return (img.naturalWidth && img.naturalHeight) ? img.naturalHeight / img.naturalWidth : 0;
      var frame = card.querySelector('.live-frame');
      var w = frame ? parseFloat(frame.dataset.natW) : 0;
      var h = frame ? parseFloat(frame.dataset.natH) : 0;
      return (w && h) ? h / w : 0;
    }

    // A card keeps its media's ratio and is scaled down to fit its cell, so a cell
    // wider than the media wants wastes width and a taller one wastes height. The
    // arrangement whose cells waste least shows the most media, and a fixed
    // ceil(sqrt(n)) grid is not always it: on a 1920x444 panel, four wide cards are
    // half again as large in one row as in two, while four tall ones on a portrait
    // panel want the 2x2. Every column count is tried; the rows are the fewest that
    // hold the cards, so 4 cards mean 1x4, 2x2 or 4x1 and 3 cards mean 1x3, 2x2 or
    // 3x1. Ties keep the first (fewest columns), so the choice is deterministic.
    function chooseArrangement(n, gW, gH, colGap, rowGap, ratios, capPad) {
      var fallback = Math.max(1, Math.ceil(Math.sqrt(n)));
      var best = { cols: fallback, rows: Math.ceil(n / fallback), area: -1 };
      for (var cols = 1; cols <= n; cols++) {
        var rows = Math.ceil(n / cols);
        var cellW = (gW - (cols - 1) * colGap) / cols;
        var cellH = (gH - (rows - 1) * rowGap) / rows;
        if (!(cellW > 0) || !(cellH > 0)) continue;
        // The caption's ceiling is on its text; its own padding rides on top of that and
        // is not media either.
        var room = Math.max(1, cellH * (1 - CAPTION_MAX) - capPad);
        var area = 0;
        for (var i = 0; i < n; i++) {
          var w = Math.min(cellW, room / ratios[i]);
          area += w * w * ratios[i];
        }
        if (area > best.area) { best.cols = cols; best.rows = rows; best.area = area; }
      }
      return best;
    }

    // The arrangement is the deck's memory of one panel. It is settled once every card's
    // ratio is known, and after that only the room the panel offers can change it — a
    // window resize. A card whose media changes size later (an embed that reflows, an
    // image that finally loads) re-sizes inside its own cell: shuffling the grid under
    // the reader is exactly the jitter this avoids.
    // What a caption adds to its text: the padding the theme gives it. It is measured
    // rather than assumed, and it is the same for every card in a deck.
    function captionPadding(card) {
      var cap = card && card.querySelector('figcaption, .caption');
      if (!cap) return 0;
      var cs = getComputedStyle(cap);
      return (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    }

    function arrangeGrid(grid, n, gW, gH, colGap, rowGap, ratios, capPad) {
      var size = gW + 'x' + gH;
      var known = true;
      for (var i = 0; i < n; i++) if (!(ratios[i] > 0)) known = false;
      var remembered = grid.dataset.cols;
      if (remembered && grid.dataset.gridSize === size && (grid.dataset.ratiosKnown === '1' || !known)) {
        fitLog('arrangement ' + remembered + 'x' + grid.dataset.rows + ' kept for ' + size);
        return { cols: +remembered, rows: +grid.dataset.rows };
      }
      var pick = chooseArrangement(n, gW, gH, colGap, rowGap, ratios.map(function (r) { return r || 1; }), capPad);
      grid.dataset.cols = pick.cols;
      grid.dataset.rows = pick.rows;
      grid.dataset.gridSize = size;
      grid.dataset.ratiosKnown = known ? '1' : '';
      fitLog('arrangement ' + pick.cols + 'x' + pick.rows + ' for ' + size +
        (remembered ? ' (was ' + remembered + 'x' + grid.dataset.rows + ')' : '') +
        ' ratios ' + (known ? 'all known' : 'some unknown'));
      return pick;
    }

    function layoutMedia(panel) {
      var grid = panel.querySelector('.media-grid');
      if (!grid) return;
      var cards = Array.prototype.slice.call(grid.querySelectorAll('.media-card'));
      var N = cards.length;
      if (!N) return;
      // Measured and fitted here, in the caller's frame: the grid's own size does not
      // depend on the template set below, and a step that is switched to and then
      // fitted a frame later is a step whose media is painted twice.
      var gW = grid.clientWidth, gH = grid.clientHeight;
      if (!gW || !gH) return;
      var gcs = getComputedStyle(grid);
      var colGap = parseFloat(gcs.columnGap) || 0;
      var rowGap = parseFloat(gcs.rowGap) || 0;
      var ratios = cards.map(mediaRatio);
      var pick = arrangeGrid(grid, N, gW, gH, colGap, rowGap, ratios, captionPadding(cards[0]));
      var cols = pick.cols, rows = pick.rows;
      grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
      grid.style.gridAutoRows = 'minmax(0, 1fr)';
      var cellW = (gW - (cols - 1) * colGap) / cols;
      var cellH = (gH - (rows - 1) * rowGap) / rows;
      fitLog('grid ' + gW + 'x' + gH + ' gap ' + colGap + '/' + rowGap + ' cards ' + N +
        ' ratios ' + ratios.map(r1).join('/') + ' -> ' + cols + 'x' + rows +
        ' cell ' + r1(cellW) + 'x' + r1(cellH) + ' area ' + Math.round(pick.area));
      cards.forEach(function (card, i) {
        var cap = card.querySelector('figcaption, .caption');
        var tag = 'card ' + (i + 1) + '/' + N + ' ' + (card.classList.contains('live-card') ? 'live' : 'image');
        // A caption's own size depends on how wide the card ends up, and the card's
        // size depends on how tall the caption is, so the two are settled together:
        // settle the caption, fit the card, and go round again until a fit reproduces
        // the width its caption was settled for. Two rounds are the usual case; the
        // cap on the caption is what stops the rounds from chasing each other.
        var ceiling = captionCeiling(card, cellW, cellH);
        var lastW = -1;
        for (var pass = 1; pass <= 6; pass++) {
          settleCaption(cap, ceiling, tag + ' p' + pass);
          var w = fitCard(card, cellW, cellH, tag + ' p' + pass);
          if (w === lastW) break;
          lastW = w;
        }
      });
      fitLog('grid done');
    }

    // Returns the width the card settled on, which is what tells the caller whether
    // the caption it just settled was settled for the right width.
    function fitCard(card, cellW, cellH, tag) {
      if (card.classList.contains('live-card')) fitLiveCard(card, cellW, cellH, tag);
      else fitImageCard(card, cellW, cellH, tag);
      return card.offsetWidth;
    }

    // How tall a caption may get. A card whose media is pinned by the cell's *height* —
    // the media at the cell's full width would not fit — can only spare CAPTION_MAX of
    // it, which is what keeps the media its room. A card pinned by the *width* has
    // whatever the media does not use, so the caption keeps the size its words want and
    // the media keeps the size its ratio wants: neither pays for the other.
    function captionCeiling(card, cellW, cellH) {
      var share = cellH * CAPTION_MAX;
      var ratio = mediaRatio(card);
      if (!(ratio > 0)) return share; // ratio unknown yet: assume the tight case
      var full = cellW * ratio; // the media at the cell's full width
      return full > cellH - share ? share : Math.max(share, cellH - full);
    }

    // A caption is text and is never scaled with the media, but it may not eat the card
    // either: on a phone a few lines of body text are most of the room the image needs,
    // and on a very wide, short cell (1920x444 with four cards) a caption that keeps
    // gaining a line as the card narrows is what the width solve below cannot satisfy —
    // it chases the caption down and collapses the card into a column that overflows the
    // cell. So the caption's whole box — text and padding — gets at most the ceiling
    // captionCeiling() worked out (see there), and the font steps down until it fits, with
    // no floor under it: a caption too small to read is still better than one that is cut
    // off.
    //
    // The padding is never spent on its own. It is written as a share of the font size —
    // the proportion the theme itself gives it — so text and padding come down together
    // and the caption keeps its shape. Sacrificing the padding first would leave a large
    // font in a box with no room around it, which reads as a mistake; and it would ride on
    // top of the ceiling, narrowing the card by exactly that much and feeding the wrap
    // count back into the width solve. Returns true when a decision moved, which the fit
    // log reports.
    var CAPTION_MAX = 0.2;
    function settleCaption(cap, ceiling, tag) {
      if (!cap) return false;
      var changed = false;
      // Everything is decided from the caption's own text, so neither the size nor the
      // padding the last settle left may colour the measurement.
      var had = cap.style.getPropertyValue('--cap-size');
      var hadPad = cap.style.padding;
      cap.style.removeProperty('--cap-size');
      cap.style.padding = '';
      cap.style.maxHeight = ''; // an enlarged card's scroll band does not belong here
      var cs = getComputedStyle(cap);
      var base = parseFloat(cs.fontSize) || 16;
      var em = function (v) { return Math.round(100 * (parseFloat(v) || 0) / base) / 100 + 'em'; };
      var padStyle = [em(cs.paddingTop), em(cs.paddingRight), em(cs.paddingBottom), em(cs.paddingLeft)].join(' ');
      cap.style.padding = padStyle;
      if (hadPad !== padStyle) changed = true;
      var size = 0; // 0: the stylesheet's own size is what fits
      if (cap.offsetHeight > ceiling) {
        // The largest size whose whole box still fits, found by halving the range. There is
        // no floor under it, and the text is never clipped, so a caption that will not fit
        // any other way is allowed to become unreadably small.
        var lo = 0.5, hi = base;
        for (var i = 0; i < 8 && hi - lo > 0.5; i++) {
          var mid = (lo + hi) / 2;
          cap.style.setProperty('--cap-size', mid + 'px');
          if (cap.offsetHeight <= ceiling) lo = mid; else hi = mid;
        }
        size = lo;
      }
      var want = size > 0 ? size + 'px' : '';
      if (want) cap.style.setProperty('--cap-size', want);
      else cap.style.removeProperty('--cap-size');
      if (had !== want) changed = true;
      fitLog((tag || 'caption') + ': ceiling ' + r1(ceiling) + ' font ' + r1(size || base) +
        ' box ' + r1(cap.offsetHeight) + ' padding ' + padStyle + (changed ? ' (moved)' : ''));
      return changed;
    }

    // Fit a card around its media. Media are sized by layout, never by scaling
    // the card: a caption is text, and text that is scaled with the media turns
    // unreadable as soon as a big image or embed is scaled right down. The card
    // is exactly as wide as the media instead, so the caption hugs the media
    // rather than leaving a pale bar beside it — which means the caption's
    // height and the media's room depend on each other. `ratio` is the media's
    // height per unit of width; returns the width the media should take.
    function fitCardWidth(card, cellW, cellH, ratio, cap, tag) {
      var W = cellW; // the card's outer width: the caption wraps in W minus borders
      var m = 0, room = 0;
      for (var k = 0; k < 6; k++) {
        card.style.width = W + 'px';
        m = card.clientWidth || cellW;
        room = cellH - (cap ? cap.offsetHeight : 0);
        if (DEBUG) fitLog('  ' + (tag || 'solve') + ' round ' + (k + 1) + ': W ' + r1(W) + ' m ' + m +
          ' room ' + r1(room) + ' need ' + r1(m * ratio) + ' ratio ' + r1(ratio) +
          ' caption ' + (cap ? cap.offsetHeight : 0) + (room < 1 || m * ratio <= room ? ' -> stop' : ''));
        if (room < 1 || m * ratio <= room) break;
        W += room / ratio - m; // the width whose media fills the room exactly
      }
      // A caption changes height only when it gains a line, so this settles in a
      // round or two. The clamp only bites for a caption that keeps growing as
      // the card narrows: the media then takes no more than the room measured.
      // room < 1 means the caption alone is taller than the cell — the media
      // stays at the width it had rather than collapsing to nothing.
      var mediaW = room > 1 ? Math.max(1, Math.min(m, room / ratio)) : m;
      card.style.width = (W + mediaW - m) + 'px';
      return mediaW;
    }

    // A card is only shown once the deck knows the size its media wants: a card
    // painted at a guessed size and corrected a frame later is what the eye
    // catches as a flicker on the first visit to a step. The wait normally ends
    // when the media's own signal arrives (an image's load or error, an embed's
    // report or load); PENDING_MS is only a last resort, because an embed is free
    // to tell the deck nothing at all and the card must not stay hidden for good.
    var PENDING_MS = 2000;
    function setPending(card, on) {
      if (on && card.dataset.shown) return; // once seen, a card is not hidden again
      if (on === card.classList.contains('pending')) return;
      if (!on) card.dataset.shown = '1';
      card.classList.toggle('pending', on);
      if (on) later(function () {
        if (destroyed || !card.classList.contains('pending')) return;
        card.classList.remove('pending');
        card.dataset.shown = '1';
        scheduleFit(); // fitted in the same frame, so the correction is never seen
      }, PENDING_MS);
    }

    function fitImageCard(card, cellW, cellH, tag) {
      var img = card.querySelector('img');
      if (!img) return;
      var cap = card.querySelector('figcaption') || card.querySelector('.caption');
      // An image has no size of its own until its bytes say so, and what it does
      // lay out as in the meantime — the alt text of a broken icon, say — is not a
      // size to fit. Load or error settles it, and the card stays out of sight in
      // the meantime; the whole deck measures its media at runtime, so nothing has
      // to be declared up front.
      if (!img.complete) {
        setPending(card, true);
        fitLog((tag || 'image') + ': not loaded yet, card waits');
        return;
      }
      // Measure the image at the widest the card may get, so the ratio does not
      // depend on the width being solved for.
      card.style.width = cellW + 'px';
      img.style.width = ''; // natural size, capped by the CSS max-width:100%
      img.style.height = '';
      var natW = img.offsetWidth;
      var natH = img.offsetHeight;
      setPending(card, false); // settled: the card may be shown…
      if (!natW || !natH) return; // …even when it settled into nothing to fit
      var ratio = natH / natW;
      fitLog((tag || 'image') + ': natural ' + r1(natW) + 'x' + r1(natH) + ' ratio ' + r1(ratio));
      var mediaW = fitCardWidth(card, cellW, cellH, ratio, cap, tag);
      img.style.width = mediaW + 'px';
      img.style.height = (mediaW * ratio) + 'px';
      fitLog((tag || 'image') + ': media ' + r1(mediaW) + 'x' + r1(mediaW * ratio) +
        ' card ' + card.offsetWidth + 'x' + card.offsetHeight);
    }

    function fitLiveCard(card, cellW, cellH, tag) {
      var wrap = card.querySelector('.live-wrap');
      var frame = card.querySelector('.live-frame');
      var cap = card.querySelector('.caption');
      var media = card.closest('.media-grid');
      if (!wrap || !frame) return;
      // An embed is laid out at its own size, so the deck has to learn that size
      // before it can fit the card. Until a report arrives the panel's own size is
      // the only honest guess: an embed lays itself out at the width it is given
      // and in the room it is given, so it is measured, not second-guessed.
      var NAT_W = parseFloat(frame.dataset.natW) || cellW;
      var natH = parseFloat(frame.dataset.natH) || cellH;
      var known = !!(frame.dataset.natW || frame.dataset.loaded);
      fitLog((tag || 'live') + ': embed ' + r1(NAT_W) + 'x' + r1(natH) + ' ratio ' + r1(natH / NAT_W) +
        ' (' + (known ? 'reported or loaded' : 'guessed from the panel') + ')');
      var mediaW = fitCardWidth(card, cellW, cellH, natH / NAT_W, cap, tag);
      // The frame keeps its own layout size — an embedded page is never reflowed
      // to fit — and is scaled inside a wrapper that takes the fitted size, so
      // the caption below it is exactly as wide as the embed.
      frame.style.width = NAT_W + 'px';
      frame.style.height = natH + 'px';
      frame.style.transformOrigin = 'top left';
      frame.style.transform = 'scale(' + (mediaW / NAT_W) + ')';
      wrap.style.width = mediaW + 'px';
      wrap.style.height = (mediaW * (natH / NAT_W)) + 'px';
      if (media) media.style.overflowY = 'visible';
      // Guessing is what has to be kept off the screen, so the card waits for the
      // embed's own report (or for it to finish loading) before it is shown at all.
      setPending(card, !known);
      fitLog((tag || 'live') + ': media ' + r1(mediaW) + 'x' + r1(mediaW * (natH / NAT_W)) +
        ' scale ' + r1(mediaW / NAT_W * 100) / 100 + ' card ' + card.offsetWidth + 'x' + card.offsetHeight);
    }

    var fitRaf;
    function fitCurrent() {
      if (zoomed) return; // the enlarged card is laid out by CSS while it is open
      var s = deck.querySelector('.slide.active');
      if (!s) return;
      Array.prototype.slice.call(s.querySelectorAll('.panel')).forEach(function (p) {
        fitPanel(p, p.classList.contains('left-panel'));
      });
      var mediaPanel = s.querySelector('.right-panel');
      if (mediaPanel) layoutMedia(mediaPanel);
    }
    function scheduleFit() {
      if (destroyed || fitRaf) return;
      fitRaf = requestAnimationFrame(function () { fitRaf = null; fitCurrent(); });
    }

    /* ---------- top bar + navigation ---------- */
    var sectionLabel = topbar.querySelector('#ld-section-label');
    var progressInner = topbar.querySelector('#ld-progress-inner');
    var stepIndicator = navbar.querySelector('#step-indicator');
    var nextBtn = navbar.querySelector('#btn-next');
    var prevBtn = navbar.querySelector('#btn-prev');

    function updateTop() {
      var s = SLIDES[current];
      sectionLabel.textContent = [s.section, s.title].filter(Boolean).join(' · ');
      progressInner.style.width = ((current + 1) / total * 100) + '%';
      stepIndicator.textContent = (current + 1) + ' / ' + total;
      nextBtn.innerHTML = current === total - 1 ? T.done : T.next;
    }

    // Keep the address bar on the current step. By default a step is *pushed*,
    // so the browser's Back/Forward walk the steps the reader visited, exactly
    // like the arrow keys do; 'replace' is for the step the deck starts on, and
    // 'none' for a move the browser itself asked for (a Back must not push the
    // step it is leaving).
    function recordStep(mode) {
      if (mode === 'none') return;
      var url = '#step-' + (current + 1);
      try {
        if (mode === 'replace') history.replaceState(null, '', url);
        else history.pushState(null, '', url);
      } catch (e) { /* file:// forbids history changes */ }
    }

    function go(index, mode) {
      if (destroyed) return;
      closeZoom();
      closeLightbox();
      index = Math.round(Number(index));
      if (!isFinite(index)) return;
      if (index < 0) index = 0;
      if (index > total - 1) { openOverview(); return; }
      var moved = index !== current;
      closeOverview();
      current = index;
      visited[current] = true;
      slides.forEach(function (el, i) { el.classList.toggle('active', i === current); });
      updateTop();
      scheduleFit();
      later(fitCurrent, 260);
      later(fitCurrent, 600);
      // A step that did not actually change (Prev on the first step, say) would
      // only fill the history with entries that go nowhere.
      recordStep(mode || (moved ? 'push' : 'none'));
      emit('change', { index: current, slide: SLIDES[current], total: total });
    }

    /* ---------- live iframe auto height ---------- */
    // Which card did this message come from? The sending window is the only
    // thing an embed cannot get wrong, so it is the only thing we match on: no
    // id has to be handed to the embed, in the URL or anywhere else, and an id
    // in the payload can never point at a card this deck doesn't own.
    function liveFrameFrom(source) {
      if (!source) return null;
      var frames = deck.querySelectorAll('iframe.live-frame');
      for (var i = 0; i < frames.length; i++) {
        if (frames[i].contentWindow === source) return frames[i];
      }
      return null;
    }

    on(window, 'message', function (e) {
      if (!e.data || e.data.type !== 'resize' || !e.data.height) return;
      var frame = liveFrameFrom(e.source);
      if (!frame) return;
      // While its card is enlarged the frame gets the whole viewport, so the
      // numbers it reports from in there must not become the grid's geometry.
      if (zoomed && zoomed.contains(frame)) return;
      if (e.data.width) { frame.dataset.natW = e.data.width; frame.style.width = e.data.width + 'px'; }
      frame.dataset.natH = e.data.height;
      frame.style.height = e.data.height + 'px';
      scheduleFit();
    });

    // Re-fit after images load / fonts are ready.
    deck.querySelectorAll('img').forEach(function (img) {
      on(img, 'load', scheduleFit);
      on(img, 'error', scheduleFit);
    });
    // An embed that reports nothing (no live helper in the page) is fitted at the
    // size it declared, once it has loaded. A frame whose load went by before the
    // deck was mounted never fires one, so ask the document itself where that is
    // allowed; a cross-origin frame can only be vouched for by a report.
    deck.querySelectorAll('iframe.live-frame').forEach(function (frame) {
      on(frame, 'load', function () { frame.dataset.loaded = '1'; scheduleFit(); });
      try {
        if (frame.contentDocument && frame.contentDocument.readyState === 'complete') frame.dataset.loaded = '1';
      } catch (e) { /* cross-origin: nothing to read */ }
    });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(scheduleFit);

    /* ---------- image lightbox ---------- */
    var lbBox = lightbox.querySelector('.lb-box');
    var lbImg = lightbox.querySelector('.lb-img');
    var lbCap = lightbox.querySelector('.lb-cap');
    // Natural size of the image on show: the card's copy is already decoded, so
    // passing it in lets the first fit happen before the lightbox's own copy has
    // reported a size (and without a frame of the old, box-filling layout).
    var lbNat = [0, 0];
    // The lightbox hugs its image: scale it to the largest size with its own
    // aspect ratio that fits the room, then take that size for the box, so the
    // image is as large as it can be and no black bars are left on any side.
    // (The live lightbox below works the same way, hence the same shape.)
    // A lightbox shows the caption at the theme's size, which on a narrow screen can be
    // far taller than the lightbox itself. It gets a band of its own to scroll in: the
    // media keeps the rest of the box, the box stays inside the viewport, and no line of
    // the caption is cut off. Returns the height that band takes.
    var LIGHTBOX_CAP = 0.4;
    function capBand(box, cap) {
      if (!cap || cap.hidden || !cap.offsetHeight) return 0;
      cap.style.maxHeight = '';
      cap.style.maxHeight = Math.max(1, Math.round(box.clientHeight * LIGHTBOX_CAP)) + 'px';
      return cap.offsetHeight;
    }

    /* ---------- zooming the media further ----------
     * Both lightboxes show the media at the largest size that fits, and then let the reader
     * go further: a trackpad pinch (which arrives as a wheel event with ctrlKey set — the
     * browser's own signal for a page zoom, so it has to be taken and prevented), a
     * two-finger pinch on a touch screen, or a double click/tap to toggle. The media is
     * transformed, never laid out again, just as the fit scales an embed rather than
     * reflowing it. What stays put is the point under the fingers, which is the whole
     * difference between this and a slider. */
    var VIEW_MAX = 8;
    var view = { el: null, box: null, capEl: null, max: null, media: null, cap: 0, z: 1, x: 0, y: 0 };
    // The box grows with the zoom, as far as the viewport lets it: zooming into a detail
    // should show more of it, not the same slice magnified — a 2x zoom in a box already at
    // the page's height doubles its width and leaves the height alone. The media itself is
    // only transformed, so the extra room is room to see, never a re-layout.
    function sizeBox() {
      if (!view.box || !view.media || !view.max) return;
      view.box.style.width = Math.min(view.max.w, view.media.w * view.z) + 'px';
      // The caption re-wraps at the new width, so measure it before giving the box its height.
      if (view.capEl) view.cap = view.capEl.offsetHeight;
      view.box.style.height = Math.min(view.max.h, view.media.h * view.z + view.cap) + 'px';
    }
    function clampView() {
      // What is visible is the box, grown and capped, less the caption's band — not the
      // media's own box, which the zoom has left behind.
      var w = view.box ? view.box.clientWidth : (view.el ? view.el.offsetWidth : 0);
      var h = view.box ? view.box.clientHeight - view.cap : (view.el ? view.el.offsetHeight : 0);
      if (!w || !h || !view.media) { view.x = view.y = 0; return; }
      view.z = Math.min(VIEW_MAX, Math.max(1, view.z));
      var sw = view.media.w * view.z, sh = view.media.h * view.z;
      // The media never leaves a gap in what is visible: at z = 1 it fills it exactly, and
      // zoomed in it always covers it. Where the box grew with the zoom there is nothing to
      // pan and the whole media is visible, so the anchor has nothing to hold; where the
      // viewport capped the box, this is what keeps the content under the fingers.
      view.x = sw <= w ? (w - sw) / 2 : Math.min(0, Math.max(w - sw, view.x));
      view.y = sh <= h ? (h - sh) / 2 : Math.min(0, Math.max(h - sh, view.y));
    }
    function applyView() {
      if (!view.el) return;
      sizeBox();
      clampView();
      var st = view.el.style;
      st.transformOrigin = '0 0';
      st.transform = (view.z > 1.001 || view.x || view.y)
        ? 'translate(' + r1(view.x) + 'px,' + r1(view.y) + 'px) scale(' + view.z.toFixed(4) + ')'
        : '';
      view.el.classList.toggle('is-zoomed', view.z > 1.001);
    }
    // Hand the view to the media that a lightbox is showing, back at the fitted size. Every
    // re-fit — opening, a resize — starts here again, so neither a transform nor a grown box
    // is left on a size that was not measured against. `max` is what the CSS allows the box
    // to be, which is what the zoom grows it towards.
    function setView(v) {
      var el = v ? v.el : null, box = v ? v.box : null;
      if (view.el && view.el !== el) { view.el.style.transform = ''; view.el.classList.remove('is-zoomed'); }
      if (view.box && view.box !== box) {
        view.box.style.width = view.box.style.height = '';
        view.box.classList.remove('is-animating');
      }
      view.el = el;
      view.box = box;
      view.capEl = (v && v.cap) || null;
      view.max = (v && v.max) || null;
      view.media = el ? { w: el.offsetWidth, h: el.offsetHeight } : null;
      view.cap = view.capEl ? view.capEl.offsetHeight : 0;
      resetView();
    }
    // Where a point on the screen is in the media's *layout* box: the element carries the
    // transform, so its rect is the transformed one.
    function viewPoint(el, clientX, clientY) {
      var r = el.getBoundingClientRect();
      return { x: (clientX - r.left) / view.z, y: (clientY - r.top) / view.z };
    }
    // Zoom by a factor around a point in those coordinates. With the content point p at
    // p*z + x on screen, keeping it there through z -> z' means x' = x - p*(z' - z).
    function zoomAt(factor, px, py) {
      if (!view.el) return;
      var z = Math.min(VIEW_MAX, Math.max(1, view.z * factor)), dz = z - view.z;
      view.z = z;
      view.x -= px * dz;
      view.y -= py * dz;
      applyView();
    }
    function panBy(dx, dy) { view.x += dx; view.y += dy; applyView(); }
    function resetView() { view.z = 1; view.x = 0; view.y = 0; applyView(); }
    // An animation class eases a double click or a reset into place; a pinch or a drag must
    // not carry it, or the media lags the fingers. The box is eased with the media, or the
    // two would move apart.
    function animateView() {
      var els = [view.el, view.box];
      els.forEach(function (el) { if (el) el.classList.add('is-animating'); });
      later(function () {
        els.forEach(function (el) { if (el) el.classList.remove('is-animating'); });
      }, 200);
    }
    // The gestures, on whichever element holds the media: the same handlers serve both
    // lightboxes. A host that does not own the current view (the lightbox behind a live
    // enlargement, say) is ignored.
    function bindZoomGestures(host, mediaOf) {
      on(host, 'wheel', function (e) {
        var el = mediaOf();
        if (!el || view.el !== el) return;
        var line = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? host.clientHeight || 16 : 1);
        var d = e.deltaY * line;
        if (e.ctrlKey || e.metaKey) {
          // A trackpad pinch. Left alone the page zooms instead, and the gesture stays
          // stuck to the page.
          e.preventDefault();
          var p = viewPoint(el, e.clientX, e.clientY);
          zoomAt(Math.exp(-d * 0.012), p.x, p.y);
        } else if (view.z > 1.001) {
          e.preventDefault(); // pan rather than scroll whatever is behind
          panBy(-e.deltaX * line, -d);
        }
      }, { passive: false });
      var touch = null;
      function spread(e) {
        var a = e.touches[0], b = e.touches[1];
        var r = view.el.getBoundingClientRect();
        return {
          d: Math.sqrt(Math.pow(b.clientX - a.clientX, 2) + Math.pow(b.clientY - a.clientY, 2)) || 1,
          x: (a.clientX + b.clientX) / 2 - r.left,
          y: (a.clientY + b.clientY) / 2 - r.top,
        };
      }
      on(host, 'touchstart', function (e) {
        var el = mediaOf();
        if (!el || view.el !== el) { touch = null; return; }
        if (e.touches.length === 2) {
          touch = { pinch: spread(e), z: view.z };
        } else if (e.touches.length === 1 && view.z > 1.001) {
          touch = { from: { x: e.touches[0].clientX, y: e.touches[0].clientY } };
        } else {
          touch = null;
        }
      }, { passive: true });
      on(host, 'touchmove', function (e) {
        if (!touch || !view.el) return;
        if (touch.pinch && e.touches.length === 2) {
          e.preventDefault();
          // The midpoint is the anchor, so the media follows the fingers: spreading them
          // zooms in around it, and moving them drags the media along.
          var m = spread(e);
          var p = { x: m.x / view.z, y: m.y / view.z };
          var z = Math.min(VIEW_MAX, Math.max(1, touch.z * (m.d / touch.pinch.d)));
          var dz = z - view.z;
          view.z = z;
          view.x -= p.x * dz;
          view.y -= p.y * dz;
          applyView();
        } else if (touch.from && e.touches.length === 1) {
          e.preventDefault();
          panBy(e.touches[0].clientX - touch.from.x, e.touches[0].clientY - touch.from.y);
          touch.from = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      }, { passive: false });
      on(host, 'touchend', function (e) { if (e.touches.length < 2) touch = null; }, { passive: true });
      on(host, 'touchcancel', function () { touch = null; }, { passive: true });
      on(host, 'dblclick', function (e) {
        var el = mediaOf();
        if (!el || view.el !== el) return;
        animateView();
        if (view.z > 1.001) { resetView(); return; }
        var p = viewPoint(el, e.clientX, e.clientY);
        zoomAt(2.5, p.x, p.y);
      });
    }
    bindZoomGestures(lightbox, function () {
      return lightbox.classList.contains('open') ? lbImg : null;
    });

    function fitLightbox() {
      if (!lightbox.classList.contains('open')) return;
      var natW = lbImg.naturalWidth || lbNat[0], natH = lbImg.naturalHeight || lbNat[1];
      if (!natW || !natH) return;
      // Back to the largest box CSS allows, which is also what a resize has to
      // measure against again — and, for the gestures, how far the box may grow.
      lbBox.style.width = lbBox.style.height = '';
      var lbMax = { w: lbBox.clientWidth, h: lbBox.clientHeight };
      lbImg.style.width = lbImg.style.height = '';
      var capH = capBand(lbBox, lbCap);
      var availW = lbBox.clientWidth;
      var availH = lbBox.clientHeight - capH;
      if (availW <= 0 || availH <= 0) return;
      var s = Math.min(availW / natW, availH / natH);
      lbImg.style.width = (natW * s) + 'px';
      lbImg.style.height = (natH * s) + 'px';
      lbBox.style.width = (natW * s) + 'px';
      // The caption may need another line at this width, so let the box grow to
      // whatever the two of them add up to.
      lbBox.style.height = 'auto';
      setView({ el: lbImg, box: lbBox, cap: lbCap, max: lbMax });
    }
    function openLightbox(src, cap, alt, natW, natH) {
      lbNat = [natW || 0, natH || 0];
      lbImg.src = src;
      lbImg.alt = alt || cap || '';
      lbCap.textContent = cap || '';
      lbCap.hidden = !cap; // an empty caption would only be a dark strip
      lightbox.classList.add('open');
      fitLightbox(); // sizes it right away if the image is already decoded
    }
    function closeLightbox() {
      lightbox.classList.remove('open');
      lbImg.removeAttribute('src');
      setView(null);
    }
    on(lbImg, 'load', function () { fitLightbox(); });
    function openImageLightbox(card) {
      var img = card.querySelector('img');
      var cap = card.querySelector('figcaption');
      if (img) {
        openLightbox(img.currentSrc || img.src, cap ? cap.textContent : '', img.alt,
          img.naturalWidth, img.naturalHeight);
      }
    }
    deck.querySelectorAll('.media-card.image-card').forEach(function (card) {
      card.style.cursor = 'zoom-in';
      on(card, 'click', function () { openImageLightbox(card); });
    });
    on(lightbox, 'click', function (e) {
      if (e.target === lightbox || e.target.classList.contains('lb-close')) closeLightbox();
    });
    on(doc, 'keydown', function (e) {
      if (lightbox.classList.contains('open') && e.key === 'Escape') { e.stopPropagation(); closeLightbox(); }
    }, true);

    /* ---------- live lightbox ----------
     * An image can be enlarged by re-showing its src, so #lightbox copies it. A
     * live frame cannot: copying it starts a second document, and moving it ends
     * the first one (the HTML spec destroys an iframe's child navigable on
     * removal and creates a new one on insertion, so any DOM move reloads the
     * page). So nothing is moved here — the card is promoted to the top layer
     * with the Popover API instead, which leaves the frame exactly where it is
     * and therefore keeps its document, its input and its JS state. A top-layer
     * element with position:fixed is laid out against the viewport, so no
     * ancestor transform, overflow or opacity can clip or displace it.
     *
     * The popover is 'manual': the deck closes it on Esc and on a press outside
     * by itself. An 'auto' popover would have the UA do both on the very same
     * keystroke and the very same press, and only one of the two may act. */
    var zoomed = null;

    // Runs synchronously from beforetoggle (i.e. before the popover actually
    // closes) so the card is a plain grid card again by the time it would
    // otherwise hit the UA's [popover]:not(:popover-open) { display: none },
    // which would blink a hole in the grid. A closed popover is also no longer
    // a popover at all, hence the attribute coming off.
    function zoomClosed(card) {
      var open = zoomed === card;
      card.removeAttribute('popover');
      card.classList.remove('zoomed');
      if (open) { zoomed = null; setView(null); }
      if (open && !destroyed) fitCurrent(); // synchronous: no half-restored frame is painted
    }

    // Fit the embed's natural box into the lightbox the way object-fit:contain
    // fits an image, then shrink the card onto the result: the frame keeps its
    // own layout size and is scaled, and the wrapper and the card take the
    // *fitted* size, so the embed fills the lightbox instead of floating in a
    // box that is always 1300x820 with black bars down the sides. The embedded
    // page is never reflowed, only shown larger.
    function fitZoom() {
      if (!zoomed) return;
      var wrap = zoomed.querySelector('.live-wrap');
      var frame = zoomed.querySelector('.live-frame');
      var cap = zoomed.querySelector('.caption');
      if (!wrap || !frame) return;
      var natW = parseFloat(frame.dataset.natW) || frame.offsetWidth;
      var natH = parseFloat(frame.dataset.natH) || frame.offsetHeight;
      // Back to the size CSS allows it (the widest the caption can be laid out at), which
      // is also what a resize has to measure against again — and, for the gestures, how far
      // the box may grow.
      zoomed.style.width = zoomed.style.height = '';
      var zoomMax = { w: zoomed.clientWidth, h: zoomed.clientHeight };
      var capH = capBand(zoomed, cap);
      var availW = zoomed.clientWidth;
      var availH = zoomed.clientHeight - capH;
      if (!natW || !natH || availW <= 0 || availH <= 0) return;
      var s = Math.min(availW / natW, availH / natH);
      var w = natW * s, h = natH * s;
      wrap.style.width = w + 'px';
      wrap.style.height = h + 'px';
      frame.style.transformOrigin = 'top left';
      frame.style.transform = 'scale(' + s + ')';
      zoomed.style.width = w + 'px';
      // The card is narrower now, so the caption may have wrapped onto another
      // line: let the height follow from the wrapper plus whatever it needs.
      zoomed.style.height = 'auto';
      setView({ el: wrap, box: zoomed, cap: cap, max: zoomMax });
    }

    function openZoom(card) {
      if (destroyed || zoomed || !card.showPopover) return;
      if (!card.querySelector('.live-frame')) return;
      // Hand the card's box to CSS while it is enlarged; scheduleFit() rebuilds
      // every size on the way out (fitLiveCard re-sets all of them).
      card.style.width = card.style.height = '';
      card.style.transform = '';
      // The enlargement has room for the caption at its normal size, and no button
      // to make room for, so the caption's own fit is dropped here (zoomClosed()
      // re-fits the card in the grid, which settles all three again).
      var cap = card.querySelector('.caption');
      if (cap) {
        cap.style.removeProperty('--cap-size');
        cap.style.padding = '';
      }
      card.setAttribute('popover', 'manual');
      card.classList.add('zoomed');
      zoomed = card;
      try {
        card.showPopover();
      } catch (e) {
        zoomClosed(card);
        return;
      }
      fitZoom();
    }

    function closeZoom() {
      if (!zoomed) return;
      var card = zoomed;
      try {
        if (card.hidePopover) card.hidePopover();
      } catch (e) { /* fall through: clean up either way */ }
      zoomClosed(card);
    }
    // A press outside the enlarged card closes it — and the click that it turns
    // into is swallowed, so nothing behind the card (a nav button, say) also
    // acts on it. This mirrors #lightbox, which is clicked away the same way.
    var swallowClick = false;
    on(doc, 'pointerdown', function (e) {
      swallowClick = false;
      if (!zoomed) return;
      // The card itself is its own backdrop (the letterbox around the embed).
      if (e.target !== zoomed && zoomed.contains(e.target)) return;
      closeZoom();
      swallowClick = true;
    }, true);
    on(doc, 'click', function (e) {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    // Both buttons live inside the media's own box, in its bottom-right corner: the
    // caption below the media then never has to make room for them, which is what
    // used to cost it a column the whole way down (or a notch in its last line).
    // Markup the deck did not render has no such box, so it falls back to the card
    // itself, where a <figcaption> still has to stay last.
    function addToMedia(card, el) {
      var box = card.querySelector('.media-box, .live-wrap');
      if (box) { box.appendChild(el); return; }
      var cap = card.querySelector('figcaption, .caption');
      if (cap) card.insertBefore(el, cap); else card.appendChild(el);
    }

    function addZoom(card) {
      var live = !!card.querySelector('.live-frame');
      if ((!live && !card.querySelector('img')) || card.querySelector('.media-zoom')) return;
      if (live && typeof card.showPopover !== 'function') return;
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'media-zoom';
      btn.title = T.zoomTitle;
      btn.setAttribute('aria-label', T.zoomTitle);
      // The icon itself is drawn in CSS, so it needs no font and no translation.
      on(btn, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation(); // an image card opens its lightbox on click as well
        if (live) openZoom(card); else openImageLightbox(card);
      });
      addToMedia(card, btn);
      if (!live) return;
      // The live lightbox shows the embed at its fitted size and lets a gesture go further.
      // The gestures only reach the card where the card is what is under the pointer: an
      // embedded page owns the events over its own surface, and it is welcome to them.
      bindZoomGestures(card, function () {
        return zoomed === card ? card.querySelector('.live-wrap') : null;
      });
      var close = doc.createElement('button');
      close.type = 'button';
      close.className = 'media-close';
      close.title = T.closeTitle;
      close.setAttribute('aria-label', T.closeTitle);
      close.textContent = '×';
      on(close, 'click', function (e) { e.preventDefault(); e.stopPropagation(); closeZoom(); });
      addToMedia(card, close);
      // Nothing else is expected to close the popover (it is 'manual'), but if
      // something does, beforetoggle is the synchronous hook for the clean-up
      // and toggle the safety net behind it.
      on(card, 'beforetoggle', function (e) { if (e.newState !== 'open') zoomClosed(card); });
      on(card, 'toggle', function (e) { if (e.newState !== 'open') zoomClosed(card); });
    }
    // Injected rather than rendered so custom renderers get the button too.
    deck.querySelectorAll('.media-card').forEach(addZoom);

    /* ---------- bottom buttons ---------- */
    on(prevBtn, 'click', function () { go(current - 1); });
    on(nextBtn, 'click', function () { go(current + 1); });

    /* ---------- fullscreen ---------- */
    var btnFull = topbar.querySelector('#ld-btn-fullscreen');
    // requestFullscreen()/exitFullscreen() return a Promise that rejects when
    // the call isn't allowed (no user gesture, missing allowfullscreen, …).
    function quiet(promise) {
      if (promise && typeof promise.catch === 'function') promise.catch(function () { /* ignore */ });
    }
    function toggleFullscreen() {
      if (!doc.fullscreenElement) {
        if (doc.documentElement.requestFullscreen) quiet(doc.documentElement.requestFullscreen());
      } else if (doc.exitFullscreen) {
        quiet(doc.exitFullscreen());
      }
    }
    on(btnFull, 'click', toggleFullscreen);
    on(doc, 'fullscreenchange', function () {
      btnFull.classList.toggle('active', !!doc.fullscreenElement);
    });

    /* ---------- keyboard ---------- */
    // True for a target that should own every keystroke (text fields, etc.).
    function isTypingTarget(t) {
      if (!t) return false;
      if (t.isContentEditable) return true;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
      if (t.tagName !== 'INPUT') return false;
      var type = (t.getAttribute('type') || 'text').toLowerCase();
      return ['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'].indexOf(type) === -1;
    }

    on(doc, 'keydown', function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      // The enlarged card owns Esc: close it here, and never act on that
      // keystroke in any other way.
      if (zoomed) {
        if (e.key === 'Escape') { e.preventDefault(); closeZoom(); }
        return;
      }
      // Don't navigate behind a modal overlay (Esc closes the lightbox).
      if (lightbox.classList.contains('open') || rotateOverlay.classList.contains('show')) return;
      var t = e.target;
      if (isTypingTarget(t)) return;
      // Let a focused button/link/control handle Space/Enter itself.
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'SUMMARY') &&
          (e.key === ' ' || e.key === 'Enter')) return;
      if (['ArrowRight', 'PageDown'].indexOf(e.key) !== -1 || e.key === ' ') { e.preventDefault(); go(current + 1); }
      else if (['ArrowLeft', 'PageUp'].indexOf(e.key) !== -1) { e.preventDefault(); go(current - 1); }
      else if (e.key === 'Home') { e.preventDefault(); go(0); }
      else if (e.key === 'End') { e.preventDefault(); go(total - 1); }
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      else if (e.key === 'g' || e.key === 'G' || e.key === 'Escape') toggleOverview();
    });

    /* ---------- touch swipe ---------- */
    var touchX = 0, touchY = 0;
    on(doc, 'touchstart', function (e) {
      touchX = e.changedTouches[0].clientX;
      touchY = e.changedTouches[0].clientY;
    }, { passive: true });
    on(doc, 'touchend', function (e) {
      var dx = e.changedTouches[0].clientX - touchX;
      var dy = e.changedTouches[0].clientY - touchY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? go(current + 1) : go(current - 1); }
    }, { passive: true });

    /* ---------- overview ---------- */
    function renderOverview() {
      var grid = overview.querySelector('.overview-grid');
      grid.innerHTML = SLIDES.map(function (s, i) {
        return '<button class="ov-card' + (i === current ? ' current' : '') + (visited[i] ? ' visited' : '') + '" data-index="' + i + '">' +
          '<div class="ov-num">' + String(i + 1).padStart(2, '0') + '</div>' +
          '<div class="ov-sec">' + escHtml(s.section) + '</div>' +
          '<div class="ov-title">' + escHtml(s.title) + '</div>' +
          (visited[i] ? '<div class="ov-done">' + escHtml(T.visited) + '</div>' : '') +
          '</button>';
      }).join('');
    }
    function openOverview() {
      if (destroyed) return;
      closeZoom();
      renderOverview();
      overview.classList.add('open');
    }
    function closeOverview() { overview.classList.remove('open'); }
    function toggleOverview() {
      overview.classList.contains('open') ? closeOverview() : openOverview();
    }
    on(topbar.querySelector('#ld-btn-menu'), 'click', toggleOverview);
    on(overview, 'click', function (e) {
      var card = e.target && e.target.closest ? e.target.closest('.ov-card') : null;
      if (card) { go(parseInt(card.dataset.index, 10)); closeOverview(); }
      else if (e.target === overview) closeOverview();
    });

    /* ---------- rotate hint ---------- */
    var rotateDismissed = false;
    function isPortraitSmall() {
      return window.matchMedia('(orientation: portrait)').matches && window.innerWidth <= 820;
    }
    function checkRotate() {
      if (!rotateDismissed) rotateOverlay.classList.toggle('show', isPortraitSmall());
    }
    on(rotateOverlay.querySelector('#rotate-continue'), 'click', function () {
      rotateDismissed = true;
      rotateOverlay.classList.remove('show');
    });

    /* ---------- init ---------- */
    checkRotate();
    on(window, 'resize', function () { checkRotate(); if (zoomed) fitZoom(); fitLightbox(); scheduleFit(); });
    on(window, 'orientationchange', function () { checkRotate(); if (zoomed) fitZoom(); fitLightbox(); scheduleFit(); });
    // Follow the browser: a Back/Forward, an in-page link or a hand-edited hash
    // moves the deck, but none of them may push a step of its own. hashchange
    // covers a changed URL, popstate the traversals that leave it as it is.
    function followStep() {
      var n = parseInt((location.hash || '').replace('#step-', ''), 10);
      if (n >= 1 && n <= total && n - 1 !== current) go(n - 1, 'none');
    }
    on(window, 'hashchange', followStep);
    on(window, 'popstate', followStep);
    var step = parseInt((location.hash || '').replace('#step-', ''), 10);
    go(step && step >= 1 && step <= total ? step - 1 : 0, 'none');
    recordStep('replace'); // the step the deck starts on takes over the loaded URL
    scheduleFit();
    if (CONFIG.fullScreenOnLoad && doc.documentElement.requestFullscreen) {
      quiet(doc.documentElement.requestFullscreen());
    }
    if (CONFIG.showOverviewOnLoad) openOverview();

    /* ---------- public instance ---------- */
    var instance = {
      version: VERSION,
      config: CONFIG,
      slides: SLIDES,
      total: total,
      get index() { return current; },
      get element() { return deck; },
      go: go,
      next: function () { go(current + 1); },
      prev: function () { go(current - 1); },
      openOverview: openOverview,
      closeOverview: closeOverview,
      toggleOverview: toggleOverview,
      toggleFullscreen: toggleFullscreen,
      refit: scheduleFit,
      on: function (name, fn) { (events[name] = events[name] || []).push(fn); return instance; },
      off: function (name, fn) {
        if (!events[name]) return instance;
        events[name] = events[name].filter(function (f) { return f !== fn; });
        return instance;
      },
      destroy: function () {
        destroyed = true;
        closeZoom();
        if (fitRaf) { cancelAnimationFrame(fitRaf); fitRaf = null; }
        timers.forEach(function (id) { clearTimeout(id); });
        timers.length = 0;
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        listeners.length = 0;
        chromeNodes.forEach(function (n) { if (n && n.remove) n.remove(); });
        if (doc.body) doc.body.removeAttribute('data-livedeck-mounted');
        if (prevAccent) rootStyle.setProperty('--accent', prevAccent); else rootStyle.removeProperty('--accent');
        if (prevAccent2) rootStyle.setProperty('--accent2', prevAccent2); else rootStyle.removeProperty('--accent2');
        doc.title = prevTitle;
        emit('destroy');
      },
    };
    if (typeof options.onReady === 'function') {
      try { options.onReady(instance); } catch (e) { console.error(e); }
    }
    // Defer 'ready' so subscribers registered right after mount() can catch it.
    later(function () { emit('ready', instance); }, 0);
    return instance;
  }

  /* ================================================================== *
   * auto-init — drop in the script and it just works.
   * Opt out with <script src="livedeck.js" data-auto="false"></script>.
   * ================================================================== */
  var script = (typeof document !== 'undefined') ? document.currentScript : null;
  var auto = !(script && script.getAttribute('data-auto') === 'false');
  function boot() {
    if (document.body && document.body.getAttribute('data-livedeck-mounted')) return;
    if (!document.querySelector('#deck-source, template[data-livedeck-source]')) return;
    if (mount()) document.body.setAttribute('data-livedeck-mounted', '');
  }
  if (auto && typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  return { mount: mount, i18n: i18n, renderers: renderers, version: VERSION };
});
