# Roster Builder: test plan and results

> Rapid prototype, not an endorsed tool. All test data is synthetic (made-up names). The parity fixture stores roles only.

## Scope

Engine calculations, planning, problem detection and fixes, request impact checks, roll forward, exports (CSV, calendar, Excel), and the user interface at phone (375px) and desktop (1280px) widths in light and dark mode.

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC1 | Given the original roster's settings, every shift, cover count, rotation and check matches the original spreadsheet. |
| AC2 | Auto-plan produces a roster with no short days, no rotation clashes and exactly 1 RDO per person per pay period, for 2, 4, 6 and 8 week rosters. |
| AC3 | Every problem shown has a plain-language reason. Every suggested fix improves the roster. Fix automatically clears all severe problems where a fix exists. |
| AC4 | Each pending request shows whether approving it is safe before the decision is made. |
| AC5 | Planning the next roster continues every rotation without a jump and swaps shifts. |
| AC6 | The Excel workbook recalculates to exactly the values the app shows, and reopens in the app with the same plan, names and swaps. |
| AC7 | Payroll CSV has one row per person per pay period and cannot inject spreadsheet formulas. |
| AC8 | No page scrolls sideways at 375px or 1280px; tap targets are at least 44px; text is at least 12px; no more than 3 font weights. |
| AC9 | Every action works by keyboard. Panels and dialogs trap focus, close with Escape and return focus. Destructive actions name what is deleted and focus Cancel first. |
| AC10 | Forms validate on leaving a field, clear errors as soon as the field is corrected, and never use a disabled submit button. |

## Automated results: engine, planner and workbook

Run with `node tests/engine.test.js`. Latest run:

| Test | What it checks | Result |
|---|---|---|
| T01 | Engine matches the original workbook value for value (roles, no names) | PASS |
| T02 | Sample plan has no problems | PASS |
| T03-2 | Auto-plan a 2-week roster: no short days, no clashes, 1 RDO per pay period | PASS |
| T03-4 | Auto-plan a 4-week roster: no short days, no clashes, 1 RDO per pay period | PASS |
| T03-6 | Auto-plan a 6-week roster: no short days, no clashes, 1 RDO per pay period | PASS |
| T03-8 | Auto-plan a 8-week roster: no short days, no clashes, 1 RDO per pay period | PASS |
| T04 | Vacant role is left out of cover and flagged when on a rotation | PASS |
| T05 | All rotations off: no rotation rows or rotation problems | PASS |
| T06 | No analysts: front desk and seats switch off cleanly | PASS |
| T07 | Leave on a standard RDO day flags 0 RDOs as a warning, not a cover problem | PASS |
| T08 | RDO swap across pay periods applies and is reported as such | PASS |
| T09 | Swap from a day that is not an RDO is rejected with the workbook wording | PASS |
| T10 | Rotation override replaces the person for that day only and front desk avoids them | PASS |
| T11 | Each suggested fix lowers the problem score | PASS |
| T12 | Fix automatically clears every severe problem in a heavy-leave week | PASS |
| T13 | Impact check: safe leave is safe, leave that drops a shift below minimum is not | PASS |
| T14 | Next roster continues every rotation without a jump | PASS |
| T15 | Next roster swaps shifts: each person starts on the other shift | PASS |
| T16 | Payroll CSV: one row per person per pay period, totals add to 10 weekdays | PASS |
| T17 | CSV cells that start with = + - @ are neutralised (formula injection) | PASS |
| T18 | Calendar file has one event per weekday with shift times | PASS |
| T19 | Workbook round trip: reopening gives back the same plan, names and swaps | PASS |
| T20 | Workbook formulas recalculate to the same values the app shows (LibreOffice) | PASS |

## Automated results: interface

| Test | Evidence | Result |
|---|---|---|
| UI1 | `tests/ui.js` loads all 5 pages at 1280 and 375. No console errors, no page-level horizontal scroll. | PASS |
| UI2 | `tests/flow.js`: approve and fix cover, fix automatically, single-day change, undo (Ctrl+Z), focus trap in the request panel, Escape restores focus, empty swap form shows inline errors, Excel and CSV download, mark as final, change logged as "After final", plan next roster, reopen the exported workbook. | PASS |
| UI3 | `tests/audit.js` (light, dark, 375px, reduced motion): font weights 400, 500, 600; no text under 12px; every control at least 44px except inline text links; no overflow; delete dialog focuses Cancel and restores focus on Escape. | PASS |
| UI4 | Workbook downloaded from the app (with leave, swaps and a one-day rotation change) recalculated in LibreOffice: 0 cells differ. | PASS |

## Edge cases covered

Vacant roles, all rotations off, no analysts, leave on an RDO day, RDO swap into another pay period, swap from a day that is not an RDO, one-day rotation cover, heavy leave in one week, overlapping leave requests, 2 to 8 week rosters, non-Monday start dates (moved to the next Monday), duplicate role names (blocked with a message), reserved shift codes (RDO, Leave, Vacant).

## Known limits

- Data lives in one browser on one device. Clearing site data loses it; use Settings, Data, Download backup.
- Leave on weekends is ignored (the roster covers weekdays only).
- Public holidays are not modelled yet.
- The fairness view compares people within a group for one roster period only.
