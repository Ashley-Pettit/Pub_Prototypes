// Measures audit rows in a real browser: weights, font sizes, hit targets, overflow, dark mode, dialog focus.
const
{
  chromium
} = require('playwright');
const base = process.argv[2] || 'http://localhost:8765/',
  out = process.argv[3] || '/tmp/claude-0/shots';
(async () =>
{
  const b = await chromium.launch();
  for (const [w, h, tag, scheme] of [
      [1280, 900, 'wide', 'light'],
      [375, 812, 'narrow', 'light'],
      [1280, 900, 'dark', 'dark']
    ])
  {
    const ctx = await b.newContext(
    {
      viewport:
      {
        width: w,
        height: h
      },
      colorScheme: scheme,
      reducedMotion: 'reduce'
    });
    const p = await ctx.newPage();
    for (const r of ['roster', 'requests', 'team', 'review', 'settings'])
    {
      await p.goto(base + '#' + r,
      {
        waitUntil: 'networkidle'
      });
      await p.waitForTimeout(200);
      const m = await p.evaluate(() =>
      {
        const weights = new Set(),
          small = [],
          tiny = [];
        for (const el of document.querySelectorAll('body *'))
        {
          if (!el.offsetParent && el.tagName !== 'BODY') continue;
          const cs = getComputedStyle(el);
          if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
          weights.add(cs.fontWeight);
          const fs = parseFloat(cs.fontSize);
          if (fs < 12) small.push(el.tagName + '.' + el.className + ':' + fs);
        }
        for (const el of document.querySelectorAll('button, a[href], input, select, [role=tab]'))
        {
          if (!el.offsetParent) continue;
          const r = el.getBoundingClientRect();
          if (el.type === 'checkbox' || el.type === 'radio') continue;
          if (r.width < 44 || r.height < 44) tiny.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 18)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        return {
          weights: [...weights],
          small: small.slice(0, 5),
          tiny: [...new Set(tiny)].slice(0, 12),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
      });
      console.log(tag, r, JSON.stringify(m));
      if (tag !== 'wide') await p.screenshot(
      {
        path: `${out}/${tag}-${r}.png`,
        fullPage: false
      });
    }
    if (tag === 'wide')
    {
      await p.goto(base + '#requests');
      await p.waitForTimeout(200);
      await p.click('.req .btn-icon >> nth=0');
      await p.waitForTimeout(150);
      console.log('dialog focus on:', await p.evaluate(() => document.activeElement.textContent.trim()), '| title:', await p.locator('.dialog h2').innerText());
      await p.keyboard.press('Escape');
      await p.waitForTimeout(100);
      console.log('dialog closed:', await p.locator('.dialog').count() === 0, 'focus restored:', await p.evaluate(() => document.activeElement.getAttribute('aria-label')));
    }
    await ctx.close();
  }
  await b.close();
})();