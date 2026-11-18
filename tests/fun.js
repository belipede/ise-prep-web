// Tests for XP, streaks, Kai and the Quick cards feed. Run: node tests/fun.js
// Checks the streak rules as pure functions, then plays the feed and a lesson on a simulated iPhone in Chromium.
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8794, U = `http://localhost:${PORT}/`;
const srv = http.createServer((q, r) => {
  if (q.url.split('?')[0] !== '/') { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': 'text/html' }); r.end(HTML);
}).listen(PORT);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const LS = 'iseprep-v1';
const stored = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), LS);
const tab = (p, t) => p.click(`nav.tabs button[data-tab="${t}"]`).then(() => p.waitForTimeout(80));

(async () => {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block' });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(U); await p.evaluate(() => localStorage.clear()); await p.reload();

    // ---- Streak rules, as pure functions ----
    const r = await p.evaluate(() => {
      const P = window.ISEPrep, out = {};
      const G = P.GAME0();
      out.lv = [0, 99, 100, 299, 300, 600].map(P.levelOf).join();
      let a = P.addXP(G, 20, '2027-01-04'); out.notYet = !a.goal && G.streak === 0;
      a = P.addXP(G, 10, '2027-01-04'); out.first = a.goal && G.streak === 1 && G.last === '2027-01-04';
      a = P.addXP(G, 50, '2027-01-04'); out.once = !a.goal && G.streak === 1;
      P.addXP(G, 30, '2027-01-05'); out.next = G.streak === 2;
      out.shown = [P.streakNow(G, '2027-01-05'), P.streakNow(G, '2027-01-06'), P.streakNow(G, '2027-01-07'), P.streakNow(G, '2027-01-08')].join();
      P.addXP(G, 30, '2027-01-07'); out.shieldUsed = G.streak === 3 && G.freezes === 0;
      P.addXP(G, 30, '2027-01-10'); out.reset = G.streak === 1 && G.best === 3;
      // Seven days in a row earns a shield, up to two
      const H = P.GAME0(); H.freezes = 0;
      let got = false; for (let d = 1; d <= 7; d++) got = P.addXP(H, 30, `2027-02-0${d}`).shield;
      out.earned = got && H.freezes === 1 && H.streak === 7;
      // Pausing for field camp: two weeks away, then back, streak kept
      P.pauseStreak(H, '2027-02-08'); out.paused = P.streakNow(H, '2027-02-20') === 7;
      P.addXP(H, 30, '2027-02-22'); out.resumed = H.streak === 8 && H.pause === null && H.freezes === 1;
      // Validation keeps the game section and fixes junk
      const S = P.EMPTY(); S.game = { xp: '45', goal: 7, days: { 'bad': 3, '2027-01-01': 20 }, streak: -2, last: 'x', freezes: 9, sound: false };
      const v = P.validate(JSON.parse(JSON.stringify(S))).game;
      out.valid = v.xp === 45 && v.goal === 30 && Object.keys(v.days).join() === '2027-01-01' && v.streak === 0 && v.last === null && v.freezes === 2 && v.sound === false;
      const old = P.EMPTY(); delete old.game; out.oldSave = P.validate(old).game.xp === 0;
      // The feed only uses lessons you've reached
      const F = P.EMPTY(); out.keys0 = P.feedKeys(F).join();
      F.tasks.filter(t => t.phase === 1 && t.order <= 4).forEach(t => t.done = true); out.keys1 = P.feedKeys(F).join();
      const cards = P.moreCards(F, { seed: 5, cards: [] }, 40).cards;
      out.cardsOk = cards.every(c => c.kind === 'kai' || ['functions', 'explog', 'limits'].includes(c.key)) && cards.some(c => c.kind === 'tip') && cards.some(c => c.kind === 'kai') && cards.filter(c => c.kind === 'q').length >= 20;
      out.cardText = cards.filter(c => c.kind === 'q').every(c => c.q.q && !/undefined|NaN/.test(c.q.q + c.q.explain));
      return out;
    });
    ok(r.lv === '1,1,2,2,3,4', 'levels go up at 100, 300 and 600 XP: ' + r.lv);
    ok(r.notYet && r.first && r.once, 'the streak starts when the daily goal is met, once a day');
    ok(r.next && r.shown === '2,2,2,0', 'a missed day uses the shield, two missed days end the streak: ' + r.shown);
    ok(r.shieldUsed && r.reset, 'the shield is spent, and a long gap restarts the streak but keeps the best');
    ok(r.earned, '7 days in a row earns a streak shield');
    ok(r.paused && r.resumed, 'a paused streak survives two weeks away and carries on when you come back');
    ok(r.valid && r.oldSave, 'saved game data is checked, and older saves get a fresh game section');
    ok(r.keys0 === 'functions' && r.keys1 === 'functions,explog,limits', 'quick cards use only lessons you have reached: ' + r.keys1);
    ok(r.cardsOk && r.cardText, 'the feed mixes questions, notes and Kai cards, all well formed');

    // ---- Home: Kai and the daily goal ----
    ok(await p.isVisible('#view .hero svg.kai'), 'Kai greets you on Home');
    ok(await p.isVisible("text=I'm Kai"), 'first-time greeting explains who Kai is');
    const before = await p.textContent('#view .bubble');
    await p.click('#view .bubble');
    ok((await p.textContent('#view .bubble')) !== before, 'tapping Kai says something new');

    // ---- Quick cards ----
    await p.click('[data-act="goFeed"]');
    ok(await p.isVisible('#feed'), 'Play quick cards opens the feed');
    const answer = async (i, right) => {
      const c = await p.evaluate(i => window.ISEPrep.ui().feed.cards[i], i);
      if (c.kind !== 'q') return false;
      if (c.q.type === 'mc') await p.click(`[data-act="fpick"][data-c="${i}"][data-k="${right ? c.q.ans : (c.q.ans + 1) % c.q.choices.length}"]`);
      else { await p.fill(`[data-fc="${i}"]`, right ? String(c.q.ans) : '987654'); await p.click(`[data-act="fcheck"][data-c="${i}"]`); }
      return true;
    };
    const qIdx = await p.evaluate(() => window.ISEPrep.ui().feed.cards.map((c, i) => c.kind === 'q' ? i : -1).filter(i => i >= 0));
    await answer(qIdx[0], true);
    let s = await stored(p);
    ok(s.game.xp === 10 && s.game.cards === 1, 'a right card gives 10 XP and is counted');
    ok(await p.isVisible(`[data-card="${qIdx[0]}"] .fb.right`), 'the card shows it was right, with the working');
    await answer(qIdx[1], false);
    s = await stored(p);
    ok(s.game.xp === 10 && s.game.cards === 2, 'a wrong card gives no XP and no penalty');
    ok(await p.isVisible(`[data-card="${qIdx[1]}"] .fb.wrong`), 'a wrong card shows the right answer');
    await answer(qIdx[2], true); await answer(qIdx[3], true);
    s = await stored(p);
    ok(s.game.streak === 1 && s.game.days[s.game.last] >= 30, 'reaching 30 XP meets the daily goal and starts a streak');
    ok((await p.textContent('#hud')).includes('🔥 1'), 'the header shows the streak');
    const n0 = await p.evaluate(() => window.ISEPrep.ui().feed.cards.length);
    await p.evaluate(() => { const f = document.getElementById('feed'); f.scrollTop = f.scrollHeight; f.dispatchEvent(new Event('scroll')); });
    await p.waitForTimeout(100);
    const n1 = await p.evaluate(() => [window.ISEPrep.ui().feed.cards.length, document.querySelectorAll('#feed .fcard').length]);
    ok(n1[0] > n0 && n1[1] === n1[0], `scrolling to the end loads more cards (${n0} → ${n1[0]})`);
    await p.evaluate(() => { const f = document.getElementById('feed'); f.scrollTop = f.clientHeight * 2; f.dispatchEvent(new Event('scroll')); });
    await tab(p, 'today'); await tab(p, 'feed');
    ok(await p.evaluate(() => document.getElementById('feed').scrollTop > 0), 'leaving and coming back keeps your place in the feed');

    // ---- A lesson gives XP and a bonus for finishing ----
    await tab(p, 'today');
    await p.click('#view .row >> nth=0 >> button[data-act="lesson"]');
    await p.click('text=Practice (5 questions)');
    for (let i = 0; i < 5; i++) {
      const q = await p.evaluate(() => { const l = window.ISEPrep.ui().lesson; return l.qs[l.i]; });
      if (q.type === 'mc') await p.click(`#sheet .choice[data-k="${q.ans}"]`);
      else { await p.fill('#ans', String(q.ans)); await p.click('#sheet [data-act="checkNum"]'); }
      if (i === 2) ok(await p.isVisible('#sheet .combo'), 'three right in a row shows a combo');
      await p.click('#sheet [data-act="nextQ"]');
    }
    ok(await p.isVisible('text=+65 XP this round'), 'five right (with combo bonus) is 65 XP');
    const x0 = (await stored(p)).game.xp;
    await p.click('text=Mark this session done');
    ok((await stored(p)).game.xp === x0 + 30, 'finishing the session adds a 30 XP bonus');

    // ---- Progress and settings ----
    await tab(p, 'log');
    ok(await p.isVisible('.badge.on:has-text("First lesson")') && await p.isVisible('.badge.on:has-text("Perfect score")') && await p.isVisible('.badge.off:has-text("7-day streak")'), 'badges unlock from what you have done');
    await tab(p, 'more');
    await p.click('[data-act="setGoal"][data-v="50"]');
    ok((await stored(p)).game.goal === 50, 'the daily goal can be changed');
    await p.click('text=Pause streak');
    s = await stored(p);
    ok(!!s.game.pause && await p.isVisible("text=I'm back, resume streak"), 'the streak can be paused for exercise');
    await p.click("text=I'm back, resume streak");
    ok((await stored(p)).game.pause === null && (await stored(p)).game.streak === 1, 'and resumed, still intact');
    await p.click('[data-act="toggleSound"]');
    ok((await stored(p)).game.sound === false, 'sound effects can be turned off');
    ok(errs.length === 0, 'no page errors: ' + errs.join('; '));
    await ctx.close();
  } catch (e) { console.log('FAIL ' + e.message); fails++; }
  await b.close(); srv.close();
  console.log(fails ? `${fails} failed` : 'All passed');
  process.exit(fails ? 1 : 0);
})();
