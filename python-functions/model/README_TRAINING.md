# ML Model Training Guide

## How Training Works

### Current Behavior
The training script **always fetches the full 2 years of historical data** every time you run it.

### Why Full Data?
- Technical indicators (RSI, MACD, moving averages) need historical context
- A 20-day moving average requires 20+ days of prior data
- Better to have consistent, complete datasets

### Data Storage
- **Historical data**: Fetched into memory, NOT saved to disk (to save space)
- **Trained model**: Saved as `scalping_model_v2.pkl` (~5-50 MB)
- **Final storage**: Uploaded to Supabase Storage (`models` bucket)

## Training Time

- **First training**: 20-40 minutes (fetching 2 years × 100+ symbols)
- **Subsequent training**: Same 20-40 minutes (re-fetches all data)

## Future Improvement: Incremental Training

To make retraining faster, we could:
1. Save processed feature data to disk
2. Only fetch new data since last training
3. Merge old and new data
4. Retrain model

**Trade-off**: This adds complexity and requires more disk space (~500 MB for cached data).

## Recommendation

For now, the full re-fetch approach is:
- ✅ Simple and reliable
- ✅ Ensures data consistency
- ✅ No cache management needed
- ❌ Slower for frequent retraining

**Suggested retraining schedule**: Weekly or monthly (not daily)

