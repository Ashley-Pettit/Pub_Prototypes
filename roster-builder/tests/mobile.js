// Phone screenshots of every step, the bottom-sheet editor, plus overflow and tap-target checks.
const
{
  chromium,
  devices
} = require('playwright');
const base = process.argv[2] || 'http://localhost:8765/',
  out = process.argv[3] || '/tmp/claude-0/m';
require('fs').mkdirSync(out,
{
  recursive: true
});
(async () =>
{
  const b = await chromium.launch();
  const ctx = await b.newContext(
  {
    ...devices['iPhone 13']
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  for (const r of ['team', 'roster', 'leave', 'excel', 'settings'])
  {
    await p.goto(base + '#' + r,
    {
      waitUntil: 'networkidle'
    });
    await p.waitForTimeout(250);
    const m = await p.evaluate(() => (
    {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      small: [...document.querySelectorAll('button, a[href], select, input:not([type=file]):not([type=checkbox])')].filter(e => e.offsetParent && (e.getBoundingClientRect().height < 44 || e.getBoundingClientRect().width < 44)).map(e => e.tagName + ' ' + (e.textContent || e.id).trim().slice(0, 16)).slice(0, 5)
    }));
    console.log(r, JSON.stringify(m));
    await p.screenshot(
    {
      path: `${out}/${r}.png`
    });
  }
  await p.goto(base + '#roster');
  await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('.rgrid').scrollIntoView());
  await p.waitForTimeout(100);
  await p.screenshot(
  {
    path: `${out}/roster-grid.png`
  });
  await p.locator('.cell').nth(2).tap();
  await p.waitForTimeout(250);
  await p.screenshot(
  {
    path: `${out}/sheet.png`
  });
  await p.locator('.pop-scrim').tap(
  {
    position:
    {
      x: 20,
      y: 20
    }
  });
  await p.waitForTimeout(150);
  console.log('sheet closed:', await p.locator('.pop').count() === 0, '| errors:', errs);
  await b.close();
})();