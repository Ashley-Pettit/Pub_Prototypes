/* Roster Builder planner: finds problems in a roster, suggests fixes, checks the impact of requests,
   rolls a roster forward to the next period and totals each person's duties.
   Depends on RosterEngine (engine.js). Works in Node (tests) and the browser. */
(function(root)
{
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.RosterEngine;
  const clone = o => JSON.parse(JSON.stringify(o));
  const ROT_LABEL = c => (
  {
    fd: c.rules.frontDesk.label,
    seat1: `${c.rules.siteB.label} seat 1`,
    seat2: `${c.rules.siteB.label} seat 2`,
    oc: c.rules.onCall.label
  });
  const ROT_KEY = {
    fd: 'frontDesk',
    seat1: 'seat1',
    seat2: 'seat2',
    oc: 'onCall'
  };
  const LEAVE_TYPES = {
    annual: 'Annual leave',
    personal: 'Personal leave',
    other: 'Other leave'
  };

  /* Build the config the engine computes from: the stored period plus approved requests. */
  function effective(period, requests)
  {
    const c = clone(period);
    const ids = new Set(c.people.map(p => p.id));
    const ok = (requests || []).filter(q => q.status === 'approved' && ids.has(q.pid));
    c.leave = ok.filter(q => q.type !== 'swap').map(q => (
    {
      id: q.id,
      pid: q.pid,
      from: q.from,
      to: q.to || q.from,
      type: q.type
    }));
    c.swaps = ok.filter(q => q.type === 'swap').map(q => (
    {
      id: q.id,
      pid: q.pid,
      from: q.from,
      to: q.to,
      reason: q.note || ''
    }));
    return E.normalise(c);
  }

  const isWork = (c, v) => v === c.shifts.early || v === c.shifts.late;
  const personByName = (c, r, name) => r.ro.find(p => E.variable(p) === name);

  /* Every problem in a computed roster, worst first, each with a plain-language explanation. */
  function issues(c, r)
  {
    const out = [];
    const R = c.rules,
      L = ROT_LABEL(c);
    r.days.forEach((d, i) =>
    {
      const x = r.cols[i],
        when = `${E.DAYS[d.dow - 1]} ${E.fmtDate(d.iso)}`;
      if (x.cover === 'SHORT')
      {
        const parts = [];
        if (x.early < R.minEarly) parts.push(
        {
          what: 'early',
          text: `${x.early} on ${c.shifts.early} (needs ${R.minEarly})`
        });
        if (x.late < R.minLate) parts.push(
        {
          what: 'late',
          text: `${x.late} on ${c.shifts.late} (needs ${R.minLate})`
        });
        if (x.senior < R.minSenior) parts.push(
        {
          what: 'senior',
          text: `${x.senior} ${E.seniorLabel(c).replace(/ on duty$/, '').toLowerCase()} on duty (needs ${R.minSenior})`
        });
        if (R.siteB.on && x.siteB != null && x.siteB < R.siteB.min) parts.push(
        {
          what: 'siteB',
          text: `${x.siteB} at ${R.siteB.label} (needs ${R.siteB.min})`
        });
        out.push(
        {
          id: `cover|${d.iso}`,
          kind: 'cover',
          severity: 2,
          i,
          iso: d.iso,
          parts,
          title: `Short on ${when}`,
          detail: parts.map(p => p.text).join(', ') + '.'
        });
      }
      for (const k of ['fd', 'seat1', 'seat2', 'oc'])
      {
        const name = x[ROT_KEY[k]];
        if (name == null) continue;
        if (name === 'NO COVER' || name === 'Vacant')
        {
          out.push(
          {
            id: `gap|${k}|${d.iso}`,
            kind: 'gap',
            severity: 2,
            i,
            iso: d.iso,
            rot: k,
            title: `${L[k]}: no one free on ${when}`,
            detail: name === 'Vacant' ? `This turn belongs to a vacant role.` : `Every analyst is off, at ${R.siteB.label} or already covering.`
          });
          continue;
        }
        const p = personByName(c, r, name);
        const v = p ? r.grid.get(p.id)[i] : '?';
        if (!isWork(c, v)) out.push(
        {
          id: `conflict|${k}|${d.iso}`,
          kind: 'conflict',
          severity: 2,
          i,
          iso: d.iso,
          rot: k,
          pid: p && p.id,
          title: `${L[k]}: ${name} is off on ${when}`,
          detail: `${name} is on ${v === 'RDO' ? 'an RDO' : v === 'Leave' ? 'leave' : v} that day.`
        });
      }
    });
    for (const p of r.ro)
    {
      r.perPerson.get(p.id).rdo.forEach((n, f) =>
      {
        if (n === 1) return;
        out.push(
        {
          id: `rdo|${p.id}|${f}`,
          kind: 'rdo',
          severity: 1,
          pid: p.id,
          f,
          title: `${E.variable(p)} has ${n} RDOs in pay period ${f + 1}`,
          detail: n === 0 ? 'Their RDO falls on leave or was changed. Move it to another day so it is not lost.' : 'Each person should have exactly 1 RDO per pay period.'
        });
      });
    }
    r.swaps.forEach(s =>
    {
      if (s.status.startsWith('OK')) return;
      const p = c.people.find(x => x.id === s.pid);
      out.push(
      {
        id: `swap|${s.id}`,
        kind: 'swap',
        severity: 1,
        pid: s.pid,
        reqId: s.id,
        title: `RDO swap for ${p ? E.variable(p) : 'someone'} can't apply`,
        detail: s.status + '.'
      });
    });
    // A seat holder being off already explains a Site B shortfall: keep one problem, not two.
    const seatClash = new Set(out.filter(x => (x.kind === 'conflict' || x.kind === 'gap') && (x.rot === 'seat1' || x.rot === 'seat2')).map(x => x.iso));
    const merged = out.filter(x =>
    {
      if (x.kind !== 'cover' || !seatClash.has(x.iso)) return true;
      x.parts = x.parts.filter(p => p.what !== 'siteB');
      x.detail = x.parts.map(p => p.text).join(', ') + '.';
      return x.parts.length > 0;
    });
    return merged.sort((a, b) => b.severity - a.severity || (a.i ?? 99) - (b.i ?? 99));
  }

  const scoreOf = list => list.reduce((a, x) => a + (x.severity === 2 ? 100 : 10), 0);

  /* Apply a change (fix or request) to an effective config copy. */
  function applyChange(c, ch)
  {
    const n = clone(c);
    if (ch.type === 'override')
    {
      if (ch.value == null) delete n.overrides[ch.pid + '|' + ch.iso];
      else n.overrides[ch.pid + '|' + ch.iso] = ch.value;
    }
    if (ch.type === 'swap') n.swaps.push(
    {
      id: 'tmp',
      pid: ch.pid,
      from: ch.from,
      to: ch.to,
      reason: ''
    });
    if (ch.type === 'rot') n.rotOverrides[ch.rot + '|' + ch.iso] = ch.pid;
    if (ch.type === 'leave') n.leave.push(
    {
      id: 'tmp',
      pid: ch.pid,
      from: ch.from,
      to: ch.to || ch.from
    });
    return E.normalise(n);
  }

  function evaluate(c, ch)
  {
    const n = applyChange(c, ch);
    const r = E.compute(n);
    const list = issues(n, r);
    return {
      score: scoreOf(list),
      list
    };
  }

  /* Up to three changes that fix an issue without creating worse ones. */
  function fixes(c, r, issue)
  {
    const base = scoreOf(issues(c, r));
    const cands = [];
    const days = r.days;
    const fortnightDays = f => days.filter(d => d.f === f);
    const rdoMoves = (p, fromIso) =>
    {
      const d0 = days.find(d => d.iso === fromIso);
      if (!d0) return;
      for (const d of fortnightDays(d0.f))
      {
        if (d.iso === fromIso) continue;
        if (!isWork(c, r.grid.get(p.id)[d.i])) continue;
        cands.push(
        {
          type: 'swap',
          pid: p.id,
          from: fromIso,
          to: d.iso,
          usual: c.rules.rdoDays.includes(d.dow),
          label: `Move ${E.variable(p)}'s RDO to ${E.DAYS[d.dow - 1]} ${E.fmtDate(d.iso)}`
        });
      }
    };
    if (issue.kind === 'cover')
    {
      const i = issue.i,
        d = days[i];
      for (const part of issue.parts)
      {
        const code = part.what === 'late' ? c.shifts.late : c.shifts.early;
        // People off on a standard RDO that day.
        for (const p of r.ro)
        {
          const v = r.grid.get(p.id)[i];
          if (v !== 'RDO' || r.source.get(p.id)[i] !== 'formula') continue;
          if (part.what === 'senior' && p.group !== 'senior') continue;
          if ((part.what === 'early' || part.what === 'late') && p.plan[d.f].shift !== part.what) continue;
          const std = r.rdoDates.get(p.id)[d.f];
          if (std === d.iso) rdoMoves(p, d.iso);
        }
        // Move someone across from the other shift for the day.
        if (part.what === 'early' || part.what === 'late')
        {
          const other = part.what === 'early' ? c.shifts.late : c.shifts.early;
          for (const p of r.ro)
          {
            if (r.grid.get(p.id)[i] !== other || E.variable(p) === 'Vacant') continue;
            cands.push(
            {
              type: 'override',
              pid: p.id,
              iso: d.iso,
              value: code,
              label: `Put ${E.variable(p)} on ${code} for ${E.DAYS[d.dow - 1]} ${E.fmtDate(d.iso)}`
            });
          }
        }
      }
      if (issue.parts.some(p => p.what === 'siteB'))
      {
        for (const k of ['seat1', 'seat2'])
        {
          const name = r.cols[i][k];
          const p = personByName(c, r, name);
          if (!p || !isWork(c, r.grid.get(p.id)[i])) substitutes(k, i);
        }
      }
    }
    if (issue.kind === 'conflict' || issue.kind === 'gap')
    {
      substitutes(issue.rot, issue.i);
      if (issue.pid)
      {
        const p = c.people.find(x => x.id === issue.pid);
        const d = days[issue.i];
        if (r.grid.get(p.id)[issue.i] === 'RDO' && r.rdoDates.get(p.id)[d.f] === d.iso && r.source.get(p.id)[issue.i] === 'formula') rdoMoves(p, d.iso);
      }
    }
    if (issue.kind === 'rdo')
    {
      const p = c.people.find(x => x.id === issue.pid);
      const std = r.rdoDates.get(p.id)[issue.f];
      if (r.perPerson.get(p.id).rdo[issue.f] === 0) rdoMoves(p, std);
    }

    function substitutes(rot, i)
    {
      const d = days[i],
        x = r.cols[i];
      const taken = new Set([x.frontDesk, x.seat1, x.seat2, x.onCall].filter(Boolean));
      const pool = rot === 'oc' ? r.pool : r.analysts;
      for (const p of pool)
      {
        const nm = E.variable(p);
        if (nm === 'Vacant' || taken.has(nm) || !isWork(c, r.grid.get(p.id)[i])) continue;
        cands.push(
        {
          type: 'rot',
          rot,
          iso: d.iso,
          pid: p.id,
          label: `Put ${nm} on ${ROT_LABEL(c)[rot]} for ${E.DAYS[d.dow - 1]} ${E.fmtDate(d.iso)}`
        });
      }
    }
    const seen = new Set();
    return cands.filter(ch =>
      {
        const k = JSON.stringify([ch.type, ch.pid, ch.iso, ch.from, ch.to, ch.rot, ch.value]);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map(ch => (
      {
        ...ch,
        ...evaluate(c, ch)
      }))
      .filter(ch => ch.score < base)
      .map(ch => (
      {
        ...ch,
        partial: ch.list.some(x => x.id === issue.id)
      }))
      .sort((a, b) => (a.partial - b.partial) || a.score - b.score || ((b.usual ? 1 : 0) - (a.usual ? 1 : 0)) || (a.type === 'swap' ? -1 : 1))
      .slice(0, 3)
      .map(ch => (
      {
        ...ch,
        remaining: ch.list.length,
        list: undefined
      }));
  }

  /* Apply the best fix repeatedly until nothing improves. Returns the list of changes. */
  function autoFix(c, maxSteps = 25)
  {
    let cur = clone(c);
    const applied = [];
    for (let step = 0; step < maxSteps; step++)
    {
      const r = E.compute(cur);
      const list = issues(cur, r);
      if (!list.length) break;
      let best = null;
      for (const iss of list)
      {
        const fx = fixes(cur, r, iss)[0];
        if (fx && (!best || fx.score < best.score)) best = fx;
      }
      if (!best) break;
      applied.push(best);
      cur = applyChange(cur, best);
    }
    return applied;
  }

  /* What approving a request would do: new problems it creates, or none. */
  function impact(c, req)
  {
    const before = issues(c, E.compute(c));
    const ch = req.type === 'swap' ?
    {
      type: 'swap',
      pid: req.pid,
      from: req.from,
      to: req.to
    } :
    {
      type: 'leave',
      pid: req.pid,
      from: req.from,
      to: req.to
    };
    const n = applyChange(c, ch);
    const rr = E.compute(n);
    const after = issues(n, rr);
    const had = new Set(before.map(x => x.id));
    const added = after.filter(x => !had.has(x.id) && !(x.kind === 'swap' && x.reqId === 'tmp'));
    let invalid = null;
    if (req.type === 'swap')
    {
      const s = rr.swaps.find(x => x.id === 'tmp');
      if (s && !s.status.startsWith('OK')) invalid = s.status;
      else if (!s) invalid = 'From date is outside this roster';
    }
    return {
      added,
      invalid,
      safe: !invalid && !added.some(x => x.severity === 2),
      warn: !invalid && added.length > 0 && !added.some(x => x.severity === 2)
    };
  }

  /* Days an RDO could move to without new problems, same pay period first. */
  function swapDays(c, pid, fromIso)
  {
    const r = E.compute(c);
    const d0 = r.days.find(d => d.iso === fromIso);
    const base = new Set(issues(c, r).map(x => x.id));
    const out = [];
    for (const d of r.days)
    {
      if (d.iso === fromIso || !isWork(c, r.grid.get(pid)[d.i])) continue;
      const n = applyChange(c,
      {
        type: 'swap',
        pid,
        from: fromIso,
        to: d.iso
      });
      const rr = E.compute(n);
      const s = rr.swaps.find(x => x.id === 'tmp');
      if (!s || !s.status.startsWith('OK')) continue;
      const added = issues(n, rr).filter(x => !base.has(x.id));
      out.push(
      {
        iso: d.iso,
        same: d0 && d.f === d0.f,
        added: added.length
      });
    }
    return out.filter(x => x.added === 0).sort((a, b) => (b.same - a.same) || a.iso.localeCompare(b.iso));
  }

  /* The next roster period: same team, rotations carry on, shifts swap, RDOs re-planned. */
  function rollForward(period, requests)
  {
    const c = clone(period);
    const N = c.weeks * 5,
      W = c.weeks;
    const r = E.compute(effective(period, requests));
    const A = r.analysts.length || 1,
      pool = r.pool.length || 1;
    const m = (x, n) => ((x % n) + n) % n;
    c.id = E.uid();
    c.start = E.addDays(c.start, 7 * W);
    c.status = 'draft';
    c.finalisedAt = null;
    c.log = [];
    c.overrides = {};
    c.rotOverrides = {};
    c.leave = [];
    c.swaps = [];
    c.rules.frontDesk.start = m(c.rules.frontDesk.start - 1 + N, A) + 1;
    c.rules.siteB.seat1 = m(c.rules.siteB.seat1 - 1 + W, A) + 1;
    c.rules.siteB.seat2 = m(c.rules.siteB.seat2 - 1 + W, A) + 1;
    c.rules.onCall.start = m(c.rules.onCall.start - 1 + W, pool) + 1;
    for (const p of c.people)
    {
      const last = p.plan[p.plan.length - 1].shift;
      p.plan = p.plan.map((q, f) => (
      {
        week: q.week,
        day: q.day,
        shift: p.pattern === 'alt' ? ((f % 2 === 0) === (last === 'late') ? 'early' : 'late') : p.pattern
      }));
    }
    const eff = effective(c, requests);
    const planned = E.autoPlan(eff,
    {
      keepShifts: true,
      tries: 30
    });
    c.people.forEach(p =>
    {
      const q = planned.people.find(x => x.id === p.id);
      if (q) p.plan = q.plan;
    });
    return c;
  }

  /* Per-person totals for the period. */
  function totals(c, r)
  {
    const m = new Map();
    for (const p of r.ro)
    {
      const v = r.grid.get(p.id),
        nm = E.variable(p);
      const t = {
        early: 0,
        late: 0,
        worked: 0,
        rdo: 0,
        leave: 0,
        fd: 0,
        seat: 0,
        ocWeeks: 0,
        changed: 0
      };
      const ocW = new Set();
      r.days.forEach((d, i) =>
      {
        if (v[i] === c.shifts.early) t.early++;
        if (v[i] === c.shifts.late) t.late++;
        if (v[i] === 'RDO') t.rdo++;
        if (v[i] === 'Leave') t.leave++;
        if (r.source.get(p.id)[i] === 'override') t.changed++;
        const x = r.cols[i];
        if (nm !== 'Vacant')
        {
          if (x.frontDesk === nm) t.fd++;
          if (x.seat1 === nm || x.seat2 === nm) t.seat++;
          if (x.onCall === nm) ocW.add(d.w);
        }
      });
      t.worked = t.early + t.late;
      t.ocWeeks = ocW.size;
      m.set(p.id, t);
    }
    return m;
  }

  /* Duties for one person on one day, for cell labels and the person view. */
  function dutiesOn(c, r, pid, i)
  {
    const p = c.people.find(x => x.id === pid);
    const nm = E.variable(p);
    const x = r.cols[i];
    const L = ROT_LABEL(c);
    const out = [];
    if (nm === 'Vacant') return out;
    if (x.frontDesk === nm) out.push(L.fd);
    if (x.seat1 === nm) out.push(L.seat1);
    if (x.seat2 === nm) out.push(L.seat2);
    if (x.onCall === nm) out.push(L.oc);
    return out;
  }

  const api = {
    effective,
    issues,
    fixes,
    autoFix,
    applyChange,
    impact,
    swapDays,
    rollForward,
    totals,
    dutiesOn,
    ROT_LABEL,
    ROT_KEY,
    LEAVE_TYPES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RosterPlanner = api;
})(typeof self !== 'undefined' ? self : this);