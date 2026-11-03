/* Roster Builder exports: payroll CSV, per-person calendar (.ics) and an HTML table for email. */
(function(root)
{
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.RosterEngine;
  const P = (typeof module !== 'undefined' && module.exports) ? require('./planner.js') : root.RosterPlanner;
  const csvCell = v =>
  {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const escHtml = s => String(s ?? '').replace(/[&<>"]/g, ch => (
  {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  } [ch]));

  /* One row per person per pay period: what payroll needs. */
  function payrollCsv(c, r, requests)
  {
    const rows = [
      ['Pay period', 'From', 'To', 'Name', 'Role', 'Days worked', 'RDO days', 'Annual leave days', 'Personal leave days', 'Other leave days', 'Single-day changes']
    ];
    const F = c.weeks / 2;
    const leaveType = (pid, iso) =>
    {
      const q = (requests || []).find(x => x.status === 'approved' && x.type !== 'swap' && x.pid === pid && iso >= x.from && iso <= (x.to || x.from));
      return q ? q.type : 'other';
    };
    for (let f = 0; f < F; f++)
    {
      const days = r.days.filter(d => d.f === f);
      for (const p of r.ro)
      {
        const v = r.grid.get(p.id),
          src = r.source.get(p.id);
        const t = {
          worked: 0,
          rdo: 0,
          annual: 0,
          personal: 0,
          other: 0,
          changed: 0
        };
        days.forEach(d =>
        {
          const x = v[d.i];
          if (x === c.shifts.early || x === c.shifts.late) t.worked++;
          else if (x === 'RDO') t.rdo++;
          else if (x === 'Leave') t[leaveType(p.id, d.iso)]++;
          if (src[d.i] === 'override') t.changed++;
        });
        rows.push([f + 1, days[0].iso, days[days.length - 1].iso, E.variable(p), p.role, t.worked, t.rdo, t.annual, t.personal, t.other, t.changed]);
      }
    }
    return csv(rows);
  }

  /* Calendar file for one person: a timed event for each shift, all-day events for RDOs and leave. */
  function ics(c, r, pid)
  {
    const p = c.people.find(x => x.id === pid);
    const times = code =>
    {
      const m = /^(\d{1,2})(?::?(\d{2}))?\s*-\s*(\d{1,2})(?::?(\d{2}))?$/.exec(code);
      if (!m) return null;
      let a = +m[1],
        b = +m[3];
      if (b <= a) b += 12;
      return [a, +(m[2] || 0), b, +(m[4] || 0)];
    };
    const pad = n => String(n).padStart(2, '0');
    const ymd = iso => iso.replace(/-/g, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Roster Builder prototype//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${c.title} - ${E.variable(p)}`];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    r.days.forEach(d =>
    {
      const v = r.grid.get(pid)[d.i];
      const duties = P.dutiesOn(c, r, pid, d.i);
      const summary = (v === 'RDO' ? 'RDO' : v === 'Leave' ? 'Leave' : `Shift ${v}`) + (duties.length && v !== 'RDO' && v !== 'Leave' ? ` (${duties.join(', ')})` : '');
      lines.push('BEGIN:VEVENT', `UID:${pid}-${d.iso}@roster-builder`, `DTSTAMP:${stamp}`, `SUMMARY:${summary.replace(/[,;]/g, ' ')}`);
      const t = times(v);
      if (t) lines.push(`DTSTART:${ymd(d.iso)}T${pad(t[0])}${pad(t[1])}00`, `DTEND:${ymd(d.iso)}T${pad(t[2] % 24)}${pad(t[3])}00`);
      else lines.push(`DTSTART;VALUE=DATE:${ymd(d.iso)}`, `DTEND;VALUE=DATE:${ymd(E.addDays(d.iso, 1))}`);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  /* A simple coloured table that pastes cleanly into Outlook or Teams. */
  function rosterHtml(c, r)
  {
    const col = v => v === c.shifts.early ? '#cfe2f3' : v === c.shifts.late ? '#d9ead3' : v === 'RDO' ? '#e3e3e3' : v === 'Leave' ? '#fbd9c4' : '#ffffff';
    const th = 'style="border:1px solid #c8c8c8;padding:4px 6px;background:#1f3864;color:#fff;font:600 12px Arial"';
    const td = bg => `style="border:1px solid #c8c8c8;padding:4px 6px;text-align:center;font:12px Arial;background:${bg}"`;
    let h = `<p style="font:600 14px Arial">${escHtml(c.title)}: ${E.fmtDate(c.start, true)} to ${E.fmtDate(E.addDays(c.start, 7 * c.weeks - 3), true)}</p><table style="border-collapse:collapse"><tr><th ${th}>Name</th>`;
    r.days.forEach(d => h += `<th ${th}>${E.DAYS[d.dow - 1]}<br>${E.fmtDate(d.iso)}</th>`);
    h += '</tr>';
    for (const p of r.ro)
    {
      h += `<tr><td style="border:1px solid #c8c8c8;padding:4px 6px;font:600 12px Arial">${escHtml(E.variable(p))}</td>`;
      r.grid.get(p.id).forEach(v => h += `<td ${td(col(v))}>${escHtml(v)}</td>`);
      h += '</tr>';
    }
    const rot = [
      ['frontDesk', c.rules.frontDesk.label, c.rules.frontDesk.on],
      ['seat1', c.rules.siteB.label + ' seat 1', c.rules.siteB.on],
      ['seat2', c.rules.siteB.label + ' seat 2', c.rules.siteB.on],
      ['onCall', c.rules.onCall.label, c.rules.onCall.on]
    ];
    for (const [k, label, on] of rot)
    {
      if (!on || r.cols[0][k] == null) continue;
      h += `<tr><td style="border:1px solid #c8c8c8;padding:4px 6px;font:600 12px Arial;background:#f2f2f2">${escHtml(label)}</td>`;
      r.cols.forEach(x => h += `<td ${td('#f9f9f9')}>${escHtml(x[k])}</td>`);
      h += '</tr>';
    }
    return h + '</table>';
  }

  function rosterText(c, r)
  {
    const rows = [
      ['Name', ...r.days.map(d => `${E.DAYS[d.dow - 1]} ${E.fmtDate(d.iso)}`)]
    ];
    for (const p of r.ro) rows.push([E.variable(p), ...r.grid.get(p.id)]);
    return rows.map(x => x.join('\t')).join('\n');
  }

  const api = {
    payrollCsv,
    ics,
    rosterHtml,
    rosterText,
    csv
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RosterExports = api;
})(typeof self !== 'undefined' ? self : this);