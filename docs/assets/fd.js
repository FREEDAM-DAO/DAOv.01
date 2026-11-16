/*
 * FREEDAM Instrument Kit (fd.js) — shared behaviors for freedamdao.org
 * Visual language adapted from vercel-labs/ui (Apache-2.0, © Vercel —
 * https://github.com/vercel-labs/ui). Original implementation; no upstream source copied.
 * See docs/assets/THIRD_PARTY_NOTICES.md for attribution.
 *
 * No wallet code here — ethers loads only on pages that need it.
 * All motion respects prefers-reduced-motion and the site-wide Motion toggle.
 */
(function () {
  'use strict';

  /* ---------------- Motion: on/off footer toggle (persists) ---------------- */
  function applyMotion(on) {
    document.body.dataset.motion = on ? 'on' : 'off';
  }
  window.fdInstallMotionToggle = function (container) {
    var host = container || document.querySelector('.fd-footer-motion');
    if (!host) return;
    var saved = localStorage.getItem('fd-motion');
    var on = saved === null ? true : saved === 'on';
    applyMotion(on);
    var btn = document.createElement('button');
    btn.className = 'fd-switch';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', String(on));
    btn.setAttribute('aria-label', 'Motion effects');
    btn.innerHTML = '<span class="fd-switch-knob"></span>';
    var label = document.createElement('span');
    label.textContent = 'Motion: ' + (on ? 'on' : 'off');
    label.style.color = 'var(--fd-dim)';
    btn.addEventListener('click', function () {
      on = !on;
      localStorage.setItem('fd-motion', on ? 'on' : 'off');
      applyMotion(on);
      btn.setAttribute('aria-checked', String(on));
      label.textContent = 'Motion: ' + (on ? 'on' : 'off');
    });
    var wrap = document.createElement('span');
    wrap.className = 'fd-switch-wrap';
    wrap.appendChild(btn);
    wrap.appendChild(label);
    host.appendChild(wrap);
  };

  /* ---------------- LED meter: renders segments + MANDATORY printed text ---------------- */
  window.fdMeter = function (opts) {
    var el = document.createElement('div');
    el.className = 'fd-meter';
    var track = document.createElement('div');
    track.className = 'fd-meter-track';
    track.setAttribute('aria-hidden', 'true');
    var pct = opts.forAura + opts.againstAura > 0
      ? Math.round((opts.forAura / (opts.forAura + opts.againstAura)) * 100) : 0;
    var forSegs = document.createElement('div');
    forSegs.className = 'fd-meter-seg fd-lit-for';
    forSegs.style.flexBasis = pct + '%';
    for (var i = 0; i < 10; i++) forSegs.appendChild(document.createElement('i'));
    var againstSegs = document.createElement('div');
    againstSegs.className = 'fd-meter-seg fd-lit-against';
    againstSegs.style.flex = '1';
    for (var j = 0; j < 10; j++) againstSegs.appendChild(document.createElement('i'));
    track.appendChild(forSegs); track.appendChild(againstSegs);
    var readout = document.createElement('p');
    readout.className = 'fd-meter-readout';
    var forPct = pct, againstPct = 100 - pct;
    readout.innerHTML =
      '<span class="fd-for-num">' + forPct + '% FOR</span> · ' +
      '<span class="fd-against-num">' + againstPct + '% AGAINST</span> · ' +
      opts.forAura.toLocaleString('en-US') + ' vs ' +
      opts.againstAura.toLocaleString('en-US') + ' Aura · ' +
      (opts.forCount + opts.againstCount) + ' members';
    el.appendChild(track); el.appendChild(readout);
    return el;
  };

  /* ---------------- LCD status readout (real text in role=status) ---------------- */
  var LCD_TONES = {
    open: '', stalled: 'warn', proposed: '',
    resolved_yes: 'for', resolved_no: 'against',
    unresolved: 'warn', in_appeal: 'warn'
  };
  window.fdLCD = function (state, detail) {
    var wrap = document.createElement('p');
    wrap.className = 'fd-lcd';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('data-tone', LCD_TONES[state] || '');
    var dot = document.createElement('span');
    dot.className = 'fd-lcd-dot';
    dot.setAttribute('aria-hidden', 'true');
    var text = document.createElement('span');
    text.textContent = state.replace('_', ' ').toUpperCase() + (detail ? ' · ' + detail : '');
    wrap.appendChild(dot); wrap.appendChild(text);
    return wrap;
  };

  /* ---------------- ARIA tabs with arrow-key navigation ---------------- */
  window.fdTabs = function (tablist) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
    function select(tab, focus) {
      tabs.forEach(function (t, i) {
        var sel = t === tab;
        t.setAttribute('aria-selected', String(sel));
        t.setAttribute('tabindex', sel ? '0' : '-1');
        panels[i].hidden = !sel;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t, false); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); }
      });
    });
    select(tabs[0], false);
  };

  /* ---------------- Stake dial (native range input) ---------------- */
  window.fdDial = function (opts) {
    var wrap = document.createElement('div');
    wrap.className = 'fd-dial-wrap';
    var input = document.createElement('input');
    input.type = 'range';
    input.className = 'fd-dial';
    input.min = opts.min; input.max = opts.max; input.step = opts.step || 1;
    input.value = Math.max(opts.min, opts.value || opts.min);
    input.setAttribute('aria-label', 'Aura to stake');
    var readout = document.createElement('p');
    readout.className = 'fd-dial-readout';
    readout.setAttribute('aria-live', 'polite');
    function paint() {
      var pct = ((input.value - input.min) / (input.max - input.min)) * 100;
      input.style.setProperty('--fd-fill', pct + '%');
      readout.textContent = Number(input.value).toLocaleString('en-US') + ' Aura';
    }
    input.addEventListener('input', paint);
    wrap.appendChild(input); wrap.appendChild(readout);
    if (opts.hint) {
      var h = document.createElement('p');
      h.className = 'fd-dial-hint';
      h.textContent = opts.hint;
      wrap.appendChild(h);
    }
    paint();
    wrap.getValue = function () { return Number(input.value); };
    return wrap;
  };
})();
