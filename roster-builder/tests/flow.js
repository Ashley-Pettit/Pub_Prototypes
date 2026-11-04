// End-to-end flow: Excel status chip, change a cell, add leave and an RDO move, re-plan, download Excel, start again, reopen it.
const
{
  chromium
} = require('playwright');
const base = process.argv[2] || 'http://localhost:8765/',
  out = process.argv[3] || '/tmp/claude-0/shots';
(async () =>
{
  const b = await chromium.launch();
  const ctx = await b.newContext(
  {
    viewport:
    {
      width: 1280,
      height: 900
    },
    acceptDownloads: true
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const chip = () => p.locator('.xchip').innerText();
  await p.goto(base,
  {
    waitUntil: 'networkidle'
  });
  await p.waitForTimeout(200);
  console.log('home screen:', await p.evaluate(() => location.hash || window.__roster.store.ui.route), '| chip:', await chip());
  await p.goto(base + '#excel');
  await p.waitForTimeout(150);
  const [d1] = await Promise.all([p.waitForEvent('download'), p.click('main .btn-primary')]);
  await d1.saveAs(out + '/s1.xlsx');
  await p.waitForTimeout(200);
  console.log('after download:', await chip(), '|', d1.suggestedFilename());
  await p.goto(base + '#roster');
  await p.waitForTimeout(150);
  await p.locator('.cell').nth(3).click();
  await p.click('.menu-item:has-text("Mark as leave")');
  await p.waitForTimeout(150);
  console.log('after cell change:', await chip());
  await p.goto(base + '#leave');
  await p.waitForTimeout(150);
  await p.fill('#lv-from', '2026-11-11');
  await p.fill('#lv-to', '2026-11-12');
  await p.click('text=Add leave');
  await p.waitForTimeout(150);
  await p.fill('#sw-to', '2026-11-17');
  await p.click('button:has-text("Move RDO")');
  await p.waitForTimeout(150);
  console.log('swap check:', await p.locator('section:has(#sw-h) .badge-s').allInnerTexts());
  await p.fill('#sw-to', '');
  await p.click('button:has-text("Move RDO")');
  await p.waitForTimeout(100);
  console.log('empty move error:', await p.locator('section:has(#sw-h) .invalid-msg').allInnerTexts());
  await p.goto(base + '#settings');
  await p.click('button:has-text("Re-plan RDOs")');
  await p.waitForTimeout(100);
  console.log('dialog focus:', await p.evaluate(() => document.activeElement.textContent.trim()));
  await p.click('text=Re-plan roster');
  await p.waitForTimeout(1500);
  console.log('issues after re-plan:', await p.evaluate(() => window.__roster.issues.value.map(x => x.title)));
  await p.goto(base + '#excel');
  await p.waitForTimeout(150);
  const [d2] = await Promise.all([p.waitForEvent('download'), p.click('main .btn-primary')]);
  await d2.saveAs(out + '/s2.xlsx');
  await p.goto(base + '#settings');
  await p.click('button:has-text("Start again")');
  await p.click('.dialog .btn-danger');
  await p.waitForTimeout(200);
  console.log('after start again:', await chip());
  await p.goto(base + '#excel');
  await p.setInputFiles('#open-xlsx', out + '/s2.xlsx');
  await p.waitForTimeout(800);
  console.log('after open:', await chip(), '| leave:', await p.evaluate(() => window.__roster.store.cfg.leave.length), '| swaps:', await p.evaluate(() => window.__roster.store.cfg.swaps.length));
  console.log('errors:', errs);
  await b.close();
})();