# ISE Prep

A private phone app for Ben's two-year preparation for NUS Industrial and Systems Engineering (Dec 2026 to Aug 2028). It's built the same way as [ascend-web](https://github.com/belipede/ascend-web): one `index.html` that you add to the iPhone Home Screen from Safari. There's no App Store, no server and no framework.

**What it does**
- **This week:** each Sunday, you check in with how free you'll be next week: minutes, which days, and phone or laptop time (0 for field camp). The app fills those slots with the next tasks in the plan and carries over anything unfinished.
- **Plan:** four phases (Calculus first, Stats and matrices, Your story and Solver, After ORD), each with a checkpoint and a projected finish date based on your check-ins.
- **Log:** quick study-time logging, hours per week for the last 12 weeks, and a weekly streak.
- **Library:** courses, books and videos for each phase.
- **More:** ORD date, process ideas from NS, export and import, automatic backups, Start over.

**Data:** stored only on the phone, in `localStorage` (`iseprep-v1`). It keeps a daily backup (last 7) and a backup before every import, restore or Start over (last 5). If saved data can't be read, the app shows a recovery screen and writes nothing. Export from More now and then.

**Weeks with no check-in** assume 1 hour on Saturday before ORD, and 5.5 hours over Mon, Wed and Sat from the ORD week. You can change the ORD date in More.

**Install on iPhone:** open the GitHub Pages address in Safari, then Share > Add to Home Screen. `sw.js` keeps a copy so it opens offline. The page loads from the network first, so updates still arrive.

**Tests:** `node tests/app.js` (needs Playwright with Chromium; it runs Chrome's engine on a simulated iPhone, not Safari). `.github/workflows/tests.yml` runs it on every pull request; merge only when it's green. Bump `VERSION` in `index.html` with every change to it.
