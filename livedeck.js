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
      // Pass a unique id through so the same page can be embedded several times
      // (each with its own data-live-id). Don't duplicate one already in src.
      var liveSrc = /[?&]liveId=/.test(m.src)
        ? m.src
        : m.src + (m.src.indexOf('?') === -1 ? '?' : '&') + 'liveId=' + encodeURIComponent(m.liveId);
      return '<div class="media-card live-card">' +
        '<div class="live-wrap">' +
        '<iframe id="' + escAttr(m.liveId) + '" class="live-frame" data-live-id="' + escAttr(m.liveId) + '"' +
        ' src="' + escAttr(liveSrc) + '" scrolling="no" loading="eager" height="' + escAttr(h) + '"' +
        ' title="' + escAttr(m.caption || m.liveId) + '"' +
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
            liveId: el.getAttribute('data-live-id') || el.id || '',
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
          liveId: m.liveId || m.id || '',
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
      var cs = getComputedStyle(inner);
      var padTB = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      var scale = 1, contentH = H;
      for (var k = 0; k < 8; k++) {
        inner.style.width = (W / scale) + 'px'; // widen, then scale down
        contentH = wrap.scrollHeight;
        var ns = Math.sqrt((H - padTB) / contentH * scale);
        if (Math.abs(ns - scale) < 0.006) { scale = ns; break; }
        scale = ns;
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

    function fitImageCard(card, cellW, cellH) {
      var img = card.querySelector('img');
      if (!img) return;
      card.style.transform = 'scale(1)';
      card.style.transformOrigin = 'center center';
      card.style.width = cellW + 'px';
      card.style.height = 'auto';
      img.style.width = cellW + 'px'; // height follows from CSS height:auto
      var natW = card.offsetWidth;
      var natH = card.offsetHeight;
      if (!natW || !natH) return;
      var s = Math.min(cellW / natW, cellH / natH);
      card.style.transform = 'scale(' + s + ')';
    }

    function fitLiveCard(card, cellW, cellH) {
      var wrap = card.querySelector('.live-wrap');
      var frame = card.querySelector('.live-frame');
      var cap = card.querySelector('.caption');
      var media = card.closest('.media-grid');
      if (!wrap || !frame) return;
      var NAT_W = parseFloat(frame.dataset.natW) || Math.max(480, cellW);
      var natH = parseFloat(frame.dataset.natH) || parseInt(frame.getAttribute('height'), 10) || 480;
      frame.style.width = NAT_W + 'px';
      frame.style.height = natH + 'px';
      frame.style.transformOrigin = 'top left';
      frame.style.transform = 'scale(1)';
      wrap.style.width = NAT_W + 'px';
      wrap.style.height = natH + 'px';
      card.style.maxWidth = 'none';
      card.style.transformOrigin = 'center center';
      card.style.transform = 'scale(1)';
      card.style.width = NAT_W + 'px';
      card.style.height = 'auto';
      var natW = card.offsetWidth || NAT_W;
      var natHTotal = card.offsetHeight || (natH + (cap ? cap.offsetHeight : 0));
      var s = Math.min(cellW / natW, cellH / natHTotal);
      card.style.transform = 'scale(' + s + ')';
      if (media) media.style.overflowY = (natHTotal * s > cellH + 4) ? 'auto' : 'visible';
    }

    var fitRaf;
    function fitCurrent() {
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

    function go(index) {
      if (destroyed) return;
      index = Math.round(Number(index));
      if (!isFinite(index)) return;
      if (index < 0) index = 0;
      if (index > total - 1) { openOverview(); return; }
      closeOverview();
      current = index;
      visited[current] = true;
      slides.forEach(function (el, i) { el.classList.toggle('active', i === current); });
      updateTop();
      scheduleFit();
      later(fitCurrent, 260);
      later(fitCurrent, 600);
      try { history.replaceState(null, '', '#step-' + (current + 1)); } catch (e) { /* file:// */ }
      emit('change', { index: current, slide: SLIDES[current], total: total });
    }

    /* ---------- live iframe auto height ---------- */
    on(window, 'message', function (e) {
      if (!e.data || e.data.type !== 'resize' || !e.data.id || !e.data.height) return;
      var frame = doc.getElementById(e.data.id);
      if (!frame || frame.tagName !== 'IFRAME' || !frame.classList.contains('live-frame')) return;
      // Only trust messages that actually came from this embed.
      if (e.source && frame.contentWindow !== e.source) return;
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
    var lbImg = lightbox.querySelector('.lb-img');
    var lbCap = lightbox.querySelector('.lb-cap');
    function openLightbox(src, cap, alt) {
      lbImg.src = src;
      lbImg.alt = alt || cap || '';
      lbCap.textContent = cap || '';
      lightbox.classList.add('open');
    }
    function closeLightbox() {
      lightbox.classList.remove('open');
      lbImg.removeAttribute('src');
    }
    deck.querySelectorAll('.media-card.image-card').forEach(function (card) {
      card.style.cursor = 'zoom-in';
      on(card, 'click', function () {
        var img = card.querySelector('img');
        var cap = card.querySelector('figcaption');
        if (img) openLightbox(img.currentSrc || img.src, cap ? cap.textContent : '', img.alt);
      });
    });
    on(lightbox, 'click', function (e) {
      if (e.target === lightbox || e.target.classList.contains('lb-close')) closeLightbox();
    });
    on(doc, 'keydown', function (e) {
      if (lightbox.classList.contains('open') && e.key === 'Escape') { e.stopPropagation(); closeLightbox(); }
    }, true);

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
    on(doc, 'keydown', function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      // Don't navigate behind a modal overlay (Esc closes the lightbox).
      if (lightbox.classList.contains('open') || rotateOverlay.classList.contains('show')) return;
      var t = e.target;
      // Don't steal keys from editable fields.
      if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      // Let Space/Enter activate a focused button/link natively.
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'A') && (e.key === ' ' || e.key === 'Enter')) return;
      if (['ArrowRight', 'PageDown'].indexOf(e.key) !== -1 || e.key === ' ') { e.preventDefault(); go(current + 1); }
      else if (['ArrowLeft', 'PageUp'].indexOf(e.key) !== -1) { e.preventDefault(); go(current - 1); }
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(total - 1);
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
    function openOverview() { if (destroyed) return; renderOverview(); overview.classList.add('open'); }
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
    on(window, 'resize', function () { checkRotate(); scheduleFit(); });
    on(window, 'orientationchange', function () { checkRotate(); scheduleFit(); });
    // Follow runtime hash changes (in-page links, manual edits). The deck's own
    // replaceState rewrites don't fire hashchange, so this can't loop.
    on(window, 'hashchange', function () {
      var n = parseInt((location.hash || '').replace('#step-', ''), 10);
      if (n >= 1 && n <= total && n - 1 !== current) go(n - 1);
    });
    var step = parseInt((location.hash || '').replace('#step-', ''), 10);
    go(step && step >= 1 && step <= total ? step - 1 : 0);
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
