# Upload Instructions

Use the sample file:

- [TEAM-upload-sample.csv](/Users/bobby/startups/team-project/TEAM-upload-sample.csv)

## How to test

1. Open the MVP in your browser.
2. Click `Upload TEAM episode CSV`.
3. Select `TEAM-upload-sample.csv`.
4. The dashboard will refresh with the uploaded dataset.

## Required columns

```text
episode_category,cases,avg_spend,target_price,snf_rate,home_health_rate,home_rate,readmission_rate,quality_score
```

## Notes

- Rates should be decimal values, for example `0.36`
- `quality_score` should be between `0` and `1`
- Each row is one episode category summary
