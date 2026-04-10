# TEAM Episode Platform

Self-contained end-to-end application built from the PRD in [`PRODUCT REQUIREMENTS DOCUMENT.pdf`](/Users/bobby/startups/team-project/iteration-3/PRODUCT%20REQUIREMENTS%20DOCUMENT.pdf). It includes:

- A responsive Apple-inspired operations UI
- A Python HTTP API
- A SQLite database with seeded TEAM episode data
- Role-aware actions and audit logging

## Run

```bash
python3 server.py
```

Then open `http://127.0.0.1:8000`.

## Included PRD Coverage

- Episode identification and timeline tracking
- Navigator worklists and missed-task alerts
- 48-hour and 7-day follow-up workflows
- Telehealth modality capture
- Clinical pathway and quality/SDoH status
- Preferred SNF/HHA network scorecards
- Spend vs target reconciliation views
- Exportable CMS reporting snapshot

## API

- `GET /api/bootstrap`
- `GET /api/episodes/:id`
- `GET /api/reports/cms`
- `POST /api/tasks/:id/complete`
- `POST /api/episodes/:id/status`
- `POST /api/episodes/:id/followups`
- `POST /api/episodes/:id/notes`

## Notes

- The app uses only built-in Python modules plus SQLite, so it does not require dependency installation.
- Seeded data lives in `data/team_platform.db` after first run.
