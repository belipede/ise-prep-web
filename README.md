# ISE Prep

A private phone app for Ben's two-year preparation for NUS Industrial and Systems Engineering (Dec 2026 to Aug 2028). It's built the same way as [ascend-web](https://github.com/belipede/ascend-web): one `index.html` that you add to the iPhone Home Screen from Safari. There's no App Store, no server and no framework.

**What it does**
- **Kai, XP and streaks:** Kai is the app's orange robot mascot, named after kaizen. Kai greets you, reacts to your answers and cheers when you hit goals. Tap Kai for tips. Every right answer is 10 XP, or 15 on a streak of three or more, and finishing a session adds 30. Meeting the daily XP goal (20 to 100, set in More) keeps a day streak going. A streak shield covers one missed day; you earn one for every 7 days in a row, up to 2. You can pause the streak for exercises or field camp.
- **Quick cards:** a vertical feed you swipe up through, made of short questions and notes. It only uses lessons you've reached. It's bonus practice for idle moments: it earns XP but doesn't count as planned study time.
- **Home (this week):** each Sunday, you check in with how free you'll be next week: minutes, which days, and phone or laptop time (0 for field camp). The app fills those slots with the next tasks in the plan and carries over anything unfinished.
- **Plan:** four phases (Calculus first, Stats and matrices, Your story and Solver, After ORD), each with a checkpoint and a projected finish date based on your check-ins.
- **Progress:** day streak, XP and level, shields, badges, study-time logging, and hours per week for the last 12 weeks.
- **Learn:** everything for Phases 1 to 3 is inside the app, for NS: short notes for each topic, then 5 practice questions (8 at checkpoints) with fresh numbers each time, checked offline. Score 80% to finish a session; the time is logged automatically. Phase 3 adds a case study writer, an XLOOKUP and Solver lesson, a cheapest-protein optimisation puzzle and a bottlenecks lesson. Outside links (Khan Academy, CS50P and others) stay hidden until the ORD week, or until you choose to show them.
- **More:** ORD date, process ideas from NS, export and import, automatic backups, Start over.

**Data:** stored only on the phone, in `localStorage` (`iseprep-v1`). It keeps a daily backup (last 7) and a backup before every import, restore or Start over (last 5). If saved data can't be read, the app shows a recovery screen and writes nothing. Export from More now and then.

**Weeks with no check-in** assume 1 hour on Saturday before ORD, and 5.5 hours over Mon, Wed and Sat from the ORD week. You can change the ORD date in More.

**Install on iPhone:** open the GitHub Pages address in Safari, then Share > Add to Home Screen. `sw.js` keeps a copy so it opens offline. The page loads from the network first, so updates still arrive.

**Tests:** `node tests/app.js`, `node tests/lessons.js` and `node tests/fun.js` (needs Playwright with Chromium; it runs Chrome's engine on a simulated iPhone, not Safari). `.github/workflows/tests.yml` runs it on every pull request; merge only when it's green. Bump `VERSION` in `index.html` with every change to it.
