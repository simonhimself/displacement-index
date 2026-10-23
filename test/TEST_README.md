# AI Displacement Tracker Integration Tests

## Test Files

- `mock_ai_displacement.json` - Mock dataset matching the expected schema
- `test_integration.js` - Validation tests for data structure and aggregation logic

## Running Tests

```bash
# Run data validation tests
node test/test_integration.js
```

## Local Worker Testing

### Test with mock data (when real dataset is unavailable)

The Worker is designed to gracefully handle failures of the AI Displacement dataset:

1. **First fetch attempt**: If the dataset URL returns 404 or times out, the Worker will:
   - Check for a previous snapshot in KV
   - If found, fall back to the cached version with a warning
   - If not found, mark the source as "unavailable" and continue

2. **Subsequent refreshes**: Once a successful fetch has occurred and been cached, future failures will use the cached version

3. **Site behavior**: The dashboard will only show AI displacement data when available. Missing data does not:
   - Break the refresh pipeline
   - Mark the site as unhealthy
   - Affect the composite index score

### Testing the full pipeline locally

```bash
# Start local dev server
npm run dev

# Test API endpoints (in another terminal)
curl http://localhost:8787/api/health
curl http://localhost:8787/api/indicators
curl http://localhost:8787/api/ai_displacement_raw          # May return 503 if unavailable
curl http://localhost:8787/api/ai_displacement_aggregates   # May return 503 if unavailable
```

## Expected Behavior

### When dataset is available
- `/api/ai_displacement_raw` returns event list
- `/api/ai_displacement_aggregates` returns monthly/sector aggregates
- Dashboard shows AI layoff inset in White-Collar Displacement card

### When dataset is unavailable (current state)
- Worker refresh completes successfully
- Warning added: "AI Displacement unavailable (optional source): ..."
- API endpoints return 503 with descriptive message
- Dashboard renders without AI displacement inset (graceful degradation)
- Site health remains "healthy" (200 status)

## Dataset Schema

```json
{
  "events": [
    {
      "company": "string",
      "date": "YYYY-MM-DD",
      "sector": "string",
      "job_functions": ["string"],
      "workers_affected": number | null,
      "source_url": "string",
      "notes": "string (optional)"
    }
  ]
}
```

## Data Quality Notes

When the real dataset becomes available, verify:

1. **Date format**: Consistently YYYY-MM-DD
2. **Worker counts**: Some events may have null/missing worker counts
3. **Source URLs**: Should be valid and dereferenceable
4. **Sector names**: Check for consistency and normalization
5. **Duplicate events**: Same company/date should be deduplicated

## Replacing Mock with Real Data

Once the real dataset is available at:
```
https://raw.githubusercontent.com/noahaust2/ai-displacement-tracker/main/data/processed/ai_displacement.json
```

1. Verify it matches the expected schema
2. Test a refresh: `curl -X POST http://localhost:8787/api/refresh -H "Authorization: Bearer YOUR_TOKEN"`
3. Check for warnings in the response
4. Verify the data appears in the dashboard

No code changes should be necessary - the Worker is already configured to fetch from this URL.
