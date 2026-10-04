/*! LiveDeck Live v0.1.0 — helper for live iframe embeds in LiveDeck.
 *  Include it in the embedded page and call LiveDeck.live.autoResize().
 *  It reports the page size to the parent deck so the deck can lay the embed
 *  out at its natural size and scale it to fit.
 *
 *  Contract with LiveDeck: postMessage({ type: 'resize', width, height }).
 *  A report carries no identifier: the deck ties it to the card the message
 *  came from by looking at the sending window, so nothing has to name the embed.
 *  MIT licensed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else {
    var ns = root.LiveDeck = root.LiveDeck || {};
    ns.live = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '0.1.0';

  function defaultMeasure() {
    var body = document.body;
    var doc = document.documentElement;
    // Measure the *content's own box*, not the iframe viewport: a body with an
    // explicit width (the usual case for an embed) reports its natural width,
    // and documentElement.clientWidth would just be the frame width.
    // When the parent slide is display:none the iframe has no layout, so this
    // returns 0 and the deck ignores it until the frame becomes visible
    // (which fires a resize inside the iframe).
    var w = body ? body.offsetWidth : (doc ? doc.clientWidth : 0);
    var h = body ? body.scrollHeight : (doc ? doc.scrollHeight : 0);
    return { width: w, height: h };
  }

  /* Send one size update to the parent. Safe to call at any time; a page that
   * is not embedded has nobody to report to and sends nothing. */
  function sendSize(options) {
    options = options || {};
    var measure = typeof options.measure === 'function' ? options.measure : defaultMeasure;
    var size = measure() || {};
    var width = size.width || 0;
    var height = size.height || 0;
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'resize', width: width, height: height }, '*');
    }
    return { width: width, height: height };
  }

  /* Watch the page and keep the parent in sync with its natural size.
   * Returns a handle with .send() and .stop(). */
  function autoResize(options) {
    options = options || {};
    var rafId = null;
    var timerIds = [];
    var stopped = false;
    var started = false;

    function later(fn, ms) {
      var id = setTimeout(function () { if (!stopped) fn(); }, ms);
      timerIds.push(id);
      return id;
    }

    function schedule() {
      if (stopped || rafId) return;
      rafId = requestAnimationFrame(function () {
        rafId = null;
        if (!stopped) sendSize(options);
      });
    }

    var observer = null;
    function startObserver() {
      if (stopped || observer || typeof ResizeObserver !== 'function') return;
      var target = options.observe || document.body || document.documentElement;
      if (!target) return;
      observer = new ResizeObserver(schedule);
      observer.observe(target);
    }

    function initial() {
      if (stopped || started) return;
      started = true;
      startObserver();
      sendSize(options);
      requestAnimationFrame(function () { if (!stopped) sendSize(options); });
      later(function () { sendSize(options); }, 60);
      later(function () { sendSize(options); }, 250);
    }

    if (document.readyState === 'complete') initial();
    else window.addEventListener('load', initial);

    window.addEventListener('resize', schedule);

    return {
      send: function () { sendSize(options); },
      stop: function () {
        stopped = true;
        window.removeEventListener('resize', schedule);
        window.removeEventListener('load', initial);
        if (observer) observer.disconnect();
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        timerIds.forEach(function (id) { clearTimeout(id); });
        timerIds.length = 0;
      },
    };
  }

  return { autoResize: autoResize, sendSize: sendSize, version: VERSION };
});
