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
      return '<figure class="media-card image-card">' +
        '<img src="' + escAttr(m.src) + '" alt="' + escAttr(alt) + '" loading="eager" decoding="async">' +
        (m.caption ? '<figcaption>' + escHtml(m.caption) + '</figcaption>' : '') +
        '</figure>';
    },
    live: function (m) {
      var h = parseInt(m.height, 10) || 420;
      // The src is emitted exactly as the author wrote it. An embed carries no
      // identifier at all: the deck tells reports apart by the window they came
      // from, so nothing has to name it (a slide has data-index, its media cards
      // are .media-card, if you need to target one from CSS).
      return '<div class="media-card live-card">' +
        '<div class="live-wrap">' +
        '<iframe class="live-frame"' +
        ' src="' + escAttr(m.src) + '" scrolling="no" loading="eager" height="' + escAttr(h) + '"' +
        ' title="' + escAttr(m.caption || '') + '"' +
        ' style="width:100%;height:' + h + 'px;border:0;"></iframe>' +
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
        var caption = el.getAttribute('data-caption') || '';
        if (el.tagName === 'IFRAME') {
          return {
            type: 'live',
            src: el.getAttribute('src') || '',
            height: parseInt(el.getAttribute('data-height'), 10) || 420,
            caption: caption,
          };
        }
        return {
          type: el.getAttribute('data-type') || 'img',
          src: el.getAttribute('src') || '',
          alt: el.getAttribute('alt'),
          caption: caption,
        };
      }) : [];
      return {
        section: sec.getAttribute('data-section') || '',
        title: sec.getAttribute('data-title') || '',
        content: contentEl ? contentEl.innerHTML : '',
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
      media: (Array.isArray(s.media) ? s.media : (s.media == null ? [] : [s.media])).map(function (m) {
        if (typeof m === 'string') return { type: 'img', src: m, caption: '' };
        return {
          type: m.type || 'img',
          src: m.src || '',
          alt: m.alt != null ? m.alt : null,
          height: m.height || 420,
          caption: m.caption || '',
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
      el.innerHTML =
        '<div class="slide-inner">' +
        '<div class="panel left-panel">' +
        '<div class="fit-wrap"><div class="panel-inner">' +
        (s.section ? '<div class="section-badge">' + escHtml(s.section) + '</div>' : '') +
        (s.title ? '<h2 class="slide-title">' + escHtml(s.title) + '</h2>' : '') +
        '<div class="ld-content">' + s.content + '</div>' +
        '</div></div></div>' +
        '<div class="panel right-panel">' +
        '<div class="fit-wrap"><div class="panel-inner media-inner">' +
        '<div class="media-grid">' + buildMedia(s.media) + '</div>' +
        '</div></div></div>' +
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
    function layoutMedia(panel) {
      var grid = panel.querySelector('.media-grid');
      if (!grid) return;
      var cards = Array.prototype.slice.call(grid.querySelectorAll('.media-card'));
      var N = cards.length;
      if (!N) return;
      var cols = Math.max(1, Math.ceil(Math.sqrt(N))); // 5 -> 3x2, 3 -> 2x2, 2 -> 2x1
      var rows = Math.ceil(N / cols);
      grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
      grid.style.gridAutoRows = 'minmax(0, 1fr)';
      requestAnimationFrame(function () {
        var gW = grid.clientWidth, gH = grid.clientHeight;
        if (!gW || !gH) return;
        var gcs = getComputedStyle(grid);
        var colGap = parseFloat(gcs.columnGap) || 0;
        var rowGap = parseFloat(gcs.rowGap) || 0;
        var cellW = (gW - (cols - 1) * colGap) / cols;
        var cellH = (gH - (rows - 1) * rowGap) / rows;
        cards.forEach(function (card) {
          if (card.classList.contains('live-card')) fitLiveCard(card, cellW, cellH);
          else fitImageCard(card, cellW, cellH);
        });
      });
    }

    // Media are sized by layout, never by scaling the card: a caption is text,
    // and text that is scaled with the media gets unreadable as soon as a big
    // image or embed is scaled right down. So the card keeps its normal type
    // and only the media gives way, taking the room the caption leaves.
    function fitImageCard(card, cellW, cellH) {
      var img = card.querySelector('img');
      if (!img) return;
      var cap = card.querySelector('figcaption') || card.querySelector('.caption');
      card.style.transform = '';
      card.style.transformOrigin = '';
      card.style.width = cellW + 'px';
      card.style.height = 'auto';
      img.style.width = ''; // natural size, capped by the CSS max-width:100%
      img.style.height = '';
      var natW = img.offsetWidth;
      var natH = img.offsetHeight;
      if (!natW || !natH) return;
      var availW = card.clientWidth || cellW; // the card's border eats into the cell
      var availH = cellH - (cap ? cap.offsetHeight : 0);
      if (availH < 1) return; // a caption taller than the cell leaves no room
      var s = Math.min(availW / natW, availH / natH);
      img.style.width = (natW * s) + 'px';
      img.style.height = (natH * s) + 'px';
    }

    function fitLiveCard(card, cellW, cellH) {
      var wrap = card.querySelector('.live-wrap');
      var frame = card.querySelector('.live-frame');
      var cap = card.querySelector('.caption');
      var media = card.closest('.media-grid');
      if (!wrap || !frame) return;
      var NAT_W = parseFloat(frame.dataset.natW) || Math.max(480, cellW);
      var natH = parseFloat(frame.dataset.natH) || parseInt(frame.getAttribute('height'), 10) || 480;
      card.style.transform = '';
      card.style.transformOrigin = '';
      card.style.maxWidth = '';
      card.style.width = cellW + 'px';
      card.style.height = 'auto';
      var availW = card.clientWidth || cellW;
      var availH = cellH - (cap ? cap.offsetHeight : 0);
      if (availH < 1) return;
      var s = Math.min(availW / NAT_W, availH / natH);
      // The frame keeps its own layout size — an embedded page is never reflowed
      // to fit — and is scaled inside a wrapper that takes the fitted size, so
      // the caption below it is laid out at the card's real width.
      frame.style.width = NAT_W + 'px';
      frame.style.height = natH + 'px';
      frame.style.transformOrigin = 'top left';
      frame.style.transform = 'scale(' + s + ')';
      wrap.style.width = (NAT_W * s) + 'px';
      wrap.style.height = (natH * s) + 'px';
      if (media) media.style.overflowY = 'visible';
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
    function fitLightbox() {
      if (!lightbox.classList.contains('open')) return;
      var natW = lbImg.naturalWidth || lbNat[0], natH = lbImg.naturalHeight || lbNat[1];
      if (!natW || !natH) return;
      // Back to the largest box CSS allows, which is also what a resize has to
      // measure against again.
      lbBox.style.width = lbBox.style.height = '';
      lbImg.style.width = lbImg.style.height = '';
      var availW = lbBox.clientWidth;
      var availH = lbBox.clientHeight - (lbCap.hidden ? 0 : lbCap.offsetHeight);
      if (availW <= 0 || availH <= 0) return;
      var s = Math.min(availW / natW, availH / natH);
      lbImg.style.width = (natW * s) + 'px';
      lbImg.style.height = (natH * s) + 'px';
      lbBox.style.width = (natW * s) + 'px';
      // The caption may need another line at this width, so let the box grow to
      // whatever the two of them add up to.
      lbBox.style.height = 'auto';
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
      if (open) zoomed = null;
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
      // Back to the size CSS allows it (the widest the caption can be laid out
      // at), which is also what a resize has to measure against again.
      zoomed.style.width = zoomed.style.height = '';
      var availW = zoomed.clientWidth;
      var availH = zoomed.clientHeight - (cap ? cap.offsetHeight : 0);
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
    }

    function openZoom(card) {
      if (destroyed || zoomed || !card.showPopover) return;
      if (!card.querySelector('.live-frame')) return;
      // Hand the card's box to CSS while it is enlarged; scheduleFit() rebuilds
      // every size on the way out (fitLiveCard re-sets all of them).
      card.style.width = card.style.height = '';
      card.style.transform = '';
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
      // First child: a <figcaption> has to stay the figure's last child, and the
      // button is absolutely positioned, so DOM order says nothing visually.
      card.insertBefore(btn, card.firstChild);
      if (!live) return;
      var close = doc.createElement('button');
      close.type = 'button';
      close.className = 'media-close';
      close.title = T.closeTitle;
      close.setAttribute('aria-label', T.closeTitle);
      close.textContent = '×';
      on(close, 'click', function (e) { e.preventDefault(); e.stopPropagation(); closeZoom(); });
      card.insertBefore(close, card.firstChild);
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
