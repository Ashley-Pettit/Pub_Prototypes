/* Roster Builder app (Vue 3). Pages: Roster, Requests, Team, Person, Review, Settings.
   State lives in localStorage on this device only. Synthetic data only: this is a prototype. */
(function()
{
  'use strict';
  const
  {
    createApp,
    reactive,
    computed,
    nextTick,
    watch
  } = Vue;
  const E = window.RosterEngine,
    P = window.RosterPlanner,
    X = window.RosterExports;
  const KEY = 'roster-builder:v2',
    OLD_KEY = 'roster-builder:v1',
    DRAFT_KEY = 'roster-builder:draft',
    PREF_KEY = 'roster-builder:prefs';
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const clone = o => JSON.parse(JSON.stringify(o));
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const MOD = isMac ? '⌘' : 'Ctrl+';

  /* ---------- small helpers ---------- */
  const todayIso = () =>
  {
    const d = new Date();
    return E.toIso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
  };
  const dayName = iso => WD[E.dowOf(iso) - 1];
  const nice = iso => iso ? `${dayName(iso)} ${E.fmtDate(iso)}` : '';
  const range = (a, b) => (!b || a === b) ? nice(a) : `${nice(a)} to ${nice(b)}`;
  const periodEnd = p => E.addDays(p.start, 7 * p.weeks - 3);
  const periodLabel = p => `${E.fmtDate(p.start)} to ${E.fmtDate(periodEnd(p), true)}`;
  const weekdaysBetween = (a, b) =>
  {
    let n = 0;
    for (let d = a; d <= (b || a); d = E.addDays(d, 1))
      if (E.dowOf(d) <= 5) n++;
    return n;
  };
  const initials = s => (s || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const ago = ts =>
  {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    const d = new Date(ts);
    return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`;
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  const TYPE_LABEL = {
    annual: 'Annual leave',
    personal: 'Personal leave',
    other: 'Other leave',
    swap: 'RDO swap'
  };
  const GROUP_NAME = {
    leader: 'Lead',
    senior: 'Senior',
    analyst: 'Analyst'
  };
  const GROUP_PLURAL = {
    leader: 'Leads',
    senior: 'Seniors',
    analyst: 'Analysts'
  };
  const PATTERN_NAME = c => (
  {
    alt: 'Swaps shift each pay period',
    early: `Always ${c.shifts.early}`,
    late: `Always ${c.shifts.late}`
  });

  function download(name, data, type)
  {
    const url = URL.createObjectURL(new Blob([data],
    {
      type
    }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const safeFile = s => (s || 'Roster').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Roster';

  /* ---------- sample data: made-up names, realistic situations ---------- */
  function sampleData()
  {
    const c = E.normalise(E.defaultConfig());
    c.title = 'IT Service Desk';
    const now = Date.now();
    const id = E.uid;
    const reqs = [];
    const eff0 = P.effective(c, []);
    const r0 = E.compute(eff0);
    const analysts = r0.analysts;
    // Approved: a sick day in week 1.
    reqs.push(
    {
      id: id(),
      pid: analysts[2].id,
      type: 'personal',
      from: E.addDays(c.start, 1),
      to: E.addDays(c.start, 1),
      note: 'Sick',
      status: 'approved',
      createdAt: now - 26 * 3600e3,
      decidedAt: now - 25 * 3600e3
    });
    // Pending: one safe and one that would cause a problem.
    let safe = null,
      risky = null;
    for (const p of analysts.concat(r0.ro.filter(x => x.group === 'senior')))
    {
      for (const off of [14, 15, 16, 7, 8])
      {
        const q = {
          pid: p.id,
          type: 'annual',
          from: E.addDays(c.start, off),
          to: E.addDays(c.start, off + 2)
        };
        const im = P.impact(P.effective(c, reqs), q);
        if (im.safe && !im.warn && !safe && p.group === 'analyst' && (!risky || risky.pid !== p.id)) safe = q;
        if (!im.safe && !risky && (!safe || safe.pid !== p.id)) risky = q;
      }
      if (safe && risky) break;
    }
    if (safe) reqs.push(
    {
      id: id(),
      ...safe,
      note: 'Family trip',
      status: 'pending',
      createdAt: now - 3 * 3600e3
    });
    if (risky) reqs.push(
    {
      id: id(),
      ...risky,
      note: 'School holidays',
      status: 'pending',
      createdAt: now - 50 * 60e3
    });
    const sw = analysts[5];
    const rd = r0.rdoDates.get(sw.id)[0];
    const days = P.swapDays(P.effective(c, reqs), sw.id, rd);
    if (days.length) reqs.push(
    {
      id: id(),
      pid: sw.id,
      type: 'swap',
      from: rd,
      to: days[0].iso,
      note: 'Medical appointment',
      status: 'pending',
      createdAt: now - 20 * 60e3
    });
    c.log = [
    {
      at: now,
      text: 'Created this roster from the sample team'
    }];
    return {
      v: 2,
      periods: [c],
      requests: reqs,
      currentId: c.id,
      sample: true
    };
  }

  /* Move data saved by the first prototype into the new shape. */
  function migrate(old)
  {
    const c = E.normalise(old);
    const reqs = (old.leave || []).map(l => (
      {
        id: E.uid(),
        pid: l.pid,
        type: 'annual',
        from: l.from,
        to: l.to || l.from,
        note: l.note || '',
        status: 'approved',
        createdAt: Date.now(),
        decidedAt: Date.now()
      }))
      .concat((old.swaps || []).map(s => (
      {
        id: E.uid(),
        pid: s.pid,
        type: 'swap',
        from: s.from,
        to: s.to,
        note: s.reason || '',
        status: 'approved',
        createdAt: Date.now(),
        decidedAt: Date.now()
      })));
    c.leave = [];
    c.swaps = [];
    return {
      v: 2,
      periods: [c],
      requests: reqs,
      currentId: c.id
    };
  }

  function load()
  {
    try
    {
      const raw = localStorage.getItem(KEY);
      if (raw)
      {
        const d = JSON.parse(raw);
        if (d && d.periods && d.periods.length)
        {
          d.periods = d.periods.map(E.normalise);
          d.requests = d.requests || [];
          return d;
        }
      }
      const old = localStorage.getItem(OLD_KEY);
      if (old) return migrate(JSON.parse(old));
    }
    catch (e)
    {
      /* fall through to sample */ }
    return sampleData();
  }

  const prefs = (() =>
  {
    try
    {
      return JSON.parse(localStorage.getItem(PREF_KEY)) ||
      {};
    }
    catch (e)
    {
      return {};
    }
  })();
  const savePrefs = () =>
  {
    try
    {
      localStorage.setItem(PREF_KEY, JSON.stringify(
      {
        rosterView: store.ui.rosterView,
        lastPid: store.ui.lastPid,
        introHidden: store.ui.introHidden
      }));
    }
    catch (e)
    {}
  };

  /* ---------- store ---------- */
  const store = reactive(
  {
    data: load(),
    undo: [],
    toasts: [],
    ui:
    {
      route: 'roster',
      param: null,
      menuOpen: false,
      rosterView: prefs.rosterView || (window.innerWidth < 768 ? 'week' : 'period'),
      week: 0,
      search: '',
      groups: [],
      onlyIssues: false,
      filtersOpen: false,
      issuesAll: false,
      reqTab: 'pending',
      reqPage: 0,
      teamSearch: '',
      teamGroups: [],
      teamFiltersOpen: false,
      teamSort:
      {
        key: 'order',
        dir: 1
      },
      teamPage: 0,
      personTab: 'shifts',
      reviewTab: 'checks',
      settings: 'period',
      feedMore: 0,
      pop: null,
      slide: null,
      confirm: null,
      lastPid: prefs.lastPid || null,
      busy: null,
      introHidden: !!prefs.introHidden,
    },
  });

  function persist()
  {
    try
    {
      localStorage.setItem(KEY, JSON.stringify(store.data));
    }
    catch (e)
    {
      toast('Changes could not be saved on this device. Free some browser storage, then try again.',
      {
        bad: true
      });
    }
  }

  const periods = computed(() => store.data.periods.slice().sort((a, b) => a.start.localeCompare(b.start)));
  const period = computed(() => store.data.periods.find(p => p.id === store.data.currentId) || periods.value[0]);
  const eff = computed(() => P.effective(period.value, store.data.requests));
  const R = computed(() => E.compute(eff.value));
  const issues = computed(() => P.issues(eff.value, R.value));
  const totals = computed(() => P.totals(eff.value, R.value));
  const pendingReqs = computed(() => store.data.requests.filter(q => q.status === 'pending'));
  const periodOf = iso => store.data.periods.find(p => iso >= p.start && iso <= E.addDays(p.start, 7 * p.weeks - 1));
  const personAny = pid =>
  {
    for (const p of [period.value, ...store.data.periods])
    {
      const x = p.people.find(q => q.id === pid);
      if (x) return x;
    }
    return null;
  };
  const nameOf = pid =>
  {
    const p = personAny(pid);
    return p ? E.variable(p) : 'Someone';
  };

  /* Every change goes through commit: undo snapshot, audit log line, save, toast with Undo. */
  function commit(text, fn, opts = {})
  {
    store.undo.push(JSON.stringify(store.data));
    if (store.undo.length > 60) store.undo.shift();
    const wasFinal = period.value && period.value.status === 'final';
    fn(store.data);
    store.data.periods = store.data.periods.map(E.normalise);
    const p = period.value;
    if (text && !opts.nolog)
    {
      p.log.unshift(
      {
        at: Date.now(),
        text,
        afterFinal: wasFinal && p.status === 'final'
      });
      if (p.log.length > 300) p.log.length = 300;
    }
    delete store.data.sample;
    persist();
    if (text && !opts.quiet) toast(text,
    {
      undo: true
    });
  }

  function undo()
  {
    const prev = store.undo.pop();
    if (!prev) return;
    store.data = JSON.parse(prev);
    persist();
    toast('Undone.');
  }

  let toastSeq = 0;

  function toast(text, opts = {})
  {
    const t = {
      id: ++toastSeq,
      text,
      undo: !!opts.undo,
      bad: !!opts.bad
    };
    store.toasts = [t];
    setTimeout(() =>
    {
      store.toasts = store.toasts.filter(x => x.id !== t.id);
    }, opts.undo ? 7000 : 4500);
  }

  /* ---------- routing ---------- */
  const ROUTES = ['roster', 'requests', 'team', 'person', 'review', 'settings'];

  function readRoute()
  {
    const h = location.hash.replace(/^#/, '');
    const [r, ...rest] = h.split('-');
    store.ui.route = ROUTES.includes(r) ? r : 'roster';
    store.ui.param = rest.join('-') || null;
    store.ui.menuOpen = false;
    store.ui.pop = null;
    nextTick(() =>
    {
      const h1 = document.querySelector('main h1');
      if (h1 && document.activeElement === document.body) h1.focus(
      {
        preventScroll: true
      });
    });
  }
  window.addEventListener('hashchange', () =>
  {
    readRoute();
    window.scrollTo(0, 0);
  });
  readRoute();

  /* ---------- actions ---------- */
  const actions = {
    setCell(pid, iso, value)
    {
      const p = personAny(pid);
      const label = value == null ? `Set ${E.variable(p)} back to the plan on ${nice(iso)}` : `Set ${E.variable(p)} to ${value} on ${nice(iso)}`;
      commit(label, d =>
      {
        const per = d.periods.find(x => x.id === d.currentId);
        delete per.overrides[pid + '|' + iso];
        if (value != null)
        {
          const planned = E.compute(P.effective(per, d.requests));
          const i = planned.days.findIndex(x => x.iso === iso);
          if (planned.grid.get(pid)[i] !== value) per.overrides[pid + '|' + iso] = value;
        }
      });
    },
    setRot(rot, iso, pid)
    {
      const L = P.ROT_LABEL(period.value)[rot];
      commit(pid ? `Put ${nameOf(pid)} on ${L} for ${nice(iso)}` : `Set ${L} back to the rotation on ${nice(iso)}`, d =>
      {
        const per = d.periods.find(x => x.id === d.currentId);
        if (pid) per.rotOverrides[rot + '|' + iso] = pid;
        else delete per.rotOverrides[rot + '|' + iso];
      });
    },
    applyFix(fx, silentText)
    {
      commit(silentText || fx.label, d => applyFixTo(d, fx));
    },
    fixAll()
    {
      const list = P.autoFix(eff.value);
      if (!list.length)
      {
        toast('No automatic fixes found. Try the suggestions on each problem.');
        return;
      }
      const before = issues.value.length;
      commit(`Fixed problems automatically (${plural(list.length, 'change')})`, d => list.forEach(fx => applyFixTo(d, fx)));
      const after = issues.value.length;
      toast(`Made ${plural(list.length, 'change')}. ${after ? plural(after, 'problem') + ' left.' : 'Everything checks out.'}`,
      {
        undo: true
      });
      void before;
    },
    decide(q, status)
    {
      const verb = status === 'approved' ? 'Approved' : status === 'declined' ? 'Declined' : 'Reopened';
      commit(`${verb} ${nameOf(q.pid)}'s ${TYPE_LABEL[q.type].toLowerCase()} (${range(q.from, q.type === 'swap' ? null : q.to)})`, d =>
      {
        const x = d.requests.find(y => y.id === q.id);
        x.status = status;
        x.decidedAt = status === 'pending' ? null : Date.now();
      });
    },
    approveAndFix(q)
    {
      const per = periodOf(q.from) || period.value;
      const others = store.data.requests.filter(x => x.id !== q.id);
      const after = P.effective(per, others.concat([
      {
        ...q,
        status: 'approved'
      }]));
      const list = P.autoFix(after);
      commit(`Approved ${nameOf(q.pid)}'s ${TYPE_LABEL[q.type].toLowerCase()} and kept cover (${plural(list.length, 'change')})`, d =>
      {
        const x = d.requests.find(y => y.id === q.id);
        x.status = 'approved';
        x.decidedAt = Date.now();
        const keep = d.currentId;
        d.currentId = per.id;
        list.forEach(fx => applyFixTo(d, fx));
        d.currentId = keep;
      });
    },
    deleteRequest(q)
    {
      ask(
      {
        title: `Delete ${nameOf(q.pid)}'s ${TYPE_LABEL[q.type].toLowerCase()} request?`,
        body: `${range(q.from, q.type === 'swap' ? q.to : q.to)}. ${q.status === 'approved' ? 'It comes off the roster straight away.' : 'This cannot be reopened later.'}`,
        confirm: 'Delete request',
        run: () => commit(`Deleted ${nameOf(q.pid)}'s ${TYPE_LABEL[q.type].toLowerCase()} request`, d =>
        {
          d.requests = d.requests.filter(y => y.id !== q.id);
        })
      });
    },
    planNext()
    {
      const last = periods.value[periods.value.length - 1];
      store.ui.busy = 'next';
      setTimeout(() =>
      {
        const n = P.rollForward(last, store.data.requests);
        commit(`Planned the next roster (${periodLabel(n)})`, d =>
        {
          d.periods.push(n);
          d.currentId = n.id;
        });
        store.ui.busy = null;
        store.ui.week = 0;
        location.hash = '#roster';
      }, 30);
    },
    replan()
    {
      ask(
      {
        title: `Replace the RDO plan for ${periodLabel(period.value)}?`,
        body: 'Shifts and standard RDOs are planned again from scratch. Approved requests and single-day changes stay.',
        confirm: 'Replace plan',
        danger: false,
        run: () =>
        {
          store.ui.busy = 'replan';
          setTimeout(() =>
          {
            const best = E.autoPlan(eff.value,
            {
              tries: 60
            });
            commit('Re-planned shifts and RDOs', d =>
            {
              const per = d.periods.find(x => x.id === d.currentId);
              per.people.forEach(p =>
              {
                const q = best.people.find(y => y.id === p.id);
                if (q) p.plan = q.plan;
              });
            });
            store.ui.busy = null;
          }, 30);
        }
      });
    },
    finalise()
    {
      commit(`Marked the roster as final`, d =>
      {
        const per = d.periods.find(x => x.id === d.currentId);
        per.status = 'final';
        per.finalisedAt = Date.now();
      });
    },
    reopen()
    {
      commit(`Reopened the roster as a draft`, d =>
      {
        const per = d.periods.find(x => x.id === d.currentId);
        per.status = 'draft';
      });
    },
    goPeriod(id)
    {
      store.data.currentId = id;
      store.ui.week = 0;
      persist();
    },
    today()
    {
      const t = todayIso();
      const p = periodOf(t) || periods.value[0];
      store.data.currentId = p.id;
      const i = Math.max(0, Math.floor((E.toDate(t) - E.toDate(p.start)) / 864e5 / 7));
      store.ui.week = Math.min(p.weeks - 1, i);
      persist();
    },
    removePerson(p)
    {
      ask(
      {
        title: `Remove ${E.variable(p)} (${p.role}) from this roster?`,
        body: 'They come off this roster and any you plan after it. Earlier rosters keep them. Their requests stay on record.',
        confirm: 'Remove person',
        run: () =>
        {
          commit(`Removed ${E.variable(p)} (${p.role})`, d =>
          {
            const per = d.periods.find(x => x.id === d.currentId);
            per.people = per.people.filter(x => x.id !== p.id);
            for (const k of Object.keys(per.overrides))
              if (k.startsWith(p.id + '|')) delete per.overrides[k];
            for (const k of Object.keys(per.rotOverrides))
              if (per.rotOverrides[k] === p.id) delete per.rotOverrides[k];
          });
          location.hash = '#team';
        }
      });
    },
    exportXlsx()
    {
      try
      {
        const extra = {
          requests: store.data.requests.filter(q => periodOf(q.from) && periodOf(q.from).id === period.value.id)
        };
        const wb = E.buildWorkbook(window.ExcelJS, eff.value, R.value, extra);
        store.ui.busy = 'xlsx';
        wb.xlsx.writeBuffer().then(buf =>
        {
          download(`${safeFile(period.value.title)} ${period.value.start}.xlsx`, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          store.ui.busy = null;
          toast('Excel workbook downloaded.');
        }).catch(() =>
        {
          store.ui.busy = null;
          toast('The workbook could not be built. Reload the page and try again.',
          {
            bad: true
          });
        });
      }
      catch (e)
      {
        store.ui.busy = null;
        toast("The Excel library didn't load. Check your connection, then reload the page.",
        {
          bad: true
        });
      }
    },
    exportPayroll()
    {
      download(`${safeFile(period.value.title)} payroll ${period.value.start}.csv`, X.payrollCsv(eff.value, R.value, store.data.requests), 'text/csv');
      toast('Payroll summary downloaded.');
    },
    exportIcs(pid)
    {
      download(`${safeFile(nameOf(pid))} roster ${period.value.start}.ics`, X.ics(eff.value, R.value, pid), 'text/calendar');
      toast(`Calendar file for ${nameOf(pid)} downloaded.`);
    },
    async copyTable()
    {
      const html = X.rosterHtml(eff.value, R.value),
        text = X.rosterText(eff.value, R.value);
      try
      {
        if (window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem(
        {
          'text/html': new Blob([html],
          {
            type: 'text/html'
          }),
          'text/plain': new Blob([text],
          {
            type: 'text/plain'
          })
        })]);
        else await navigator.clipboard.writeText(text);
        toast('Roster table copied. Paste it into an email or Teams message.');
      }
      catch (e)
      {
        toast('Copying was blocked by the browser. Download the Excel workbook instead.',
        {
          bad: true
        });
      }
    },
    backup()
    {
      download(`Roster Builder backup ${todayIso()}.json`, JSON.stringify(store.data, null, 1), 'application/json');
      toast('Backup downloaded.');
    },
    async openFile(file)
    {
      try
      {
        const buf = await file.arrayBuffer();
        if (/\.json$/i.test(file.name))
        {
          const d = JSON.parse(new TextDecoder().decode(buf));
          if (!d.periods) throw new Error('shape');
          ask(
          {
            title: `Replace everything with ${file.name}?`,
            body: 'All rosters and requests on this device are replaced by the backup.',
            confirm: 'Replace with backup',
            run: () => commit(`Restored backup ${file.name}`, x =>
            {
              x.periods = d.periods;
              x.requests = d.requests || [];
              x.currentId = d.currentId || d.periods[0].id;
            })
          });
          return;
        }
        const res = await E.readWorkbook(window.ExcelJS, buf);
        if (!res)
        {
          toast(`${file.name} wasn't made by Roster Builder. Open a workbook or backup saved from this app.`,
          {
            bad: true
          });
          return;
        }
        const c = res.config;
        const ex = res.extra ||
        {};
        commit(`Opened ${file.name}`, d =>
        {
          const same = d.periods.findIndex(p => p.start === c.start);
          c.leave = [];
          c.swaps = [];
          if (same >= 0)
          {
            c.id = d.periods[same].id;
            c.log = d.periods[same].log || [];
            d.periods[same] = c;
          }
          else
          {
            c.id = E.uid();
            d.periods.push(c);
          }
          d.currentId = c.id;
          for (const q of ex.requests || [])
          {
            const i = d.requests.findIndex(y => y.id === q.id);
            if (i >= 0) d.requests[i] = q;
            else d.requests.push(q);
          }
        });
        location.hash = '#roster';
      }
      catch (e)
      {
        toast(`${file.name} couldn't be read. Check it's a workbook or backup saved from this app.`,
        {
          bad: true
        });
      }
    },
    reset()
    {
      ask(
      {
        title: 'Delete all rosters and requests on this device?',
        body: 'Everything goes back to the sample team. Download a backup first if you want to keep this.',
        confirm: 'Delete everything',
        run: () =>
        {
          store.undo.push(JSON.stringify(store.data));
          store.data = sampleData();
          persist();
          toast('Reset to the sample team.',
          {
            undo: true
          });
          location.hash = '#roster';
        }
      });
    },
    deletePeriod()
    {
      const p = period.value;
      if (store.data.periods.length < 2) return;
      ask(
      {
        title: `Delete the roster for ${periodLabel(p)}?`,
        body: 'Its plan, single-day changes and change log are deleted. Requests stay.',
        confirm: 'Delete roster',
        run: () => commit(`Deleted the roster for ${periodLabel(p)}`, d =>
        {
          d.periods = d.periods.filter(x => x.id !== p.id);
          d.currentId = d.periods[d.periods.length - 1].id;
        },
        {
          nolog: true
        })
      });
    },
  };

  function applyFixTo(d, fx)
  {
    const per = d.periods.find(x => x.id === d.currentId);
    if (fx.type === 'override') per.overrides[fx.pid + '|' + fx.iso] = fx.value;
    if (fx.type === 'rot') per.rotOverrides[fx.rot + '|' + fx.iso] = fx.pid;
    if (fx.type === 'swap') d.requests.push(
    {
      id: E.uid(),
      pid: fx.pid,
      type: 'swap',
      from: fx.from,
      to: fx.to,
      note: 'Moved to keep cover',
      status: 'approved',
      createdAt: Date.now(),
      decidedAt: Date.now(),
      byFix: true
    });
  }

  /* ---------- confirm dialog ---------- */
  function ask(o)
  {
    store.ui.confirm = {
      ...o,
      opener: document.activeElement
    };
  }

  /* ---------- focus trap helpers ---------- */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function trap(e, el)
  {
    if (e.key !== 'Tab' || !el) return;
    const f = [...el.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0],
      last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first)
    {
      e.preventDefault();
      last.focus();
    }
    else if (!e.shiftKey && document.activeElement === last)
    {
      e.preventDefault();
      first.focus();
    }
  }

  /* ---------- tooltip directive (real tooltip, shown on hover and focus) ---------- */
  let tipEl = null;

  function showTip(el)
  {
    hideTip();
    const text = el.getAttribute('data-tip');
    if (!text) return;
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    tipEl.setAttribute('role', 'tooltip');
    const kbd = el.getAttribute('data-kbd');
    tipEl.textContent = text;
    if (kbd)
    {
      const k = document.createElement('kbd');
      k.textContent = kbd;
      tipEl.appendChild(k);
    }
    document.body.appendChild(tipEl);
    const r = el.getBoundingClientRect(),
      t = tipEl.getBoundingClientRect();
    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - t.width - 8));
    let top = r.top - t.height - 8;
    if (top < 8) top = r.bottom + 8;
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }

  function hideTip()
  {
    if (tipEl)
    {
      tipEl.remove();
      tipEl = null;
    }
  }
  const tipDirective = {
    mounted(el, b)
    {
      el.setAttribute('data-tip', b.value.text || b.value);
      if (b.value.kbd) el.setAttribute('data-kbd', b.value.kbd);
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', b.value.text || b.value);
      el.addEventListener('mouseenter', () => showTip(el));
      el.addEventListener('mouseleave', hideTip);
      el.addEventListener('focus', () =>
      {
        if (el.matches(':focus-visible')) showTip(el);
      });
      el.addEventListener('blur', hideTip);
      el.addEventListener('click', hideTip);
    },
    updated(el, b)
    {
      el.setAttribute('data-tip', b.value.text || b.value);
      el.setAttribute('aria-label', b.value.text || b.value);
    },
    unmounted()
    {
      hideTip();
    },
  };

  /* ---------- shared view helpers (mixed into every component) ---------- */
  const shared = {
    computed:
    {
      store: () => store,
      ui: () => store.ui,
      data: () => store.data,
      period: () => period.value,
      eff: () => eff.value,
      R: () => R.value,
      issues: () => issues.value,
      totals: () => totals.value,
      periods: () => periods.value,
      pendingReqs: () => pendingReqs.value,
      E: () => E,
      P: () => P,
      MOD: () => MOD,
    },
    methods:
    {
      nice,
      range,
      periodLabel,
      plural,
      ago,
      initials,
      nameOf,
      dayName,
      typeLabel: t => TYPE_LABEL[t],
      groupName: g => GROUP_NAME[g],
      groupPlural: g => GROUP_PLURAL[g],
      patternName(p)
      {
        return PATTERN_NAME(this.eff)[p];
      },
      v: p => E.variable(p),
      fmt: (iso, y) => E.fmtDate(iso, y),
      go(h)
      {
        location.hash = '#' + h;
      },
      act(name, ...args)
      {
        return actions[name](...args);
      },
      days(q)
      {
        return q.type === 'swap' ? 1 : weekdaysBetween(q.from, q.to);
      },
      cellClass(v)
      {
        const c = this.eff.shifts;
        return v === c.early ? 'c-early' : v === c.late ? 'c-late' : v === 'RDO' ? 'c-rdo' : v === 'Leave' ? 'c-leave' : 'c-other';
      },
      openRequest(prefill)
      {
        store.ui.slide = {
          kind: 'request',
          prefill: prefill ||
          {},
          opener: document.activeElement
        };
      },
      openPerson(p)
      {
        store.ui.slide = {
          kind: 'person',
          pid: p ? p.id : null,
          opener: document.activeElement
        };
      },
      openDay(i)
      {
        store.ui.slide = {
          kind: 'day',
          i,
          opener: document.activeElement
        };
      },
    },
  };

  /* Roster page: the calendar grid of people by day, with problems and fixes above it. */
  const RosterPage = {
    template: '#tpl-roster',
    mixins: [shared],
    data: () => (
    {
      fixCache:
      {}
    }),
    computed:
    {
      visibleDays()
      {
        const d = this.R.days;
        return this.ui.rosterView === 'week' ? d.filter(x => x.w === this.ui.week) : d;
      },
      issueDays()
      {
        const s = new Set();
        this.issues.forEach(x =>
        {
          if (x.i != null && x.severity === 2) s.add(x.i);
        });
        return s;
      },
      people()
      {
        const q = this.ui.search.trim().toLowerCase();
        const withIssue = new Set(this.issues.map(x => x.pid).filter(Boolean));
        return this.R.ro.filter(p => (!q || E.variable(p).toLowerCase().includes(q) || p.role.toLowerCase().includes(q)) &&
          (!this.ui.groups.length || this.ui.groups.includes(p.group)) && (!this.ui.onlyIssues || withIssue.has(p.id) || this.clashPeople.has(p.id)));
      },
      clashPeople()
      {
        const s = new Set();
        this.issues.forEach(x =>
        {
          if (x.kind === 'conflict' && x.pid) s.add(x.pid);
        });
        return s;
      },
      clashCells()
      {
        const s = new Set();
        this.issues.forEach(x =>
        {
          if (x.kind === 'conflict' && x.pid) s.add(x.pid + '|' + x.iso);
        });
        return s;
      },
      pendingCells()
      {
        const s = new Map();
        for (const q of this.pendingReqs)
        {
          if (q.type === 'swap')
          {
            s.set(q.pid + '|' + q.from, 'Pending RDO swap');
            s.set(q.pid + '|' + q.to, 'Pending RDO swap');
            continue;
          }
          for (let d = q.from; d <= (q.to || q.from); d = E.addDays(d, 1)) s.set(q.pid + '|' + d, `Pending ${TYPE_LABEL[q.type].toLowerCase()}`);
        }
        return s;
      },
      shownIssues()
      {
        return this.ui.issuesAll ? this.issues : this.issues.slice(0, 4);
      },
      rotRows()
      {
        const c = this.eff,
          R = this.R,
          L = P.ROT_LABEL(c),
          rows = [];
        if (c.rules.frontDesk.on && R.analysts.length) rows.push(
        {
          key: 'fd',
          col: 'frontDesk',
          cls: 'r-fd',
          label: `${L.fd}`,
          note: 'daily'
        });
        if (c.rules.siteB.on && R.analysts.length)
        {
          rows.push(
          {
            key: 'seat1',
            col: 'seat1',
            cls: 'r-seat1',
            label: L.seat1,
            note: 'Mon to Fri'
          });
          rows.push(
          {
            key: 'seat2',
            col: 'seat2',
            cls: 'r-seat2',
            label: L.seat2,
            note: 'Wed to Tue'
          });
        }
        if (c.rules.onCall.on && R.so.length) rows.push(
        {
          key: 'oc',
          col: 'onCall',
          cls: 'r-oc',
          label: L.oc,
          note: 'weekly'
        });
        return rows;
      },
      todayIso: () => todayIso(),
      prevPeriod()
      {
        const i = this.periods.findIndex(p => p.id === this.period.id);
        return this.periods[i - 1] || null;
      },
      nextPeriod()
      {
        const i = this.periods.findIndex(p => p.id === this.period.id);
        return this.periods[i + 1] || null;
      },
      filterCount()
      {
        return this.ui.groups.length + (this.ui.onlyIssues ? 1 : 0);
      },
    },
    watch:
    {
      'store.data':
      {
        handler()
        {
          this.fixCache = {};
        },
        deep: true
      }
    },
    methods:
    {
      fixesFor(iss)
      {
        if (!this.fixCache[iss.id]) this.fixCache[iss.id] = P.fixes(this.eff, this.R, iss).slice(0, 2);
        return this.fixCache[iss.id];
      },
      cellOf(p, d)
      {
        return this.R.grid.get(p.id)[d.i];
      },
      isChanged(p, d)
      {
        return this.R.source.get(p.id)[d.i] === 'override';
      },
      duties(p, d)
      {
        return P.dutiesOn(this.eff, this.R, p.id, d.i);
      },
      shortDuty(s)
      {
        return s.split(/\s+/).map(w => /^\d+$/.test(w) ? w : w[0]).join('').toUpperCase();
      },
      rotClash(row, d)
      {
        const nm = this.R.cols[d.i][row.col];
        if (nm === 'NO COVER' || nm === 'Vacant') return true;
        const p = this.R.ro.find(x => E.variable(x) === nm);
        const v = p ? this.R.grid.get(p.id)[d.i] : '?';
        return v !== this.eff.shifts.early && v !== this.eff.shifts.late;
      },
      weekStart(d)
      {
        return d.i % 5 === 0;
      },
      openCell(e, p, d)
      {
        store.ui.pop = {
          kind: 'cell',
          pid: p.id,
          i: d.i,
          iso: d.iso,
          anchor: e.currentTarget
        };
      },
      openRot(e, row, d)
      {
        store.ui.pop = {
          kind: 'rot',
          rot: row.key,
          col: row.col,
          i: d.i,
          iso: d.iso,
          anchor: e.currentTarget
        };
      },
      setView(v)
      {
        this.ui.rosterView = v;
        savePrefs();
      },
      hideIntro()
      {
        this.ui.introHidden = true;
        savePrefs();
      },
      toggleGroup(g)
      {
        const a = this.ui.groups;
        const i = a.indexOf(g);
        if (i >= 0) a.splice(i, 1);
        else a.push(g);
      },
      clearFilters()
      {
        this.ui.groups = [];
        this.ui.onlyIssues = false;
        this.ui.search = '';
      },
      gridKey(e)
      {
        const k = e.key;
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) return;
        const t = e.target.closest('[data-r][data-c]');
        if (!t) return;
        let r = +t.dataset.r,
          c = +t.dataset.c;
        if (k === 'ArrowLeft') c--;
        if (k === 'ArrowRight') c++;
        if (k === 'ArrowUp') r--;
        if (k === 'ArrowDown') r++;
        const n = this.$el.querySelector(`[data-r="${r}"][data-c="${c}"]`);
        if (n)
        {
          e.preventDefault();
          n.focus();
        }
      },
    },
  };

  /* Requests page: an approval queue that shows each request's effect on cover before you decide. */
  const RequestsPage = {
    template: '#tpl-requests',
    mixins: [shared],
    computed:
    {
      list()
      {
        const t = this.ui.reqTab;
        const all = this.data.requests.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return t === 'all' ? all : all.filter(q => q.status === t);
      },
      counts()
      {
        const c = {
          pending: 0,
          approved: 0,
          declined: 0,
          all: this.data.requests.length
        };
        this.data.requests.forEach(q => c[q.status]++);
        return c;
      },
      pageSize: () => 8,
      page()
      {
        return this.list.slice(this.ui.reqPage * this.pageSize, (this.ui.reqPage + 1) * this.pageSize);
      },
    },
    watch:
    {
      'ui.reqTab'()
      {
        this.ui.reqPage = 0;
      }
    },
    methods:
    {
      impactOf(q)
      {
        if (q.status !== 'pending') return null;
        const per = periodOf(q.from) || this.period;
        const others = this.data.requests.filter(x => x.id !== q.id);
        const im = P.impact(P.effective(per, others), q);
        return im;
      },
      inRoster(q)
      {
        return !!periodOf(q.from);
      },
      overlaps(q)
      {
        if (q.type === 'swap' || q.status !== 'pending') return [];
        const per = periodOf(q.from) || this.period;
        const me = per.people.find(p => p.id === q.pid);
        return this.data.requests.filter(x => x.id !== q.id && x.type !== 'swap' && x.status !== 'declined' && x.from <= (q.to || q.from) && (x.to || x.from) >= q.from)
          .filter(x =>
          {
            const o = per.people.find(p => p.id === x.pid);
            return o && me && o.group === me.group;
          });
      },
      canFix(q)
      {
        const im = this.impactOf(q);
        if (!im || im.safe || im.invalid) return false;
        const per = periodOf(q.from) || this.period;
        const others = this.data.requests.filter(x => x.id !== q.id);
        const after = P.effective(per, others.concat([
        {
          ...q,
          status: 'approved'
        }]));
        const fx = P.autoFix(after, 8);
        let cur = after;
        fx.forEach(f =>
        {
          cur = P.applyChange(cur, f);
        });
        const before = new Set(P.issues(P.effective(per, others), E.compute(P.effective(per, others))).map(x => x.id));
        return fx.length > 0 && !P.issues(cur, E.compute(cur)).some(x => x.severity === 2 && !before.has(x.id));
      },
    },
  };

  /* Team page: the people on this roster, with this period's totals. */
  const TeamPage = {
    template: '#tpl-team',
    mixins: [shared],
    computed:
    {
      rows()
      {
        const q = this.ui.teamSearch.trim().toLowerCase();
        const order = new Map(this.R.ro.map((p, i) => [p.id, i]));
        let rows = this.R.ro.filter(p => (!q || E.variable(p).toLowerCase().includes(q) || p.role.toLowerCase().includes(q)) && (!this.ui.teamGroups.length || this.ui.teamGroups.includes(p.group)))
          .map(p => (
          {
            p,
            t: this.totals.get(p.id),
            issues: this.issues.filter(x => x.pid === p.id).length
          }));
        const
        {
          key,
          dir
        } = this.ui.teamSort;
        const val = r => key === 'order' ? order.get(r.p.id) : key === 'name' ? E.variable(r.p).toLowerCase() : key === 'role' ? r.p.role.toLowerCase() : r.t[key];
        rows.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * dir);
        return rows;
      },
      pageSize: () => 25,
      page()
      {
        return this.rows.slice(this.ui.teamPage * this.pageSize, (this.ui.teamPage + 1) * this.pageSize);
      },
      L()
      {
        return P.ROT_LABEL(this.eff);
      },
    },
    methods:
    {
      sort(key)
      {
        const s = this.ui.teamSort;
        if (s.key === key) s.dir = -s.dir;
        else
        {
          s.key = key;
          s.dir = key === 'name' || key === 'role' || key === 'order' ? 1 : -1;
        }
      },
      sortIcon(key)
      {
        const s = this.ui.teamSort;
        return s.key !== key ? 'bi-chevron-expand' : s.dir > 0 ? 'bi-chevron-up' : 'bi-chevron-down';
      },
      ariaSort(key)
      {
        const s = this.ui.teamSort;
        return s.key !== key ? 'none' : s.dir > 0 ? 'ascending' : 'descending';
      },
      toggleGroup(g)
      {
        const a = this.ui.teamGroups;
        const i = a.indexOf(g);
        if (i >= 0) a.splice(i, 1);
        else a.push(g);
        this.ui.teamPage = 0;
      },
      exportTeam()
      {
        const rows = [
          ['Name', 'Role', 'Group', 'Shift pattern', 'Days worked', `On ${this.eff.shifts.early}`, `On ${this.eff.shifts.late}`, 'RDOs', 'Leave days', this.L.fd, 'Seat days', `${this.L.oc} weeks`]
        ];
        this.rows.forEach(r => rows.push([this.v(r.p), r.p.role, GROUP_NAME[r.p.group], this.patternName(r.p.pattern), r.t.worked, r.t.early, r.t.late, r.t.rdo, r.t.leave, r.t.fd, r.t.seat, r.t.ocWeeks]));
        download(`${safeFile(this.period.title)} team ${this.period.start}.csv`, X.csv(rows), 'text/csv');
        toast('Team list downloaded.');
      },
    },
  };

  /* Person page: one person's roster, requests and totals. */
  const PersonPage = {
    template: '#tpl-person',
    mixins: [shared],
    computed:
    {
      p()
      {
        return this.period.people.find(x => x.id === this.ui.param) || null;
      },
      t()
      {
        return this.p && this.totals.get(this.p.id);
      },
      rows()
      {
        if (!this.p) return [];
        const pid = this.p.id;
        return this.R.days.map(d =>
        {
          const v = this.R.grid.get(pid)[d.i],
            src = this.R.source.get(pid)[d.i];
          const notes = [];
          const lq = this.data.requests.find(q => q.status === 'approved' && q.type !== 'swap' && q.pid === pid && d.iso >= q.from && d.iso <= (q.to || q.from));
          if (lq) notes.push(TYPE_LABEL[lq.type]);
          const sq = this.data.requests.find(q => q.status === 'approved' && q.type === 'swap' && q.pid === pid && (q.from === d.iso || q.to === d.iso));
          if (sq) notes.push(sq.to === d.iso ? `RDO moved from ${nice(sq.from)}` : `RDO moved to ${nice(sq.to)}`);
          if (src === 'override') notes.push('Changed for this day');
          const pend = this.data.requests.find(q => q.status === 'pending' && q.pid === pid && (q.type === 'swap' ? (q.from === d.iso || q.to === d.iso) : (d.iso >= q.from && d.iso <= (q.to || q.from))));
          if (pend) notes.push(`Pending ${TYPE_LABEL[pend.type].toLowerCase()}`);
          return {
            d,
            v,
            duties: P.dutiesOn(this.eff, this.R, pid, d.i),
            notes
          };
        });
      },
      reqs()
      {
        return this.p ? this.data.requests.filter(q => q.pid === this.p.id).sort((a, b) => b.from.localeCompare(a.from)) : [];
      },
      avg()
      {
        const all = [...this.totals.values()];
        const g = this.p ? this.R.ro.filter(x => x.group === this.p.group).map(x => this.totals.get(x.id)) : all;
        const mean = k => g.length ? g.reduce((a, x) => a + x[k], 0) / g.length : 0;
        return {
          worked: mean('worked'),
          fd: mean('fd'),
          seat: mean('seat'),
          ocWeeks: mean('ocWeeks'),
          early: mean('early')
        };
      },
      L()
      {
        return P.ROT_LABEL(this.eff);
      },
    },
  };

  /* Review page: the roster as one record. Checks, payroll summary, fairness, change log and exports. */
  const ReviewPage = {
    template: '#tpl-review',
    mixins: [shared],
    computed:
    {
      checks()
      {
        const s = this.R.summary,
          n = this.R.days.length,
          is = this.issues;
        const vac = this.R.ro.filter(p => E.variable(p) === 'Vacant');
        const pend = this.pendingReqs.filter(q =>
        {
          const p = periodOf(q.from);
          return p && p.id === this.period.id;
        });
        const list = [
        {
          ok: !s.short,
          t: 'Daily cover',
          d: s.short ? `Short on ${plural(s.short, 'day')} of ${n}.` : `Every one of the ${n} days meets the minimums.`,
          go: 'roster'
        }, ];
        if (this.eff.rules.frontDesk.on || this.eff.rules.siteB.on || this.eff.rules.onCall.on) list.push(
        {
          ok: !(s.conflict + s.gap),
          t: 'Rotations',
          d: (s.conflict + s.gap) ? `${plural(s.conflict + s.gap, 'day')} with someone rostered who is off, or no one free.` : 'Everyone on a rotation is working that day.',
          go: 'roster'
        });
        list.push(
        {
          ok: !s.rdoIssues,
          t: 'RDOs',
          d: s.rdoIssues ? `${plural(s.rdoIssues, 'person', 'people')} without exactly 1 RDO each pay period.` : 'Everyone has 1 RDO each pay period.',
          go: 'roster'
        });
        list.push(
        {
          ok: !s.badSwaps,
          t: 'RDO swaps',
          d: s.badSwaps ? `${plural(s.badSwaps, 'swap')} can't apply.` : 'All approved swaps apply cleanly.',
          go: 'requests'
        });
        list.push(
        {
          ok: !pend.length,
          warn: true,
          t: 'Requests',
          d: pend.length ? `${plural(pend.length, 'request')} waiting for a decision.` : 'No requests waiting.',
          go: 'requests'
        });
        list.push(
        {
          ok: !vac.length,
          warn: true,
          t: 'Vacant roles',
          d: vac.length ? `${vac.map(p => p.role).join(', ')} ${vac.length === 1 ? 'has' : 'have'} no one assigned.` : 'Every role has someone assigned.',
          go: 'team'
        });
        void is;
        return list;
      },
      ready()
      {
        return this.checks.every(c => c.ok || c.warn);
      },
      payroll()
      {
        const F = this.eff.weeks / 2,
          out = [];
        for (let f = 0; f < F; f++)
        {
          const days = this.R.days.filter(d => d.f === f);
          out.push(
          {
            f,
            from: days[0].iso,
            to: days[days.length - 1].iso,
            rows: this.R.ro.map(p =>
            {
              const v = this.R.grid.get(p.id),
                src = this.R.source.get(p.id);
              const t = {
                worked: 0,
                rdo: 0,
                leave: 0,
                changed: 0
              };
              days.forEach(d =>
              {
                const x = v[d.i];
                if (x === this.eff.shifts.early || x === this.eff.shifts.late) t.worked++;
                else if (x === 'RDO') t.rdo++;
                else if (x === 'Leave') t.leave++;
                if (src[d.i] === 'override') t.changed++;
              });
              return {
                p,
                ...t
              };
            })
          });
        }
        return out;
      },
      fairness()
      {
        const by = {};
        for (const p of this.R.ro)
        {
          (by[p.group] = by[p.group] || []).push(
          {
            p,
            t: this.totals.get(p.id)
          });
        }
        const out = [];
        for (const g of ['senior', 'analyst', 'leader'])
        {
          const rows = by[g];
          if (!rows) continue;
          const mean = k => rows.reduce((a, r) => a + r.t[k], 0) / rows.length;
          const m = {
            early: mean('early'),
            fd: mean('fd'),
            seat: mean('seat'),
            ocWeeks: mean('ocWeeks')
          };
          out.push(
          {
            g,
            rows: rows.map(r => (
            {
              ...r,
              hi:
              {
                early: Math.abs(r.t.early - m.early) >= 3,
                fd: Math.abs(r.t.fd - m.fd) >= 2,
                seat: Math.abs(r.t.seat - m.seat) >= 3,
                oc: Math.abs(r.t.ocWeeks - m.ocWeeks) >= 2
              }
            })),
            m
          });
        }
        return out;
      },
      feed()
      {
        return this.period.log.slice(0, 20 + this.ui.feedMore * 20);
      },
      L()
      {
        return P.ROT_LABEL(this.eff);
      },
      lastChange()
      {
        return this.period.log[0] ? ago(this.period.log[0].at) : 'not yet';
      },
    },
  };

  /* Settings page: how this roster is set up. Grouped fields save together. */
  const SettingsPage = {
    template: '#tpl-settings',
    mixins: [shared],
    data()
    {
      return {
        f: null,
        touched:
        {},
        saved: null
      };
    },
    computed:
    {
      sections: () => [
        ['period', 'Roster period'],
        ['shifts', 'Shifts'],
        ['cover', 'Daily cover'],
        ['rotations', 'Rotations'],
        ['rdo', 'RDO days'],
        ['data', 'Data']
      ],
      errors()
      {
        const f = this.f,
          e = {};
        if (!f) return e;
        if (!f.title.trim()) e.title = 'Enter a roster name, for example IT Service Desk.';
        if (!f.start) e.start = 'Choose the first Monday of the roster.';
        const code = /^[^",]{1,12}$/;
        if (!code.test(f.early.trim())) e.early = 'Enter a short code without commas, like 7-4.';
        if (!code.test(f.late.trim())) e.late = 'Enter a short code without commas, like 8-5.';
        if (f.early.trim() && f.early.trim() === f.late.trim()) e.late = 'Use a different code from the early shift.';
        if (['RDO', 'Leave', 'Vacant'].includes(f.early.trim())) e.early = 'That word is used by the roster. Pick another code.';
        if (['RDO', 'Leave', 'Vacant'].includes(f.late.trim())) e.late = 'That word is used by the roster. Pick another code.';
        for (const k of ['minEarly', 'minLate', 'minSenior', 'sbMin'])
          if (!(Number.isInteger(+f[k]) && +f[k] >= 0 && +f[k] <= 50)) e[k] = 'Enter a whole number from 0 to 50.';
        if (+f.sbMin > 2) e.sbMin = 'There are 2 seats, so use 0, 1 or 2.';
        const A = this.R.analysts.length || 1;
        for (const k of ['fdStart', 'seat1', 'seat2'])
          if (!(Number.isInteger(+f[k]) && +f[k] >= 1 && +f[k] <= A)) e[k] = `Enter an analyst number from 1 to ${A}.`;
        const maxPool = this.R.so.filter(p => p.group !== 'leader').length || 1;
        if (!(Number.isInteger(+f.ocPool) && +f.ocPool >= 1 && +f.ocPool <= maxPool)) e.ocPool = `Enter a number from 1 to ${maxPool}.`;
        if (!(Number.isInteger(+f.ocStart) && +f.ocStart >= 1 && +f.ocStart <= Math.max(1, +f.ocPool || 1))) e.ocStart = `Enter a number from 1 to ${Math.max(1, +f.ocPool || 1)}.`;
        if (!f.rdoDays.length) e.rdoDays = 'Tick at least one day.';
        return e;
      },
      startMoved()
      {
        return this.f && this.f.start && E.dowOf(this.f.start) !== 1 ? E.mondayOnOrAfter(this.f.start) : null;
      },
      dirty()
      {
        return this.f && JSON.stringify(this.f) !== JSON.stringify(this.fromPeriod());
      },
    },
    watch:
    {
      'period.id':
      {
        handler()
        {
          this.reset();
        },
        immediate: true
      }
    },
    methods:
    {
      fromPeriod()
      {
        const c = this.period,
          r = c.rules;
        return {
          title: c.title,
          start: c.start,
          weeks: c.weeks,
          early: c.shifts.early,
          late: c.shifts.late,
          minEarly: r.minEarly,
          minLate: r.minLate,
          minSenior: r.minSenior,
          fdLabel: r.frontDesk.label,
          fdStart: r.frontDesk.start,
          sbLabel: r.siteB.label,
          sbMin: r.siteB.min,
          seat1: r.siteB.seat1,
          seat2: r.siteB.seat2,
          ocLabel: r.onCall.label,
          ocPool: r.onCall.poolSize,
          ocStart: r.onCall.start,
          rdoDays: r.rdoDays.slice()
        };
      },
      reset()
      {
        this.f = this.fromPeriod();
        this.touched = {};
      },
      blur(k)
      {
        this.touched[k] = true;
      },
      focusField(k)
      {
        if (this.errors[k]) this.touched[k] = false;
      },
      err(k)
      {
        return this.touched[k] && this.errors[k];
      },
      save(section, keys)
      {
        keys.forEach(k => this.touched[k] = true);
        const bad = keys.find(k => this.errors[k]);
        if (bad)
        {
          nextTick(() =>
          {
            const el = document.getElementById('set-' + bad);
            if (el) el.focus();
          });
          return;
        }
        const f = this.f;
        commit(`Updated ${this.sections.find(s => s[0] === section)[1].toLowerCase()} settings`, d =>
        {
          const per = d.periods.find(x => x.id === d.currentId),
            r = per.rules;
          if (section === 'period')
          {
            per.title = f.title.trim();
            per.start = E.mondayOnOrAfter(f.start);
            per.weeks = +f.weeks;
          }
          if (section === 'shifts')
          {
            per.shifts.early = f.early.trim();
            per.shifts.late = f.late.trim();
          }
          if (section === 'cover')
          {
            r.minEarly = +f.minEarly;
            r.minLate = +f.minLate;
            r.minSenior = +f.minSenior;
          }
          if (section === 'rotations')
          {
            r.frontDesk.label = f.fdLabel.trim() || 'Front desk';
            r.frontDesk.start = +f.fdStart;
            r.siteB.label = f.sbLabel.trim() || 'Site B';
            r.siteB.min = +f.sbMin;
            r.siteB.seat1 = +f.seat1;
            r.siteB.seat2 = +f.seat2;
            r.onCall.label = f.ocLabel.trim() || 'On call';
            r.onCall.poolSize = +f.ocPool;
            r.onCall.start = +f.ocStart;
          }
          if (section === 'rdo')
          {
            r.rdoDays = f.rdoDays.slice().sort();
          }
        });
        this.saved = section;
        this.reset();
        setTimeout(() =>
        {
          if (this.saved === section) this.saved = null;
        }, 3000);
      },
      toggleRot(key, on)
      {
        const L = {
          frontDesk: this.eff.rules.frontDesk.label,
          siteB: this.eff.rules.siteB.label,
          onCall: this.eff.rules.onCall.label
        } [key];
        commit(`${on ? 'Turned on' : 'Turned off'} ${L}`, d =>
        {
          d.periods.find(x => x.id === d.currentId).rules[key].on = on;
        });
      },
      pickFile(e)
      {
        const f = e.target.files[0];
        e.target.value = '';
        if (f) actions.openFile(f);
      },
      goSection(s)
      {
        this.ui.settings = s;
        nextTick(() =>
        {
          const h = document.getElementById('sec-' + s);
          if (h) h.focus();
        });
      },
    },
  };

  /* Root app: chrome, overlays (popover, slide-over, dialog), toasts and shortcuts. */
  const app = createApp(
  {
    mixins: [shared],
    components:
    {
      RosterPage,
      RequestsPage,
      TeamPage,
      PersonPage,
      ReviewPage,
      SettingsPage
    },
    data: () => (
    {
      form: null,
      touched:
      {},
      popPos: null
    }),
    computed:
    {
      page()
      {
        return {
          roster: 'roster-page',
          requests: 'requests-page',
          team: 'team-page',
          person: 'person-page',
          review: 'review-page',
          settings: 'settings-page'
        } [this.ui.route];
      },
      nav: () => [
        ['roster', 'Roster'],
        ['requests', 'Requests'],
        ['team', 'Team'],
        ['review', 'Review'],
        ['settings', 'Settings']
      ],
      navCurrent()
      {
        return this.ui.route === 'person' ? 'team' : this.ui.route;
      },
      pop()
      {
        return this.ui.pop;
      },
      popPerson()
      {
        return this.pop && this.pop.kind === 'cell' ? this.eff.people.find(p => p.id === this.pop.pid) : null;
      },
      popValue()
      {
        return this.popPerson ? this.R.grid.get(this.popPerson.id)[this.pop.i] : null;
      },
      popSource()
      {
        if (!this.popPerson) return '';
        const src = this.R.source.get(this.popPerson.id)[this.pop.i];
        if (src === 'override') return 'Changed for this day';
        if (src === 'leave')
        {
          const q = this.data.requests.find(x => x.status === 'approved' && x.type !== 'swap' && x.pid === this.popPerson.id && this.pop.iso >= x.from && this.pop.iso <= (x.to || x.from));
          return q ? `${TYPE_LABEL[q.type]}, approved` : 'Leave';
        }
        if (this.popValue === 'RDO') return 'Standard RDO';
        return 'From the plan';
      },
      popRotOptions()
      {
        if (!this.pop || this.pop.kind !== 'rot') return [];
        const pool = this.pop.rot === 'oc' ? this.R.pool : this.R.analysts;
        return pool.map(p => (
        {
          p,
          v: this.R.grid.get(p.id)[this.pop.i],
          working: [this.eff.shifts.early, this.eff.shifts.late].includes(this.R.grid.get(p.id)[this.pop.i])
        }));
      },
      popRotCurrent()
      {
        return this.pop && this.pop.kind === 'rot' ? this.R.cols[this.pop.i][this.pop.col] : null;
      },
      popRotManual()
      {
        return this.pop && this.pop.kind === 'rot' && !!(this.R.cols[this.pop.i].manual ||
        {})[this.pop.rot];
      },
      slide()
      {
        return this.ui.slide;
      },
      dlg()
      {
        return this.ui.confirm;
      },
      // request form
      reqPeople()
      {
        return this.R.ro.filter(p => E.variable(p) !== 'Vacant');
      },
      reqRdoDates()
      {
        const f = this.form;
        if (!f || !f.pid) return [];
        const per = periodOf(f.from) || this.period;
        const r = E.compute(P.effective(per, this.data.requests));
        return (r.rdoDates.get(f.pid) || []).map(iso => (
        {
          iso,
          taken: r.grid.get(f.pid)[r.days.findIndex(d => d.iso === iso)] !== 'RDO'
        }));
      },
      reqErrors()
      {
        const f = this.form,
          e = {};
        if (!f || this.slide.kind !== 'request') return e;
        if (!f.pid) e.pid = 'Choose who the request is for.';
        if (!f.from) e.from = f.type === 'swap' ? 'Choose the RDO to move.' : 'Choose the first day of leave.';
        if (f.type !== 'swap' && f.to && f.from && f.to < f.from) e.to = 'Choose a last day on or after the first day.';
        if (f.type !== 'swap' && f.from && weekdaysBetween(f.from, f.to || f.from) === 0) e.to = 'Those dates are a weekend. Choose at least one weekday.';
        if (f.type === 'swap' && !f.to) e.to = 'Choose the day the RDO moves to.';
        if (f.type === 'swap' && f.to && E.dowOf(f.to) > 5) e.to = 'Choose a weekday.';
        return e;
      },
      reqImpact()
      {
        const f = this.form;
        if (!f || this.slide.kind !== 'request' || Object.keys(this.reqErrors).length) return null;
        const per = periodOf(f.from);
        if (!per) return {
          outside: true
        };
        return P.impact(P.effective(per, this.data.requests),
        {
          pid: f.pid,
          type: f.type,
          from: f.from,
          to: f.type === 'swap' ? f.to : (f.to || f.from)
        });
      },
      reqSuggest()
      {
        const f = this.form;
        if (!f || f.type !== 'swap' || !f.pid || !f.from) return [];
        const per = periodOf(f.from);
        if (!per) return [];
        return P.swapDays(P.effective(per, this.data.requests), f.pid, f.from).slice(0, 6);
      },
      personErrors()
      {
        const f = this.form,
          e = {};
        if (!f || this.slide.kind !== 'person') return e;
        if (!f.role.trim()) e.role = 'Enter a role, for example Analyst 8.';
        else if (this.period.people.some(p => p.id !== f.id && p.role.trim().toLowerCase() === f.role.trim().toLowerCase())) e.role = `${f.role.trim()} is already on this roster. Use a different role name.`;
        return e;
      },
      dayInfo()
      {
        if (!this.slide || this.slide.kind !== 'day') return null;
        const i = this.slide.i,
          d = this.R.days[i],
          x = this.R.cols[i],
          c = this.eff;
        const by = v => this.R.ro.filter(p => this.R.grid.get(p.id)[i] === v);
        const off = this.R.ro.filter(p => ![c.shifts.early, c.shifts.late].includes(this.R.grid.get(p.id)[i]));
        return {
          d,
          x,
          early: by(c.shifts.early),
          late: by(c.shifts.late),
          off,
          issues: this.issues.filter(z => z.i === i)
        };
      },
    },
    watch:
    {
      'ui.slide'(s)
      {
        hideTip();
        if (!s) return;
        this.touched = {};
        if (s.kind === 'request')
        {
          let draft = null;
          try
          {
            draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
          }
          catch (e)
          {}
          const pid = s.prefill.pid || (draft && !s.prefill.pid && draft.pid) || this.ui.lastPid || (this.reqPeople[0] && this.reqPeople[0].id);
          const t = todayIso();
          let d0 = t > this.period.start ? E.addDays(t, 1) : this.period.start;
          while (E.dowOf(d0) > 5) d0 = E.addDays(d0, 1);
          const base = {
            pid,
            type: 'annual',
            from: d0,
            to: d0,
            note: '',
            approve: false
          };
          this.form = Object.assign(base, (!s.prefill.pid && draft) ? draft :
          {}, s.prefill);
          this.form.restored = !!(draft && !s.prefill.pid && (draft.from || draft.note));
        }
        if (s.kind === 'person')
        {
          const p = s.pid && this.period.people.find(x => x.id === s.pid);
          this.form = p ?
          {
            id: p.id,
            name: p.name,
            role: p.role,
            group: p.group,
            pattern: p.pattern
          } :
          {
            id: null,
            name: '',
            role: this.nextRole('analyst'),
            group: 'analyst',
            pattern: 'alt'
          };
        }
        nextTick(() =>
        {
          const el = this.$refs.slide;
          if (el)
          {
            const f = el.querySelector('[autofocus]') || el.querySelector(FOCUSABLE);
            if (f) f.focus();
          }
        });
      },
      form:
      {
        deep: true,
        handler(f)
        {
          if (f && this.slide && this.slide.kind === 'request')
          {
            try
            {
              const
              {
                restored,
                ...rest
              } = f;
              localStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
            }
            catch (e)
            {}
          }
        }
      },
      'ui.confirm'(c)
      {
        if (c) nextTick(() =>
        {
          const b = this.$refs.dlgCancel;
          if (b) b.focus();
        });
      },
      'ui.pop'(p)
      {
        hideTip();
        if (!p)
        {
          this.popPos = null;
          return;
        }
        nextTick(() =>
        {
          const el = this.$refs.pop;
          if (!el || !p.anchor) return;
          const r = p.anchor.getBoundingClientRect(),
            w = el.offsetWidth,
            h = el.offsetHeight;
          let left = r.left + window.scrollX;
          left = Math.min(left, window.scrollX + document.documentElement.clientWidth - w - 16);
          left = Math.max(window.scrollX + 16, left);
          let top = r.bottom + window.scrollY + 4;
          if (r.bottom + h + 8 > window.innerHeight && r.top - h - 4 > 0) top = r.top + window.scrollY - h - 4;
          this.popPos = {
            left: left + 'px',
            top: top + 'px'
          };
          const f = el.querySelector('[aria-checked="true"]') || el.querySelector('button');
          if (f) f.focus();
        });
      },
      'ui.route'()
      {
        this.ui.slide = null;
        this.ui.pop = null;
      },
    },
    methods:
    {
      undo,
      toast,
      closePop(restore = true)
      {
        const a = this.ui.pop && this.ui.pop.anchor;
        this.ui.pop = null;
        if (restore && a && document.body.contains(a)) a.focus();
      },
      choose(value)
      {
        const p = this.ui.pop;
        this.closePop();
        actions.setCell(p.pid, p.iso, value);
      },
      chooseRot(pid)
      {
        const p = this.ui.pop;
        this.closePop();
        actions.setRot(p.rot, p.iso, pid);
      },
      leaveFromCell()
      {
        const p = this.ui.pop;
        this.closePop(false);
        this.openRequest(
        {
          pid: p.pid,
          type: 'annual',
          from: p.iso,
          to: p.iso,
          approve: true
        });
      },
      closeSlide()
      {
        const o = this.ui.slide && this.ui.slide.opener;
        this.ui.slide = null;
        this.form = null;
        nextTick(() =>
        {
          if (o && document.body.contains(o)) o.focus();
        });
      },
      slideKey(e)
      {
        if (e.key === 'Escape')
        {
          e.stopPropagation();
          this.closeSlide();
        }
        else trap(e, this.$refs.slide);
      },
      dlgKey(e)
      {
        if (e.key === 'Escape')
        {
          e.stopPropagation();
          this.closeDlg();
        }
        else trap(e, this.$refs.dlg);
      },
      closeDlg()
      {
        const o = this.ui.confirm && this.ui.confirm.opener;
        this.ui.confirm = null;
        nextTick(() =>
        {
          if (o && document.body.contains(o)) o.focus();
        });
      },
      runDlg()
      {
        const c = this.ui.confirm;
        this.closeDlg();
        c.run();
      },
      blur(k)
      {
        this.touched[k] = true;
      },
      unfocusErr(k)
      {
        this.touched[k] = false;
      },
      ferr(k, errs)
      {
        return this.touched[k] && errs[k];
      },
      discardDraft()
      {
        try
        {
          localStorage.removeItem(DRAFT_KEY);
        }
        catch (e)
        {}
        const pid = this.form.pid;
        this.form = {
          pid,
          type: 'annual',
          from: this.period.start,
          to: this.period.start,
          note: '',
          approve: false,
          restored: false
        };
        this.touched = {};
      },
      submitRequest(approveNow)
      {
        ['pid', 'from', 'to'].forEach(k => this.touched[k] = true);
        const bad = ['pid', 'from', 'to'].find(k => this.reqErrors[k]);
        if (bad)
        {
          nextTick(() =>
          {
            const el = document.getElementById('rq-' + bad);
            if (el) el.focus();
          });
          return;
        }
        const f = this.form;
        const q = {
          id: E.uid(),
          pid: f.pid,
          type: f.type,
          from: f.from,
          to: f.type === 'swap' ? f.to : (f.to || f.from),
          note: (f.note || '').trim(),
          status: approveNow ? 'approved' : 'pending',
          createdAt: Date.now(),
          decidedAt: approveNow ? Date.now() : null
        };
        this.ui.lastPid = f.pid;
        savePrefs();
        try
        {
          localStorage.removeItem(DRAFT_KEY);
        }
        catch (e)
        {}
        commit(`${approveNow ? 'Added and approved' : 'Added'} ${nameOf(q.pid)}'s ${TYPE_LABEL[q.type].toLowerCase()} (${q.type === 'swap' ? `${nice(q.from)} to ${nice(q.to)}` : range(q.from, q.to)})`, d => d.requests.push(q));
        this.closeSlide();
      },
      nextRole(g)
      {
        const base = {
          analyst: 'Analyst',
          senior: 'Senior',
          leader: 'Team Leader'
        } [g];
        let n = this.period.people.filter(p => p.group === g).length + 1;
        let role = `${base} ${n}`;
        while (this.period.people.some(p => p.role.toLowerCase() === role.toLowerCase())) role = `${base} ${++n}`;
        return role;
      },
      groupChanged()
      {
        if (!this.form.id && /^(Analyst|Senior|Team Leader) \d+$/.test(this.form.role)) this.form.role = this.nextRole(this.form.group);
        if (this.form.group === 'leader' && !this.form.id) this.form.pattern = 'early';
      },
      submitPerson()
      {
        this.touched.role = true;
        if (this.personErrors.role)
        {
          nextTick(() => document.getElementById('ps-role').focus());
          return;
        }
        const f = this.form;
        if (f.id)
        {
          commit(`Updated ${f.name.trim() || f.role.trim()}'s details`, d =>
          {
            const p = d.periods.find(x => x.id === d.currentId).people.find(x => x.id === f.id);
            p.name = f.name.trim();
            p.role = f.role.trim();
            p.group = f.group;
            if (p.pattern !== f.pattern)
            {
              p.pattern = f.pattern;
              if (f.pattern !== 'alt') p.plan.forEach(q => q.shift = f.pattern);
            }
          });
        }
        else
        {
          const id = E.uid();
          const per = this.period;
          // Place the new person's RDOs where they hurt cover least.
          const draft = E.normalise(
          {
            ...clone(per),
            people: [...clone(per.people),
            {
              id,
              role: f.role.trim(),
              name: f.name.trim(),
              group: f.group,
              pattern: f.pattern,
              plan: []
            }]
          });
          const eff2 = P.effective(draft, this.data.requests);
          let best = null,
            bs = Infinity;
          const np = eff2.people.find(p => p.id === id);
          const F = per.weeks / 2;
          for (let f2 = 0; f2 < F; f2++)
          {
            best = null;
            bs = Infinity;
            for (const wk of [1, 2])
              for (const day of eff2.rules.rdoDays)
                for (const sh of (f.pattern === 'alt' ? ['early', 'late'] : [f.pattern]))
                {
                  np.plan[f2] = {
                    week: wk,
                    day,
                    shift: sh
                  };
                  const s = P.issues(eff2, E.compute(eff2)).reduce((a, x) => a + (x.severity === 2 ? 100 : 10), 0) + Math.random();
                  if (s < bs)
                  {
                    bs = s;
                    best = {
                      week: wk,
                      day,
                      shift: sh
                    };
                  }
                }
            np.plan[f2] = best;
          }
          commit(`Added ${f.name.trim() || f.role.trim()} as ${f.role.trim()}`, d =>
          {
            d.periods.find(x => x.id === d.currentId).people.push(
            {
              id,
              role: f.role.trim(),
              name: f.name.trim(),
              group: f.group,
              pattern: f.pattern,
              plan: np.plan
            });
          });
        }
        this.closeSlide();
      },
      fixFromDay(fx)
      {
        actions.applyFix(fx);
      },
      dayFixes(iss)
      {
        return P.fixes(this.eff, this.R, iss).slice(0, 2);
      },
      globalKey(e)
      {
        const tag = (e.target.tagName || '').toLowerCase();
        const typing = ['input', 'textarea', 'select'].includes(tag);
        if (e.key === 'Escape')
        {
          if (this.ui.pop)
          {
            this.closePop();
            return;
          }
          if (this.ui.menuOpen)
          {
            this.ui.menuOpen = false;
            return;
          }
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !typing && !this.ui.slide && !this.ui.confirm)
        {
          e.preventDefault();
          undo();
        }
        if (e.key === '/' && !typing && !this.ui.slide && !this.ui.confirm)
        {
          const s = document.querySelector('[data-search]');
          if (s)
          {
            e.preventDefault();
            s.focus();
          }
        }
      },
      outside(e)
      {
        if (this.ui.pop && this.$refs.pop && !this.$refs.pop.contains(e.target) && !(this.ui.pop.anchor && this.ui.pop.anchor.contains(e.target))) this.closePop(false);
        if (this.ui.menuOpen && !e.target.closest('.menu-toggle') && !e.target.closest('.navmenu')) this.ui.menuOpen = false;
        if (this.ui.filtersOpen && !e.target.closest('.filters')) this.ui.filtersOpen = false;
        if (this.ui.teamFiltersOpen && !e.target.closest('.filters')) this.ui.teamFiltersOpen = false;
      },
    },
    mounted()
    {
      document.addEventListener('keydown', this.globalKey);
      document.addEventListener('mousedown', this.outside);
      window.addEventListener('resize', () =>
      {
        if (this.ui.pop) this.closePop(false);
        hideTip();
      });
      document.documentElement.setAttribute('data-bs-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', m => document.documentElement.setAttribute('data-bs-theme', m.matches ? 'dark' : 'light'));
    },
  });
  app.directive('tip', tipDirective);
  app.mount('#app');
  window.__roster = {
    store,
    actions,
    R,
    issues
  };
})();