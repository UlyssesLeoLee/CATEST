# e:\CATEST\port-config.test.ps1

$ErrorActionPreference = "Stop"

# Load the target functions
. ./port-config.ps1 -Probe

function New-TestTcpListener([int]$Port) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    return $listener
}

$Failed = 0
$Passed = 0

function Assert-Equal($Expected, $Actual, $Message) {
    if ($Expected -eq $Actual) {
        Write-Host "  [PASS] $Message" -ForegroundColor Green
        $script:Passed++
    } else {
        Write-Host "  [FAIL] $Message (Expected: $Expected, Got: $Actual)" -ForegroundColor Red
        $script:Failed++
    }
}

Write-Host "Running UT for Test-PortAlive..." -ForegroundColor Cyan

# Test 1: Closed port
$resClosed = Test-PortAlive -Port 40002
Assert-Equal "closed" $resClosed "No listener returns 'closed'"

# Test 2: Known TCP port (Memgraph 37687)
$resKnownTCPCheck = Test-PortAlive -Port 37687
Assert-Equal "alive" $resKnownTCPCheck "Known TCP-only port (37687) correctly returns 'alive'"

# Test 3: Known TCP port (VisualVS 37788)
$resVisualVSTCPCheck = Test-PortAlive -Port 37788
Assert-Equal "alive" $resVisualVSTCPCheck "Known TCP-only port (37788) correctly returns 'alive'"

# Test 4: Unknown pure TCP listener (simulating the vpnkit ghost for web ports)
$tcpGhost = New-TestTcpListener 40000
Start-Sleep -Milliseconds 200
$resGhost = Test-PortAlive -Port 40000
Assert-Equal "dead" $resGhost "Unknown TCP-only port returns 'dead'"
$tcpGhost.Stop()

# Test 5: Known HTTP port (Envoy Gateway 33088)
$resHttp = Test-PortAlive -Port 33088
Assert-Equal "alive" $resHttp "Live HTTP port (Envoy Gateway 33088) correctly returns 'alive'"

Write-Host "`nTest Summary: $Passed Passed, $Failed Failed" -ForegroundColor Cyan
if ($Failed -gt 0) { exit 1 } else { exit 0 }
