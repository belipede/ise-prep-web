// Tests for ISE Prep. Run: node tests/app.js
// Serves index.html locally and drives it on a simulated iPhone in Chromium (not Safari on a real phone).
// Needs Playwright with Chromium.
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8791, U = `http://localhost:${PORT}/`;
const srv = http.createServer((q, r) => {
  if (q.url.split('?')[0] !== '/') { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': 'text/html' }); r.end(HTML);
}).listen(PORT);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const LS = 'iseprep-v1';
const stored = p => p.evaluate(k => localStorage.getItem(k), LS);
const tab = (p, t) => p.click(`nav.tabs button[data-tab="${t}"]`).then(() => p.waitForTimeout(100));

async function phone(b) {
  const ctx = await b.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block', acceptDownloads: true });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  return { ctx, p };
}
async function open(p, data) {
  await p.goto(U);
  await p.evaluate(([k, v]) => { localStorage.clear(); if (v != null) localStorage.setItem(k, v); }, [LS, data == null ? null : typeof data === 'string' ? data : JSON.stringify(data)]);
  await p.reload();
}
// Runs planner functions in the page on a given state.
const inPage = (p, fn, arg) => p.evaluate(([src, a]) => { const f = new Function('P', 'a', 'return (' + src + ')(P, a)'); return f(window.ISEPrep, a); }, [fn.toString(), arg]);

(async () => {
  const b = await chromium.launch();
  try {
    // ---- Planner logic, on fixed weeks so results don't depend on today's date ----
    {
      const { ctx, p } = await phone(b);
      await open(p, null);
      const r = await inPage(p, (P) => {
        const W = '2027-01-04', S = P.EMPTY();   // a Monday during NS
        const out = {};
        out.monday = P.weekStart('2027-01-09') === W;
        out.def = P.planWeek(S, W).sessions;
        S.weeks[W] = { mins: 0, days: [5], mode: 'both' };
        out.zero = P.planWeek(S, W).sessions.length;
        S.weeks[W] = { mins: 120, days: [5, 6], mode: 'both' };
        out.two = P.planWeek(S, W).sessions;
        // carry-over: 30 min logged on s1 the week before, not finished
        delete S.weeks[W];
        S.logs.push({ id: 'l1', day: '2027-01-01', mins: 30, taskId: 's1' });
        out.carry = P.planWeek(S, W).sessions;
        // a task ticked done during the week stays in that week's plan (stable), and is gone the week after
        S.logs = []; S.tasks[0].done = true; S.tasks[0].doneOn = '2027-01-05';
        out.stable = P.planWeek(S, W).sessions[0].taskId;
        out.next = P.planWeek(S, '2027-01-11').sessions[0].taskId;
        // phone-only week skips laptop tasks
        const S2 = P.EMPTY();
        for (const t of S2.tasks) if (t.phase < 4) { t.done = true; t.doneOn = '2026-12-01'; }
        S2.weeks[W] = { mins: 180, days: [5], mode: 'phone' };
        out.phone = P.planWeek(S2, W).sessions.map(s => S2.tasks.find(t => t.id === s.taskId).mode);
        S2.weeks[W].mode = 'both';
        out.both = P.planWeek(S2, W).sessions.map(s => S2.tasks.find(t => t.id === s.taskId).mode);
        // after ORD the default is 5.5 h over three days
        const S3 = P.EMPTY();
        out.afterOrd = P.planWeek(S3, '2028-05-08').sessions.reduce((n, s) => n + s.mins, 0);
        out.afterOrdDays = [...new Set(P.planWeek(S3, '2028-05-08').sessions.map(s => s.day))];
        S3.ord = '2027-03-01';
        out.earlyOrd = P.availability(S3, '2027-03-08').mins;
        // projection: on track at the default pace; behind when weeks are checked in at 0
        const S4 = P.EMPTY();
        out.proj = P.project(S4, 1, '2026-11-30');
        for (let i = 0, w = '2026-11-30'; i < 20; i++) { S4.weeks[w] = { mins: 0, days: [5], mode: 'both' }; const d = new Date(w + 'T12:00'); d.setDate(d.getDate() + 7); w = d.toISOString().slice(0, 10); }
        out.projLate = P.project(S4, 1, '2026-11-30');
        return out;
      });
      ok(r.monday, 'weeks start on Monday');
      ok(r.def.length === 1 && r.def[0].mins === 60 && r.def[0].taskId === 's1' && r.def[0].day === '2027-01-09', 'default NS week: 1 hour on Saturday, first task');
      ok(r.zero === 0, 'a 0-minute check-in plans nothing');
      ok(r.two.length === 2 && r.two[0].day === '2027-01-09' && r.two[1].day === '2027-01-10' && r.two[0].taskId === 's1' && r.two[1].taskId === 's2', '2 hours over Sat and Sun: one task each day, in order');
      ok(r.carry[0].taskId === 's1' && r.carry[0].mins === 30 && r.carry[1].taskId === 's2' && r.carry[1].mins === 30, 'unfinished task carries over with the time left, then the next task');
      ok(r.stable === 's1' && r.next === 's2', "a task ticked off stays in this week's plan and is gone next week");
      ok(r.phone.length > 0 && r.phone.every(m => m === 'phone'), 'phone-only week plans only phone tasks');
      ok(r.both.includes('laptop'), 'a week with laptop time includes laptop tasks');
      ok(r.afterOrd === 330 && r.afterOrdDays.length === 3, 'after ORD the default week is 5.5 hours over three days');
      ok(r.earlyOrd === 330, 'changing the ORD date changes the default');
      ok(r.proj.late === 0 && r.proj.finish <= '2027-07-31', `phase 1 on track at 1 h a week (done by ${r.proj.finish})`);
      ok(r.projLate.late > 0, `20 weeks at 0 puts phase 1 behind (${r.projLate.late} weeks)`);
      ok(p.errs.length === 0, 'no page errors: ' + p.errs.join('; '));
      await ctx.close();
    }

    // ---- First open, check-in, tick and log through the screens ----
    {
      const { ctx, p } = await phone(b);
      await open(p, null);
      const s0 = JSON.parse(await stored(p));
      ok(s0 && s0.tasks.length > 100 && s0.tasks[0].title.startsWith('Precalculus'), `fresh install loads the plan (${s0.tasks.length} sessions)`);
      ok(await p.isVisible('text=How free are you this week?'), 'This week asks for a check-in');
      await p.click('text=Check in for this week');
      await p.click('#sheet .chip[data-m="120"]');
      await p.click('#sheet .chip[data-d="6"]');   // add Sunday to Saturday
      await p.click('#sheet .chip[data-v="phone"]');
      await p.click('text=Save check-in');
      const s1 = JSON.parse(await stored(p));
      const wk = Object.keys(s1.weeks)[0];
      ok(wk && s1.weeks[wk].mins === 120 && s1.weeks[wk].days.join() === '5,6' && s1.weeks[wk].mode === 'phone', 'check-in saved: 2 h, Sat and Sun, phone only');
      ok(!(await p.isVisible('text=How free are you this week?')), 'check-in prompt goes away');
      ok((await p.locator('#view .row').count()) === 2, 'two sessions planned');
      await p.click('#view .row >> nth=0 >> .chk');
      ok(JSON.parse(await stored(p)).tasks[0].done === true, 'ticking a session marks its task done');
      ok((await p.locator('#view .row.done').count()) === 1, 'the ticked session stays visible, struck through');
      await p.click('text=Log other study time');
      await p.selectOption('#sheet select[name="taskId"]', 's2');
      await p.fill('#sheet input[name="mins"]', '40');
      await p.click('#sheet button:has-text("Save")');
      const s2 = JSON.parse(await stored(p));
      ok(s2.logs.length === 1 && s2.logs[0].mins === 40 && s2.logs[0].taskId === 's2', 'logging time saves minutes against the task');
      await tab(p, 'log');
      ok(await p.isVisible('text=40 min'), 'Log tab shows the entry');
      await tab(p, 'plan');
      await p.click('text=Show tasks >> nth=0');
      await p.fill('form[data-form="addTask"] input[name="title"]', 'Past-year poly maths paper');
      await p.click('text=Add task');
      ok(JSON.parse(await stored(p)).tasks.some(t => t.title === 'Past-year poly maths paper' && t.phase === 1), 'can add a task to a phase');
      await tab(p, 'learn');
      ok(!(await p.isVisible('text=Khan Academy: Precalculus')), 'outside resources are hidden before ORD');
      await p.click('text=Show outside resources');
      await p.click('.row:has-text("Khan Academy: Precalculus") >> button');
      ok(JSON.parse(await stored(p)).resources[0].status === 'doing', 'resource status cycles');
      await tab(p, 'more');
      await p.fill('form[data-form="idea"] input', 'Stores queue on Monday mornings');
      await p.click('text=Add idea');
      ok(JSON.parse(await stored(p)).ideas.length === 1, 'process idea saved');
      ok(p.errs.length === 0, 'no page errors: ' + p.errs.join('; '));
      await ctx.close();
    }

    // ---- Data safety ----
    {
      const { ctx, p } = await phone(b);
      const bad = '{"v":1,"tasks":[{"broken":';
      await open(p, bad);
      ok(await p.isVisible("text=Couldn't read your saved data"), 'unreadable data shows the recovery screen');
      for (const t of ['plan', 'log', 'more', 'today']) await tab(p, t);
      ok((await stored(p)) === bad, 'unreadable data is never overwritten while locked');
      await p.click('text=Keep a copy and start fresh');
      const keys = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('iseprep-bak:')));
      const kept = await p.evaluate(ks => ks.map(k => JSON.parse(localStorage.getItem(k))).find(b => b.reason === 'unreadable'), keys);
      ok(kept && kept.data === bad, 'starting fresh keeps the unreadable text as a backup');
      ok(JSON.parse(await stored(p)).tasks.length > 100, 'and loads the plan');

      // Export, then import into a clean phone
      await p.click('#view .row >> nth=0 >> .chk');
      await tab(p, 'more');
      await p.click('button:has-text("Export")');
      const text = await p.inputValue('#exportText');
      const { ctx: c2, p: p2 } = await phone(b);
      await open(p2, null);
      await tab(p2, 'more');
      await p2.fill('form[data-form="import"] textarea', text);
      await p2.click('form[data-form="import"] button');
      const a = JSON.parse(text), z = JSON.parse(await stored(p2));
      delete a.savedAt; delete z.savedAt;
      ok(JSON.stringify(a) === JSON.stringify(z), 'export and import round-trip exactly');
      ok(await p2.evaluate(() => Object.keys(localStorage).some(k => k.includes('before-import'))), 'import keeps a backup first');
      await p2.fill('form[data-form="import"] textarea', '{"nope":1}');
      const before = await stored(p2);
      await p2.click('form[data-form="import"] button');
      ok(await p2.isVisible("text=Couldn't import"), 'bad import shows an error');
      ok((await stored(p2)) === before, 'bad import changes nothing');

      // Daily backup and restore
      await p2.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('iseprep-bak:')) localStorage.removeItem(k); });
      await p2.reload();
      await tab(p2, 'today');
      await p2.click('#view .row >> nth=0 >> .chk');
      const daily = await p2.evaluate(() => Object.keys(localStorage).filter(k => /^iseprep-bak:\d{4}-\d{2}-\d{2}$/.test(k)));
      ok(daily.length === 1, 'first change of the day makes a daily backup');
      await tab(p2, 'more');
      const preReset = JSON.parse(await stored(p2));
      await p2.click('button[data-act="reset"]');
      await p2.click('text=Yes, start over');
      ok(JSON.parse(await stored(p2)).tasks.every(t => !t.done), 'Start over reloads the plan');
      await p2.click('.row:has-text("Before Start over") >> text=Restore');
      const restored = JSON.parse(await stored(p2)); delete restored.savedAt; delete preReset.savedAt;
      ok(JSON.stringify(restored) === JSON.stringify(preReset), 'restoring the backup brings the data back exactly');
      ok(p.errs.length === 0 && p2.errs.length === 0, 'no page errors: ' + [...p.errs, ...p2.errs].join('; '));
      await c2.close(); await ctx.close();
    }
  } catch (e) { console.log('FAIL ' + e.message); fails++; }
  await b.close(); srv.close();
  console.log(fails ? `${fails} failed` : 'All passed');
  process.exit(fails ? 1 : 0);
})();
