# Roster Builder (rapid prototype)

> **Rapid prototype, not an endorsed tool.** Do not enter council data. For management review as a concept only.

Live: https://ashley-pettit.github.io/Pub_Prototypes/roster-builder/

## The problem it explores

Team leaders who run a two-shift service desk roster by hand in Excel spend time on the same checks every fortnight:

- Is there enough cover on each shift, every weekday, with a senior on duty?
- Does everyone get exactly one RDO per pay period?
- Are the rotations (front desk, second-site seats, on call) staffed by people who are actually working that day?
- If a leave or RDO swap request is approved, what breaks?
- What does payroll need, and what changed after the roster was sent out?

Roster Builder does those checks continuously and suggests fixes, so the leader decides rather than calculates.

## What it does

| Area | What a team leader can do |
|---|---|
| Roster | See the whole period or one week. Problems are listed with plain-language reasons and one-click fixes (move an RDO, cover a rotation, swap a shift for a day). "Fix automatically" applies the best fixes in one step. Any cell can be changed for a single day. |
| Requests | Record leave (annual, personal, other) and RDO swaps. Every pending request shows whether approving it is safe, what it would break, and whether it overlaps someone else's leave. "Approve and fix cover" approves and repairs cover in one step. Suggested days are offered for RDO swaps. |
| Team | Add, edit or remove people; set group (lead, senior, analyst) and shift pattern. Totals per person for the period. |
| Person | One person's days, duties, requests and totals. Download a calendar file (.ics) for Outlook or a phone. |
| Review | Readiness checks, a payroll summary per pay period, a fairness view of duties within each group, and a change log that marks changes made after the roster was marked final. Exports live here: a table to paste into email, payroll CSV, staff calendars and the Excel workbook. |
| Settings | Roster name, start, length (2 to 8 weeks), shift codes, cover minimums, rotations, allowed RDO days, backup and restore, reset. |
| Next roster | "Plan next roster" carries every rotation on without a jump, swaps everyone's shift, and re-plans RDOs. Earlier rosters are kept. |

The Excel workbook matches the structure of the original team roster spreadsheet (Roster, Setup and RDO sheets, live formulas, dropdowns, colour rules and the same cover and rotation checks). Values were checked against the original value for value, and every exported workbook recalculates to the numbers the app shows.

## How it's built

- Static web app: `index.html`, `css/app.css`, `js/*.js`. No build step and no server.
- Vue 3 and Bootstrap 5 (LCC stack), Bootstrap Icons, ExcelJS for the workbook. All from cdnjs.
- `js/engine.js`: roster model and calculations (mirrors the workbook formulas), auto-planning, Excel writer and reader.
- `js/planner.js`: problems, fixes, request impact, roll forward, totals.
- `js/exports.js`: payroll CSV (formula-injection safe), calendar files, email table.
- `js/app.js`: the Vue app.
- Data is kept in the browser's local storage on one device. Nothing is sent anywhere.

## Running the tests

```
npm install exceljs@4.4.0 playwright
node tests/engine.test.js          # 23 engine, planner and workbook tests (LibreOffice optional)
python3 -m http.server 8765 &       # then, in another shell:
node tests/ui.js && node tests/flow.js && node tests/audit.js
```

See [TESTING.md](TESTING.md) for the test plan, acceptance criteria and latest results.

## Handover checklist (LCC Enterprise Coding Standards)

**In stack:** HTML, CSS, JavaScript, Vue, Bootstrap.

**Needs an ICT-DA exception or a swap before production:**
- Hosting on GitHub Pages and source on GitHub. Production would move to Azure App Service with source in Azure DevOps.
- Local browser storage. Production would use Cosmos DB or Azure SQL behind an Azure Function App, with sign-in (Entra ID) so rosters are shared and audited.
- ExcelJS, Bootstrap Icons and Google Fonts from public CDNs. Production would self-host them.

**Privacy:** the prototype holds only made-up names. A production version would hold staff names, leave types and personal leave, which is personal information under the Information Privacy Act 2009 (Qld). It would need a privacy impact assessment, role-based access and retention rules. No AI model is used.

**Security notes:** all output is escaped by Vue templates; CSV cells starting with `=`, `+`, `-` or `@` are neutralised; uploaded files are parsed, never executed. Production still needs authentication on every change, server-side validation and an OWASP Top 10 review.

**Still needed for production:** Dev, Test and Prod environments with CI/CD in Azure DevOps; DevOps cards for changes; UAT with synthetic data; approvals from ICT-DA, CAB, PGG and the business system owner; a go-live plan, service transition document and support playbook; integration with the HR or payroll system for leave and pay periods.
