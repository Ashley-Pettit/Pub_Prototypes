/* Roster Builder app (Vue 3): builds and checks a team roster, then hands it over as an Excel file.
   The Excel file is the source of truth. The app keeps a working copy in this browser only. */
(function()
{
  'use strict';
  const
  {
    createApp,
    reactive,
    computed,
    nextTick
  } = Vue;
  const E = window.RosterEngine,
    P = window.RosterPlanner;
  const KEY = 'roster-builder:v3',
    PREF_KEY = 'roster-builder:prefs';
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const MOD = isMac ? '⌘' : 'Ctrl+';

  /* ---------- helpers ---------- */
  const dayName = iso => WD[E.dowOf(iso) - 1];
  const nice = iso => iso ? `${dayName(iso)} ${E.fmtDate(iso)}` : '';
  const periodEnd = c => E.addDays(c.start, 7 * c.weeks - 3);
  const periodLabel = c => `${E.fmtDate(c.start)} to ${E.fmtDate(periodEnd(c), true)}`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  const timeOf = ts => new Date(ts).toLocaleString('en-AU',
  {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  });
  const hashOf = c =>
  {
    const s = JSON.stringify(c);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  };
  const safeFile = s => (s || 'Roster').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Roster';
  const fileName = c => `${safeFile(c.title)} ${c.start}.xlsx`;
  const GROUP_NAME = {
    leader: 'Lead',
    senior: 'Senior',
    analyst: 'Analyst'
  };

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

  function sample()
  {
    const c = E.normalise(E.defaultConfig());
    c.title = 'IT Service Desk';
    return c;
  }

  function load()
  {
    try
    {
      const raw = localStorage.getItem(KEY);
      if (raw)
      {
        const d = JSON.parse(raw);
        if (d && d.cfg) return {
          cfg: E.normalise(d.cfg),
          excel: d.excel || null
        };
      }
    }
    catch (e)
    {
      /* start fresh */ }
    return {
      cfg: sample(),
      excel: null
    };
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

  /* ---------- store ---------- */
  const start = load();
  const store = reactive(
  {
    cfg: start.cfg,
    excel: start.excel,
    undo: [],
    toasts: [],
    ui:
    {
      route: 'roster',
      rosterView: prefs.rosterView || (window.innerWidth < 768 ? 'week' : 'period'),
      week: 0,
      pop: null,
      confirm: null,
      busy: null,
      menuOpen: false
    },
  });
  const R = computed(() => E.compute(store.cfg));
  const issues = computed(() => P.issues(store.cfg, R.value));
  const inSync = computed(() => !!store.excel && store.excel.hash === hashOf(store.cfg));

  function persist()
  {
    try
    {
      localStorage.setItem(KEY, JSON.stringify(
      {
        cfg: store.cfg,
        excel: store.excel
      }));
    }
    catch (e)
    {
      toast('Changes could not be kept in this browser. Download the Excel file to keep them.',
      {
        bad: true
      });
    }
  }
  const savePrefs = () =>
  {
    try
    {
      localStorage.setItem(PREF_KEY, JSON.stringify(
      {
        rosterView: store.ui.rosterView
      }));
    }
    catch (e)
    {}
  };

  /* Every change: undo snapshot, tidy the model, keep a working copy, confirm with Undo. */
  function commit(text, fn)
  {
    store.undo.push(JSON.stringify(store.cfg));
    if (store.undo.length > 50) store.undo.shift();
    fn(store.cfg);
    store.cfg = E.normalise(store.cfg);
    persist();
    if (text) toast(text,
    {
      undo: true
    });
  }

  function undo()
  {
    const prev = store.undo.pop();
    if (!prev) return;
    store.cfg = E.normalise(JSON.parse(prev));
    persist();
    toast('Undone.');
  }

  let seq = 0;

  function toast(text, opts = {})
  {
    const t = {
      id: ++seq,
      text,
      undo: !!opts.undo,
      bad: !!opts.bad
    };
    store.toasts = [t];
    setTimeout(() =>
    {
      store.toasts = store.toasts.filter(x => x.id !== t.id);
    }, opts.undo ? 6000 : 4500);
  }

  function ask(o)
  {
    store.ui.confirm = {
      ...o,
      opener: document.activeElement
    };
  }

  /* ---------- routing ---------- */
  const ROUTES = ['roster', 'team', 'leave', 'settings'];

  function readRoute()
  {
    const r = location.hash.replace(/^#/, '');
    store.ui.route = ROUTES.includes(r) ? r : 'roster';
    store.ui.menuOpen = false;
    store.ui.pop = null;
  }
  window.addEventListener('hashchange', () =>
  {
    readRoute();
    window.scrollTo(0, 0);
    nextTick(() =>
    {
      const h = document.querySelector('main h1');
      if (h) h.focus(
      {
        preventScroll: true
      });
    });
  });
  readRoute();

  /* ---------- Excel in and out ---------- */
  const excel = {
    save()
    {
      if (!window.ExcelJS)
      {
        toast("The Excel tools didn't load. Check your connection, then reload the page.",
        {
          bad: true
        });
        return;
      }
      store.ui.busy = 'save';
      const c = store.cfg,
        wb = E.buildWorkbook(window.ExcelJS, c, R.value);
      wb.xlsx.writeBuffer().then(buf =>
        {
          const name = fileName(c);
          download(name, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          store.excel = {
            name,
            at: Date.now(),
            hash: hashOf(c),
            how: 'downloaded'
          };
          persist();
          toast(`Downloaded ${name}. That file is now the master copy.`);
        }).catch(() => toast('The Excel file could not be built. Reload the page and try again.',
        {
          bad: true
        }))
        .finally(() =>
        {
          store.ui.busy = null;
        });
    },
    async open(file)
    {
      store.ui.busy = 'open';
      try
      {
        const res = await E.readWorkbook(window.ExcelJS, await file.arrayBuffer());
        if (!res)
        {
          toast(`${file.name} wasn't made by Roster Builder. Open a roster file downloaded from this app.`,
          {
            bad: true
          });
          return;
        }
        store.undo.push(JSON.stringify(store.cfg));
        store.cfg = E.normalise(res.config);
        store.excel = {
          name: file.name,
          at: Date.now(),
          hash: hashOf(store.cfg),
          how: 'opened'
        };
        persist();
        toast(`Opened ${file.name}, including any changes made in Excel.`,
        {
          undo: true
        });
        location.hash = '#roster';
      }
      catch (e)
      {
        toast(`${file.name} couldn't be read. Check it's an .xlsx downloaded from this app.`,
        {
          bad: true
        });
      }
      finally
      {
        store.ui.busy = null;
      }
    },
  };

  /* ---------- tooltip directive: real tooltip on hover and keyboard focus ---------- */
  let tipEl = null;

  function showTip(el)
  {
    hideTip();
    const text = el.getAttribute('data-tip');
    if (!text) return;
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.textContent = text;
    const kbd = el.getAttribute('data-kbd');
    if (kbd)
    {
      const k = document.createElement('kbd');
      k.textContent = kbd;
      tipEl.appendChild(k);
    }
    document.body.appendChild(tipEl);
    const r = el.getBoundingClientRect(),
      t = tipEl.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left + r.width / 2 - t.width / 2, window.innerWidth - t.width - 8));
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
  const tip = {
    mounted(el, b)
    {
      const v = typeof b.value === 'string' ?
      {
        text: b.value
      } : b.value;
      el.setAttribute('data-tip', v.text);
      if (v.kbd) el.setAttribute('data-kbd', v.kbd);
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', v.text);
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
      const v = typeof b.value === 'string' ?
      {
        text: b.value
      } : b.value;
      el.setAttribute('data-tip', v.text);
      el.setAttribute('aria-label', v.text);
    },
    unmounted()
    {
      hideTip();
    },
  };

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function trap(e, el)
  {
    if (e.key !== 'Tab' || !el) return;
    const f = [...el.querySelectorAll(FOCUSABLE)];
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0])
    {
      e.preventDefault();
      f[f.length - 1].focus();
    }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1])
    {
      e.preventDefault();
      f[0].focus();
    }
  }

  /* ---------- shared bits for every page ---------- */
  const shared = {
    computed:
    {
      store: () => store,
      ui: () => store.ui,
      cfg: () => store.cfg,
      R: () => R.value,
      issues: () => issues.value,
      E: () => E,
      inSync: () => inSync.value
    },
    methods:
    {
      nice,
      plural,
      periodLabel,
      v: p => E.variable(p),
      fmt: (iso, y) => E.fmtDate(iso, y),
      groupName: g => GROUP_NAME[g],
      cellClass(v)
      {
        const s = this.cfg.shifts;
        return v === s.early ? 'c-early' : v === s.late ? 'c-late' : v === 'RDO' ? 'c-rdo' : v === 'Leave' ? 'c-leave' : 'c-other';
      },
      saveExcel()
      {
        excel.save();
      },
    },
  };

  /* Roster: the grid, its cover and rotation rows, and any problems. */
  const RosterPage = {
    template: '#tpl-roster',
    mixins: [shared],
    computed:
    {
      days()
      {
        return this.ui.rosterView === 'week' ? this.R.days.filter(d => d.w === this.ui.week) : this.R.days;
      },
      shortDays()
      {
        return new Set(this.issues.filter(x => x.severity === 2 && x.i != null).map(x => x.i));
      },
      rotRows()
      {
        const c = this.cfg,
          L = P.ROT_LABEL(c),
          rows = [];
        if (c.rules.frontDesk.on && this.R.analysts.length) rows.push(
        {
          col: 'frontDesk',
          cls: 'r-fd',
          label: L.fd,
          note: 'daily'
        });
        if (c.rules.siteB.on && this.R.analysts.length)
        {
          rows.push(
          {
            col: 'seat1',
            cls: 'r-seat1',
            label: L.seat1,
            note: 'Mon to Fri'
          });
          rows.push(
          {
            col: 'seat2',
            cls: 'r-seat2',
            label: L.seat2,
            note: 'Wed to Tue'
          });
        }
        if (c.rules.onCall.on && this.R.so.length) rows.push(
        {
          col: 'onCall',
          cls: 'r-oc',
          label: L.oc,
          note: 'weekly'
        });
        return rows;
      },
    },
    methods:
    {
      val(p, d)
      {
        return this.R.grid.get(p.id)[d.i];
      },
      changed(p, d)
      {
        return this.R.source.get(p.id)[d.i] !== 'formula';
      },
      duties(p, d)
      {
        return P.dutiesOn(this.cfg, this.R, p.id, d.i);
      },
      wk(d)
      {
        return this.ui.rosterView === 'period' && d.i % 5 === 0 ? (d.w % 2 === 0 ? 'pp' : 'wk') : '';
      },
      clash(row, d)
      {
        const nm = this.R.cols[d.i][row.col];
        if (nm === 'NO COVER' || nm === 'Vacant') return true;
        const p = this.R.ro.find(x => E.variable(x) === nm);
        const v = p ? this.R.grid.get(p.id)[d.i] : '?';
        return v !== this.cfg.shifts.early && v !== this.cfg.shifts.late;
      },
      openCell(e, p, d)
      {
        store.ui.pop = {
          pid: p.id,
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
      replan()
      {
        ask(
        {
          title: `Re-plan shifts and RDOs for ${periodLabel(this.cfg)}?`,
          body: 'Everyone gets 1 RDO per pay period, placed to keep cover up and avoid rotation clashes. Leave and single-day changes stay.',
          confirm: 'Re-plan roster',
          danger: false,
          run: () =>
          {
            store.ui.busy = 'replan';
            setTimeout(() =>
            {
              const best = E.autoPlan(store.cfg,
              {
                tries: 50
              });
              commit('Re-planned shifts and RDOs', c =>
              {
                c.people.forEach(p =>
                {
                  const q = best.people.find(x => x.id === p.id);
                  if (q) p.plan = q.plan;
                });
              });
              store.ui.busy = null;
            }, 30);
          }
        });
      },
    },
  };

  /* Team: who is on the roster. Each field saves as you leave it. */
  const TeamPage = {
    template: '#tpl-team',
    mixins: [shared],
    data: () => (
    {
      errs:
      {}
    }),
    computed:
    {
      people()
      {
        return this.R.ro;
      }
    },
    methods:
    {
      setField(p, f, e)
      {
        let val = e.target.value;
        if (f === 'role')
        {
          val = val.trim();
          if (!val)
          {
            this.errs[p.id] = 'Enter a role, for example Analyst 3.';
            return;
          }
          if (this.cfg.people.some(x => x.id !== p.id && x.role.toLowerCase() === val.toLowerCase()))
          {
            this.errs[p.id] = `${val} is already used. Each role needs a different name.`;
            return;
          }
          delete this.errs[p.id];
        }
        if (f === 'name') val = val.trim();
        if (p[f] === val) return;
        commit(f === 'name' ? `${p.role} is now ${val || 'Vacant'}` : `Updated ${E.variable(p)}`, c =>
        {
          const q = c.people.find(x => x.id === p.id);
          q[f] = val;
          if (f === 'pattern' && val !== 'alt') q.plan.forEach(x => x.shift = val);
        });
      },
      clearErr(p)
      {
        delete this.errs[p.id];
      },
      add(group)
      {
        const base = {
          analyst: 'Analyst',
          senior: 'Senior',
          leader: 'Team Leader'
        } [group];
        let n = this.cfg.people.filter(p => p.group === group).length + 1,
          role = `${base} ${n}`;
        while (this.cfg.people.some(p => p.role.toLowerCase() === role.toLowerCase())) role = `${base} ${++n}`;
        const id = E.uid();
        commit(`Added ${role}. Type their name, then re-plan the roster.`, c => c.people.push(
        {
          id,
          role,
          name: '',
          group,
          pattern: group === 'leader' ? 'early' : 'alt',
          plan: []
        }));
        nextTick(() =>
        {
          const el = document.getElementById('name-' + id);
          if (el) el.focus();
        });
      },
      remove(p)
      {
        ask(
        {
          title: `Remove ${E.variable(p)} (${p.role})?`,
          body: 'They come off the roster, with their leave and RDO changes.',
          confirm: 'Remove person',
          run: () => commit(`Removed ${E.variable(p)}`, c =>
          {
            c.people = c.people.filter(x => x.id !== p.id);
            c.leave = c.leave.filter(l => l.pid !== p.id);
            c.swaps = c.swaps.filter(s => s.pid !== p.id);
            for (const k of Object.keys(c.overrides))
              if (k.startsWith(p.id + '|')) delete c.overrides[k];
          })
        });
      },
    },
  };

  /* Leave and RDO changes: simple lists that write into the roster and the Excel file. */
  const LeavePage = {
    template: '#tpl-leave',
    mixins: [shared],
    data: () => (
    {
      lf:
      {
        pid: '',
        from: '',
        to: '',
        note: ''
      },
      sf:
      {
        pid: '',
        from: '',
        to: '',
        reason: ''
      },
      lt:
      {},
      st:
      {}
    }),
    computed:
    {
      people()
      {
        return this.R.ro.filter(p => E.variable(p) !== 'Vacant');
      },
      minD()
      {
        return this.cfg.start;
      },
      maxD()
      {
        return E.addDays(this.cfg.start, 7 * this.cfg.weeks - 1);
      },
      lErr()
      {
        const f = this.lf,
          e = {};
        if (!f.from) e.from = 'Choose the first day.';
        else if (f.from < this.minD || f.from > this.maxD) e.from = `Choose a day from ${nice(this.minD)} to ${nice(periodEnd(this.cfg))}.`;
        if (f.to && f.from && f.to < f.from) e.to = 'Choose a last day on or after the first day.';
        return e;
      },
      rdoDates()
      {
        return this.sf.pid ? (this.R.rdoDates.get(this.sf.pid) || []) : [];
      },
      sErr()
      {
        const f = this.sf,
          e = {};
        if (!f.from) e.from = 'Choose the RDO to move.';
        if (!f.to) e.to = 'Choose the day it moves to.';
        else if (E.dowOf(f.to) > 5) e.to = 'Choose a weekday.';
        else if (f.to < this.minD || f.to > this.maxD) e.to = 'Choose a day inside this roster.';
        return e;
      },
      swaps()
      {
        return this.R.swaps;
      },
    },
    created()
    {
      const p = this.people[0];
      if (p)
      {
        this.lf.pid = p.id;
        this.sf.pid = p.id;
        this.sf.from = (this.R.rdoDates.get(p.id) || [])[0] || '';
      }
      this.lf.from = this.cfg.start;
    },
    methods:
    {
      name(pid)
      {
        const p = this.cfg.people.find(x => x.id === pid);
        return p ? E.variable(p) : 'Someone';
      },
      addLeave()
      {
        this.lt = {
          from: true,
          to: true
        };
        if (Object.keys(this.lErr).length)
        {
          nextTick(() => document.getElementById('lv-from').focus());
          return;
        }
        const f = {
          ...this.lf,
          id: E.uid(),
          to: this.lf.to || this.lf.from,
          note: this.lf.note.trim()
        };
        commit(`Added leave for ${this.name(f.pid)} (${nice(f.from)}${f.to !== f.from ? ' to ' + nice(f.to) : ''})`, c => c.leave.push(f));
        this.lf.note = '';
        this.lt = {};
      },
      removeLeave(l)
      {
        ask(
        {
          title: `Remove ${this.name(l.pid)}'s leave from ${nice(l.from)}?`,
          body: 'Those days go back to the plan.',
          confirm: 'Remove leave',
          run: () => commit(`Removed ${this.name(l.pid)}'s leave`, c =>
          {
            c.leave = c.leave.filter(x => x.id !== l.id);
          })
        });
      },
      pickSwapPerson()
      {
        this.sf.from = (this.R.rdoDates.get(this.sf.pid) || [])[0] || '';
      },
      addSwap()
      {
        this.st = {
          from: true,
          to: true
        };
        if (Object.keys(this.sErr).length)
        {
          nextTick(() => document.getElementById(this.sErr.from ? 'sw-from' : 'sw-to').focus());
          return;
        }
        const f = {
          ...this.sf,
          id: E.uid(),
          reason: this.sf.reason.trim()
        };
        commit(`Moved ${this.name(f.pid)}'s RDO from ${nice(f.from)} to ${nice(f.to)}`, c => c.swaps.push(f));
        this.sf.to = '';
        this.sf.reason = '';
        this.st = {};
      },
      removeSwap(s)
      {
        ask(
        {
          title: `Undo ${this.name(s.pid)}'s RDO move to ${nice(s.to)}?`,
          body: 'The RDO goes back to its standard day.',
          confirm: 'Remove RDO change',
          run: () => commit(`Removed ${this.name(s.pid)}'s RDO change`, c =>
          {
            c.swaps = c.swaps.filter(x => x.id !== s.id);
          })
        });
      },
    },
  };

  /* Settings: one form, one Save. */
  const SettingsPage = {
    template: '#tpl-settings',
    mixins: [shared],
    data()
    {
      return {
        f: this.fromCfg(),
        t:
        {},
        saved: false
      };
    },
    computed:
    {
      A()
      {
        return this.R.analysts.length || 1;
      },
      maxPool()
      {
        return this.R.so.filter(p => p.group !== 'leader').length || 1;
      },
      errors()
      {
        const f = this.f,
          e = {},
          code = /^[^",]{1,12}$/,
          whole = (x, lo, hi) => x !== '' && Number.isInteger(+x) && +x >= lo && +x <= hi;
        if (!f.title.trim()) e.title = 'Enter a roster name, for example IT Service Desk.';
        if (!f.start) e.start = 'Choose the first Monday.';
        if (!code.test(f.early.trim())) e.early = 'Enter a short code without commas, like 7-4.';
        if (!code.test(f.late.trim())) e.late = 'Enter a short code without commas, like 8-5.';
        else if (f.late.trim() === f.early.trim()) e.late = 'Use a different code from the early shift.';
        for (const k of ['minEarly', 'minLate', 'minSenior'])
          if (!whole(f[k], 0, 50)) e[k] = 'Enter a whole number from 0 to 50.';
        if (!whole(f.sbMin, 0, 2)) e.sbMin = 'Use 0, 1 or 2.';
        for (const k of ['fdStart', 'seat1', 'seat2'])
          if (!whole(f[k], 1, this.A)) e[k] = `Enter 1 to ${this.A}.`;
        if (!whole(f.ocPool, 1, this.maxPool)) e.ocPool = `Enter 1 to ${this.maxPool}.`;
        if (!whole(f.ocStart, 1, Math.max(1, +f.ocPool || 1))) e.ocStart = `Enter 1 to ${Math.max(1, +f.ocPool || 1)}.`;
        if (!f.rdoDays.length) e.rdoDays = 'Tick at least one day.';
        return e;
      },
      moved()
      {
        return this.f.start && E.dowOf(this.f.start) !== 1 ? E.mondayOnOrAfter(this.f.start) : null;
      },
    },
    methods:
    {
      fromCfg()
      {
        const c = store.cfg,
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
          fdOn: r.frontDesk.on,
          fdLabel: r.frontDesk.label,
          fdStart: r.frontDesk.start,
          sbOn: r.siteB.on,
          sbLabel: r.siteB.label,
          sbMin: r.siteB.min,
          seat1: r.siteB.seat1,
          seat2: r.siteB.seat2,
          ocOn: r.onCall.on,
          ocLabel: r.onCall.label,
          ocPool: r.onCall.poolSize,
          ocStart: r.onCall.start,
          rdoDays: r.rdoDays.slice()
        };
      },
      err(k)
      {
        return this.t[k] && this.errors[k];
      },
      save()
      {
        Object.keys(this.errors).forEach(k => this.t[k] = true);
        const bad = Object.keys(this.errors)[0];
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
        commit('Settings saved', c =>
        {
          const r = c.rules;
          c.title = f.title.trim();
          c.start = E.mondayOnOrAfter(f.start);
          c.weeks = +f.weeks;
          c.shifts = {
            early: f.early.trim(),
            late: f.late.trim()
          };
          r.minEarly = +f.minEarly;
          r.minLate = +f.minLate;
          r.minSenior = +f.minSenior;
          r.rdoDays = f.rdoDays.slice().sort();
          r.frontDesk = {
            on: f.fdOn,
            label: f.fdLabel.trim() || 'Front desk',
            start: +f.fdStart
          };
          r.siteB = {
            on: f.sbOn,
            label: f.sbLabel.trim() || 'Site B',
            min: +f.sbMin,
            seat1: +f.seat1,
            seat2: +f.seat2
          };
          r.onCall = {
            on: f.ocOn,
            label: f.ocLabel.trim() || 'On call',
            poolSize: +f.ocPool,
            start: +f.ocStart
          };
        });
        this.f = this.fromCfg();
        this.t = {};
        this.saved = true;
        setTimeout(() =>
        {
          this.saved = false;
        }, 3000);
      },
      reset()
      {
        this.f = this.fromCfg();
        this.t = {};
      },
      startAgain()
      {
        ask(
        {
          title: 'Start again with the sample team?',
          body: 'The roster in this browser is replaced. Any Excel file you downloaded is not affected.',
          confirm: 'Start again',
          run: () =>
          {
            commit('Started again with the sample team', c =>
            {
              Object.keys(c).forEach(k => delete c[k]);
              Object.assign(c, sample());
            });
            store.excel = null;
            persist();
            this.reset();
          }
        });
      },
    },
  };

  /* Root: header, Excel bar, cell popover, confirm dialog, toasts, shortcuts. */
  createApp(
  {
    mixins: [shared],
    components:
    {
      RosterPage,
      TeamPage,
      LeavePage,
      SettingsPage
    },
    data: () => (
    {
      popPos: null
    }),
    computed:
    {
      page()
      {
        return {
          roster: 'roster-page',
          team: 'team-page',
          leave: 'leave-page',
          settings: 'settings-page'
        } [this.ui.route];
      },
      nav: () => [
        ['roster', 'Roster'],
        ['team', 'Team'],
        ['leave', 'Leave and RDOs'],
        ['settings', 'Settings']
      ],
      pop()
      {
        return this.ui.pop;
      },
      popP()
      {
        return this.pop ? this.cfg.people.find(p => p.id === this.pop.pid) : null;
      },
      popVal()
      {
        return this.popP ? this.R.grid.get(this.popP.id)[this.pop.i] : null;
      },
      popChanged()
      {
        return this.popP && this.cfg.overrides[this.popP.id + '|' + this.pop.iso] != null;
      },
      dlg()
      {
        return this.ui.confirm;
      },
      MOD: () => MOD,
      excelState()
      {
        if (!store.excel) return {
          kind: 'none',
          title: 'No Excel file yet',
          text: 'When the roster looks right, download it. That file becomes the master copy for the team.'
        };
        if (inSync.value) return {
          kind: 'ok',
          title: 'Excel file is up to date',
          text: `${store.excel.name}, ${store.excel.how} ${timeOf(store.excel.at)}.`
        };
        return {
          kind: 'changed',
          title: 'Changes not in Excel yet',
          text: `Download a new copy to replace ${store.excel.name}, so the Excel file stays the master copy.`
        };
      },
    },
    watch:
    {
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
          if (!el) return;
          const r = p.anchor.getBoundingClientRect();
          const left = Math.max(window.scrollX + 16, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - el.offsetWidth - 16));
          let top = r.bottom + window.scrollY + 4;
          if (r.bottom + el.offsetHeight + 8 > window.innerHeight && r.top - el.offsetHeight > 0) top = r.top + window.scrollY - el.offsetHeight - 4;
          this.popPos = {
            left: left + 'px',
            top: top + 'px'
          };
          const f = el.querySelector('[aria-checked="true"]') || el.querySelector('button');
          if (f) f.focus();
        });
      },
      'ui.confirm'(c)
      {
        if (c) nextTick(() =>
        {
          if (this.$refs.cancel) this.$refs.cancel.focus();
        });
      },
    },
    methods:
    {
      undo,
      pickFile(e)
      {
        const f = e.target.files[0];
        e.target.value = '';
        if (f) excel.open(f);
      },
      closePop(restore = true)
      {
        const a = this.ui.pop && this.ui.pop.anchor;
        this.ui.pop = null;
        if (restore && a && document.body.contains(a)) a.focus();
      },
      choose(value)
      {
        const p = this.ui.pop,
          person = this.popP;
        this.closePop();
        commit(value == null ? `${E.variable(person)} is back to the plan on ${nice(p.iso)}` : `${E.variable(person)} set to ${value} on ${nice(p.iso)}`, c =>
        {
          delete c.overrides[p.pid + '|' + p.iso];
          if (value != null && E.compute(c).grid.get(p.pid)[p.i] !== value) c.overrides[p.pid + '|' + p.iso] = value;
        });
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
      dlgKey(e)
      {
        if (e.key === 'Escape')
        {
          e.stopPropagation();
          this.closeDlg();
        }
        else trap(e, this.$refs.dlg);
      },
      key(e)
      {
        const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
        if (e.key === 'Escape' && this.ui.pop) this.closePop();
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !typing && !this.ui.confirm)
        {
          e.preventDefault();
          undo();
        }
      },
      outside(e)
      {
        if (this.ui.pop && this.$refs.pop && !this.$refs.pop.contains(e.target) && !this.ui.pop.anchor.contains(e.target)) this.closePop(false);
        if (this.ui.menuOpen && !e.target.closest('.menu-toggle') && !e.target.closest('.navmenu')) this.ui.menuOpen = false;
      },
    },
    mounted()
    {
      document.addEventListener('keydown', this.key);
      document.addEventListener('mousedown', this.outside);
      window.addEventListener('resize', () =>
      {
        if (this.ui.pop) this.closePop(false);
        hideTip();
      });
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const set = () => document.documentElement.setAttribute('data-bs-theme', mq.matches ? 'dark' : 'light');
      set();
      mq.addEventListener('change', set);
    },
  }).directive('tip', tip).mount('#app');
  window.__roster = {
    store,
    R,
    issues
  };
})();