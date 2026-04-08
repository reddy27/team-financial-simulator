# TEAM Financial Simulator MVP

This is a dependency-free browser MVP for the finance-first TEAM product concept.

## What it does

- Loads a sample TEAM dataset by default
- Accepts CSV uploads using the same schema
- Calculates a baseline projected reconciliation view by episode category
- Lets the user model discharge mix, readmission improvement, and quality score lift
- Produces a simple executive summary for finance stakeholders

## Files

- `index.html`: application shell
- `styles.css`: presentation layer
- `app.js`: scenario engine and rendering logic
- `sample-data/team-sample-data.csv`: upload template / example dataset

## Run locally

Because this is a static app, any local HTTP server works. For example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## CSV schema

```text
episode_category,cases,avg_spend,target_price,snf_rate,home_health_rate,home_rate,readmission_rate,quality_score
```

Notes:
- rates should be provided as decimals, for example `0.34`
- quality score should be between `0` and `1`

## MVP limitations

- Scenario logic is heuristic, not production-grade TEAM reconciliation logic
- No authentication, persistence, or EHR integration
- No patient-level or real-time workflow support
- CSV parsing is intentionally simple and assumes comma-delimited files without quoted commas
