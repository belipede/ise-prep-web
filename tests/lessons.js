// Tests for the in-app lessons. Run: node tests/lessons.js
// Checks every question generator many times, then walks through a lesson, a writing activity and the
// protein puzzle on a simulated iPhone in Chromium. Needs Playwright with Chromium.
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8793, U = `http://localhost:${PORT}/`;
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

    // ---- Every generator, 40 seeds each ----
    const g = await p.evaluate(() => {
      const P = window.ISEPrep, bad = [], seen = {};
      let total = 0;
      for (const [key, L] of Object.entries(P.LESSONS)) {
        if (L.activity) continue;
        const texts = new Set();
        for (let seed = 1; seed <= 40; seed++) {
          const qs = P.lessonQuestions(key, seed * 7919);
          if (!qs.length) bad.push(key + ': no questions');
          for (const q of qs) {
            total++;
            texts.add(q.q);
            if (!q.q || !q.explain) bad.push(key + ': empty text');
            if (/undefined|NaN|Infinity/.test(q.q + q.explain)) bad.push(key + ': bad text: ' + q.q);
            if (q.type === 'num') { if (!Number.isFinite(q.ans)) bad.push(key + ': bad answer ' + q.q); else if (!P.checkNum(String(q.ans), q.ans)) bad.push(key + ': own answer rejected'); }
            else if (q.type === 'mc') { if (!Array.isArray(q.choices) || q.choices.length < 2 || !(q.ans >= 0 && q.ans < q.choices.length)) bad.push(key + ': bad choice question'); if (new Set(q.choices).size !== q.choices.length) bad.push(key + ': duplicate choices ' + q.q); }
            else bad.push(key + ': unknown type');
          }
        }
        seen[key] = texts.size;
      }
      const same = JSON.stringify(P.lessonQuestions('chain', 123)) === JSON.stringify(P.lessonQuestions('chain', 123));
      const differ = JSON.stringify(P.lessonQuestions('chain', 123)) !== JSON.stringify(P.lessonQuestions('chain', 124));
      const nums = [P.checkNum('1/6', 1 / 6), P.checkNum('0.167', 1 / 6), P.checkNum('−3', -3), P.checkNum('0.2', 1 / 6), P.checkNum('abc', 1)];
      const S = P.EMPTY();
      const noLesson = S.tasks.filter(t => t.phase < 4 && !P.lessonOf(t)).length, p4 = S.tasks.filter(t => t.phase === 4 && P.lessonOf(t)).length;
      const allPhone = S.tasks.filter(t => t.phase < 4).every(t => t.mode === 'phone');
      // An older save without lesson fields still finds its lessons
      const old = S.tasks.map(t => { const c = { ...t }; delete c.lesson; return c; });
      const oldOk = old.filter(t => t.phase < 4).every(t => P.lessonOf(t));
      return { bad: bad.slice(0, 10), total, seen, same, differ, nums, noLesson, p4, allPhone, oldOk };
    });
    ok(g.bad.length === 0, `all ${g.total} generated questions are well formed ${g.bad.join(' | ')}`);
    ok(Object.entries(g.seen).filter(([k]) => !k.startsWith('check')).every(([, n]) => n >= 6), 'each lesson produces varied questions: ' + Object.entries(g.seen).map(([k, n]) => k + ' ' + n).join(', '));
    ok(g.same && g.differ, 'same seed gives the same questions, a new seed gives new ones');
    ok(g.nums.join() === 'true,true,true,false,', 'answers accept fractions, decimals and the − sign, and reject wrong or non-numbers');
    ok(g.noLesson === 0 && g.p4 === 0 && g.allPhone, 'every Phase 1 to 3 session has an in-app lesson and is phone-only; Phase 4 has none');
    ok(g.oldOk, 'saves made before lessons existed still find them');

    // ---- Protein puzzle optimum, checked independently ----
    const meal = await p.evaluate(() => { const P = window.ISEPrep; let best = Infinity, q = null; for (let a = 0; a <= 5; a++) for (let b = 0; b <= 5; b++) for (let c = 0; c <= 5; c++) for (let d = 0; d <= 5; d++) { const pr = 12 * a + 31 * b + 12 * c + 8 * d, cost = Math.round((0.8 * a + 2.2 * b + 1.0 * c + 0.9 * d) * 100) / 100; if (pr >= 60 && cost < best - 1e-9) { best = cost; q = [a, b, c, d]; } } return { best, q, app: P.MEAL_BEST }; });
    ok(Math.abs(meal.best - meal.app) < 1e-9, `cheapest protein plan is $${meal.app} (${meal.q.join(', ')})`);

    // ---- Walk through a lesson from This week ----
    await p.click('#view .row >> nth=0 >> button[data-act="lesson"]');
    ok(await p.isVisible('text=Practice (5 questions)'), 'Start opens the notes first');
    await p.click('text=Practice (5 questions)');
    for (let i = 0; i < 5; i++) {
      const q = await p.evaluate(() => { const l = window.ISEPrep.ui().lesson; return l.qs[l.i]; });
      if (q.type === 'mc') await p.click(`#sheet .choice[data-k="${q.ans}"]`);
      else { await p.fill('#ans', String(q.ans)); await p.click('#sheet [data-act="checkNum"]'); }
      ok(await p.isVisible('#sheet .fb.right'), `question ${i + 1} marked right`);
      await p.click('#sheet [data-act="nextQ"]');
    }
    ok(await p.isVisible('text=5 of 5 (100%)'), 'score shows 100%');
    await p.click('text=Mark this session done');
    let s = await stored(p);
    ok(s.tasks[0].done && s.quiz.s1.best === 100 && s.logs.some(l => l.taskId === 's1'), 'finishing marks the session done, logs the time and saves the score');

    // ---- Failing doesn't offer Mark done; retry gives new questions ----
    await p.evaluate(() => {});
    await tab(p, 'learn');
    await p.click('.row:has-text("Exponentials and logarithms") >> button');
    await p.click('text=Practice (5 questions)');
    const first = await p.evaluate(() => window.ISEPrep.ui().lesson.qs.map(q => q.q).join('|'));
    for (let i = 0; i < 5; i++) {
      const q = await p.evaluate(() => { const l = window.ISEPrep.ui().lesson; return l.qs[l.i]; });
      if (q.type === 'mc') await p.click(`#sheet .choice[data-k="${(q.ans + 1) % q.choices.length}"]`);
      else await p.click('#sheet [data-act="skipQ"]');
      ok(await p.isVisible('#sheet .fb.wrong'), `wrong answer ${i + 1} shows the right answer`);
      await p.click('#sheet [data-act="nextQ"]');
    }
    ok(!(await p.isVisible('text=Mark this session done')), 'below 80% there is no Mark done');
    await p.click('text=Try new questions');
    const second = await p.evaluate(() => window.ISEPrep.ui().lesson.qs.map(q => q.q).join('|'));
    ok(first !== second, 'retrying gives different questions');
    await p.fill('#ans', 'hello').catch(() => {});
    if (await p.isVisible('#ans')) { await p.click('#sheet [data-act="checkNum"]'); ok(await p.isVisible('text=Type a number'), 'non-numbers get a friendly message'); }
    await p.click('#sheet [data-act="lessonNotes"]');
    ok(await p.isVisible('#sheet .card.notes'), 'notes can be reopened mid-practice');
    await p.click('#sheet [data-act="lessonClose"]').catch(async () => { await p.evaluate(() => {}); });

    // ---- Writing activity: outline ----
    await p.evaluate(() => { const S = JSON.parse(localStorage.getItem('iseprep-v1')); });
    await tab(p, 'learn');
    await p.click('.row:has-text("Case study: outline") >> button');
    ok(await p.isDisabled('text=Mark this session done'), 'outline cannot be finished while empty');
    for (const k of ['situation', 'problem', 'action', 'result', 'next']) await p.fill(`#sheet textarea[data-note="case-${k}"]`, 'Something about ' + k);
    s = await stored(p);
    ok(s.notes['case-result'] === 'Something about result', 'writing saves as you type');
    ok(!(await p.isDisabled('text=Mark this session done')), 'all five headings filled enables Mark done');
    await p.click('text=Mark this session done');
    s = await stored(p);
    ok(s.tasks.find(t => t.lesson === 'caseOutline').done, 'outline session marked done');

    // ---- Protein puzzle in the UI ----
    await p.click('.row:has-text("Solver model: cheapest protein") >> button');
    for (let i = 0; i < 4; i++) for (let k = 0; k < meal.q[i]; k++) await p.click(`#sheet [data-act="meal"][data-i="${i}"][data-d="1"]`);
    s = await stored(p);
    ok(s.mealSolved === true, 'finding the cheapest plan marks the puzzle solved');
    ok(!(await p.isDisabled('text=Mark this session done')), 'and enables Mark done');
    await p.click('#sheet [data-act="lessonClose"]');

    // ---- Outside resources appear on their own after ORD ----
    await tab(p, 'more');
    await p.fill('form[data-form="ord"] input', '2026-01-01');
    await p.click('text=Save ORD date');
    await tab(p, 'learn');
    ok(await p.isVisible('text=Khan Academy: Precalculus'), 'after ORD, outside resources show without asking');
    ok(errs.length === 0, 'no page errors: ' + errs.join('; '));
    await ctx.close();
  } catch (e) { console.log('FAIL ' + e.message); fails++; }
  await b.close(); srv.close();
  console.log(fails ? `${fails} failed` : 'All passed');
  process.exit(fails ? 1 : 0);
})();
