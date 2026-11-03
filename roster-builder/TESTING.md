# Roster Builder: test plan and results

> Rapid prototype, not an endorsed tool. All test data is synthetic. The parity fixture stores roles only, no names.

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC1 | Given the original roster's settings, every shift, cover count, rotation and check matches the original spreadsheet. |
| AC2 | Re-plan gives no short days, no rotation clashes and 1 RDO per person per pay period, for 2 to 8 week rosters. |
| AC3 | The downloaded Excel file recalculates to exactly what the app shows, and reopens in the app with the same team, plan, leave and RDO moves. |
| AC4 | The Excel status bar always shows whether the app matches the last Excel file. |
| AC5 | No sideways scrolling at 375px or 1280px, tap targets at least 44px, text at least 12px, light and dark mode. |
| AC6 | Forms validate when leaving a field and never use a disabled submit button. Removing anything asks first, naming what goes, with Cancel focused. |

## Engine, planning and Excel (`node tests/engine.test.js`)

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
| T19 | Workbook round trip: reopening gives back the same plan, names and swaps | PASS |
| T20 | Workbook formulas recalculate to the same values the app shows (LibreOffice) | PASS |

## Interface

| Test | Evidence | Result |
|---|---|---|
| UI1 | `tests/ui.js`: all 4 pages at 1280 and 375, no console errors, no page-level sideways scroll. | PASS |
| UI2 | `tests/flow.js`: Excel bar goes from "No Excel file yet" to "up to date" on download and "Changes not in Excel yet" after an edit; single-day leave; add leave; RDO move with check; empty form shows an inline error; re-plan confirm focuses Cancel; start again; reopening the downloaded file restores leave and RDO moves. | PASS |
| UI3 | `tests/audit.js` (light, dark, 375px, reduced motion): weights 400, 500, 600; nothing under 12px; all controls at least 44px; no overflow. | PASS |

## Known limits

- The working copy lives in one browser. The Excel file is the copy to keep.
- Public holidays are not modelled.
- If the same roster is edited in Excel and in the app at once, the last file downloaded wins.
