/* Roster Builder core: model, compute (mirrors the workbook formulas), auto-plan, xlsx writer, xlsx reader.
   Works in Node (tests) and the browser (app). */
(function(root)
{
  'use strict';

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const GROUPS = ['leader', 'senior', 'analyst'];
  const GROUP_LABEL = {
    leader: 'Lead',
    senior: 'Senior',
    analyst: 'Analyst'
  };
  const uid = () => Math.random().toString(36).slice(2, 9);

  /* ---------- dates (all UTC, ISO strings 'YYYY-MM-DD') ---------- */
  const toDate = iso =>
  {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const toIso = dt => dt.toISOString().slice(0, 10);
  const addDays = (iso, n) =>
  {
    const d = toDate(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return toIso(d);
  };
  const dowOf = iso => (toDate(iso).getUTCDay() + 6) % 7 + 1; // 1 = Mon
  const mondayOnOrAfter = iso =>
  {
    const w = dowOf(iso);
    return w === 1 ? iso : addDays(iso, 8 - w);
  };
  const fmtDate = (iso, withYear) =>
  {
    const d = toDate(iso);
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getUTCDate() + ' ' + M[d.getUTCMonth()] + (withYear ? ' ' + d.getUTCFullYear() : '');
  };

  /* ---------- default model ---------- */
  function defaultConfig()
  {
    const today = new Date();
    const iso = toIso(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));
    const p = (role, name, group, pattern, plan) => (
    {
      id: uid(),
      role,
      name,
      group,
      pattern,
      plan
    });
    return {
      v: 1,
      title: 'IT Team Roster',
      start: mondayOnOrAfter(iso),
      weeks: 4,
      shifts:
      {
        early: '7-4',
        late: '8-5'
      },
      people: [
        p('Team Leader', 'Alex', 'leader', 'early', [
        {
          week: 2,
          day: 5,
          shift: 'early'
        },
        {
          week: 2,
          day: 5,
          shift: 'early'
        }]),
        p('Specialist', 'Bree', 'senior', 'alt', [
        {
          week: 2,
          day: 1,
          shift: 'late'
        },
        {
          week: 1,
          day: 1,
          shift: 'early'
        }]),
        p('Senior 1', 'Chen', 'senior', 'alt', [
        {
          week: 1,
          day: 1,
          shift: 'early'
        },
        {
          week: 1,
          day: 5,
          shift: 'late'
        }]),
        p('Senior 2', 'Dana', 'senior', 'alt', [
        {
          week: 1,
          day: 5,
          shift: 'late'
        },
        {
          week: 2,
          day: 1,
          shift: 'early'
        }]),
        p('Analyst 1', 'Eli', 'analyst', 'alt', [
        {
          week: 2,
          day: 1,
          shift: 'early'
        },
        {
          week: 1,
          day: 1,
          shift: 'late'
        }]),
        p('Analyst 2', 'Fatima', 'analyst', 'alt', [
        {
          week: 1,
          day: 1,
          shift: 'early'
        },
        {
          week: 1,
          day: 1,
          shift: 'late'
        }]),
        p('Analyst 3', 'Gus', 'analyst', 'alt', [
        {
          week: 1,
          day: 5,
          shift: 'early'
        },
        {
          week: 2,
          day: 1,
          shift: 'late'
        }]),
        p('Analyst 4', 'Hana', 'analyst', 'alt', [
        {
          week: 2,
          day: 5,
          shift: 'early'
        },
        {
          week: 1,
          day: 5,
          shift: 'late'
        }]),
        p('Analyst 5', 'Isaac', 'analyst', 'alt', [
        {
          week: 1,
          day: 1,
          shift: 'late'
        },
        {
          week: 1,
          day: 5,
          shift: 'early'
        }]),
        p('Analyst 6', 'Jade', 'analyst', 'alt', [
        {
          week: 1,
          day: 5,
          shift: 'late'
        },
        {
          week: 2,
          day: 5,
          shift: 'early'
        }]),
        p('Analyst 7', 'Kofi', 'analyst', 'alt', [
        {
          week: 2,
          day: 1,
          shift: 'late'
        },
        {
          week: 2,
          day: 1,
          shift: 'early'
        }]),
      ],
      rules:
      {
        minEarly: 3,
        minLate: 3,
        minSenior: 1,
        rdoDays: [1, 5],
        frontDesk:
        {
          on: true,
          label: 'Front desk',
          start: 1
        },
        siteB:
        {
          on: true,
          label: 'Site B',
          min: 2,
          seat1: 1,
          seat2: 4
        },
        onCall:
        {
          on: true,
          label: 'On call',
          poolSize: 3,
          start: 1
        },
      },
      leave: [], // {id, pid, from, to, note}
      swaps: [], // {id, pid, from, to, reason}
      overrides:
      {}, // "pid|iso" -> value
    };
  }

  /* Bring any loaded config up to shape. */
  function normalise(c)
  {
    const d = defaultConfig();
    c = Object.assign(
    {}, d, c ||
    {});
    c.shifts = Object.assign(
    {}, d.shifts, c.shifts);
    c.rules = Object.assign(
    {}, d.rules, c.rules);
    for (const k of ['frontDesk', 'siteB', 'onCall']) c.rules[k] = Object.assign(
    {}, d.rules[k], c.rules[k]);
    c.weeks = [2, 4, 6, 8].includes(+c.weeks) ? +c.weeks : 4;
    if (dowOf(c.start) !== 1) c.start = mondayOnOrAfter(c.start);
    const F = c.weeks / 2;
    c.people = (c.people || []).map(p =>
    {
      p = Object.assign(
      {
        id: uid(),
        role: 'Role',
        name: '',
        group: 'analyst',
        pattern: 'alt',
        plan: []
      }, p);
      if (!GROUPS.includes(p.group)) p.group = 'analyst';
      const plan = [];
      for (let f = 0; f < F; f++)
      {
        const prev = plan[f - 1];
        const q = Object.assign(
        {}, p.plan[f] ||
        {
          week: 1,
          day: 1,
          shift: prev ? (prev.shift === 'early' ? 'late' : 'early') : 'early'
        });
        q.week = q.week === 2 ? 2 : 1;
        q.day = Math.min(5, Math.max(1, +q.day || 1));
        q.shift = q.shift === 'late' ? 'late' : 'early';
        if (p.pattern === 'early') q.shift = 'early';
        if (p.pattern === 'late') q.shift = 'late';
        plan.push(q);
      }
      p.plan = plan;
      return p;
    });
    c.leave = c.leave || [];
    c.swaps = c.swaps || [];
    c.overrides = c.overrides ||
    {};
    c.rotOverrides = c.rotOverrides ||
    {};
    c.log = c.log || [];
    c.status = c.status || 'draft';
    c.id = c.id || uid();
    if (!Array.isArray(c.rules.rdoDays) || !c.rules.rdoDays.length) c.rules.rdoDays = [1, 5];
    return c;
  }

  /* Orders: roster grid = leaders, seniors, analysts. Setup sheet = seniors, analysts, leaders (on-call pool = first N). */
  const byGroup = (c, order) => order.flatMap(g => c.people.filter(p => p.group === g));
  const rosterOrder = c => byGroup(c, ['leader', 'senior', 'analyst']);
  const setupOrder = c => byGroup(c, ['senior', 'analyst', 'leader']);
  const variable = p => (p.name || '').trim() || 'Vacant';

  function seniorLabel(c)
  {
    const bases = [...new Set(c.people.filter(p => p.group === 'senior').map(p => p.role.replace(/\s*\d+$/, '').trim()))].filter(Boolean);
    return (bases.length ? bases.join('/') : 'Senior') + ' on duty';
  }

  /* ---------- compute: mirrors the workbook ---------- */
  function compute(c)
  {
    const N = c.weeks * 5,
      F = c.weeks / 2;
    const E = c.shifts.early,
      L = c.shifts.late;
    const days = [];
    for (let i = 0; i < N; i++)
    {
      const w = Math.floor(i / 5);
      days.push(
      {
        i,
        w,
        dow: i % 5 + 1,
        f: Math.floor(w / 2),
        iso: addDays(c.start, 7 * w + (i % 5))
      });
    }
    const ro = rosterOrder(c),
      so = setupOrder(c);
    const analysts = so.filter(p => p.group === 'analyst');
    const A = analysts.length;
    const rdoDate = p => p.plan.map((q, f) => addDays(c.start, 7 * (2 * f + q.week - 1) + (q.day - 1)));
    const rdoDates = new Map(c.people.map(p => [p.id, rdoDate(p)]));

    // RDO change checks (same wording as the workbook).
    const lastIso = addDays(c.start, 7 * c.weeks - 1);
    const swapStatus = s =>
    {
      const p = c.people.find(x => x.id === s.pid);
      if (!p) return '';
      if (!s.from || !s.to) return 'Enter both dates';
      const rd = rdoDates.get(p.id);
      if (!rd.includes(s.from)) return "From date is not this person's RDO";
      if (s.to < c.start || s.to > lastIso || dowOf(s.to) > 5) return 'To date is outside the roster or a weekend';
      if (rd.includes(s.to)) return 'To date is already their RDO';
      const fi = iso => Math.floor((toDate(iso) - toDate(c.start)) / 864e5 / 14);
      return fi(s.from) !== fi(s.to) ? 'OK - moves to a different fortnight' : 'OK';
    };
    const inPeriod = s => s.from && s.from >= c.start && s.from <= lastIso;
    const swaps = c.swaps.filter(inPeriod).map(s => (
    {
      ...s,
      status: swapStatus(s)
    }));
    const okSwaps = swaps.filter(s => s.status.startsWith('OK'));
    const onLeave = (pid, iso) => c.leave.some(l => l.pid === pid && l.from && iso >= l.from && iso <= (l.to || l.from));

    // Grid values.
    const grid = new Map(); // pid -> [values]
    const source = new Map(); // pid -> ['formula'|'leave'|'override']
    for (const p of c.people)
    {
      const rd = rdoDates.get(p.id);
      const vals = [],
        src = [];
      for (const d of days)
      {
        const ov = c.overrides[p.id + '|' + d.iso];
        if (ov != null && ov !== '')
        {
          vals.push(ov);
          src.push('override');
          continue;
        }
        if (onLeave(p.id, d.iso))
        {
          vals.push('Leave');
          src.push('leave');
          continue;
        }
        const isStd = d.iso === rd[d.f] && !okSwaps.some(s => s.pid === p.id && s.from === d.iso);
        const movedIn = okSwaps.some(s => s.pid === p.id && s.to === d.iso);
        vals.push(isStd || movedIn ? 'RDO' : (p.plan[d.f].shift === 'late' ? L : E));
        src.push('formula');
      }
      grid.set(p.id, vals);
      source.set(p.id, src);
    }
    const working = v => v === E || v === L;
    const nameLookup = (name, i) =>
    {
      const p = ro.find(x => variable(x) === name);
      return p ? grid.get(p.id)[i] : '?';
    };

    const mod = (x, m) => ((x % m) + m) % m;
    const R = c.rules;
    const pool = so.slice(0, Math.max(1, Math.min(R.onCall.poolSize, so.length)));
    const cols = days.map(d =>
    {
      const out = {
        early: 0,
        late: 0,
        senior: 0
      };
      for (const p of ro)
      {
        const v = grid.get(p.id)[d.i];
        if (variable(p) === 'Vacant') continue;
        if (v === E) out.early++;
        if (v === L) out.late++;
        if (p.group === 'senior' && working(v)) out.senior++;
      }
      out.total = out.early + out.late;
      const rov = (key, base) =>
      {
        const pid = (c.rotOverrides ||
        {})[key + '|' + d.iso];
        const p = pid && c.people.find(x => x.id === pid);
        if (p)
        {
          out.manual[key] = true;
          return variable(p);
        }
        return base;
      };
      out.manual = {};
      if (R.siteB.on && A)
      {
        out.seat1 = rov('seat1', variable(analysts[mod(R.siteB.seat1 - 1 + d.w, A)]));
        out.seat2 = rov('seat2', variable(analysts[mod(R.siteB.seat2 - 1 + d.w - (d.dow < 3 ? 1 : 0), A)]));
        out.siteB = [out.seat1, out.seat2].filter(n => n !== 'Vacant' && working(nameLookup(n, d.i))).length;
      }
      if (R.frontDesk.on && A)
      {
        const sched = mod(R.frontDesk.start - 1 + d.i, A) + 1,
          next = mod(R.frontDesk.start - 1 + d.i + 1, A) + 1;
        const dist = analysts.map((p, k0) =>
        {
          const k = k0 + 1,
            v = variable(p);
          const ok = v !== 'Vacant' && working(grid.get(p.id)[d.i]) && (!(R.siteB.on) || (v !== out.seat1 && v !== out.seat2)) && (mod(k - sched, A) === 0 || k !== next);
          return ok ? mod(k - sched, A) : 99;
        });
        const mn = Math.min(...dist);
        out.fdSched = sched;
        out.fdDist = dist;
        out.fdWorked = mod(sched - 1 + mn, A) + 1;
        out.frontDesk = rov('fd', mn >= 99 ? 'NO COVER' : variable(analysts[out.fdWorked - 1]));
      }
      if (R.onCall.on && so.length) out.onCall = rov('oc', variable(pool[mod(R.onCall.start - 1 + d.w, pool.length)]));
      out.cover = (out.early >= R.minEarly && out.late >= R.minLate && out.senior >= R.minSenior && (!(R.siteB.on && A) || out.siteB >= R.siteB.min)) ? 'OK' : 'SHORT';
      const rot = [];
      if (R.frontDesk.on && A) rot.push(out.frontDesk);
      if (R.siteB.on && A) rot.push(out.seat1, out.seat2);
      if (R.onCall.on && so.length) rot.push(out.onCall);
      if (rot.length)
      {
        if (rot.some(n => n === 'NO COVER' || n === 'Vacant')) out.rotation = 'VACANT/GAP';
        else out.rotation = rot.some(n => !working(nameLookup(n, d.i))) ? 'CONFLICT' : 'OK';
      }
      return out;
    });
    const perPerson = new Map(c.people.map(p =>
    {
      const v = grid.get(p.id);
      const rdo = [];
      for (let f = 0; f < F; f++) rdo.push(v.slice(f * 10, f * 10 + 10).filter(x => x === 'RDO').length);
      return [p.id,
      {
        rdo,
        worked: v.filter(working).length
      }];
    }));
    const summary = {
      short: cols.filter(x => x.cover === 'SHORT').length,
      conflict: cols.filter(x => x.rotation === 'CONFLICT').length,
      gap: cols.filter(x => x.rotation === 'VACANT/GAP').length,
      rdoIssues: c.people.filter(p => perPerson.get(p.id).rdo.some(n => n !== 1)).length,
      badSwaps: swaps.filter(s => !s.status.startsWith('OK')).length,
    };
    return {
      days,
      grid,
      source,
      cols,
      perPerson,
      swaps,
      rdoDates,
      ro,
      so,
      analysts,
      pool,
      summary
    };
  }

  /* ---------- auto-plan: shifts + standard RDOs ---------- */
  function autoPlan(c, opts = {})
  {
    const tries = opts.tries || 40;
    const F = c.weeks / 2;
    const allowed = c.rules.rdoDays.length ? c.rules.rdoDays : [1, 5];
    const score = r => r.summary.short * 1000 + r.summary.conflict * 300 + r.summary.gap * 40 + r.summary.rdoIssues * 200 +
      r.cols.reduce((a, x) => a + Math.pow(Math.max(0, 6 - Math.min(x.early - c.rules.minEarly, x.late - c.rules.minLate)), 2), 0);
    let best = null,
      bestScore = Infinity;
    const rand = arr => arr[Math.floor(Math.random() * arr.length)];
    const shuffle = a =>
    {
      a = a.slice();
      for (let i = a.length - 1; i > 0; i--)
      {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    for (let t = 0; t < tries; t++)
    {
      const cand = JSON.parse(JSON.stringify(c));
      // Shifts: split each group evenly between early and late, alternating each fortnight.
      if (!opts.keepShifts)
        for (const g of ['senior', 'analyst', 'leader'])
        {
          const ps = shuffle(cand.people.filter(p => p.group === g && p.pattern === 'alt'));
          const flip = Math.random() < 0.5;
          ps.forEach((p, k) =>
          {
            const s0 = (k % 2 === 0) !== flip ? 'early' : 'late';
            p.plan.forEach((q, f) =>
            {
              q.shift = f % 2 === 0 ? s0 : (s0 === 'early' ? 'late' : 'early');
            });
          });
          cand.people.filter(p => p.group === g && p.pattern !== 'alt').forEach(p => p.plan.forEach(q => q.shift = p.pattern));
        }
      // RDOs: greedy, one fortnight at a time, people in random order.
      for (const p of cand.people) p.plan.forEach(q =>
      {
        q.week = 1;
        q.day = 0;
      }); // 0 = unplaced
      for (let f = 0; f < F; f++)
      {
        const order = shuffle(cand.people);
        for (const p of order)
        {
          let bestSlot = null,
            bs = -Infinity;
          for (const week of [1, 2])
            for (const day of allowed)
            {
              p.plan[f].week = week;
              p.plan[f].day = day;
              const s = -score(compute(cand)) + Math.random() * 2;
              if (s > bs)
              {
                bs = s;
                bestSlot = {
                  week,
                  day
                };
              }
            }
          p.plan[f].week = bestSlot.week;
          p.plan[f].day = bestSlot.day;
        }
      }
      cand.people.forEach(p => p.plan.forEach(q =>
      {
        if (!q.day) q.day = allowed[0];
      }));
      const r = compute(cand);
      const s = score(r);
      if (s < bestScore)
      {
        bestScore = s;
        best = cand;
        if (r.summary.short + r.summary.conflict + r.summary.rdoIssues === 0 && t > tries / 4) break;
      }
    }
    // Drop swaps that no longer start on an RDO.
    return best;
  }

  /* ---------- xlsx writer (ExcelJS) ---------- */
  const colL = n =>
  {
    let s = '';
    while (n > 0)
    {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };
  const NAVY = 'FF1F3864',
    INPUT = 'FFFFF2CC',
    BAND = 'FFD9E1F2',
    GREY = 'FF7F7F7F',
    RED = 'FFFF9999';
  const fill = argb => (
  {
    type: 'pattern',
    pattern: 'solid',
    fgColor:
    {
      argb
    }
  });
  const dxf = argb => (
  {
    fill:
    {
      type: 'pattern',
      pattern: 'solid',
      bgColor:
      {
        argb
      }
    }
  });
  const thin = {
    style: 'thin',
    color:
    {
      argb: 'FFBFBFBF'
    }
  };
  const serial = iso => (toDate(iso) - Date.UTC(1899, 11, 30)) / 864e5;
  const safeName = (role, used) =>
  {
    let n = role.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'Role';
    if (/^\d/.test(n)) n = 'R_' + n;
    if (/^[A-Za-z]{1,3}\d+$/.test(n) || /^[RrCc]$/.test(n) || /^[Rr]\d*[Cc]\d*$/.test(n)) n = 'Role_' + n;
    let k = n,
      i = 2;
    while (used.has(k.toLowerCase())) k = n + '_' + i++;
    used.add(k.toLowerCase());
    return k;
  };

  function buildWorkbook(ExcelJS, c, r, extra)
  {
    c = normalise(c);
    r = r || compute(c);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Roster Builder';
    wb.calcProperties = {
      fullCalcOnLoad: true
    };
    const E = c.shifts.early,
      L = c.shifts.late,
      R = c.rules;
    const N = c.weeks * 5,
      F = c.weeks / 2;
    const ro = r.ro,
      so = r.so,
      analysts = r.analysts,
      A = analysts.length;
    const sb = R.siteB.on && A > 0,
      fd = R.frontDesk.on && A > 0,
      oc = R.onCall.on && so.length > 0;
    const font = (o = {}) => Object.assign(
    {
      name: 'Calibri',
      size: 10
    }, o);

    /* Sheets: Roster first (formulas reference sheets by name, so order is free). */
    const rs = wb.addWorksheet('Roster',
    {
      views: [
      {
        state: 'frozen',
        xSplit: 2,
        ySplit: 7
      }]
    });
    const su = wb.addWorksheet('Setup',
    {
      views: [
      {
        state: 'frozen',
        ySplit: 1
      }]
    });
    const ro_ = wb.addWorksheet('RDO');

    su.columns = [
    {
      width: 16
    },
    {
      width: 18
    },
    {
      width: 22
    },
    {
      width: 10
    },
    {
      width: 3
    },
    {
      width: 40
    },
    {
      width: 18
    },
    {
      width: 80
    }];
    ['Role', 'Name (type here)', 'Variable used on roster', 'Group', '', 'Rule', 'Setting', 'How it works'].forEach((h, i) =>
    {
      const cell = su.getCell(1, i + 1);
      cell.value = h || null;
      if (h)
      {
        cell.font = font(
        {
          bold: true,
          color:
          {
            argb: 'FFFFFFFF'
          }
        });
        cell.fill = fill(NAVY);
        cell.alignment = {
          vertical: 'middle'
        };
      }
    });
    const varAddr = new Map();
    const usedNames = new Set();
    so.forEach((p, k) =>
    {
      const row = 2 + k;
      su.getCell(row, 1).value = p.role;
      su.getCell(row, 1).font = font(
      {
        bold: true
      });
      const b = su.getCell(row, 2);
      b.value = p.name || null;
      b.fill = fill(INPUT);
      b.font = font();
      const cc = su.getCell(row, 3);
      cc.value = {
        formula: `IF(TRIM(B${row})="","Vacant",TRIM(B${row}))`,
        result: variable(p)
      };
      cc.font = font();
      su.getCell(row, 4).value = GROUP_LABEL[p.group];
      su.getCell(row, 4).font = font(
      {
        color:
        {
          argb: GREY
        }
      });
      [1, 2, 3, 4].forEach(ci => su.getCell(row, ci).border = {
        top: thin,
        left: thin,
        bottom: thin,
        right: thin
      });
      const nm = safeName(p.role, usedNames);
      cc.name = nm;
      varAddr.set(p.id,
      {
        row,
        ref: `Setup!$C$${row}`,
        name: nm
      });
    });
    const firstVar = 2,
      lastVar = 1 + so.length;
    const anaRows = analysts.map(p => varAddr.get(p.id).row);
    const anaRange = A ? `Setup!$C$${anaRows[0]}:$C$${anaRows[A - 1]}` : null;

    // Rules
    const rules = [];
    const rule = (key, label, value, note, input, numFmt) => rules.push(
    {
      key,
      label,
      value,
      note,
      input,
      numFmt
    });
    rule('vacant', 'Vacant rule', 'Vacant', "If the name next to a role is empty, that role's variable shows Vacant. Vacant people are left out of coverage counts and rotations flag them.");
    rule('start', 'Roster start date', toDate(c.start), `Must be a Monday. The roster runs ${c.weeks} weeks (${N} weekdays) from this date. To change the length, rebuild it in Roster Builder.`, true, 'ddd d mmm yyyy');
    rule('leads', 'Leads', 'Not in rotations', 'Lead roles sit in the roster grid and count toward shift cover and total on duty, not toward the senior count. They are never in a rotation.');
    rule('shifts', 'Shifts', `${E} / ${L}`, 'Early and late groups swap each fortnight (set per person on the RDO sheet).');
    rule('rdo', 'RDO', '1 per fortnight', 'Standard RDOs are set on the RDO sheet. RDO columns on the roster turn red if a person does not have exactly 1 per fortnight.');
    rule('move', 'Moving an RDO', 'RDO sheet', 'Record swaps in the RDO changes table on the RDO sheet. The roster applies them to that person only and rotations are unaffected.');
    rule('manual', 'Manual edits', 'Overtype', 'You can also overtype any roster cell (the dropdown has Leave). It changes that cell only; no rotation is rebuilt around it.');
    rule('pay', 'Payroll', 'Fortnightly', 'Week labels sit above the dates; each pay period covers two roster weeks.');
    rule('minEarly', `Minimum on ${E} per day`, R.minEarly, 'Cover check turns SHORT if fewer.', true);
    rule('minLate', `Minimum on ${L} per day`, R.minLate, 'Cover check turns SHORT if fewer.', true);
    rule('minSenior', `Minimum ${seniorLabel(c).replace(/ on duty$/, '')} on duty`, R.minSenior, 'Counts the senior group on either shift.', true);
    if (fd) rule('fdStart', `${R.frontDesk.label}: analyst # on day 1 (1-${A})`, R.frontDesk.start, `1 person, rotates daily through the analysts on a fixed day-by-day schedule. If that analyst is on RDO, leave${sb ? ', ' + R.siteB.label : ''} or Vacant, the next free analyst covers that day only.`, true);
    if (sb)
    {
      rule('sbMin', `${R.siteB.label} minimum on duty`, R.siteB.min, `Cover check turns SHORT if fewer than this are working at ${R.siteB.label}.`, true);
      rule('sbSeat1', `${R.siteB.label} seat 1: analyst # in week 1 (1-${A})`, R.siteB.seat1, 'Rotates weekly, Monday to Friday.', true);
      rule('sbSeat2', `${R.siteB.label} seat 2: analyst # from Wed of week 1 (1-${A})`, R.siteB.seat2, 'Rotates weekly, Wednesday to Tuesday (staggered from seat 1). Mon/Tue of week 1 use the analyst before this one.', true);
    }
    if (oc)
    {
      rule('ocPool', `${R.onCall.label} pool size`, r.pool.length, `Rotation uses the first N roles in column A (leads are listed last). ${so.filter(p => p.group === 'senior').length} = senior group only.`, true);
      rule('ocStart', `${R.onCall.label}: pool position in week 1`, R.onCall.start, 'Rotates weekly (Mon-Sun) through the pool.', true);
    }
    rule('rotcheck', 'Rotation check', 'Automatic', 'CONFLICT = rotation person on RDO/leave. VACANT/GAP = a rotation role is Vacant or nobody is free.');
    rule('rotover', 'Rotation overrides', 'Dropdown', 'Overtype or pick from the dropdown in any rotation cell to swap someone for a day.');
    const S = {};
    rules.forEach((ru, k) =>
    {
      const row = 2 + k;
      S[ru.key] = `Setup!$G$${row}`;
      const a = su.getCell(row, 6),
        b = su.getCell(row, 7),
        n = su.getCell(row, 8);
      a.value = ru.label;
      a.font = font(
      {
        bold: true
      });
      a.alignment = {
        vertical: 'middle',
        wrapText: true
      };
      b.value = ru.value;
      b.font = font();
      b.alignment = {
        horizontal: 'center',
        vertical: 'middle'
      };
      if (ru.numFmt) b.numFmt = ru.numFmt;
      if (ru.input) b.fill = fill(INPUT);
      n.value = ru.note;
      n.font = font();
      n.alignment = {
        vertical: 'middle',
        wrapText: true
      };
      [a, b, n].forEach(x => x.border = {
        top: thin,
        left: thin,
        bottom: thin,
        right: thin
      });
    });
    const noteRow = Math.max(lastVar, 1 + rules.length) + 2;
    ['Yellow cells are inputs. Type a name next to each role.', 'Clear a name and its variable becomes Vacant everywhere on the roster.', 'Variable names (e.g. Senior_1, Analyst_3, Team_Leader) point at column C.', 'Built with Roster Builder. Open this file in the app to change the team, length or rotations.', 'Rapid prototype output, not an endorsed tool. Do not enter council data. For management review as a concept only.']
    .forEach((t, k) =>
    {
      const x = su.getCell(noteRow + k, 1);
      x.value = t;
      x.font = font(
      {
        size: 9,
        color:
        {
          argb: GREY
        }
      });
    });
    su.getCell(S.start.replace('Setup!', '').replace(/\$/g, '')).dataValidation = {
      type: 'date',
      operator: 'greaterThan',
      allowBlank: false,
      formulae: [new Date(Date.UTC(2000, 0, 1))],
      showErrorMessage: true,
      errorTitle: 'Date',
      error: 'Enter a Monday date.'
    };

    /* RDO sheet */
    const rd = ro_;
    rd.getCell('A1').value = 'RDO Management';
    rd.getCell('A1').font = font(
    {
      bold: true,
      size: 14
    });
    rd.getCell('A2').value = 'Standard RDOs (top table) feed the roster grid. Record any swap in the changes table below; do not edit the grid for swaps.';
    rd.getCell('A2').font = font(
    {
      size: 9
    });
    const heads = ['Role', 'Name'];
    for (let f = 0; f < F; f++) heads.push(`Fortnight ${f + 1} week (${2 * f + 1}-${2 * f + 2})`, `Fortnight ${f + 1} day`, `Fortnight ${f + 1} RDO date`, `Fortnight ${f + 1} shift`);
    heads.forEach((h, i) =>
    {
      const x = rd.getCell(4, i + 1);
      x.value = h;
      x.font = font(
      {
        bold: true,
        color:
        {
          argb: 'FFFFFFFF'
        }
      });
      x.fill = fill(NAVY);
      x.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true
      };
    });
    rd.getRow(4).height = 31.5;
    rd.getColumn(1).width = 22;
    rd.getColumn(2).width = 18;
    for (let f = 0; f < F; f++)
    {
      rd.getColumn(3 + 4 * f).width = 12;
      rd.getColumn(4 + 4 * f).width = 11;
      rd.getColumn(5 + 4 * f).width = 15;
      rd.getColumn(6 + 4 * f).width = 11;
    }
    const rdoRow = new Map();
    const firstRdo = 5,
      lastRdo = 4 + ro.length;
    ro.forEach((p, k) =>
    {
      const row = 5 + k;
      rdoRow.set(p.id, row);
      const va = varAddr.get(p.id);
      const a = rd.getCell(row, 1);
      a.value = {
        formula: `Setup!A${va.row}`,
        result: p.role
      };
      a.font = font(
      {
        bold: true
      });
      const b = rd.getCell(row, 2);
      b.value = {
        formula: `Setup!C${va.row}`,
        result: variable(p)
      };
      b.font = font();
      const dates = r.rdoDates.get(p.id);
      for (let f = 0; f < F; f++)
      {
        const q = p.plan[f],
          c0 = 3 + 4 * f;
        const wk = rd.getCell(row, c0);
        wk.value = 2 * f + q.week;
        wk.fill = fill(INPUT);
        wk.dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`"${2 * f + 1},${2 * f + 2}"`]
        };
        const dy = rd.getCell(row, c0 + 1);
        dy.value = DAYS[q.day - 1];
        dy.fill = fill(INPUT);
        dy.dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`"${DAYS.join(',')}"`]
        };
        const dt = rd.getCell(row, c0 + 2);
        dt.value = {
          formula: `${S.start}+7*(${colL(c0)}${row}-1)+MATCH(${colL(c0 + 1)}${row},{"Mon","Tue","Wed","Thu","Fri"},0)-1`,
          result: toDate(dates[f])
        };
        dt.numFmt = 'ddd d mmm';
        const sh = rd.getCell(row, c0 + 3);
        sh.value = q.shift === 'late' ? L : E;
        sh.fill = fill(INPUT);
        sh.dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`"${E},${L}"`]
        };
        [wk, dy, dt, sh].forEach(x =>
        {
          x.font = font();
          x.alignment = {
            horizontal: 'center'
          };
        });
      }
      for (let ci = 1; ci <= 2 + 4 * F; ci++) rd.getCell(row, ci).border = {
        top: thin,
        left: thin,
        bottom: thin,
        right: thin
      };
    });
    const swapsIn = r.swaps;
    const chgTitle = lastRdo + 3,
      chgHead = chgTitle + 1,
      chg0 = chgHead + 1,
      chgRows = Math.max(20, swapsIn.length + 5),
      chg1 = chg0 + chgRows - 1;
    rd.getCell(chgTitle, 1).value = "RDO changes (move one person's RDO without touching the grid or the rotations)";
    rd.getCell(chgTitle, 1).font = font(
    {
      bold: true,
      size: 12
    });
    ['Name', 'Move RDO from (date)', 'Move RDO to (date)', 'Reason / approved by', 'Check'].forEach((h, i) =>
    {
      const x = rd.getCell(chgHead, i + 1);
      x.value = h;
      x.font = font(
      {
        bold: true,
        color:
        {
          argb: 'FFFFFFFF'
        }
      });
      x.fill = fill(NAVY);
      x.alignment = {
        horizontal: 'center'
      };
    });
    if (rd.getColumn(4).width < 26) rd.getColumn(4).width = 26;
    if (rd.getColumn(5).width < 40) rd.getColumn(5).width = 40;
    const CH = {
      name: `RDO!$A$${chg0}:$A$${chg1}`,
      from: `RDO!$B$${chg0}:$B$${chg1}`,
      to: `RDO!$C$${chg0}:$C$${chg1}`,
      check: `RDO!$E$${chg0}:$E$${chg1}`
    };
    const nameRange = `$B$${firstRdo}:$B$${lastRdo}`;
    const dateCols = [];
    for (let f = 0; f < F; f++) dateCols.push(colL(5 + 4 * f));
    for (let k = 0; k < chgRows; k++)
    {
      const row = chg0 + k,
        s = swapsIn[k],
        st = swapsIn[k];
      const p = s && c.people.find(x => x.id === s.pid);
      const a = rd.getCell(row, 1);
      a.value = p ? variable(p) : null;
      a.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [nameRange]
      };
      const b = rd.getCell(row, 2);
      b.value = s && s.from ? toDate(s.from) : null;
      b.numFmt = 'ddd d mmm yyyy';
      const cc = rd.getCell(row, 3);
      cc.value = s && s.to ? toDate(s.to) : null;
      cc.numFmt = 'ddd d mmm yyyy';
      [b, cc].forEach(x => x.dataValidation = {
        type: 'date',
        operator: 'greaterThan',
        allowBlank: true,
        formulae: [new Date(Date.UTC(2000, 0, 1))]
      });
      const d = rd.getCell(row, 4);
      d.value = s ? (s.reason || null) : null;
      const idx = col => `INDEX($${col}$${firstRdo}:$${col}$${lastRdo},MATCH($A${row},${nameRange},0))`;
      const notFrom = 'AND(' + dateCols.map(dc => `${idx(dc)}<>$B${row}`).join(',') + ')';
      const isTo = 'OR(' + dateCols.map(dc => `${idx(dc)}=$C${row}`).join(',') + ')';
      const f = `IF($A${row}="","",IF(OR($B${row}="",$C${row}=""),"Enter both dates",IFERROR(IF(${notFrom},"From date is not this person's RDO",IF(OR($C${row}<${S.start},$C${row}>${S.start}+${7 * c.weeks - 1},WEEKDAY($C${row},2)>5),"To date is outside the roster or a weekend",IF(${isTo},"To date is already their RDO",IF(INT(($B${row}-${S.start})/14)<>INT(($C${row}-${S.start})/14),"OK - moves to a different fortnight","OK")))),"Name not found")))`;
      const e = rd.getCell(row, 5);
      e.value = {
        formula: f,
        result: st ? st.status : ''
      };
      [a, b, cc, d].forEach(x =>
      {
        x.fill = fill(INPUT);
        x.font = font();
      });
      e.font = font();
      for (let ci = 1; ci <= 5; ci++) rd.getCell(row, ci).border = {
        top: thin,
        left: thin,
        bottom: thin,
        right: thin
      };
    }
    rd.addConditionalFormatting(
    {
      ref: `E${chg0}:E${chg1}`,
      rules: [
      {
        type: 'expression',
        priority: 1,
        formulae: [`AND(E${chg0}<>"",LEFT(E${chg0},2)<>"OK")`],
        style: dxf(RED)
      },
      {
        type: 'expression',
        priority: 2,
        formulae: [`LEFT(E${chg0},4)="OK -"`],
        style: dxf('FFFFE699')
      }]
    });
    const ex = ro.find(p => p.group === 'analyst') || ro[0];
    if (ex)
    {
      const x = rd.getCell(chg1 + 2, 1);
      x.value = `Example: ${variable(ex)} | ${DAYS[ex.plan[0].day - 1]} ${fmtDate(r.rdoDates.get(ex.id)[0])} | ${DAYS[ex.plan[0].day % 5]} ... | requested by employee   (a change only applies when its Check starts with OK)`;
      x.font = font(
      {
        size: 9,
        color:
        {
          argb: GREY
        }
      });
    }

    /* Roster sheet */
    const C0 = 3,
      lastDay = C0 + N - 1;
    const dc = i => colL(C0 + i);
    const r0 = 8,
      r1 = 7 + ro.length;
    const personRow = new Map(ro.map((p, k) => [p.id, r0 + k]));
    let row = r1 + 2;
    const RW = {};
    RW.covHead = row++;
    RW.early = row++;
    RW.late = row++;
    RW.total = row++;
    RW.senior = row++;
    if (sb) RW.siteB = row++;
    RW.cover = row++;
    const anyRot = fd || sb || oc;
    if (anyRot)
    {
      row++;
      RW.rotHead = row++;
      if (fd) RW.fd = row++;
      if (sb)
      {
        RW.seat1 = row++;
        RW.seat2 = row++;
      }
      if (oc) RW.oc = row++;
      RW.rotCheck = row++;
    }
    row++;
    RW.helpHead = row++;
    RW.week = row++;
    RW.dow = row++;
    if (fd)
    {
      RW.fdSched = row++;
      RW.fdWorked = row++;
      RW.dist0 = row;
      row += A;
    }
    const lastRow = row - 1;
    const statCol0 = lastDay + 1; // RDO count per fortnight, then Days worked
    const daysCol = statCol0 + F;

    rs.getColumn(1).width = 26;
    rs.getColumn(2).width = 13;
    for (let i = 0; i < N; i++) rs.getColumn(C0 + i).width = 9;
    for (let f = 0; f <= F; f++) rs.getColumn(statCol0 + f).width = 11;
    const set = (r_, c_, v, st) =>
    {
      const x = rs.getCell(r_, c_);
      x.value = v;
      if (st) Object.assign(x, st);
      return x;
    };
    set(1, 1, c.title,
    {
      font: font(
      {
        bold: true,
        size: 16
      })
    });
    rs.getRow(1).height = 20;
    const sub = `${c.weeks} weeks from ${fmtDate(c.start, true)}  |  Swap an RDO on the RDO sheet. Shift cells also have a dropdown: ${E}, ${L}, RDO, Leave`;
    set(2, 1,
    {
      formula: `"${c.weeks} weeks from "&TEXT(${S.start},"d mmm yyyy")&"  |  Swap an RDO on the RDO sheet. Shift cells also have a dropdown: ${E}, ${L}, RDO, Leave"`,
      result: sub
    },
    {
      font: font(
      {
        size: 9
      })
    });
    set(3, 1, `Blue = ${E}   Green = ${L}   Grey = RDO   Orange = Leave   Red = needs attention`,
    {
      font: font(
      {
        size: 9
      })
    });
    const hdr = {
      font: font(
      {
        bold: true,
        color:
        {
          argb: 'FFFFFFFF'
        }
      }),
      fill: fill(NAVY),
      alignment:
      {
        horizontal: 'center',
        vertical: 'middle'
      }
    };
    const wkBorder = i => (i % 5 === 0 ?
    {
      left:
      {
        style: 'medium',
        color:
        {
          argb: 'FF000000'
        }
      }
    } :
    {
      left: thin
    });
    set(4, 1, 'Pay period', hdr);
    set(5, 1, 'Payroll week', hdr);
    set(6, 1, 'Day', hdr);
    set(7, 1, 'Name', hdr);
    set(7, 2, 'Role', hdr);
    [4, 5, 6].forEach(rr => set(rr, 2, null, hdr));
    for (let i = 0; i < N; i++)
    {
      const d = r.days[i],
        col = C0 + i,
        L_ = dc(i);
      if (i % 10 === 0)
      {
        set(4, col,
        {
          formula: `"Pay period "&(INT((${L_}$${RW.week}-1)/2)+1)`,
          result: `Pay period ${d.f + 1}`
        }, hdr);
        rs.mergeCells(4, col, 4, col + 9);
      }
      if (i % 5 === 0)
      {
        set(5, col,
        {
          formula: `"Week "&(MOD(${L_}$${RW.week}-1,2)+1)`,
          result: `Week ${d.w % 2 + 1}`
        }, hdr);
        rs.mergeCells(5, col, 5, col + 4);
      }
      set(6, col,
      {
        formula: `${L_}7`,
        result: toDate(d.iso)
      },
      {
        ...hdr,
        numFmt: 'ddd',
        border: wkBorder(i)
      });
      set(7, col,
      {
        formula: `${S.start}+${7 * d.w + (i % 5)}`,
        result: toDate(d.iso)
      },
      {
        ...hdr,
        numFmt: 'd mmm',
        border: wkBorder(i)
      });
    }
    for (let f = 0; f < F; f++) set(7, statCol0 + f, `RDO wk ${2 * f + 1}-${2 * f + 2}`, hdr);
    set(7, daysCol, 'Days worked', hdr);
    for (let cc = statCol0; cc <= daysCol; cc++)[4, 5, 6].forEach(rr => set(rr, cc, null, hdr));

    const dvShift = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${E},${L},RDO,Leave"`]
    };
    ro.forEach(p =>
    {
      const rr = personRow.get(p.id),
        va = varAddr.get(p.id),
        rdr = rdoRow.get(p.id);
      set(rr, 1,
      {
        formula: va.name,
        result: variable(p)
      },
      {
        font: font(
        {
          bold: true
        })
      });
      set(rr, 2,
      {
        formula: `Setup!A${va.row}`,
        result: p.role
      },
      {
        font: font()
      });
      const vals = r.grid.get(p.id),
        src = r.source.get(p.id);
      for (let i = 0; i < N; i++)
      {
        const d = r.days[i],
          L_ = dc(i);
        const dCol = colL(5 + 4 * d.f),
          sCol = colL(6 + 4 * d.f);
        const cell = rs.getCell(rr, C0 + i);
        if (src[i] === 'formula') cell.value = {
          formula: `IF(OR(AND(${L_}$7=RDO!$${dCol}$${rdr},COUNTIFS(${CH.name},$A${rr},${CH.from},${L_}$7,${CH.check},"OK*")=0),COUNTIFS(${CH.name},$A${rr},${CH.to},${L_}$7,${CH.check},"OK*")>0),"RDO",RDO!$${sCol}$${rdr})`,
          result: vals[i]
        };
        else cell.value = vals[i];
        cell.font = font();
        cell.alignment = {
          horizontal: 'center'
        };
        cell.border = wkBorder(i);
        cell.dataValidation = dvShift;
      }
      const st = r.perPerson.get(p.id);
      for (let f = 0; f < F; f++) set(rr, statCol0 + f,
      {
        formula: `COUNTIF(${dc(10 * f)}${rr}:${dc(10 * f + 9)}${rr},"RDO")`,
        result: st.rdo[f]
      },
      {
        font: font(),
        alignment:
        {
          horizontal: 'center'
        }
      });
      set(rr, daysCol,
      {
        formula: `COUNTIF(${dc(0)}${rr}:${dc(N - 1)}${rr},"${E}")+COUNTIF(${dc(0)}${rr}:${dc(N - 1)}${rr},"${L}")`,
        result: st.worked
      },
      {
        font: font(),
        alignment:
        {
          horizontal: 'center'
        }
      });
    });
    const gridRef = `${dc(0)}${r0}:${dc(N - 1)}${r1}`;
    rs.addConditionalFormatting(
    {
      ref: gridRef,
      rules: [
      {
        type: 'cellIs',
        operator: 'equal',
        priority: 1,
        formulae: [`"${E}"`],
        style: dxf('FFBDD7EE')
      },
      {
        type: 'cellIs',
        operator: 'equal',
        priority: 2,
        formulae: [`"${L}"`],
        style: dxf('FFC6E0B4')
      },
      {
        type: 'cellIs',
        operator: 'equal',
        priority: 3,
        formulae: ['"RDO"'],
        style: dxf('FFD9D9D9')
      },
      {
        type: 'cellIs',
        operator: 'equal',
        priority: 4,
        formulae: ['"Leave"'],
        style: dxf('FFF8CBAD')
      }]
    });
    rs.addConditionalFormatting(
    {
      ref: `${colL(statCol0)}${r0}:${colL(statCol0 + F - 1)}${r1}`,
      rules: [
      {
        type: 'cellIs',
        operator: 'notEqual',
        priority: 5,
        formulae: ['1'],
        style: dxf(RED)
      }]
    });
    rs.addConditionalFormatting(
    {
      ref: `A${r0}:A${r1}`,
      rules: [
      {
        type: 'cellIs',
        operator: 'equal',
        priority: 6,
        formulae: ['"Vacant"'],
        style:
        {
          font:
          {
            color:
            {
              argb: 'FFC00000'
            },
            bold: false
          }
        }
      }]
    });

    // Coverage
    const band = {
      font: font(
      {
        bold: true
      }),
      fill: fill(BAND)
    };
    set(RW.covHead, 1, 'Coverage', band);
    for (let cc = 2; cc <= daysCol; cc++) set(RW.covHead, cc, null,
    {
      fill: fill(BAND)
    });
    set(RW.early, 1, `On ${E}`,
    {
      font: font()
    });
    set(RW.late, 1, `On ${L}`,
    {
      font: font()
    });
    set(RW.total, 1, 'Total on duty',
    {
      font: font()
    });
    set(RW.senior, 1, seniorLabel(c),
    {
      font: font()
    });
    if (sb) set(RW.siteB, 1, `${R.siteB.label} on duty`,
    {
      font: font()
    });
    set(RW.cover, 1, 'Cover check',
    {
      font: font(
      {
        bold: true
      })
    });
    const seniors = ro.filter(p => p.group === 'senior');
    const sr0 = seniors.length ? personRow.get(seniors[0].id) : null,
      sr1 = seniors.length ? personRow.get(seniors[seniors.length - 1].id) : null;
    const lookup = (L_, ref) => `IFERROR(INDEX(${L_}$${r0}:${L_}$${r1},MATCH(${ref},$A$${r0}:$A$${r1},0)),"?")`;
    const isWork = (L_, ref) => `OR(${lookup(L_, ref)}="${E}",${lookup(L_, ref)}="${L}")`;
    const notWork = (L_, ref) => `AND(${lookup(L_, ref)}<>"${E}",${lookup(L_, ref)}<>"${L}")`;
    for (let i = 0; i < N; i++)
    {
      const L_ = dc(i),
        col = C0 + i,
        x = r.cols[i],
        cst = {
          font: font(),
          alignment:
          {
            horizontal: 'center'
          },
          border: wkBorder(i)
        };
      set(RW.early, col,
      {
        formula: `SUMPRODUCT(($A$${r0}:$A$${r1}<>"Vacant")*(${L_}$${r0}:${L_}$${r1}="${E}"))`,
        result: x.early
      }, cst);
      set(RW.late, col,
      {
        formula: `SUMPRODUCT(($A$${r0}:$A$${r1}<>"Vacant")*(${L_}$${r0}:${L_}$${r1}="${L}"))`,
        result: x.late
      }, cst);
      set(RW.total, col,
      {
        formula: `${L_}${RW.early}+${L_}${RW.late}`,
        result: x.total
      }, cst);
      set(RW.senior, col, seniors.length ?
      {
        formula: `SUMPRODUCT(($A$${sr0}:$A$${sr1}<>"Vacant")*((${L_}$${sr0}:${L_}$${sr1}="${E}")+(${L_}$${sr0}:${L_}$${sr1}="${L}")))`,
        result: x.senior
      } : 0, cst);
      if (sb) set(RW.siteB, col,
      {
        formula: `IF(AND(${L_}${RW.seat1}<>"Vacant",${isWork(L_, L_ + RW.seat1)}),1,0)+IF(AND(${L_}${RW.seat2}<>"Vacant",${isWork(L_, L_ + RW.seat2)}),1,0)`,
        result: x.siteB
      }, cst);
      const conds = [`${L_}${RW.early}>=${S.minEarly}`, `${L_}${RW.late}>=${S.minLate}`, `${L_}${RW.senior}>=${S.minSenior}`];
      if (sb) conds.push(`${L_}${RW.siteB}>=${S.sbMin}`);
      set(RW.cover, col,
      {
        formula: `IF(AND(${conds.join(',')}),"OK","SHORT")`,
        result: x.cover
      },
      {
        ...cst,
        font: font(
        {
          bold: true
        })
      });
    }
    rs.addConditionalFormatting(
    {
      ref: `${dc(0)}${RW.cover}:${dc(N - 1)}${RW.cover}`,
      rules: [
      {
        type: 'cellIs',
        operator: 'equal',
        priority: 7,
        formulae: ['"SHORT"'],
        style: dxf(RED)
      }]
    });

    // Rotations
    if (anyRot)
    {
      set(RW.rotHead, 1, 'Rotations (leads are not in any rotation)', band);
      for (let cc = 2; cc <= daysCol; cc++) set(RW.rotHead, cc, null,
      {
        fill: fill(BAND)
      });
      if (fd) set(RW.fd, 1, `${R.frontDesk.label} (daily)`,
      {
        font: font()
      });
      if (sb)
      {
        set(RW.seat1, 1, `${R.siteB.label} seat 1 (Mon-Fri)`,
        {
          font: font()
        });
        set(RW.seat2, 1, `${R.siteB.label} seat 2 (Wed-Tue)`,
        {
          font: font()
        });
      }
      if (oc) set(RW.oc, 1, `${R.onCall.label} (weekly)`,
      {
        font: font()
      });
      set(RW.rotCheck, 1, 'Rotation check',
      {
        font: font(
        {
          bold: true
        })
      });
      const rotDv = {
        type: 'list',
        allowBlank: true,
        formulae: [`Setup!$C$${firstVar}:$C$${lastVar}`]
      };
      for (let i = 0; i < N; i++)
      {
        const L_ = dc(i),
          col = C0 + i,
          x = r.cols[i],
          cst = {
            font: font(),
            alignment:
            {
              horizontal: 'center',
              vertical: 'middle',
              wrapText: true
            },
            border: wkBorder(i),
            dataValidation: rotDv
          };
        const fx = (k, v) => x.manual && x.manual[k] ? v : null;
        if (fd && fx('fd', x.frontDesk)) set(RW.fd, col, x.frontDesk, cst);
        else if (fd) set(RW.fd, col,
        {
          formula: `IF(MIN(${L_}${RW.dist0}:${L_}${RW.dist0 + A - 1})>=99,"NO COVER",INDEX(${anaRange},${L_}${RW.fdWorked}))`,
          result: x.frontDesk
        }, cst);
        if (sb)
        {
          if (fx('seat1', 1)) set(RW.seat1, col, x.seat1, cst);
          else set(RW.seat1, col,
          {
            formula: `INDEX(${anaRange},MOD(${S.sbSeat1}-1+${L_}$${RW.week}-1,ROWS(${anaRange}))+1)`,
            result: x.seat1
          }, cst);
          if (fx('seat2', 1)) set(RW.seat2, col, x.seat2, cst);
          else set(RW.seat2, col,
          {
            formula: `INDEX(${anaRange},MOD(${S.sbSeat2}-1+${L_}$${RW.week}-1-IF(${L_}$${RW.dow}<3,1,0),ROWS(${anaRange}))+1)`,
            result: x.seat2
          }, cst);
        }
        if (oc && fx('oc', 1)) set(RW.oc, col, x.onCall, cst);
        else if (oc) set(RW.oc, col,
        {
          formula: `INDEX(Setup!$C$${firstVar}:$C$${lastVar},MOD(${S.ocStart}-1+${L_}$${RW.week}-1,${S.ocPool})+1)`,
          result: x.onCall
        }, cst);
        const refs = [];
        if (fd) refs.push(L_ + RW.fd);
        if (sb) refs.push(L_ + RW.seat1, L_ + RW.seat2);
        if (oc) refs.push(L_ + RW.oc);
        const gap = [...(fd ? [`${L_}${RW.fd}="NO COVER"`] : []), ...refs.map(q => `${q}="Vacant"`)];
        set(RW.rotCheck, col,
        {
          formula: `IF(OR(${gap.join(',')}),"VACANT/GAP",IF(OR(${refs.map(q => notWork(L_, q)).join(',')}),"CONFLICT","OK"))`,
          result: x.rotation
        },
        {
          font: font(
          {
            bold: true
          }),
          alignment:
          {
            horizontal: 'center'
          },
          border: wkBorder(i)
        });
      }
      const rotFill = (rr, argb, p) => rr && rs.addConditionalFormatting(
      {
        ref: `${dc(0)}${rr}:${dc(N - 1)}${rr}`,
        rules: [
        {
          type: 'expression',
          priority: p,
          formulae: ['1'],
          style: dxf(argb)
        }]
      });
      rotFill(RW.fd, 'FFFFE699', 8);
      rotFill(RW.seat1, 'FFF4B084', 9);
      rotFill(RW.seat2, 'FFF8CBAD', 10);
      rotFill(RW.oc, 'FFB4C6E7', 11);
      rs.addConditionalFormatting(
      {
        ref: `${dc(0)}${RW.rotCheck}:${dc(N - 1)}${RW.rotCheck}`,
        rules: [
        {
          type: 'cellIs',
          operator: 'notEqual',
          priority: 12,
          formulae: ['"OK"'],
          style: dxf(RED)
        }]
      });
      [RW.fd, RW.seat1, RW.seat2, RW.oc].filter(Boolean).forEach(rr => rs.getRow(rr).height = 27.75);
    }

    // Helpers
    const help = {
      font: font(
      {
        size: 9,
        color:
        {
          argb: GREY
        }
      })
    };
    set(RW.helpHead, 1, 'Helper rows (grouped - click + on the left to expand; do not edit)', help);
    set(RW.week, 1, 'Roster week #', help);
    set(RW.dow, 1, 'Day of week (1=Mon)', help);
    if (fd)
    {
      set(RW.fdSched, 1, `${R.frontDesk.label} scheduled analyst #`, help);
      set(RW.fdWorked, 1, `${R.frontDesk.label} analyst # worked`, help);
      analysts.forEach((p, k) => set(RW.dist0 + k, 1, `${p.role} distance`, help));
    }
    const hc = {
      ...help,
      alignment:
      {
        horizontal: 'center'
      }
    };
    for (let i = 0; i < N; i++)
    {
      const L_ = dc(i),
        col = C0 + i,
        d = r.days[i],
        x = r.cols[i];
      set(RW.week, col,
      {
        formula: `INT((${L_}$7-${S.start})/7)+1`,
        result: d.w + 1
      }, hc);
      set(RW.dow, col,
      {
        formula: `WEEKDAY(${L_}$7,2)`,
        result: d.dow
      }, hc);
      if (fd)
      {
        set(RW.fdSched, col,
        {
          formula: `MOD(${S.fdStart}-1+${i},${A})+1`,
          result: x.fdSched
        }, hc);
        set(RW.fdWorked, col,
        {
          formula: `MOD(${L_}${RW.fdSched}-1+MIN(${L_}${RW.dist0}:${L_}${RW.dist0 + A - 1}),${A})+1`,
          result: x.fdWorked
        }, hc);
        analysts.forEach((p, k0) =>
        {
          const k = k0 + 1,
            vref = varAddr.get(p.id).ref.replace('Setup!', 'Setup!'),
            pr = personRow.get(p.id);
          const seatCond = sb ? `,${vref}<>${L_}$${RW.seat1},${vref}<>${L_}$${RW.seat2}` : '';
          set(RW.dist0 + k0, col,
          {
            formula: `IF(AND(${vref}<>"Vacant",OR(${L_}${pr}="${E}",${L_}${pr}="${L}")${seatCond},OR(MOD(${k}-${L_}$${RW.fdSched},${A})=0,${k}<>(MOD(${S.fdStart}-1+${i + 1},${A})+1))),MOD(${k}-${L_}$${RW.fdSched},${A}),99)`,
            result: x.fdDist[k0]
          }, hc);
        });
      }
    }
    for (let rr = RW.week; rr <= lastRow; rr++)
    {
      rs.getRow(rr).outlineLevel = 1;
      rs.getRow(rr).hidden = true;
    }
    rs.properties.outlineLevelRow = 1;
    rs.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9
    };

    /* Hidden app data so the app can reopen this file */
    const ad = wb.addWorksheet('AppData',
    {
      state: 'veryHidden'
    });
    const json = JSON.stringify(
    {
      app: 'roster-builder',
      v: 2,
      config: c,
      extra: extra || null,
      layout:
      {
        personRow: [...personRow],
        rdoRow: [...rdoRow],
        setup: [...varAddr].map(([k, v]) => [k, v.row]),
        S,
        chg0,
        chgRows,
        C0,
        N
      }
    });
    ad.getCell('A1').value = 'roster-builder';
    for (let k = 0; k * 30000 < json.length; k++) ad.getCell(2 + k, 1).value = json.slice(k * 30000, (k + 1) * 30000);
    return wb;
  }

  /* ---------- reader: reopen a file made by this app, picking up edits made in Excel ---------- */
  async function readWorkbook(ExcelJS, buffer)
  {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ad = wb.getWorksheet('AppData');
    if (!ad || ad.getCell('A1').value !== 'roster-builder') return null;
    let json = '';
    for (let k = 2; ad.getCell(k, 1).value; k++) json += ad.getCell(k, 1).value;
    const data = JSON.parse(json);
    const c = normalise(data.config);
    const lay = data.layout;
    const su = wb.getWorksheet('Setup'),
      rd = wb.getWorksheet('RDO'),
      rs = wb.getWorksheet('Roster');
    const val = cell =>
    {
      const v = cell.value;
      if (v && typeof v === 'object' && 'formula' in v) return {
        f: true,
        v: v.result
      };
      if (v && typeof v === 'object' && v.richText) return {
        f: false,
        v: v.richText.map(t => t.text).join('')
      };
      return {
        f: false,
        v
      };
    };
    const isoOf = v => v instanceof Date ? toIso(new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()))) : (typeof v === 'number' ? toIso(new Date(Date.UTC(1899, 11, 30) + v * 864e5)) : null);
    const byId = new Map(c.people.map(p => [p.id, p]));
    // Names
    for (const [pid, row] of lay.setup)
    {
      const p = byId.get(pid);
      if (p)
      {
        const v = val(su.getCell(row, 2)).v;
        p.name = v == null ? '' : String(v).trim();
      }
    }
    // Settings
    const num = key =>
    {
      if (!lay.S[key]) return null;
      const a = lay.S[key].replace('Setup!', '').replace(/\$/g, '');
      const v = val(su.getCell(a)).v;
      return v;
    };
    const st = num('start');
    if (st)
    {
      const iso = isoOf(st);
      if (iso) c.start = mondayOnOrAfter(iso);
    }
    const n = (key, setter) =>
    {
      const v = num(key);
      if (v != null && !isNaN(+v)) setter(+v);
    };
    n('minEarly', v => c.rules.minEarly = v);
    n('minLate', v => c.rules.minLate = v);
    n('minSenior', v => c.rules.minSenior = v);
    n('fdStart', v => c.rules.frontDesk.start = v);
    n('sbMin', v => c.rules.siteB.min = v);
    n('sbSeat1', v => c.rules.siteB.seat1 = v);
    n('sbSeat2', v => c.rules.siteB.seat2 = v);
    n('ocPool', v => c.rules.onCall.poolSize = v);
    n('ocStart', v => c.rules.onCall.start = v);
    // RDO plan
    const F = c.weeks / 2;
    for (const [pid, row] of lay.rdoRow)
    {
      const p = byId.get(pid);
      if (!p) continue;
      for (let f = 0; f < F; f++)
      {
        const wk = +val(rd.getCell(row, 3 + 4 * f)).v,
          dy = DAYS.indexOf(String(val(rd.getCell(row, 4 + 4 * f)).v)),
          sh = String(val(rd.getCell(row, 6 + 4 * f)).v);
        if (wk === 2 * f + 1 || wk === 2 * f + 2) p.plan[f].week = wk - 2 * f;
        if (dy >= 0) p.plan[f].day = dy + 1;
        if (sh === c.shifts.early) p.plan[f].shift = 'early';
        else if (sh === c.shifts.late) p.plan[f].shift = 'late';
      }
    }
    // RDO changes
    const nameToId = new Map(c.people.map(p => [variable(p).toLowerCase(), p.id]));
    c.swaps = [];
    for (let k = 0; k < lay.chgRows; k++)
    {
      const row = lay.chg0 + k,
        nm = val(rd.getCell(row, 1)).v;
      if (!nm) continue;
      const pid = nameToId.get(String(nm).trim().toLowerCase());
      if (!pid) continue;
      c.swaps.push(
      {
        id: uid(),
        pid,
        from: isoOf(val(rd.getCell(row, 2)).v),
        to: isoOf(val(rd.getCell(row, 3)).v),
        reason: val(rd.getCell(row, 4)).v || ''
      });
    }
    // Grid: any typed value (not a formula) becomes an override, except Leave already in leave ranges.
    const r = compute(
    {
      ...c,
      overrides:
      {}
    });
    const newOv = {};
    for (const [pid, row] of lay.personRow)
    {
      if (!byId.has(pid)) continue;
      for (let i = 0; i < lay.N; i++)
      {
        const cell = val(rs.getCell(row, lay.C0 + i));
        if (cell.f) continue;
        const v = cell.v == null ? '' : String(cell.v).trim();
        const iso = r.days[i].iso;
        if (v === 'Leave' && c.leave.some(l => l.pid === pid && iso >= l.from && iso <= (l.to || l.from))) continue;
        newOv[pid + '|' + iso] = v;
      }
    }
    c.overrides = newOv;
    return {
      config: c,
      extra: data.extra || null
    };
  }

  const api = {
    DAYS,
    GROUPS,
    GROUP_LABEL,
    uid,
    defaultConfig,
    normalise,
    compute,
    autoPlan,
    buildWorkbook,
    readWorkbook,
    rosterOrder,
    setupOrder,
    variable,
    seniorLabel,
    addDays,
    dowOf,
    mondayOnOrAfter,
    fmtDate,
    toIso,
    toDate
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RosterEngine = api;
})(typeof self !== 'undefined' ? self : this);