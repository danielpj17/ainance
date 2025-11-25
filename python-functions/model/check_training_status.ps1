# Quick training status check script
# Run this to check if training is complete

Write-Host "=== ML Training Status Check ===" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""

$modelPath = "scalping_model_v2.pkl"
$metricsPath = "training_metrics.json"

# Check model file
Write-Host "Model File:" -ForegroundColor Yellow
if (Test-Path $modelPath) {
    $model = Get-Item $modelPath
    Write-Host "  ✅ EXISTS!" -ForegroundColor Green
    Write-Host "    Size: $([math]::Round($model.Length/1MB, 2)) MB"
    Write-Host "    Created: $($model.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-Host ""
    Write-Host "🎉 TRAINING COMPLETE! 🎉" -ForegroundColor Green
} else {
    Write-Host "  ⏳ Not created yet (still training)" -ForegroundColor Yellow
    Write-Host ""
    
    # Check metrics
    Write-Host "Training Metrics:" -ForegroundColor Yellow
    if (Test-Path $metricsPath) {
        Write-Host "  ✅ EXISTS" -ForegroundColor Green
        try {
            $metrics = Get-Content $metricsPath | ConvertFrom-Json
            if ($metrics.test_accuracy) {
                Write-Host "    Test Accuracy: $($metrics.test_accuracy)"
            }
        } catch {
            Write-Host "    (Could not read metrics)"
        }
    } else {
        Write-Host "  ⏳ Not created yet" -ForegroundColor Yellow
    }
    
    # Check Python processes
    Write-Host ""
    Write-Host "Python Processes:" -ForegroundColor Yellow
    $procs = Get-Process python -ErrorAction SilentlyContinue
    if ($procs) {
        Write-Host "  Running: $($procs.Count) process(es)" -ForegroundColor Cyan
        $now = Get-Date
        foreach ($p in $procs) {
            $runtime = $now - $p.StartTime
            Write-Host "    PID $($p.Id): Running for $([math]::Round($runtime.TotalMinutes, 1)) minutes"
        }
    } else {
        Write-Host "  ⚠️  No Python processes found (may have completed or crashed)" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "Status: Training in progress..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Tip: Run this script every 30 minutes to check progress" -ForegroundColor Gray

