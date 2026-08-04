# cleanup-nul-files.ps1
# Script to delete all "nul" files from the repository
# This script is designed to be called as a Claude Code hook

$RepositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Write-Host "Cleaning up 'nul' files from repository..." -ForegroundColor Yellow

# Find all files named exactly "nul" (case-insensitive)
$nulFiles = Get-ChildItem -Path $RepositoryRoot -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq "nul" }

if ($nulFiles.Count -eq 0) {
    Write-Host "No 'nul' files found." -ForegroundColor Green
    exit 0
}

Write-Host "Found $($nulFiles.Count) 'nul' file(s):" -ForegroundColor Cyan
foreach ($file in $nulFiles) {
    Write-Host "  - $($file.FullName)" -ForegroundColor Gray
}

# Delete each nul file
$deletedCount = 0
foreach ($file in $nulFiles) {
    try {
        Remove-Item -Path $file.FullName -Force -ErrorAction Stop
        Write-Host "Deleted: $($file.FullName)" -ForegroundColor Green
        $deletedCount++
    }
    catch {
        Write-Host "Failed to delete: $($file.FullName) - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nCleanup complete. Deleted $deletedCount file(s)." -ForegroundColor Green
exit 0
