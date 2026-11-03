/* Automated tests for the roster engine, planner and workbook.
   Run: npm install exceljs@4.4.0 && node tests/engine.test.js
   LibreOffice (soffice) is optional: when present, generated workbooks are recalculated and compared. */
const assert = require('assert');
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  cp = require('child_process');
const E = require('../js/engine.js'),
  P = require('../js/planner.js');
let ExcelJS = null;
try
{
  ExcelJS = require('exceljs');
}
catch (e)
{}
const results = [];
async function test(id, name, fn)
{
  try
  {
    await fn();
    results.push([id, name, 'PASS', '']);
  }
  catch (e)
  {
    results.push([id, name, 'FAIL', e.message.split('\n')[0]]);
  }
}
const base = () =>
{
  const c = E.normalise(E.defaultConfig());
  c.start = '2026-11-02';
  return c;
};
const roleMap = c => new Map(c.people.map(p => [E.variable(p), p.role]));

(async () =>
{
  await test('T01', 'Engine matches the original workbook value for value (roles, no names)', () =>
  {
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/original-roster.json')));
    const c = base();
    const r = E.compute(c);
    const rm = roleMap(c);
    for (const p of c.people) assert.deepStrictEqual(r.grid.get(p.id), fx.grid[p.role], p.role);
    for (const k of ['early', 'late', 'total', 'senior', 'siteB', 'cover', 'rotation']) assert.deepStrictEqual(r.cols.map(x => x[k]), fx.cols[k], k);
    for (const k of ['frontDesk', 'seat1', 'seat2', 'onCall']) assert.deepStrictEqual(r.cols.map(x => rm.get(x[k]) || x[k]), fx.cols[k], k);
  });
  await test('T02', 'Sample plan has no problems', () =>
  {
    const c = base();
    assert.strictEqual(P.issues(c, E.compute(c)).length, 0);
  });
  for (const w of [2, 4, 6, 8]) await test('T03-' + w, `Auto-plan a ${w}-week roster: no short days, no clashes, 1 RDO per pay period`, () =>
  {
    const c = base();
    c.weeks = w;
    const n = E.normalise(c);
    const best = E.autoPlan(n,
    {
      tries: 30
    });
    const r = E.compute(best);
    assert.strictEqual(r.days.length, w * 5);
    assert.strictEqual(r.summary.short, 0, 'short');
    assert.strictEqual(r.summary.conflict, 0, 'conflict');
    assert.strictEqual(r.summary.rdoIssues, 0, 'rdo');
  });
  await test('T04', 'Vacant role is left out of cover and flagged when on a rotation', () =>
  {
    const c = base();
    const a = c.people.find(p => p.role === 'Analyst 1');
    a.name = '';
    const r = E.compute(c);
    assert(r.cols.every(x => x.early + x.late <= 10));
    const is = P.issues(c, r);
    assert(is.some(x => x.kind === 'gap'), 'gap expected');
  });
  await test('T05', 'All rotations off: no rotation rows or rotation problems', () =>
  {
    const c = base();
    c.rules.frontDesk.on = false;
    c.rules.siteB.on = false;
    c.rules.onCall.on = false;
    const r = E.compute(c);
    assert(r.cols.every(x => x.rotation == null && x.frontDesk == null && x.onCall == null));
  });
  await test('T06', 'No analysts: front desk and seats switch off cleanly', () =>
  {
    const c = base();
    c.people = c.people.filter(p => p.group !== 'analyst');
    const r = E.compute(E.normalise(c));
    assert(r.cols.every(x => x.frontDesk == null && x.seat1 == null));
  });
  await test('T07', 'Leave on a standard RDO day flags 0 RDOs as a warning, not a cover problem', () =>
  {
    const c = base();
    const p = c.people[5];
    const rd = E.compute(c).rdoDates.get(p.id)[0];
    const eff = P.effective(c, [
    {
      id: 'q',
      pid: p.id,
      type: 'annual',
      from: rd,
      to: rd,
      status: 'approved'
    }]);
    const is = P.issues(eff, E.compute(eff));
    const x = is.find(i => i.kind === 'rdo');
    assert(x && x.severity === 1);
  });
  await test('T08', 'RDO swap across pay periods applies and is reported as such', () =>
  {
    const c = base();
    const p = c.people[6];
    const r0 = E.compute(c);
    const from = r0.rdoDates.get(p.id)[0];
    const to = r0.days.find(d => d.f === 1 && r0.grid.get(p.id)[d.i] !== 'RDO').iso;
    const eff = P.effective(c, [
    {
      id: 'q',
      pid: p.id,
      type: 'swap',
      from,
      to,
      status: 'approved'
    }]);
    const r = E.compute(eff);
    assert.strictEqual(r.swaps[0].status, 'OK - moves to a different fortnight');
    assert.strictEqual(r.grid.get(p.id)[r.days.findIndex(d => d.iso === to)], 'RDO');
  });
  await test('T09', 'Swap from a day that is not an RDO is rejected with the workbook wording', () =>
  {
    const c = base();
    const p = c.people[6];
    const eff = P.effective(c, [
    {
      id: 'q',
      pid: p.id,
      type: 'swap',
      from: '2026-11-04',
      to: '2026-11-05',
      status: 'approved'
    }]);
    const s = E.compute(eff).swaps[0];
    assert(!s || s.status === "From date is not this person's RDO");
  });
  await test('T10', 'Rotation override replaces the person for that day only and front desk avoids them', () =>
  {
    const c = base();
    const r0 = E.compute(c);
    const j = r0.analysts[3];
    c.rotOverrides['seat1|2026-11-03'] = j.id;
    const r = E.compute(c);
    assert.strictEqual(r.cols[1].seat1, E.variable(j));
    assert.notStrictEqual(r.cols[1].frontDesk, E.variable(j));
    assert.strictEqual(r.cols[2].seat1, r0.cols[2].seat1);
  });
  await test('T11', 'Each suggested fix lowers the problem score', () =>
  {
    const c = base();
    const ids = c.people.map(p => p.id);
    const eff = P.effective(c, [4, 5, 6].map(k => (
    {
      id: 'q' + k,
      pid: ids[k],
      type: 'annual',
      from: '2026-11-02',
      to: '2026-11-06',
      status: 'approved'
    })));
    const r = E.compute(eff);
    const is = P.issues(eff, r);
    assert(is.length > 0);
    const sc = l => l.reduce((a, x) => a + (x.severity === 2 ? 100 : 10), 0);
    const base0 = sc(is);
    for (const iss of is.slice(0, 5))
      for (const fx of P.fixes(eff, r, iss))
      {
        const n = P.applyChange(eff, fx);
        assert(sc(P.issues(n, E.compute(n))) < base0, fx.label);
      }
  });
  await test('T12', 'Fix automatically clears every severe problem in a heavy-leave week', () =>
  {
    const c = base();
    const ids = c.people.map(p => p.id);
    let eff = P.effective(c, [4, 5].map(k => (
    {
      id: 'q' + k,
      pid: ids[k],
      type: 'annual',
      from: '2026-11-02',
      to: '2026-11-06',
      status: 'approved'
    })));
    P.autoFix(eff).forEach(fx =>
    {
      eff = P.applyChange(eff, fx);
    });
    assert.strictEqual(P.issues(eff, E.compute(eff)).filter(x => x.severity === 2).length, 0);
  });
  await test('T13', 'Impact check: safe leave is safe, leave that drops a shift below minimum is not', () =>
  {
    const c = base();
    const r = E.compute(c);
    const lateDay = r.days.find(d => r.cols[d.i].late === c.rules.minLate);
    const latePerson = r.ro.find(p => r.grid.get(p.id)[lateDay.i] === c.shifts.late && p.group !== 'leader');
    const bad = P.impact(c,
    {
      pid: latePerson.id,
      type: 'annual',
      from: lateDay.iso,
      to: lateDay.iso
    });
    assert.strictEqual(bad.safe, false);
    const busy = r.days.find(d => r.cols[d.i].early >= c.rules.minEarly + 2);
    const ok = r.ro.find(p => p.group === 'leader');
    assert.strictEqual(P.impact(c,
    {
      pid: ok.id,
      type: 'other',
      from: busy.iso,
      to: busy.iso
    }).safe, true);
  });
  await test('T14', 'Next roster continues every rotation without a jump', () =>
  {
    const c = base();
    const nx = P.rollForward(c, []);
    const r1 = E.compute(c),
      r2 = E.compute(nx);
    const long = base();
    long.weeks = 8;
    const rl = E.compute(E.normalise(long));
    for (const k of ['seat1', 'seat2', 'onCall', 'fdSched']) assert.deepStrictEqual(r2.cols.slice(0, 5).map(x => x[k]), rl.cols.slice(20, 25).map(x => x[k]), k);
    assert.strictEqual(nx.start, '2026-11-30');
    assert.strictEqual(r2.summary.short + r2.summary.conflict, 0);
  });
  await test('T15', 'Next roster swaps shifts: each person starts on the other shift', () =>
  {
    const c = base();
    const nx = P.rollForward(c, []);
    for (const p of c.people.filter(x => x.pattern === 'alt'))
    {
      const q = nx.people.find(x => x.id === p.id);
      assert.notStrictEqual(q.plan[0].shift, p.plan[1].shift, p.role);
    }
  });
  if (ExcelJS)
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-'));
    const busy = () =>
    {
      const c = base();
      const ids = c.people.map(p => p.id);
      let eff = P.effective(c, [
      {
        id: 'a',
        pid: ids[6],
        type: 'annual',
        from: '2026-11-10',
        to: '2026-11-12',
        status: 'approved'
      }]);
      eff.overrides[ids[2] + '|2026-11-18'] = 'Leave';
      P.autoFix(eff).forEach(fx => eff = P.applyChange(eff, fx));
      return eff;
    };
    await test('T19', 'Workbook round trip: reopening gives back the same plan, names and swaps', async () =>
    {
      const c = busy();
      const wb = E.buildWorkbook(ExcelJS, c, E.compute(c));
      const f = path.join(tmp, 'rt.xlsx');
      await wb.xlsx.writeFile(f);
      const back = (await E.readWorkbook(ExcelJS, fs.readFileSync(f))).config;
      assert.deepStrictEqual(back.people.map(p => [p.name, p.plan]), c.people.map(p => [p.name, p.plan]));
      assert.strictEqual(back.swaps.length, E.compute(c).swaps.length);
    });
    let hasLO = false;
    try
    {
      cp.execSync('which soffice',
      {
        stdio: 'ignore'
      });
      hasLO = true;
    }
    catch (e)
    {}
    if (hasLO) await test('T20', 'Workbook formulas recalculate to the same values the app shows (LibreOffice)', async () =>
    {
      const c = busy();
      const f = path.join(tmp, 'calc.xlsx');
      await E.buildWorkbook(ExcelJS, c, E.compute(c)).xlsx.writeFile(f);
      cp.execSync(`soffice --headless --convert-to xlsx --outdir ${tmp}/out ${f}`,
      {
        stdio: 'ignore'
      });
      const a = new ExcelJS.Workbook();
      await a.xlsx.readFile(f);
      const b = new ExcelJS.Workbook();
      await b.xlsx.readFile(`${tmp}/out/calc.xlsx`);
      let diffs = 0;
      for (const name of ['Roster', 'Setup', 'RDO']) a.getWorksheet(name).eachRow((row, rn) => row.eachCell((cell, cn) =>
      {
        const val = v =>
        {
          if (v && typeof v === 'object' && 'result' in v) v = v.result;
          if (v instanceof Date) v = v.toISOString().slice(0, 10);
          return v === '' ? null : v;
        };
        if (String(val(cell.value)) !== String(val(b.getWorksheet(name).getCell(rn, cn).value))) diffs++;
      }));
      assert.strictEqual(diffs, 0, diffs + ' cells differ');
    });
  }
  const w = Math.max(...results.map(r => r[1].length));
  results.forEach(r => console.log(`${r[0].padEnd(6)} ${r[2]}  ${r[1].padEnd(w)}  ${r[3]}`));
  const fails = results.filter(r => r[2] === 'FAIL').length;
  console.log(`\n${results.length - fails} of ${results.length} passed`);
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(
  {
    ran: new Date().toISOString(),
    results
  }, null, 1));
  process.exitCode = fails ? 1 : 0;
})();