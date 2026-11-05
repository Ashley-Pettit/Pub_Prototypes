# Roster Builder (rapid prototype)

> **Rapid prototype, not an endorsed tool.** Do not enter council data. For management review as a concept only.

Live: https://ashley-pettit.github.io/logan-prototypes/roster-builder/

## The idea

The roster lives in an **Excel file, and that file is the source of truth**. Roster Builder is a helper that creates and checks that file:

1. Set up the team and the rules (shifts, cover minimums, rotations).
2. Let the app plan RDOs and shifts, and check cover and rotations every day.
3. Add leave and RDO moves, or change a single day.
4. **Download the Excel file.** That file is the master copy: share it, keep it on the team drive, and make day-to-day changes in it.
5. To re-plan later, **open the Excel file** in the app (changes made in Excel come with it), then download a new copy to replace the old one.

A bar at the top of every page shows whether the app matches the last Excel file, or has changes not yet in Excel.

## What's in the Excel file

The same layout as the original team roster spreadsheet: Roster, Setup and RDO sheets, live formulas, dropdowns, colour rules, and the cover and rotation checks. Values were checked against the original value for value, and every downloaded file recalculates to the numbers the app shows.

## The three steps

| Step | What it's for |
|---|---|
| 1 Check roster | The grid with cover and rotation rows, a short list of anything to check, single-day changes (a bottom sheet on a phone), on a phone). |
| 2 Leave and RDOs | Approved leave and RDO moves, with the same checks the workbook uses. |
| 3 Excel | Download the master copy, see whether it's up to date, and open an existing file. |

Settings (gear icon) holds the Team (names, roles, groups and shift patterns, set up once), Re-plan RDOs, a collapsed how-it-works guide, and the roster name, start, length, shift codes, cover minimums, rotations and RDO days. On a phone the steps sit in a bottom tab bar, and every page ends with a Next button. An Excel status chip in the header shows on every page.

## How it's built

- Static web app: `index.html`, `css/app.css`, `js/engine.js` (roster maths, planning, Excel writer and reader), `js/planner.js` (checks), `js/app.js` (Vue app).
- Vue 3 and Bootstrap 5 (LCC stack), Bootstrap Icons, ExcelJS. Loaded from cdnjs.
- A working copy is kept in the browser's local storage. Nothing is sent anywhere.

## Tests

```
npm install exceljs@4.4.0 playwright
node tests/engine.test.js            # engine, planning and Excel tests (LibreOffice optional)
python3 -m http.server 8765 &         # then:
node tests/ui.js && node tests/flow.js && node tests/audit.js
```

See [TESTING.md](TESTING.md).

## Handover checklist (LCC Enterprise Coding Standards)

**In stack:** HTML, CSS, JavaScript, Vue, Bootstrap. The Excel file is the system of record, which suits a SharePoint document library.

**Needs an ICT-DA exception or a swap before production:** GitHub Pages hosting and GitHub source (move to Azure App Service and Azure DevOps); public CDNs (self-host).

**Privacy:** the prototype uses made-up names only. Real rosters hold staff names and leave, which is personal information under the Information Privacy Act 2009 (Qld). Keep the Excel files in an access-controlled library. No AI model is used.

**Still needed for production:** environments and CI/CD in Azure DevOps, DevOps cards for changes, UAT with synthetic data, approvals (ICT-DA, CAB, PGG, business system owner), and support documentation.
