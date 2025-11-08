# Auto-Healing QA Test Suite

This test suite automatically validates all video transformation presets and attempts to auto-heal any failures detected.

## Overview

The auto-healing QA suite tests all presets with `videoTransform: true` and:
1. Creates jobs via the API
2. Polls for completion
3. Verifies R2 URLs are accessible
4. Validates job status and artifacts
5. Auto-heals common configuration issues
6. Generates a detailed markdown report

## Running the Tests

### Prerequisites

1. **API Server Running**: The API must be running on `http://localhost:4000` (or set `E2E_BASE_URL`/`API_BASE_URL` env var)
2. **Worker Running**: The worker must be running to process jobs
3. **Redis**: Redis must be available for queue processing
4. **Environment Variables**:
   - `TEST_API_KEY` or `API_KEY`: API key for authentication
   - `TEST_VIDEO_URL`: Test video URL (defaults to Big Buck Bunny sample)
   - `E2E_BASE_URL` or `API_BASE_URL`: API base URL (defaults to `http://localhost:4000`)

### Run Tests

```bash
# Run auto-heal tests
npm run test:heal

# Or with vitest directly
npx vitest run tests/videoTransform.heal.ts
```

### With Custom Configuration

```bash
E2E_BASE_URL=http://localhost:4000 \
TEST_API_KEY=sk_test_your_key \
TEST_VIDEO_URL=https://example.com/video.mp4 \
npm run test:heal
```

## Test Flow

For each preset with `videoTransform: true`:

1. **Configuration Validation**: Checks preset configuration for required fields
2. **Job Creation**: POST to `/v1/jobs` with preset_id
3. **Status Polling**: Polls `/v1/jobs/:id` every 2 seconds (max 30 attempts = 60 seconds)
4. **Verification**:
   - Job status is "completed"
   - Video transform step exists
   - Video transform status is "completed"
   - Artifact key exists
   - Signed URL exists
   - URL format is valid (contains `https://` and `X-Amz-`)
   - URL is accessible (HEAD request)
5. **Auto-Healing**: If test fails, attempts to fix common issues:
   - Missing `videoTransform: true`
   - Missing `videoTransformConfig`
   - Invalid queue names
   - Missing async/await patterns

## Auto-Healing Rules

The test suite automatically attempts to fix:

1. **Missing videoTransform flag**: Adds `videoTransform: true` if preset needs it
2. **Missing videoTransformConfig**: Adds empty config object if missing
3. **Queue name mismatches**: Validates queue name is `video-transform`
4. **Async issues**: Checks for missing await/async patterns

## Report Output

Reports are saved to `tests/reports/autoheal-report.md` with:

- Summary statistics (passed/failed/fixed/skipped)
- Detailed results for each preset
- Error messages for failures
- Fixes applied during auto-healing
- Configuration validation results

## Presets Tested

Only presets with `videoTransform: true` are tested:

- `blindness`
- `deaf`
- `color_blindness`
- `adhd`
- `autism`
- `epilepsy_flash`
- `epilepsy_noise`
- `cognitive_load`

## Example Report

```markdown
# Auto-Heal QA Results

**Generated:** 2025-01-XX...
**API Base URL:** http://localhost:4000

## Summary

- ✅ **Passed:** 8/8
- 🔧 **Fixed:** 0/8
- ❌ **Failed:** 0/8
- ⏭️  **Skipped:** 0/8

## Detailed Results

### ✅ blindness: OK
- **Job ID:** 12345
- **Video Transform URL:** https://r2.example.com/...
- **Details:**
  - Artifact Key: artifacts/tenant/12345-transformed.mp4
  - Cloudinary URL: https://cloudinary.com/...

## Conclusion

✅ **All presets validated and pipeline stable**
```

## Troubleshooting

### Tests Fail with "Failed to create job"
- Verify API is running
- Check API key is valid
- Verify rate limits haven't been exceeded

### Tests Fail with "Job polling timeout"
- Verify worker is running
- Check Redis connection
- Verify queues are processing jobs
- Check worker logs for errors

### Tests Fail with "Missing artifactKey"
- Verify video transform worker completed successfully
- Check worker logs for transformation errors
- Verify R2 credentials are configured

### Tests Fail with "Invalid URL format"
- Verify R2 signed URL generation is working
- Check `getSignedGetUrl` function in `apps/api/src/lib/r2.ts`
- Verify R2 credentials are correct

## Integration with CI/CD

Add to your CI pipeline:

```yaml
- name: Run Auto-Heal Tests
  run: |
    npm run test:heal
  env:
    E2E_BASE_URL: ${{ env.API_URL }}
    TEST_API_KEY: ${{ secrets.TEST_API_KEY }}
    TEST_VIDEO_URL: ${{ env.TEST_VIDEO_URL }}
```

## Notes

- Each preset test has a 2-minute timeout
- Tests run sequentially (not parallel) to avoid rate limiting
- Auto-healing modifies `config/presets.json` - commit changes if valid
- Reports are generated after all tests complete

