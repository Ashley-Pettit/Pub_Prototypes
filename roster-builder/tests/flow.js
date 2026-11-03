// End-to-end flow: approve and fix, single-day change, export Excel, reopen it, plan next roster, mark final.
const
{
  chromium
} = require('playwright');
const fs = require('fs');
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
  const log = (...a) => console.log(...a);
  const issues = () => p.evaluate(() => window.__roster.issues.value.map(x => x.title));
  await p.goto(base + '#requests',
  {
    waitUntil: 'networkidle'
  });
  await p.waitForTimeout(300);
  log('pending rows:', await p.locator('.req').count(), '| fix buttons:', await p.locator('text=Approve and fix cover').count());
  await p.screenshot(
  {
    path: out + '/flow-requests.png'
  });
  if (await p.locator('text=Approve and fix cover').count())
  {
    await p.click('text=Approve and fix cover');
    await p.waitForTimeout(300);
    log('toast:', await p.locator('.toast-item').innerText());
  }
  await p.goto(base + '#roster');
  await p.waitForTimeout(200);
  log('issues now:', await issues());
  await p.click('text=Fix automatically').catch(() => log('no fix-all button (no issues)'));
  await p.waitForTimeout(300);
  log('after fix all:', await issues());
  // keyboard: focus a cell, arrow right, enter opens popover, choose RDO, escape
  await p.locator('.cell').first().focus();
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
  log('popover open:', await p.locator('.pop').count(), 'focused:', await p.evaluate(() => document.activeElement.textContent.trim()));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(100);
  log('focus back on cell:', await p.evaluate(() => document.activeElement.className));
  await p.locator('.cell').nth(1).click();
  await p.click('.menu-item:has-text("Make it an RDO")');
  await p.waitForTimeout(200);
  log('after single-day RDO:', (await issues()).slice(0, 3));
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(200);
  log('after undo:', (await issues()).length);
  // slide-over focus trap + escape restores
  await p.click('text=Add request');
  await p.waitForTimeout(200);
  for (let k = 0; k < 25; k++) await p.keyboard.press('Tab');
  log('focus inside panel after 25 tabs:', await p.evaluate(() => !!document.activeElement.closest('.slide')));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  log('panel closed, focus on:', await p.evaluate(() => document.activeElement.textContent.trim().slice(0, 20)));
  // submit empty swap form shows errors, no silent no-op
  await p.click('text=Add request');
  await p.click('.seg button:has-text("RDO swap")');
  await p.click('text=Add as pending');
  await p.waitForTimeout(150);
  log('swap errors:', await p.locator('.slide .invalid-msg').allInnerTexts());
  await p.keyboard.press('Escape');
  // export xlsx from review
  await p.goto(base + '#review');
  await p.click('.tabs button:has-text("Export")');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Download workbook')]);
  await dl.saveAs(out + '/flow.xlsx');
  log('xlsx:', dl.suggestedFilename());
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('text=Download CSV')]);
  await dl2.saveAs(out + '/flow.csv');
  log('csv:', dl2.suggestedFilename());
  await p.click('text=Mark as final');
  await p.waitForTimeout(150);
  // change after final shows in log
  await p.goto(base + '#roster');
  await p.locator('.cell').nth(5).click();
  await p.click('.menu-item:has-text("Work")');
  await p.waitForTimeout(150);
  await p.goto(base + '#review');
  await p.click('.tabs button:has-text("Changes")');
  await p.waitForTimeout(100);
  log('after-final entries:', await p.locator('.feed-item:has-text("After final")').count());
  await p.screenshot(
  {
    path: out + '/flow-changes.png'
  });
  // plan next roster
  await p.goto(base + '#roster');
  await p.click('text=Plan next roster');
  await p.waitForTimeout(1500);
  log('period now:', await p.locator('.period-label').innerText(), '| issues:', (await issues()).length);
  await p.screenshot(
  {
    path: out + '/flow-next.png',
    fullPage: true
  });
  // reopen exported workbook
  await p.goto(base + '#settings');
  await p.click('.settings nav button:has-text("Data")');
  await p.setInputFiles('input[type=file]', out + '/flow.xlsx');
  await p.waitForTimeout(800);
  log('after open:', await p.locator('.period-label').innerText().catch(() => '?'), await p.locator('.toast-item').innerText().catch(() => ''));
  log('errors:', errs);
  await b.close();
})();