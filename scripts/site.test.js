/* Increment 1 acceptance harness — markets pages + fd.js kit, run with `node scripts/site.test.js` */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', 'docs');
let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  PASS', name); }
  catch (e) { failures++; console.log('  FAIL', name, '—', e.message); }
}

// 1. markets.json schema (spec §2.1, 12 fields + derived)
const raw = fs.readFileSync(path.join(ROOT, 'data', 'markets.json'), 'utf8');
const data = JSON.parse(raw);
const REQ = ['id', 'title', 'jurisdiction', 'summary_plain', 'policy_link', 'condition',
  'resolution_source', 'opens_at', 'stake_window_ends', 'deadline', 'state', 'totals'];
check('markets.json: 5 seed markets present', () => assert.strictEqual(data.markets.length, 5));
check('markets.json: every market has all required fields', () => {
  for (const m of data.markets) {
    for (const f of REQ) assert.ok(m[f] !== undefined && m[f] !== null && m[f] !== '', `${m.id} missing ${f}`);
    assert.ok(m.coi_flags && m.resolution && m.data_as_of, `${m.id} missing coi_flags/resolution/data_as_of`);
  }
});
check('markets.json: titles ≤80 chars, stake window ≥72h after opens', () => {
  for (const m of data.markets) {
    assert.ok(m.title.length <= 80, m.id + ' title too long');
    assert.ok(new Date(m.stake_window_ends) - new Date(m.opens_at) >= 72 * 3600 * 1000, m.id + ' window < 72h');
    assert.ok(new Date(m.stake_window_ends) <= new Date(m.deadline), m.id + ' window ends after deadline');
  }
});
check('markets.json: no PII fields (no names/emails/addresses beyond 0x COI)', () => {
  const s = raw.toLowerCase();
  for (const pii of ['email', '@gmail', '@icloud', 'phone', 'full_name']) assert.ok(!s.includes(pii), 'found ' + pii);
});
check('markets.json: valid state vocabulary only', () => {
  const V = ['proposed', 'open', 'stalled', 'resolved_yes', 'resolved_no', 'unresolved', 'in_appeal'];
  for (const m of data.markets) assert.ok(V.includes(m.state), m.id + ' bad state ' + m.state);
});

// 2. kit unit behavior in jsdom
const kitSrc = fs.readFileSync(path.join(ROOT, 'assets', 'fd.js'), 'utf8');
function freshDom(html) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://freedamdao.org/test' });
  dom.window.eval(kitSrc);
  return dom;
}
check('fd.js: meter prints text, never color-only', () => {
  const dom = freshDom('<div id="h"></div>');
  const el = dom.window.fdMeter({ forAura: 1240, againstAura: 760, forCount: 41, againstCount: 25 });
  const text = el.querySelector('.fd-meter-readout').textContent;
  assert.ok(text.includes('62% FOR') && text.includes('1,240 vs 760 Aura') && text.includes('66 members'), text);
  assert.strictEqual(el.querySelector('.fd-meter-track').getAttribute('aria-hidden'), 'true');
});
check('fd.js: LCD is real text in role=status', () => {
  const dom = freshDom('<div id="h"></div>');
  const el = dom.window.fdLCD('open', '14D LEFT');
  assert.strictEqual(el.getAttribute('role'), 'status');
  assert.ok(el.textContent.includes('OPEN · 14D LEFT'));
});
check('fd.js: tabs ARIA pattern + arrow keys', () => {
  const dom = freshDom(`<div role="tablist" id="t">
    <button role="tab" id="a" aria-controls="pa">A</button>
    <button role="tab" id="b" aria-controls="pb">B</button></div>
    <div role="tabpanel" id="pa">pA</div><div role="tabpanel" id="pb" >pB</div>`);
  dom.window.fdTabs(dom.window.document.getElementById('t'));
  const d = dom.window.document;
  assert.strictEqual(d.getElementById('a').getAttribute('aria-selected'), 'true');
  assert.strictEqual(d.getElementById('pa').hidden, false);
  assert.strictEqual(d.getElementById('pb').hidden, true);
  d.getElementById('a').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.strictEqual(d.getElementById('b').getAttribute('aria-selected'), 'true');
  assert.strictEqual(d.getElementById('pb').hidden, false);
});
check('fd.js: dial is a native range input with min floor', () => {
  const dom = freshDom('<div id="h"></div>');
  const el = dom.window.fdDial({ min: 10, max: 1000, value: 50 });
  const input = el.querySelector('input[type=range]');
  assert.strictEqual(input.min, '10');
  assert.strictEqual(el.getValue(), 50);
});

// 3. listing page renders from markets.json in jsdom
const listingHtml = fs.readFileSync(path.join(ROOT, 'markets', 'index.html'), 'utf8');
async function axeAudit(html, label) {
  const { AxeBuilder } = require('axe-core/lib/axe'); // not how axe loads in node; fallback below
}
(async () => {
  // listing page integration
  const marketsPayload = JSON.parse(raw); // reuse validated markets.json
  const dom = await JSDOM.fromFile(path.join(ROOT, 'markets', 'index.html'),
    { runScripts: 'dangerously', url: 'https://freedamdao.org/markets/',
      beforeParse(window) {
        window.fetch = (u) => Promise.resolve({
          ok: true, status: 200, json: () => Promise.resolve(marketsPayload)
        });
      } });
  dom.window.eval(kitSrc);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('render timeout')), 8000);
    const obs = new dom.window.MutationObserver(() => {
      if (dom.window.document.querySelector('[data-grid="proposed"] .fd-market-card')) {
        clearTimeout(t); obs.disconnect(); res();
      }
    });
    obs.observe(dom.window.document.body, { childList: true, subtree: true });
  });
  const d = dom.window.document;
  check('listing: renders 5 cards in proposed tab', () => {
    assert.strictEqual(d.querySelectorAll('[data-grid="proposed"] .fd-market-card').length, 5);
    assert.ok(d.getElementById('data-as-of').textContent.length > 5);
  });
  check('listing: noscript fallback to raw JSON', () => {
    assert.ok(listingHtml.includes('/data/markets.json') && listingHtml.includes('<noscript>'));
  });
  // axe-core on the live DOM
  const axeSrc = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
  dom.window.eval(axeSrc);
  const res = await dom.window.eval('axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] })');
  const serious = res.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  console.log('  axe listing:', serious.length, 'serious/critical; all violations:', res.violations.map(v => v.id + ':' + v.impact).join(', ') || 'none');
  check('listing: axe 0 serious/critical', () => assert.strictEqual(serious.length, 0));
  // detail page with a bad id must not throw / must show not-found
  const vHtml = fs.readFileSync(path.join(ROOT, 'markets', 'view.html'), 'utf8');
  check('detail: strict id validation present (regex PM-###, textContent sinks, esc() on data)', () => {
    assert.ok(vHtml.includes('/^PM-[0-9]{3}$/') && vHtml.includes('textContent') && vHtml.includes('function esc('));
  });
  check('detail: resolution readout wired (resolved_yes/no/unresolved panels)', () => {
    assert.ok(vHtml.includes('Our members called it') && vHtml.includes('resolved_yes') && vHtml.includes('unresolved'));
  });

  // ---- ledger page: render with empty data + axe ----
  const emptyLedger = { data_as_of: '2026-11-16T00:00:00Z', operator_pub_key: '0xabc', event_count: 0, totals: { minted: 0, locked_aura: 0, burned: 0, slashed: 0 }, balances: [], leaderboard: [], events: [] };
  const ldom = await JSDOM.fromFile(path.join(ROOT, 'ledger', 'index.html'), {
    runScripts: 'dangerously', url: 'https://freedamdao.org/ledger/',
    beforeParse(window) {
      window.fetch = (u) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(emptyLedger) });
    }
  });
  ldom.window.eval(kitSrc);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('ledger render timeout')), 8000);
    const obs = new ldom.window.MutationObserver(() => {
      if (ldom.window.document.getElementById('events')?.querySelector('p, table')) { clearTimeout(t); obs.disconnect(); res(); }
    });
    obs.observe(ldom.window.document.body, { childList: true, subtree: true });
  });
  const ld = ldom.window.document;
  check('ledger page: renders empty states honestly (no fake data)', () => {
    assert.ok(ld.getElementById('leaderboard').textContent.includes('No resolved markets yet'));
    assert.ok(ld.getElementById('balances').textContent.includes('No balances yet'));
  });
  ldom.window.eval(fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8'));
  const lres = await ldom.window.eval('axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] })');
  const lserious = lres.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  console.log('  axe ledger:', lserious.length, 'serious/critical; all:', lres.violations.map(v => v.id + ':' + v.impact).join(', ') || 'none');
  check('ledger page: axe 0 serious/critical', () => assert.strictEqual(lserious.length, 0));
  console.log(failures === 0 ? '\nALL CHECKS GREEN' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.log('  FAIL integration —', e.message); process.exit(1); });
