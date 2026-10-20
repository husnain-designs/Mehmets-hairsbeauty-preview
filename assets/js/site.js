/* Mehmet's Hair & Beauty London — shared page behaviour.
 *
 * Owns the things that are genuinely stateful: the header's scroll response,
 * the fullscreen menu, the live open/closed clock, the Services scroll-spy and
 * the live-review swap. Everything layout-related lives in site.css as media
 * queries, so the page is correct before this file runs.
 */
(function () {
  'use strict';

  var PHONE_HOURS = { open: 540, close: 1140 };   // 09:00 – 19:00, Europe/London
  var motion = null;

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------------------------------------------------------- open now -- */
  function londonMinutes() {
    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    var get = function (type) {
      var p = parts.find(function (x) { return x.type === type; });
      return p ? parseInt(p.value, 10) : 0;
    };
    return get('hour') * 60 + get('minute');
  }

  function paintStatus() {
    var mins = londonMinutes();
    var open = mins >= PHONE_HOURS.open && mins < PHONE_HOURS.close;
    var text = open
      ? 'Open now · until 19:00'
      : (mins < PHONE_HOURS.open ? 'Closed · opens today at 9:00' : 'Closed · opens tomorrow at 9:00');
    qsa('[data-status-text]').forEach(function (el) { el.textContent = text; });
    qsa('[data-status-dot]').forEach(function (el) { el.classList.toggle('is-open', open); });
  }

  /* ------------------------------------------------------------ header -- */
  function initHeader() {
    var header = qs('[data-site-header]');
    var quickBar = qs('[data-quick-bar]');
    var subnav = qs('[data-subnav]');
    var menu = qs('[data-menu]');
    if (!header) return function () {};

    var state = { scrolled: false, hidden: false };

    return function onScroll(y, dir) {
      var scrolled = y > 40;
      var hidden = state.hidden;
      if (y < 480 || dir < 0) hidden = false;
      else if (dir > 0) hidden = true;
      if (scrolled === state.scrolled && hidden === state.hidden) return;
      state.scrolled = scrolled;
      state.hidden = hidden;

      var menuOpen = menu && menu.classList.contains('is-open');
      header.classList.toggle('is-scrolled', scrolled);
      header.classList.toggle('is-ink', scrolled && !menuOpen);
      header.classList.toggle('is-hidden', hidden && !menuOpen);
      if (quickBar) quickBar.classList.toggle('is-down', !!menuOpen);
      if (subnav) subnav.classList.toggle('is-raised', hidden);
    };
  }

  /* -------------------------------------------------------------- menu -- */
  function initMenu() {
    var menu = qs('[data-menu]');
    var header = qs('[data-site-header]');
    var quickBar = qs('[data-quick-bar]');
    var openBtn = qs('[data-menu-open]');
    if (!menu || !openBtn) return;

    function setOpen(open) {
      if (menu.classList.contains('is-open') === open) return;
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      openBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (quickBar) quickBar.classList.toggle('is-down', open);
      if (header) {
        // While the menu is up the header must not hide or invert behind it
        header.classList.toggle('is-hidden', false);
        header.classList.toggle('is-ink', !open && header.classList.contains('is-scrolled'));
      }
      if (motion) motion.lock(open);
      if (open) {
        setTimeout(function () {
          var first = qs('.site-menu__nav a', menu);
          if (first) first.focus({ preventScroll: true });
        }, 80);
      } else {
        openBtn.focus({ preventScroll: true });
      }
    }

    openBtn.addEventListener('click', function () { setOpen(!menu.classList.contains('is-open')); });
    qsa('[data-menu-close]', menu).forEach(function (b) { b.addEventListener('click', function () { setOpen(false); }); });
    // Any menu link closes the panel; site-motion handles the in-page scroll itself
    qsa('a', menu).forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) setOpen(false);
    });

    // Keep focus inside the panel while it is modal
    menu.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || !menu.classList.contains('is-open')) return;
      var items = qsa('a[href], button:not([disabled])', menu);
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* --------------------------------------------- responsive parallax -- */
  /* The prototypes toggled data-parallax from JS by viewport width; attributes
     can't be set from CSS, so the switch stays here and nowhere else. */
  function syncParallax() {
    var changed = false;
    qsa('[data-parallax-below]').forEach(function (el) {
      var below = parseFloat(el.getAttribute('data-parallax-below')) || 0;
      var want = window.innerWidth < below ? (el.getAttribute('data-parallax-value') || '0.2') : null;
      var has = el.getAttribute('data-parallax');
      if (want === has) return;
      changed = true;
      if (want === null) { el.removeAttribute('data-parallax'); el.style.transform = ''; delete el.__pt; }
      else el.setAttribute('data-parallax', want);
    });
    return changed;
  }

  /* ------------------------------------------------ service row press -- */
  /* site-motion's generic touch feedback deliberately skips anything taller
     than 72px or near-full-width, which is every service row (76px), so the
     rows get nothing on tap while :hover carries all the feedback on desktop.
     This drives the same end state from pointer events instead.
     Mouse pointers are ignored so the desktop :hover path is untouched. */
  function initServicePress() {
    var rows = qsa('.cat__item, .svc-row');
    if (!rows.length || !window.PointerEvent) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var MIN_HOLD = reduce ? 0 : 160;   // keep the state readable on a fast tap
    var SLOP = 10;                     // movement past this is a scroll, not a tap
    var active = null, x0 = 0, y0 = 0, downAt = 0, timer = 0;

    function release(now) {
      if (!active) return;
      var row = active;
      active = null;
      clearTimeout(timer);
      var wait = now ? 0 : Math.max(0, MIN_HOLD - (Date.now() - downAt));
      if (wait) timer = setTimeout(function () { row.classList.remove('is-pressed'); }, wait);
      else row.classList.remove('is-pressed');
    }

    rows.forEach(function (row) {
      row.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse') return;        // desktop keeps :hover
        release(true);
        active = row; x0 = e.clientX; y0 = e.clientY; downAt = Date.now();
        clearTimeout(timer);
        row.classList.add('is-pressed');
      }, { passive: true });
    });

    // Scrolling with a finger down must never leave a row lit
    document.addEventListener('pointermove', function (e) {
      if (!active) return;
      if (Math.abs(e.clientX - x0) > SLOP || Math.abs(e.clientY - y0) > SLOP) release(true);
    }, { passive: true });

    ['pointerup', 'pointercancel'].forEach(function (ev) {
      document.addEventListener(ev, function () { release(false); }, { passive: true });
    });
    window.addEventListener('scroll', function () { release(true); }, { passive: true });
    // Back-forward cache can restore the page mid-press
    window.addEventListener('pagehide', function () { release(true); });
  }

  /* ----------------------------------------------- services scroll-spy -- */
  function initCategorySpy() {
    var links = qsa('[data-subnav] a');
    var sections = qsa('[data-cat]');
    if (!links.length || !sections.length || !('IntersectionObserver' in window)) return;

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.id;
        links.forEach(function (a) {
          a.setAttribute('aria-current', a.getAttribute('href') === '#' + id ? 'true' : 'false');
        });
      });
      /* A 5%-tall band (-40/-55) is thin enough that a hard flick on a phone can carry a
         section boundary straight across it between samples, leaving the tab highlight on
         the previous category. 20% is still unambiguous — only one section can occupy it —
         and it survives fast scrolling. */
    }, { rootMargin: '-30% 0px -50% 0px', threshold: 0 });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* -------------------------------------------------------- live reviews -- */
  /* Swaps the three static quotes for the cached Google Business Profile feed
     when the server has one. Fails silently: the static quotes stay. */
  function loadReviews() {
    var host = qs('[data-reviews]');
    if (!host) return;

    fetch('api/reviews', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        var isJson = (r.headers.get('content-type') || '').indexOf('json') > -1;
        return r.ok && isJson ? r.json() : null;
      })
      .then(function (data) {
        if (!data || data.status !== 'ok' || !Array.isArray(data.reviews)) return;
        var list = data.reviews
          .filter(function (x) { return x && x.comment && x.comment.trim(); })
          .slice(0, 6);
        if (!list.length) return;

        host.textContent = '';
        list.forEach(function (x) {
          var n = Math.max(1, Math.min(5, x.star_rating || 5));
          var fig = document.createElement('figure');
          fig.className = 'review';
          fig.setAttribute('data-reveal', 'up');

          var stars = document.createElement('span');
          stars.className = 'review__stars';
          stars.setAttribute('aria-label', n + ' out of 5 stars');
          stars.textContent = '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

          var quote = document.createElement('blockquote');
          quote.textContent = '“' + x.comment.trim() + '”';

          var cap = document.createElement('figcaption');
          cap.textContent = (x.author_name || 'Google reviewer') + ' ';
          var src = document.createElement('span');
          src.textContent = '· Google review';
          cap.appendChild(src);

          fig.appendChild(stars);
          fig.appendChild(quote);
          fig.appendChild(cap);
          host.appendChild(fig);
        });

        if (typeof data.average_rating === 'number') {
          var score = qs('[data-reviews-score]');
          if (score) score.textContent = data.average_rating.toFixed(1);
        }
        if (typeof data.total_reviews === 'number') {
          var count = qs('[data-reviews-count]');
          if (count) count.textContent = String(data.total_reviews);
        }
        if (motion) motion.refresh();
      })
      .catch(function () { /* static quotes remain */ });
  }

  /* ------------------------------------------------------- hash landing -- */
  /* Cross-page links such as index.html#reviews: wait for fonts so the measured
     offset matches the final layout, then jump without animating. */
  function hashGo() {
    var id = (window.location.hash || '').slice(1);
    if (!id || !/^[a-z][\w-]*$/i.test(id)) return;
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () {
      setTimeout(function () {
        var target = document.getElementById(id);
        if (!target || !motion) return;
        motion.refresh();
        motion.scrollToEl(target, true);
      }, 160);
    });
  }

  /* -------------------------------------------------------------- boot -- */
  function boot() {
    paintStatus();
    setInterval(paintStatus, 60000);

    syncParallax();
    initMenu();
    initCategorySpy();
    initServicePress();

    var onScroll = initHeader();

    var start = function () {
      if (!window.SiteMotion) { setTimeout(start, 40); return; }
      motion = window.SiteMotion.init(document, { onScroll: onScroll });
      window.siteMotionInstance = motion;   // booking.js scrolls through the same instance
      hashGo();
      loadReviews();
    };
    start();

    var raf = 0;
    window.addEventListener('resize', function () {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        if (syncParallax() && motion) motion.refresh();
      });
    });

    qsa('[data-to-top]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (motion) motion.toTop();
        else window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
