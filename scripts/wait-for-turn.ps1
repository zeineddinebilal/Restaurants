# Blocks until .collab/TURN contains the given name, then prints the matching file.
# Used by the builder (Gemini in Antigravity) and the reviewer (Claude) to hand work back and forth.
#
#   powershell -ExecutionPolicy Bypass -File scripts/wait-for-turn.ps1 -For gemini
#
# Exit codes: 0 = it is now your turn; 2 = timed out, just run the same command again.
param(
    [Parameter(Mandatory = $true)][ValidateSet('gemini', 'claude')][string]$For,
    [int]$TimeoutMinutes = 50,
    [int]$PollSeconds = 15
)

$root = Split-Path -Parent $PSScriptRoot
$turnFile = Join-Path $root '.collab\TURN'
$deadline = (Get-Date).AddMinutes($TimeoutMinutes)

Write-Output "Waiting for TURN = '$For' (up to $TimeoutMinutes min)..."
while ((Get-Date) -lt $deadline) {
    if (Test-Path $turnFile) {
        $turn = (Get-Content $turnFile -Raw).Trim().ToLower()
        if ($turn -eq $For) {
            Write-Output "TURN = $For. Your turn now."
            $msg = if ($For -eq 'gemini') { '.collab\review.md' } else { '.collab\handoff.md' }
            $msgPath = Join-Path $root $msg
            if (Test-Path $msgPath) {
                Write-Output "----- $msg -----"
                Get-Content $msgPath -Raw
            }
            exit 0
        }
    }
    Start-Sleep -Seconds $PollSeconds
}
Write-Output "Still waiting (timeout). Run the same command again to keep waiting."
exit 2
