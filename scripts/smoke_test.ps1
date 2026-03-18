# Smoke Test for CATLLM
$ErrorActionPreference = "Continue"

Write-Host "Starting Smoke Test..." -ForegroundColor Cyan

$services = @(
    @{ Name = "Postgres (Internal)"; Host = "postgres.catest.svc.cluster.local"; Port = 34321 },
    @{ Name = "Kafka (Internal)"; Host = "kafka.catest.svc.cluster.local"; Port = 9092 },
    @{ Name = "Qdrant (Internal)"; Host = "qdrant.catest.svc.cluster.local"; Port = 36334 },
    @{ Name = "Neo4j (Internal)"; Host = "neo4j.catest.svc.cluster.local"; Port = 37474 },
    @{ Name = "Gateway (External)"; Host = "localhost"; Port = 33080 }
)

$allPassed = $true

foreach ($svc in $services) {
    Write-Host "Checking $($svc.Name) ($($svc.Host):$($svc.Port))... " -NoNewline
    
    if ($svc.Name -like "*(Internal)*") {
        # Check if we can reach it from another pod
        $res = kubectl exec -n catest postgres-0 -- nc -z -v -w 5 $($svc.Host) $($svc.Port) 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK" -ForegroundColor Green
        } else {
            Write-Host "FAILED" -ForegroundColor Red
            Write-Host "  Error: $res" -ForegroundColor Gray
            $allPassed = $false
        }
    } else {
        # Check localhost external port
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.ReceiveTimeout = 2000
            $tcp.SendTimeout = 2000
            $connect = $tcp.BeginConnect($svc.Host, $svc.Port, $null, $null)
            $wait = $connect.AsyncWaitHandle.WaitOne(2000, $false)
            if ($wait) {
                $tcp.EndConnect($connect)
                Write-Host "OK" -ForegroundColor Green
            } else {
                Write-Host "FAILED (Timeout)" -ForegroundColor Red
                $allPassed = $false
            }
            $tcp.Close()
        } catch {
            Write-Host "FAILED ($($_.Exception.Message))" -ForegroundColor Red
            $allPassed = $false
        }
    }
}

Write-Host "`nChecking Pod Status..."
$pods = kubectl get pods -n catest --no-headers
$failedPods = $pods | Where-Object { $_ -notmatch "Running" -and $_ -notmatch "Completed" }

if ($failedPods) {
    Write-Host "Warning: Some pods are not in Running/Completed state:" -ForegroundColor Yellow
    $failedPods | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    $allPassed = $false
} else {
    Write-Host "All pods look good!" -ForegroundColor Green
}

if ($allPassed) {
    Write-Host "`nSmoke Test PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`nSmoke Test FAILED" -ForegroundColor Red
    exit 1
}
