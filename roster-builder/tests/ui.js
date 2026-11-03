// Click-through test of the main flows at 1280 and 375. Usage: node tests/ui.js [baseUrl] [outDir]
const
{
  chromium
} = require('playwright');
const base = process.argv[2] || 'http://localhost:8765/',
  out = process.argv[3] || '/tmp/claude-0/shots';
require('fs').mkdirSync(out,
{
  recursive: true
});
(async () =>
{
  const b = await chromium.launch();
  const res = [];
  for (const [w, h, tag] of [
      [1280, 900, 'wide'],
      [375, 812, 'narrow']
    ])
  {
    const ctx = await b.newContext(
    {
      viewport:
      {
        width: w,
        height: h
      },
      acceptDownloads: true
    });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    for (const r of ['roster', 'requests', 'team', 'review', 'settings'])
    {
      await p.goto(base + '#' + r,
      {
        waitUntil: 'networkidle'
      });
      await p.waitForTimeout(250);
      const ov = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      await p.screenshot(
      {
        path: `${out}/${tag}-${r}.png`,
        fullPage: tag === 'wide'
      });
      res.push(`${tag} ${r} overflow=${ov}`);
    }
    if (tag === 'wide')
    {
      const pid = await p.evaluate(() => window.__roster.store.data.periods[0].people[4].id);
      await p.goto(base + '#person-' + pid,
      {
        waitUntil: 'networkidle'
      });
      await p.waitForTimeout(200);
      await p.screenshot(
      {
        path: `${out}/${tag}-person.png`,
        fullPage: true
      });
      await p.goto(base + '#roster');
      await p.waitForTimeout(200);
      await p.click('.cell >> nth=3');
      await p.waitForTimeout(200);
      await p.screenshot(
      {
        path: `${out}/${tag}-pop.png`
      });
      await p.keyboard.press('Escape');
      await p.click('text=Add request');
      await p.waitForTimeout(300);
      await p.screenshot(
      {
        path: `${out}/${tag}-slide.png`
      });
      await p.keyboard.press('Escape');
      await p.click('.dayhead >> nth=2');
      await p.waitForTimeout(300);
      await p.screenshot(
      {
        path: `${out}/${tag}-day.png`
      });
      await p.keyboard.press('Escape');
    }
    res.push(`${tag} errors: ${JSON.stringify(errs)}`);
    await ctx.close();
  }
  console.log(res.join('\n'));
  await b.close();
})();