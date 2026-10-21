/* Mehmet's Hair & Beauty London — appointment request wizard.
 *
 * Four steps (services → day & time → details → review) then an outcome step.
 * Nothing is a confirmed booking: when a backend is configured (see API_BASE
 * below), the request is POSTed to it and the salon confirms it separately.
 * Success is only shown when the server explicitly says it stored the
 * request and echoes back a reference. With no backend configured — the
 * static GitHub Pages build this repo publishes — the wizard completes the
 * request entirely client-side as a labelled demo and never transmits any
 * entered detail anywhere.
 */
(function () {
  'use strict';

  /* --------------------------------------------------------------- data -- */
  var CATS = [
    { name: 'Hair & Styling', items: ["Children's cuts", 'Fringe trim', 'Beard trim', 'Blow dry', 'Hairstyling',
      'Updos', 'Curly hair', 'Hair straightening', 'Braids', 'Twist braids', 'Box braids', 'Dreadlocks',
      'Perms', 'Hair extensions'] },
    { name: 'Colour & Treatments', items: ['Hair colouring', 'Hair highlighting', 'Balayage', 'Ombre hair colour',
      'Hair glossing', 'Hair glazing', 'Gloss or Glaze', 'Keratin treatments', 'Brazilian hair straightening',
      'Hair hydration treatments', 'Hair regrowth'] },
    { name: 'Beauty', items: ['Eyebrow threading', 'Body waxing', 'Laser hair removal', 'Manicure', 'Pedicure'] }
  ];
  var SERVICES = CATS.reduce(function (all, c) { return all.concat(c.items); }, []);
  var STEPS = ['Service', 'Date & time', 'Details', 'Review'];

  /* Published hours are 9:00–19:00. Preferred starts run 9:00–18:00 so every
     request leaves an hour before closing. */
  var SLOTS = [];
  for (var m = 540; m <= 1080; m += 30) SLOTS.push(m);
  var GROUPS = [['Morning', 540, 690], ['Afternoon', 720, 990], ['Evening', 1020, 1080]];

  /* Set this to the salon's real booking API origin (e.g. 'https://booking.example.com')
     to enable live submission once a production backend exists. Left empty, there is
     nothing to send to, so submit() never fetches and completes as a static demo. */
  var API_BASE = '';
  var ENDPOINT = 'api/booking-requests';
  var MAX_SVCS = 8;
  var MIN_LEAD_MIN = 60;

  var ARROW = '<svg width="16" height="10" viewBox="0 0 18 10" fill="none" stroke="currentColor" aria-hidden="true"><path d="M0 5h16.5M12.5 1l4 4-4 4"/></svg>';

  /* --------------------------------------------------------------- dom -- */
  var root = document.querySelector('[data-wizard]');
  if (!root) return;

  var el = {
    flow:        document.querySelector('[data-flow]'),
    pane:        document.querySelector('[data-pane]'),
    progress:    document.querySelector('[data-progress]'),
    progressMob: document.querySelector('[data-progress-mobile]'),
    tabs:        document.querySelector('[data-tabs]'),
    grid:        document.querySelector('[data-svc-grid]'),
    chips:       document.querySelector('[data-chips]'),
    selCount:    document.querySelector('[data-sel-count]'),
    selEmpty:    document.querySelector('[data-sel-empty]'),
    svcText:     document.querySelector('[data-svc-text]'),
    days:        document.querySelector('[data-days]'),
    more:        document.querySelector('[data-more]'),
    times:       document.querySelector('[data-times]'),
    timeGroups:  document.querySelector('[data-time-groups]'),
    dateLong:    document.querySelector('[data-date-long]'),
    reviewList:  document.querySelector('[data-review-list]'),
    doneGrid:    document.querySelector('[data-done-grid]'),
    firstName:   document.querySelector('[data-first-name]'),
    phoneOut:    document.querySelector('[data-phone-out]'),
    failMsg:     document.querySelector('[data-fail-msg]'),
    badgeLabel:  document.querySelector('[data-badge-label]'),
    headingLead: document.querySelector('[data-heading-lead]'),
    doneLede:    document.querySelector('[data-done-lede]'),
    previewNote: document.querySelector('[data-preview-note]'),
    actions:     document.querySelector('[data-actions]'),
    back:        document.querySelector('[data-back]'),
    next:        document.querySelector('[data-next]'),
    nextLabel:   document.querySelector('[data-next-label]'),
    barNote:     document.querySelector('[data-bar-note]'),
    cardStatus:  document.querySelector('[data-card-status]'),
    cardDot:     document.querySelector('[data-card-dot]'),
    picked:      document.querySelector('[data-picked]'),
    pickedName:  document.querySelector('[data-picked-name]'),
    form:        document.querySelector('[data-details-form]')
  };
  var fields = {
    name:    document.getElementById('bk-name'),
    phone:   document.getElementById('bk-phone'),
    email:   document.getElementById('bk-email'),
    notes:   document.getElementById('bk-notes'),
    website: document.getElementById('bk-website')
  };

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------------------------------------------------------------- state -- */
  var state = {
    step: 1,
    cat: 0,
    svcs: [],
    date: null,
    time: null,
    more: false,
    errs: {},
    hint: '',
    sending: false,
    result: null,
    preselected: null
  };
  var abortCtrl = null;

  /* ------------------------------------------------------------ helpers -- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function hm(x) { return pad(Math.floor(x / 60)) + ':' + pad(x % 60); }

  /* "Now" in the salon's timezone, independent of the visitor's clock. */
  function londonNow() {
    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', weekday: 'short', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    var get = function (t) {
      var p = parts.find(function (x) { return x.type === t; });
      return p ? p.value : '';
    };
    return {
      mins: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10),
      y: parseInt(get('year'), 10),
      mo: parseInt(get('month'), 10),
      d: parseInt(get('day'), 10)
    };
  }

  function dayList() {
    var t = londonNow();
    // If nothing is still bookable today, start the strip tomorrow.
    var startOff = SLOTS.some(function (x) { return x > t.mins + MIN_LEAD_MIN; }) ? 0 : 1;
    var count = (state.more || window.innerWidth < 1024) ? 28 : 14;
    var out = [];
    for (var i = 0; i < count; i++) {
      var k = startOff + i;
      var dt = new Date(Date.UTC(t.y, t.mo - 1, t.d + k));
      var o = { timeZone: 'UTC' };
      out.push({
        iso: dt.toISOString().slice(0, 10),
        wk: k === 0 ? 'Today' : dt.toLocaleDateString('en-GB', Object.assign({ weekday: 'short' }, o)),
        day: String(dt.getUTCDate()),
        mon: dt.toLocaleDateString('en-GB', Object.assign({ month: 'short' }, o)),
        long: dt.toLocaleDateString('en-GB', Object.assign({ weekday: 'long', day: 'numeric', month: 'long' }, o)),
        today: k === 0
      });
    }
    return out;
  }

  function slotsFor(iso, days) {
    var t = londonNow();
    var d = days.find(function (x) { return x.iso === iso; });
    return SLOTS.filter(function (x) { return !(d && d.today) || x > t.mins + MIN_LEAD_MIN; });
  }

  function toggleService(name) {
    var at = state.svcs.indexOf(name);
    if (at > -1) {
      state.svcs.splice(at, 1);
      state.hint = '';
    } else if (state.svcs.length >= MAX_SVCS) {
      state.hint = 'You can request up to ' + MAX_SVCS + ' services at once.';
    } else {
      state.svcs.push(name);
      state.hint = '';
    }
    render();
  }

  function validate() {
    var e = {};
    var name = fields.name.value.trim();
    var phone = fields.phone.value.trim();
    var email = fields.email.value.trim();
    var notes = fields.notes.value;
    var digits = phone.replace(/\D/g, '');

    if (name.length < 2) e.name = 'Please enter your name.';
    else if (name.length > 80) e.name = 'Please shorten your name.';

    if (!phone) e.phone = 'Please enter a phone number so the salon can confirm.';
    else if (!/^\+?[\d\s()-]{7,25}$/.test(phone) || digits.length < 10 || digits.length > 15) {
      e.phone = 'Please check the number, e.g. 07700 900123.';
    }

    if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) {
      e.email = 'Please check your email address.';
    }
    if (notes.length > 500) e.notes = 'Please keep notes under 500 characters.';
    return e;
  }

  /* --------------------------------------------------------- navigation -- */
  function go(step) {
    if (state.step === step) return;
    state.step = step;
    state.hint = '';
    render();
    stepChanged();
  }

  function stepChanged() {
    if (el.pane && !reduce && el.pane.animate) {
      el.pane.animate(
        [{ opacity: 0, transform: 'translate3d(0,18px,0)' }, { opacity: 1, transform: 'translate3d(0,0,0)' }],
        { duration: 760, easing: 'cubic-bezier(.16,1,.3,1)' }
      );
    }
    var motion = window.siteMotionInstance;
    if (el.flow) {
      var r = el.flow.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.55) {
        if (motion) motion.scrollToEl(el.flow);
        else window.scrollTo({ top: r.top + window.scrollY - 100, behavior: reduce ? 'auto' : 'smooth' });
      }
    }
    setTimeout(function () {
      var visible = el.pane.querySelector('.step:not([hidden]) [data-focus]');
      if (visible) visible.focus({ preventScroll: true });
    }, 80);
    if (motion) motion.refresh();
  }

  function next() {
    if (state.sending) return;
    if (state.step === 1) {
      if (!state.svcs.length) { state.hint = 'Choose at least one service to continue.'; return render(); }
      return go(2);
    }
    if (state.step === 2) {
      if (!state.date) { state.hint = 'Choose a day to continue.'; return render(); }
      if (!state.time) { state.hint = 'Choose a preferred time.'; return render(); }
      return go(3);
    }
    if (state.step === 3) {
      var errs = validate();
      var keys = Object.keys(errs);
      if (keys.length) {
        state.errs = errs;
        state.hint = 'Please check the highlighted details.';
        render();
        setTimeout(function () {
          var f = fields[keys[0]];
          if (f) f.focus();
        }, 30);
        return;
      }
      state.errs = {};
      return go(4);
    }
    if (state.step === 4) submit();
  }

  function back() {
    if (state.step > 1 && state.step < 5) go(state.step - 1);
  }

  /* ------------------------------------------------------------- submit -- */
  /* No backend exists to issue a real reference, so the demo result carries none —
     see renderOutcome(), which omits the Reference row entirely when staticPreview
     is set, rather than inventing one that looks genuine. */
  function staticPreviewResult(services) {
    return { ok: true, services: services, staticPreview: true };
  }

  function submit() {
    if (state.sending) return;

    var errs = validate();
    if (Object.keys(errs).length) {
      state.errs = errs;
      state.step = 3;
      state.hint = 'Please check the highlighted details.';
      render();
      return stepChanged();
    }
    if (!state.svcs.length) {
      state.step = 1;
      state.hint = 'Choose at least one service to continue.';
      render();
      return stepChanged();
    }

    var services = state.svcs.slice();

    state.sending = true;
    state.hint = '';
    render();

    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer;

    function finish(result) {
      clearTimeout(timer);
      abortCtrl = null;
      state.sending = false;
      state.result = result;
      state.step = 5;
      render();
      stepChanged();
    }

    /* No backend is configured (API_BASE is empty) — complete the demo locally after a
       short delay so the "Sending…" state still shows, without ever constructing or
       transmitting a request body containing the name, phone, email, notes, services,
       date or time entered above. */
    if (!API_BASE) {
      timer = setTimeout(function () { finish(staticPreviewResult(services)); }, 450);
      return;
    }

    var body = {
      services: services,
      date: state.date,
      time: state.time,
      name: fields.name.value.trim(),
      phone: fields.phone.value.trim(),
      email: fields.email.value.trim(),
      notes: fields.notes.value.trim(),
      website: fields.website.value
    };

    abortCtrl = ctrl;
    timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);

    fetch(API_BASE + ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (r) {
        var isJson = (r.headers.get('content-type') || '').indexOf('application/json') > -1;
        return (isJson ? r.json().catch(function () { return null; }) : Promise.resolve(null))
          .then(function (data) { return { r: r, data: data, isJson: isJson }; });
      })
      .then(function (res) {
        var r = res.r, data = res.data;
        /* API_BASE is set, so a real backend is expected to answer here. The salon's
           booking API always answers /api/ with JSON, success or error — that's how its
           own 404 route responds too — so a non-JSON reply means that configured backend
           is unreachable or broken, not that there's no backend at all (that case is
           already handled above, before any fetch is made). Treat it as a send failure. */
        if (!res.isJson) {
          return finish({ ok: false, msg: 'The online booking system isn’t available right now, so the salon did not receive your request.' });
        }
        // Only call it sent when the server confirms it stored the request.
        if (r.ok && data && data.status === 'received' && typeof data.reference === 'string' && data.reference) {
          var saved = Array.isArray(data.services) ? data.services : null;
          var mismatch = saved && (saved.length !== services.length ||
            saved.some(function (x, i) { return x !== services[i]; }));
          if (mismatch) {
            return finish({ ok: false, msg: 'The booking system didn’t record your services correctly, so we can’t be sure the request is right.' });
          }
          return finish({ ok: true, reference: data.reference, services: saved || services });
        }
        if (r.status === 400 && data && typeof data.error === 'string') return finish({ ok: false, msg: data.error });
        if (r.status === 429) return finish({ ok: false, msg: 'Too many requests have been sent from this connection in a short time. Please wait a few minutes.' });
        finish({ ok: false, msg: 'The online booking system isn’t available right now, so the salon did not receive your request.' });
      })
      .catch(function (err) {
        finish({
          ok: false,
          msg: err && err.name === 'AbortError'
            ? 'The booking system took too long to respond, so we can’t be sure the request arrived. Please call the salon before trying again.'
            : 'We couldn’t connect to the salon’s booking system, so your request was not sent.'
        });
      });
  }

  /* -------------------------------------------------------------- views -- */
  function renderTabs() {
    el.tabs.textContent = '';
    CATS.forEach(function (c, i) {
      var picked = c.items.filter(function (n) { return state.svcs.indexOf(n) > -1; }).length;
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', state.cat === i ? 'true' : 'false');
      b.textContent = c.name + (picked ? ' · ' + picked : '');
      b.addEventListener('click', function () { state.cat = i; render(); });
      el.tabs.appendChild(b);
    });
  }

  function renderServiceGrid() {
    var cat = CATS[state.cat];
    el.grid.setAttribute('aria-label', cat.name);
    el.grid.textContent = '';
    cat.items.forEach(function (name) {
      var picked = state.svcs.indexOf(name) > -1;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'svc-opt';
      b.setAttribute('role', 'checkbox');
      b.setAttribute('aria-checked', picked ? 'true' : 'false');
      b.innerHTML = '<span></span><span class="svc-opt__box" aria-hidden="true">' +
        '<svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.6 4 7.5 10 1"/></svg></span>';
      b.firstChild.textContent = name;
      b.addEventListener('click', function () { toggleService(name); });
      el.grid.appendChild(b);
    });
  }

  function renderSelection() {
    var n = state.svcs.length;
    el.selCount.textContent = n ? n + (n === 1 ? ' service selected' : ' services selected') : '';
    el.selEmpty.hidden = n > 0;
    el.chips.hidden = n === 0;
    el.chips.textContent = '';
    state.svcs.forEach(function (name) {
      var li = document.createElement('li');
      li.className = 'chip';
      var label = document.createElement('span');
      label.textContent = name;
      var x = document.createElement('button');
      x.type = 'button';
      x.setAttribute('aria-label', 'Remove ' + name);
      x.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true"><path d="M1 1l8 8M9 1 1 9"/></svg>';
      x.addEventListener('click', function () { toggleService(name); });
      li.appendChild(label);
      li.appendChild(x);
      el.chips.appendChild(li);
    });
  }

  function renderDays(days) {
    el.days.textContent = '';
    days.forEach(function (d) {
      var picked = state.date === d.iso;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'day';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', picked ? 'true' : 'false');
      b.setAttribute('aria-label', d.long + (d.today ? ', today' : ''));
      b.innerHTML = '<span class="day__wk"></span><span class="day__n"></span><span class="day__mo"></span>';
      b.children[0].textContent = d.wk;
      b.children[1].textContent = d.day;
      b.children[2].textContent = d.mon;
      b.addEventListener('click', function () {
        if (state.date !== d.iso) state.time = null;
        state.date = d.iso;
        state.hint = '';
        render();
      });
      el.days.appendChild(b);
    });
    el.more.textContent = state.more ? 'Show fewer dates' : 'Show later dates';
  }

  function renderTimes(days) {
    var day = days.find(function (x) { return x.iso === state.date; });
    el.times.hidden = !day;
    if (!day) return;

    el.dateLong.textContent = day.long;
    var open = slotsFor(state.date, days);
    el.timeGroups.textContent = '';

    GROUPS.forEach(function (g) {
      var inGroup = open.filter(function (x) { return x >= g[1] && x <= g[2]; });
      if (!inGroup.length) return;

      var wrap = document.createElement('div');
      wrap.className = 'times__group';
      var name = document.createElement('span');
      name.className = 'times__name';
      name.textContent = g[0];
      var grid = document.createElement('div');
      grid.className = 'times__grid';
      grid.setAttribute('role', 'radiogroup');
      grid.setAttribute('aria-label', g[0]);

      inGroup.forEach(function (x) {
        var v = hm(x);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', state.time === v ? 'true' : 'false');
        b.textContent = v;
        b.addEventListener('click', function () { state.time = v; state.hint = ''; render(); });
        grid.appendChild(b);
      });

      wrap.appendChild(name);
      wrap.appendChild(grid);
      el.timeGroups.appendChild(wrap);
    });
  }

  function renderErrors() {
    ['name', 'phone', 'email', 'notes'].forEach(function (k) {
      var msg = state.errs[k] || '';
      var input = fields[k];
      var out = document.getElementById('bk-' + k + '-err');
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      out.textContent = msg;
      out.classList.toggle('is-shown', !!msg);
    });
  }

  function renderReview(day) {
    var svcKey = state.svcs.length > 1 ? 'Services' : 'Service';
    var when = day ? day.long : '';
    var rows = [
      { k: svcKey, v: state.svcs.join(', '), go: 1, aria: 'Edit services' },
      { k: 'Preferred time', v: when && state.time ? when + ' at ' + state.time : '', go: 2, aria: 'Edit day and time' },
      { k: 'Name', v: fields.name.value.trim(), go: 3, aria: 'Edit details' },
      { k: 'Phone', v: fields.phone.value.trim() },
      { k: 'Email', v: fields.email.value.trim() || 'Not given' },
      { k: 'Notes', v: fields.notes.value.trim() || 'None' }
    ];

    el.reviewList.textContent = '';
    rows.forEach(function (row) {
      var wrap = document.createElement('div');
      wrap.className = 'review-row';
      var dt = document.createElement('dt');
      dt.textContent = row.k;
      var dd = document.createElement('dd');
      dd.textContent = row.v;
      wrap.appendChild(dt);
      if (row.go) {
        var edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'text-btn';
        edit.textContent = 'Edit';
        edit.setAttribute('aria-label', row.aria);
        edit.addEventListener('click', function () { go(row.go); });
        wrap.appendChild(edit);
      }
      wrap.appendChild(dd);
      el.reviewList.appendChild(wrap);
    });
  }

  function renderOutcome(day) {
    var res = state.result || {};
    if (res.ok) {
      if (el.badgeLabel) el.badgeLabel.textContent = res.staticPreview ? 'Preview — not sent' : 'Awaiting salon confirmation';
      if (el.headingLead) el.headingLead.textContent = res.staticPreview ? 'Demo complete' : 'Request received';
      if (el.doneLede) el.doneLede.hidden = !!res.staticPreview;
      if (el.previewNote) el.previewNote.hidden = !res.staticPreview;
      el.firstName.textContent = fields.name.value.trim().split(/\s+/)[0] || '';
      el.phoneOut.textContent = fields.phone.value.trim();
      var rows = [
        [state.svcs.length > 1 ? 'Services' : 'Service', (res.services || state.svcs).join(', ')],
        ['Requested day', day ? day.long : ''],
        ['Preferred time', state.time || '']
      ];
      /* No backend means no real reference was issued — see staticPreviewResult(). */
      if (!res.staticPreview) rows.push(['Reference', res.reference || '']);
      el.doneGrid.textContent = '';
      rows.forEach(function (r) {
        var box = document.createElement('div');
        var dt = document.createElement('dt');
        dt.textContent = r[0];
        var dd = document.createElement('dd');
        dd.textContent = r[1];
        box.appendChild(dt);
        box.appendChild(dd);
        el.doneGrid.appendChild(box);
      });
    } else {
      el.failMsg.textContent = res.msg || '';
    }
  }

  function renderRail(day) {
    var res = state.result || {};
    var dayShort = day ? day.wk + ' ' + day.day + ' ' + day.mon : '';
    var values = [
      state.svcs.join(', '),
      dayShort ? (state.time ? dayShort + ' · ' + state.time : dayShort) : '',
      fields.name.value.trim(),
      state.step >= 5 ? (res.ok ? (res.staticPreview ? 'Preview' : 'Sent') : 'Not sent') : (state.step === 4 ? 'Check and send' : '')
    ];
    var hints = ['Choose below', 'Choose below', 'Add your details', 'Check and send'];

    for (var i = 0; i < 4; i++) {
      var n = i + 1;
      var li = document.querySelector('[data-rail-step="' + n + '"]');
      if (!li) continue;
      var done = state.step > n;
      var current = state.step === n;
      var clickable = n < state.step && state.step < 5;
      var value = values[i];

      li.classList.toggle('is-done', done);
      li.classList.toggle('is-current', current);
      li.classList.toggle('has-value', !!value);
      li.querySelector('[data-rail-value]').textContent = value || (current ? hints[i] : '—');

      var btn = li.querySelector('[data-rail-go]');
      btn.disabled = !clickable;
      btn.setAttribute('aria-label', clickable ? 'Edit ' + STEPS[i].toLowerCase() : STEPS[i]);
      li.setAttribute('aria-current', current ? 'step' : 'false');
    }

    var sent = state.step === 5;
    el.cardStatus.textContent = sent
      ? (res.ok ? (res.staticPreview ? 'Preview — not sent' : 'Sent · awaiting salon confirmation') : 'Not sent')
      : (state.step === 4 ? 'Ready to send' : 'Draft · not sent yet');
    el.cardDot.classList.toggle('is-open', (sent && res.ok) || state.step === 4);
    el.cardDot.style.background = sent && !res.ok ? '#C46A5E' : '';
  }

  function renderProgress() {
    for (var i = 0; i < 4; i++) {
      var li = document.querySelector('[data-progress-step="' + (i + 1) + '"]');
      if (!li) continue;
      li.classList.toggle('is-filled', state.step > i);
      li.classList.toggle('is-current', state.step === i + 1);
      li.classList.toggle('is-done', state.step > i + 1);
      li.setAttribute('aria-current', state.step === i + 1 ? 'step' : 'false');
    }
    el.progressMob.textContent = STEPS[Math.min(4, state.step) - 1];
    el.progress.hidden = state.step >= 5;
  }

  function renderActions(day) {
    var ready = state.step === 1 ? state.svcs.length > 0
      : state.step === 2 ? !!(state.date && state.time)
      : true;
    var when = day ? day.long : '';
    var note = state.hint || (
      state.step === 1 && state.svcs.length
        ? state.svcs.length + (state.svcs.length === 1 ? ' service selected' : ' services selected')
        : state.step === 2 && state.time && when
          ? when.split(' ').slice(0, 3).join(' ') + ' · ' + state.time
          : ''
    );

    el.actions.hidden = state.step >= 5;
    el.back.classList.toggle('is-invisible', state.step <= 1);
    el.barNote.textContent = note;
    el.barNote.classList.toggle('is-hint', !!state.hint);
    el.nextLabel.textContent = state.step === 4
      ? (state.sending ? 'Sending…' : 'Send request')
      : (state.step === 3 ? 'Review request' : 'Continue');
    el.next.setAttribute('aria-disabled', ready && !state.sending ? 'false' : 'true');
  }

  function render() {
    var days = dayList();
    var day = days.find(function (x) { return x.iso === state.date; }) || null;

    // Only the active step is in the document flow
    var map = { 1: '1', 2: '2', 3: '3', 4: '4' };
    Object.keys(map).forEach(function (k) {
      var node = document.querySelector('[data-step="' + k + '"]');
      if (node) node.hidden = state.step !== Number(k);
    });
    var res = state.result || {};
    document.querySelector('[data-step="5-ok"]').hidden = !(state.step === 5 && res.ok);
    document.querySelector('[data-step="5-fail"]').hidden = !(state.step === 5 && !res.ok);

    if (state.step === 1) { renderTabs(); renderServiceGrid(); renderSelection(); }
    if (state.step === 2) {
      el.svcText.textContent = state.svcs.join(', ');
      renderDays(days);
      renderTimes(days);
    }
    if (state.step === 3) renderErrors();
    if (state.step === 4) renderReview(day);
    if (state.step === 5) renderOutcome(day);

    renderRail(day);
    renderProgress();
    renderActions(day);
  }

  /* --------------------------------------------------------------- wire -- */
  el.next.addEventListener('click', next);
  el.back.addEventListener('click', back);
  el.more.addEventListener('click', function () { state.more = !state.more; render(); });
  el.form.addEventListener('submit', function (e) { e.preventDefault(); next(); });

  document.querySelectorAll('[data-goto]').forEach(function (b) {
    b.addEventListener('click', function () { go(Number(b.getAttribute('data-goto'))); });
  });
  document.querySelectorAll('[data-rail-go]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!b.disabled) go(Number(b.getAttribute('data-rail-go')));
    });
  });
  document.querySelector('[data-retry]').addEventListener('click', function () { submit(); });
  document.querySelector('[data-restart]').addEventListener('click', function () {
    state.step = 1;
    state.svcs = [];
    state.date = null;
    state.time = null;
    state.result = null;
    state.hint = '';
    state.errs = {};
    fields.notes.value = '';
    fields.website.value = '';
    render();
    stepChanged();
  });

  // Typing clears that field's error straight away
  ['name', 'phone', 'email', 'notes'].forEach(function (k) {
    fields[k].addEventListener('input', function () {
      if (!state.errs[k]) return;
      delete state.errs[k];
      renderErrors();
    });
  });

  // The day strip holds 14 dates on desktop and 28 below it
  var resizeRaf = 0;
  var lastNarrow = window.innerWidth < 1024;
  window.addEventListener('resize', function () {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(function () {
      var narrow = window.innerWidth < 1024;
      if (narrow === lastNarrow) return;
      lastNarrow = narrow;
      if (state.step === 2) render();
    });
  });

  window.addEventListener('beforeunload', function () { if (abortCtrl) abortCtrl.abort(); });

  /* Deep link from the Services page: services.html → booking.html?service=Balayage */
  (function preselect() {
    try {
      var q = (new URLSearchParams(window.location.search).get('service') || '').trim().toLowerCase();
      if (!q) return;
      var match = SERVICES.find(function (n) { return n.toLowerCase() === q; });
      if (!match) return;
      state.svcs = [match];
      state.cat = CATS.findIndex(function (c) { return c.items.indexOf(match) > -1; });
      state.step = 2;
      state.preselected = match;
      el.pickedName.textContent = match;
      el.picked.hidden = false;
    } catch (e) { /* no deep link */ }
  })();

  render();
})();
