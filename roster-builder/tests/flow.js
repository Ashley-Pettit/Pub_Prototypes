// End-to-end flow: excel status, change a cell, add leave and an RDO move, re-plan, download Excel, reopen it.
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
  const bar = () => p.locator('#xb-title').innerText();
  await p.goto(base + '#roster',
  {
    waitUntil: 'networkidle'
  });
  await p.waitForTimeout(200);
  console.log('excel bar at start:', await bar());
  await p.screenshot(
  {
    path: out + '/s-roster.png',
    fullPage: true
  });
  const [d1] = await Promise.all([p.waitForEvent('download'), p.click('text=Download Excel')]);
  await d1.saveAs(out + '/s1.xlsx');
  await p.waitForTimeout(200);
  console.log('after download:', await bar(), '|', d1.suggestedFilename());
  await p.locator('.cell').nth(3).click();
  await p.click('.menu-item:has-text("Mark as leave")');
  await p.waitForTimeout(150);
  console.log('after cell change:', await bar());
  await p.screenshot(
  {
    path: out + '/s-changed.png'
  });
  await p.goto(base + '#leave');
  await p.waitForTimeout(150);
  await p.fill('#lv-from', '2026-11-11');
  await p.fill('#lv-to', '2026-11-12');
  await p.click('text=Add leave');
  await p.waitForTimeout(150);
  await p.click('#sw-to');
  await p.fill('#sw-to', '2026-11-17');
  await p.click('text=Move RDO');
  await p.waitForTimeout(150);
  console.log('leave rows:', await p.locator('section:has(#lv-h) tbody tr').count(), '| swap check:', await p.locator('section:has(#sw-h) .badge-s').allInnerTexts());
  await p.screenshot(
  {
    path: out + '/s-leave.png',
    fullPage: true
  });
  await p.fill('#sw-to', '');
  await p.click('text=Move RDO');
  await p.waitForTimeout(100);
  console.log('empty move error:', await p.locator('section:has(#sw-h) .invalid-msg').allInnerTexts());
  await p.goto(base + '#roster');
  await p.click('text=Re-plan RDOs');
  await p.waitForTimeout(100);
  console.log('dialog focus:', await p.evaluate(() => document.activeElement.textContent.trim()));
  await p.click('text=Re-plan roster');
  await p.waitForTimeout(1500);
  console.log('issues after re-plan:', await p.evaluate(() => window.__roster.issues.value.map(x => x.title)));
  const [d2] = await Promise.all([p.waitForEvent('download'), p.click('text=Download Excel')]);
  await d2.saveAs(out + '/s2.xlsx');
  await p.goto(base + '#settings');
  await p.click('button:has-text("Start again")');
  await p.click('.dialog .btn-danger');
  await p.waitForTimeout(200);
  console.log('after start again:', await bar());
  await p.setInputFiles('#open-xlsx', out + '/s2.xlsx');
  await p.waitForTimeout(800);
  console.log('after open:', await bar(), '| leave:', await p.evaluate(() => window.__roster.store.cfg.leave.length), '| swaps:', await p.evaluate(() => window.__roster.store.cfg.swaps.length));
  await p.screenshot(
  {
    path: out + '/s-opened.png'
  });
  console.log('errors:', errs);
  await b.close();
})();