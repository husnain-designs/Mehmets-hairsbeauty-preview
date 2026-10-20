/* Mehmet's Hair & Beauty London — shared motion system.
   Reveal kinds (data-reveal): up · fade · lines · stagger · mask.
   Also: data-parallax="0.1", data-scrub (sets --p), data-hscroll (sticky horizontal track),
   data-preview-list (cursor-follow image on fine pointers). Honours prefers-reduced-motion. */
(function () {
  'use strict';
  var EASE = 'cubic-bezier(.16,1,.3,1)';
  var UP0D = { opacity: 0, transform: 'translate3d(0,34px,0)' };
  var UP0S = { opacity: 0, transform: 'translate3d(0,24px,0)' };
  var UP1 = { opacity: 1, transform: 'translate3d(0,0,0)' };

  function plan(el) {
    var k = el.getAttribute('data-reveal'), out = [];
    var UP0 = window.innerWidth < 768 ? UP0S : UP0D;
    var kids = Array.prototype.slice.call(el.children);
    if (k === 'lines') {
      kids.forEach(function (c, i) { out.push({ el: c.firstElementChild || c, a: { transform: 'translate3d(0,112%,0)' }, b: { transform: 'translate3d(0,0,0)' }, d: 1250, o: i * 105 }); });
    } else if (k === 'stagger') {
      kids.forEach(function (c, i) { out.push({ el: c, a: UP0, b: UP1, d: 1000, o: i * 70 }); });
    } else if (k === 'mask') {
      out.push({ el: el, a: { clipPath: 'inset(100% 0% 0% 0%)', webkitClipPath: 'inset(100% 0% 0% 0%)' }, b: { clipPath: 'inset(0% 0% 0% 0%)', webkitClipPath: 'inset(0% 0% 0% 0%)' }, d: 1500, o: 0, e: 'cubic-bezier(.77,0,.18,1)' });
      var img = el.querySelector('img');
      if (img) out.push({ el: img, a: { transform: 'scale(1.18)' }, b: { transform: 'scale(1)' }, d: 2300, o: 0 });
    } else if (k === 'fade') {
      out.push({ el: el, a: { opacity: 0 }, b: { opacity: 1 }, d: 1400, o: 0 });
    } else {
      out.push({ el: el, a: UP0, b: UP1, d: 1100, o: 0 });
    }
    return out;
  }
  function hold(el) {
    el.__p = plan(el);
    el.__p.forEach(function (t) { t.h = t.el.animate([t.a, t.a], { duration: 1, fill: 'forwards' }); });
  }
  function show(el, extra) {
    var base = (parseFloat(el.getAttribute('data-delay')) || 0) + (extra || 0);
    (el.__p || []).forEach(function (t) {
      if (t.h) t.h.cancel();
      t.el.animate([t.a, t.b], { duration: t.d, delay: base + t.o, easing: t.e || EASE, fill: 'both' });
    });
  }

  function init(root, opts) {
    opts = opts || {};
    root = root || document;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var alive = true, offs = [];
    function on(t, ev, fn, o) { t.addEventListener(ev, fn, o); offs.push(function () { t.removeEventListener(ev, fn, o); }); }
    function qa(s) { return Array.prototype.slice.call(root.querySelectorAll(s)); }

    /* Smooth wheel scrolling — desktop pointers only, never on touch */
    var lenis = null, rafId = 0;
    if (!reduce && fine && window.Lenis) {
      try {
        lenis = new window.Lenis({ duration: 1.15, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, smoothWheel: true, wheelMultiplier: 0.9 });
        var loop = function (t) { if (!alive) return; lenis.raf(t); rafId = requestAnimationFrame(loop); };
        rafId = requestAnimationFrame(loop);
      } catch (e) { lenis = null; }
    }

    /* Reveals */
    var canAnimate = !reduce && 'IntersectionObserver' in window && !!Element.prototype.animate;
    /* Everything the observer is still holding at opacity 0. An element that goes from
       "below the fold" to "above the fold" in a single frame — an in-page anchor jump,
       a restored scroll position, a hard flick on a phone — crosses no threshold, so the
       observer never fires for it and it would stay invisible for the rest of the visit.
       The scroll frame sweeps this list and reveals anything that has gone past. */
    var pending = [];
    function settle(el) {
      var i = pending.indexOf(el);
      if (i > -1) pending.splice(i, 1);
    }
    var io = canAnimate ? new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); settle(en.target); show(en.target, en.target.__solo ? (n++) * 85 : 0); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 }) : null;
    function watch(el) { pending.push(el); io.observe(el); }
    /* `edge` is how far below the fold still counts as "should be showing by now":
       0 sweeps only what has already gone past, innerHeight also catches whatever is
       on screen. */
    function sweepPassed(edge) {
      if (!pending.length) return;
      var vh = window.innerHeight;
      for (var i = pending.length - 1; i >= 0; i--) {
        var el = pending[i], r = el.getBoundingClientRect();
        if (r.bottom < 0 || (edge && r.top < vh * 0.92)) {
          io.unobserve(el); pending.splice(i, 1); show(el);
        }
      }
    }
    /* The observer and the scroll frame both ride on the rendering loop. A tab that was
       restored from the back/forward cache, or throttled while in the background, can
       land on a scroll position having delivered nothing — and a held element is
       invisible, not merely un-animated. This runs off a timer instead, so content can
       never be left hidden whatever the rendering loop did. It costs nothing once the
       list is empty, and it only ever reveals what the viewer can already see. */
    var settleTimer = 0;
    function sweepSoon() {
      if (!pending.length) return;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(function () { if (alive) sweepPassed(true); }, 220);
    }
    function scan() {
      if (!io) return;
      /* Stacked layouts (<1024): tall stagger groups would finish animating off-screen,
         so each child is observed and revealed as it actually scrolls into view. */
      var stacked = window.innerWidth < 1024;
      qa('[data-reveal]').forEach(function (el) {
        if (el.__rv) return;
        el.__rv = 1;
        if (stacked && el.getAttribute('data-reveal') === 'stagger' && !el.hasAttribute('data-now')) {
          Array.prototype.slice.call(el.children).forEach(function (c) { c.__solo = 1; hold(c); watch(c); });
          return;
        }
        hold(el);
        if (el.hasAttribute('data-now')) show(el); else watch(el);
      });
    }
    scan();

    /* Scroll-linked effects */
    var par = [], scr = [], hs = [], small = false;
    /* Warm lazy images a screen or so before their section arrives: fetch + decode off the
       critical path so nothing pops in or hitches mid-scroll (horizontal tracks included,
       whose images never intersect on their own because they're clipped by the pin). */
    var warmIO = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (!e.isIntersecting) return;
        warmIO.unobserve(e.target);
        Array.prototype.slice.call(e.target.querySelectorAll('img[loading="lazy"]')).forEach(function (im) {
          im.loading = 'eager';
          if (im.decode) im.decode().catch(function () {});
        });
      });
    }, { rootMargin: '140% 0px 140% 0px' }) : null;
    function warm() {
      if (!warmIO) return;
      qa('img[loading="lazy"]').forEach(function (im) {
        var s = im.closest('[data-hscroll], section, footer') || im.parentElement;
        if (s && !s.__warm) { s.__warm = 1; warmIO.observe(s); }
      });
    }
    function collect() {
      warm();
      par = qa('[data-parallax]');
      scr = qa('[data-scrub]');
      hs.forEach(function (x) { if (x.offScroll) x.offScroll(); if (x.eio) x.eio.disconnect(); (x.ent || []).forEach(function (a) { a.cancel(); }); });
      hs = qa('[data-hscroll]').map(function (h) {
        var x = { h: h, pin: h.querySelector('[data-hscroll-pin]'), tr: h.querySelector('[data-hscroll-track]'), bar: h.querySelector('[data-hscroll-progress]'), on: false, dist: 0, items: [] };
        if (x.tr) {
          x.items = Array.prototype.slice.call(x.tr.children).map(function (f) {
            var img = f.querySelector('img');
            return { f: f, img: img, fr: img ? img.parentElement : null, cx: 0 };
          });
          /* Swipe mode: per-card motion depends only on scrollLeft, so it runs on the track's own
             scroll, never on every vertical page-scroll frame. */
          var tk = false;
          var fn = function () { if (x.on || tk) return; tk = true; requestAnimationFrame(function () { tk = false; if (alive && x.local) localFrame(x); }); };
          x.tr.addEventListener('scroll', fn, { passive: true });
          x.offScroll = function () { x.tr.removeEventListener('scroll', fn); };
        }
        return x;
      });
    }
    /* Swipe-gallery mode (touch / stacked layouts): entrance, per-card parallax, progress. */
    function localOn(x) {
      if (x.local) return;
      x.local = true;
      x.items.forEach(function (it) { if (it.img && !reduce) it.img.style.transition = 'none'; });
      if (!canAnimate || x.h.__entered) return;
      var A0 = { opacity: 0, transform: 'translate3d(48px,0,0)' };
      x.ent = x.items.map(function (it) { return it.f.animate([A0, A0], { duration: 1, fill: 'forwards' }); });
      /* Starts as soon as the track's top edge clears the bottom ~10% of the viewport */
      x.eio = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        x.eio.disconnect(); x.h.__entered = true;
        x.ent.forEach(function (a) { a.cancel(); });
        x.ent = x.items.map(function (it, i) { return it.f.animate([A0, { opacity: 1, transform: 'translate3d(0,0,0)' }], { duration: 950, delay: Math.min(i, 3) * 70, easing: EASE, fill: 'both' }); });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
      x.eio.observe(x.tr);
    }
    function localOff(x) {
      if (!x.local) return;
      x.local = false;
      if (x.eio) x.eio.disconnect();
      (x.ent || []).forEach(function (a) { a.cancel(); });
      x.ent = null; x.h.__entered = false;
      x.items.forEach(function (it) { if (it.img) { it.img.style.transform = ''; it.img.style.transition = ''; } if (it.fr) it.fr.style.transform = ''; });
    }
    function localFrame(x) {
      var tr = x.tr, cw = tr.clientWidth, max = tr.scrollWidth - cw, sl = tr.scrollLeft;
      if (x.bar) x.bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, Math.max(0, sl / max)) : 0).toFixed(4) + ')';
      if (reduce) return;
      x.items.forEach(function (it) {
        if (!it.img) return;
        var d = Math.max(-1.2, Math.min(1.2, (it.cx - sl - cw / 2) / cw));
        it.img.style.transform = 'translate3d(' + (-d * 7).toFixed(2) + '%,0,0) scale(1.16)';
        it.fr.style.transform = 'scale(' + (1 - Math.min(1, Math.abs(d)) * 0.07).toFixed(4) + ')';
      });
    }
    function measure() {
      small = window.innerWidth < 768;
      hs.forEach(function (x) {
        if (!x.pin || !x.tr) return;
        x.on = !reduce && getComputedStyle(x.pin).position === 'sticky';
        if (!x.on) {
          x.h.style.height = ''; x.tr.style.transform = ''; x.tr.style.willChange = '';
          localOn(x);
          var base = x.tr.offsetLeft;
          x.items.forEach(function (it) { it.cx = it.f.offsetLeft - base + it.f.offsetWidth / 2; });
          localFrame(x);
          return;
        }
        localOff(x);
        x.tr.style.willChange = 'transform';
        x.dist = Math.max(0, x.tr.scrollWidth - x.pin.clientWidth);
        x.h.style.height = (x.dist + window.innerHeight) + 'px';
      });
      if (reduce) scr.forEach(function (s) { s.style.setProperty('--p', '100%'); });
    }
    var lastY = window.scrollY, ticking = false;
    function frame() {
      ticking = false;
      if (!alive) return;
      var y = window.scrollY, vh = window.innerHeight;
      if (opts.onScroll) opts.onScroll(y, y > lastY ? 1 : (y < lastY ? -1 : 0));
      lastY = y;
      sweepPassed();
      if (reduce) return;
      /* Read every rect first, then write, so one frame never forces repeated style/layout passes */
      var pv = par.map(function (p) {
        var r = p.parentElement.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return null;
        var f = parseFloat(p.getAttribute('data-parallax')) || 0;
        if (small) f *= 0.7;
        return 'translate3d(0,' + ((r.top + r.height / 2 - vh / 2) * -f).toFixed(1) + 'px,0)';
      });
      par.forEach(function (p, i) { if (pv[i] !== null && p.__pt !== pv[i]) { p.__pt = pv[i]; p.style.transform = pv[i]; } });
      scr.forEach(function (s) {
        var r = s.getBoundingClientRect(), a = vh * 0.86 - r.top, b = r.bottom - vh * 0.42;
        var p = a <= 0 ? 0 : (b <= 0 ? 1 : a / (a + b));
        s.style.setProperty('--p', (p * 100).toFixed(1) + '%');
      });
      hs.forEach(function (x) {
        if (!x.on) return;
        var r = x.h.getBoundingClientRect(), span = r.height - vh;
        var p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
        x.tr.style.transform = 'translate3d(' + (-p * x.dist).toFixed(1) + 'px,0,0)';
        if (x.bar) x.bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      });
    }
    function req() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
    collect(); measure(); frame();
    on(window, 'scroll', function () { req(); sweepSoon(); }, { passive: true });
    on(document, 'visibilitychange', function () { if (!document.hidden) sweepSoon(); });
    on(window, 'pageshow', sweepSoon);
    on(window, 'resize', function () { measure(); req(); });
    on(window, 'load', function () { measure(); req(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (alive) { measure(); req(); } });

    /* Cursor-follow preview (fine pointers on desktop widths only; never on touch) */
    if (fine && !reduce) qa('[data-preview-list]').forEach(function (list) {
      var card = document.querySelector(list.getAttribute('data-preview-list'));
      if (!card) return;
      /* Mirror the CSS gate exactly: the card is display:none below 1024px, and a
         display:none <img src> still downloads. Sources live in data-src until here. */
      if (!window.matchMedia('(min-width: 1024px)').matches) return;
      var imgs = Array.prototype.slice.call(card.querySelectorAll('[data-preview-img]'));
      imgs.forEach(function (im) {
        var d = im.getAttribute('data-src');
        if (d) { im.src = d; im.removeAttribute('data-src'); }
      });
      var mx = 0, my = 0, cx = 0, cy = 0, ox = 0, live = false, r2 = 0, GAP = 36;
      /* Sits beside the cursor (right, or left near the right edge) so it never covers the row text under the pointer */
      function side() { var w = card.offsetWidth; return mx + GAP + w > window.innerWidth - 16 ? -(w / 2 + GAP) : (w / 2 + GAP); }
      function tick() {
        cx += (mx - cx) * 0.14; cy += (my - cy) * 0.14; ox += (side() - ox) * 0.12;
        var rot = Math.max(-5, Math.min(5, (mx - cx) * 0.05));
        var hh = card.offsetHeight, y = Math.max(12, Math.min(window.innerHeight - hh - 12, cy - hh / 2));
        card.style.transform = 'translate3d(' + (cx + ox - card.offsetWidth / 2).toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) rotate(' + rot.toFixed(2) + 'deg)';
        if (alive && (live || Math.abs(mx - cx) + Math.abs(my - cy) + Math.abs(side() - ox) > 0.6)) r2 = requestAnimationFrame(tick);
      }
      Array.prototype.slice.call(list.querySelectorAll('[data-preview]')).forEach(function (row) {
        on(row, 'mouseenter', function (e) {
          if (window.innerWidth < 1024) return;
          var i = row.getAttribute('data-preview');
          imgs.forEach(function (im) { im.style.opacity = im.getAttribute('data-preview-img') === i ? '1' : '0'; });
          if (!live) { cx = mx = e.clientX; cy = my = e.clientY; ox = side(); }
          live = true; card.style.opacity = '1';
          cancelAnimationFrame(r2); r2 = requestAnimationFrame(tick);
        });
        on(row, 'mousemove', function (e) { mx = e.clientX; my = e.clientY; });
      });
      on(list, 'mouseleave', function () { live = false; card.style.opacity = '0'; });
      offs.push(function () { cancelAnimationFrame(r2); });
    });

    /* Touch press feedback for buttons (hover states never fire on touch) */
    if (!fine && canAnimate) {
      var pressed = null;
      var release = function () {
        if (!pressed) return;
        var t = pressed; pressed = null;
        if (t.__pa) t.__pa.cancel();
        t.__pa = t.animate([{ transform: 'scale(.965)' }, { transform: 'scale(1)' }], { duration: 520, easing: EASE });
      };
      on(document, 'pointerdown', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('a,button') : null;
        if (!t || t.offsetHeight > 72 || t.offsetWidth > window.innerWidth * 0.92) return;
        release(); pressed = t;
        if (t.__pa) t.__pa.cancel();
        t.__pa = t.animate([{ transform: 'scale(1)' }, { transform: 'scale(.965)' }], { duration: 160, easing: EASE, fill: 'forwards' });
      }, { passive: true });
      on(document, 'pointerup', release, { passive: true });
      on(document, 'pointercancel', release, { passive: true });
      on(window, 'scroll', release, { passive: true });
    }

    /* Call links: on a normal page the browser hands tel: straight to the dialer / calling app.
       When the page is embedded (previews, iframes), a subframe often isn't allowed to launch
       external apps, so hand the tel: URL to the top-level window instead. */
    on(document, 'click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="tel:"]') : null;
      if (!a || window.top === window || e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var href = a.getAttribute('href');
      e.preventDefault();
      try { window.top.location.href = href; return; } catch (err) {}
      try { if (window.open(href, '_top')) return; } catch (err2) {}
      window.location.href = href;
    });

    /* In-page anchors */
    on(document, 'click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var id = a.getAttribute('href');
      if (!id || id.length < 2) return;
      var t = document.getElementById(id.slice(1));
      if (!t) return;
      e.preventDefault();
      /* A menu link may be tapped while the page is scroll-locked: release first, scroll next frame */
      if (lenis) lenis.start();
      document.documentElement.style.overflow = '';
      requestAnimationFrame(function () { api.scrollToEl(t); });
    });

    var api = {
      scrollToEl: function (t, immediate) {
        if (!t) return;
        var off = parseFloat(getComputedStyle(t).scrollMarginTop) || 0;
        var y = t.getBoundingClientRect().top + window.scrollY - off;
        if (lenis) lenis.scrollTo(y, { duration: 1.4, immediate: !!immediate, force: true });
        else window.scrollTo({ top: y, behavior: (reduce || immediate) ? 'auto' : 'smooth' });
      },
      refresh: function () { scan(); collect(); measure(); req(); },
      lock: function (b) {
        if (lenis) { if (b) lenis.stop(); else lenis.start(); }
        document.documentElement.style.overflow = b ? 'hidden' : '';
      },
      toTop: function () {
        if (lenis) lenis.scrollTo(0, { duration: 1.6 });
        else window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      },
      destroy: function () {
        alive = false; cancelAnimationFrame(rafId);
        if (lenis) lenis.destroy();
        if (io) io.disconnect();
        if (warmIO) warmIO.disconnect();
        hs.forEach(function (x) { if (x.offScroll) x.offScroll(); localOff(x); });
        offs.forEach(function (f) { f(); });
        document.documentElement.style.overflow = '';
      }
    };
    return api;
  }

  window.SiteMotion = { init: init };
})();
