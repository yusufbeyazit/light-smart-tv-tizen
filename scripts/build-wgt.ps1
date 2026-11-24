<#
.SYNOPSIS
    Nuvio Live - Samsung Tizen 3.0 (.wgt) Paketleme ve TV Yukleme Araci
    Onemli: PowerShell Compress-Archive Windows '\' ayiricisi yazdigi icin
    Tizen (Linux) icinde css/app.css ve js/*.js acilmaz. Bu betik kesin POSIX '/'
    yollariyla ZipArchive olusturur!
.EXAMPLE
    .\scripts\build-wgt.ps1
    .\scripts\build-wgt.ps1 -TvIp 192.168.1.45 -CertProfile "SamsungCert"
#>
param(
    [string]$TvIp = "",
    [string]$CertProfile = "",
    [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DistPath = Join-Path $ProjectRoot $OutputDir
$StagePath = Join-Path $DistPath "wgt-stage"
$WgtPath = Join-Path $DistPath "LightSmartTV-Tizen3.wgt"

Write-Host "=== Light Smart TV (Tizen 3.0) Paketleme ===" -ForegroundColor Cyan

# Ensure icon.png exists
$IconPng = Join-Path $ProjectRoot "icon.png"
if (-not (Test-Path $IconPng)) {
    Write-Host "[1/4] icon.png olusturuluyor (512x512)..." -ForegroundColor Yellow
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap(512, 512)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 0)),
        (New-Object System.Drawing.Point(512, 512)),
        [System.Drawing.Color]::FromArgb(7, 16, 34),
        [System.Drawing.Color]::FromArgb(14, 31, 66)
    )
    $g.FillRectangle($bgBrush, 0, 0, 512, 512)
    $accentBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(120, 120)),
        (New-Object System.Drawing.Point(390, 390)),
        [System.Drawing.Color]::FromArgb(0, 229, 255),
        [System.Drawing.Color]::FromArgb(37, 99, 235)
    )
    $font = New-Object System.Drawing.Font("Segoe UI", 230, [System.Drawing.FontStyle]::Bold)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("L", $font, $accentBrush, (New-Object System.Drawing.RectangleF(0, 0, 512, 512)), $sf)
    $liveBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 59, 92))
    $g.FillEllipse($liveBrush, 370, 96, 48, 48)
    $bmp.Save($IconPng, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

# Clean stage
if (Test-Path $StagePath) { Remove-Item -Recurse -Force $StagePath }
New-Item -ItemType Directory -Force -Path $StagePath | Out-Null

Write-Host "[2/4] Uygulama dosyalari hazirlaniyor..." -ForegroundColor Yellow
Copy-Item (Join-Path $ProjectRoot "config.xml") $StagePath
Copy-Item (Join-Path $ProjectRoot "index.html") $StagePath
Copy-Item $IconPng $StagePath
$FeatherIcon = Join-Path $ProjectRoot "icon-feather.png"
if (Test-Path $FeatherIcon) { Copy-Item $FeatherIcon $StagePath }
Copy-Item -Recurse (Join-Path $ProjectRoot "css") $StagePath
Copy-Item -Recurse (Join-Path $ProjectRoot "js") $StagePath
if (Test-Path (Join-Path $ProjectRoot "assets")) {
    Copy-Item -Recurse (Join-Path $ProjectRoot "assets") $StagePath
}

function New-PosixZipFromDirectory {
    param([string]$SourceDir, [string]$DestZip)
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path $DestZip) { Remove-Item -Force $DestZip }

    $baseFull = (Resolve-Path $SourceDir).Path.TrimEnd('\', '/')
    $fs = [System.IO.File]::Open($DestZip, [System.IO.FileMode]::Create)
    $zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        # Add directory entries first (POSIX '/')
        $dirs = Get-ChildItem -Path $baseFull -Recurse -Directory | Sort-Object FullName
        foreach ($d in $dirs) {
            $relDir = $d.FullName.Substring($baseFull.Length + 1).Replace('\', '/') + '/'
            $null = $zip.CreateEntry($relDir)
        }
        # Add file entries with explicit POSIX '/' paths
        $files = Get-ChildItem -Path $baseFull -Recurse -File | Sort-Object FullName
        foreach ($f in $files) {
            $relFile = $f.FullName.Substring($baseFull.Length + 1).Replace('\', '/')
            $entry = $zip.CreateEntry($relFile, [System.IO.Compression.CompressionLevel]::Optimal)
            $entryStream = $entry.Open()
            $fileStream = [System.IO.File]::OpenRead($f.FullName)
            try {
                $fileStream.CopyTo($entryStream)
            } finally {
                $fileStream.Dispose()
                $entryStream.Dispose()
            }
        }
    } finally {
        $zip.Dispose()
        $fs.Dispose()
    }
}

# Check if Tizen CLI is installed for official signed WGT
$TizenCmd = Get-Command tizen -ErrorAction SilentlyContinue
if ($TizenCmd -and $CertProfile) {
    Write-Host "[3/4] Tizen CLI ile imzali .wgt olusturuluyor (Profil: $CertProfile)..." -ForegroundColor Green
    & tizen package -t wgt -s $CertProfile -- $StagePath -o $DistPath
} else {
    Write-Host "[3/4] POSIX '/' uyumlu .wgt arsivi olusturuluyor..." -ForegroundColor Yellow
    New-PosixZipFromDirectory -SourceDir $StagePath -DestZip $WgtPath
    Write-Host "Paket olusturuldu: $WgtPath" -ForegroundColor Green
    if (-not $TizenCmd) {
        Write-Host "Not: TV'ye yuklemek icin Tizen Studio veya tizen-cli ile Samsung sertifikasiyla imzalayin." -ForegroundColor Gray
    }
}

# Verify zero backslashes inside WGT
Add-Type -AssemblyName System.IO.Compression.FileSystem
$checkZip = [System.IO.Compression.ZipFile]::OpenRead($WgtPath)
$badEntries = $checkZip.Entries | Where-Object { $_.FullName.Contains('\') }
$entryCount = $checkZip.Entries.Count
$checkZip.Dispose()
if ($badEntries) {
    throw "HATA: WGT arsivinde ters egik cizgi (\) bulundu!"
}
Write-Host "[OK] Dogrulandi: $entryCount dosya POSIX '/' yolu ile paketlendi." -ForegroundColor Green

# Optional TV install via SDB + Tizen CLI
if ($TvIp -and $TizenCmd) {
    Write-Host "[4/4] Samsung TV ($TvIp) baglantisi kuruluyor ve kuruluyor..." -ForegroundColor Cyan
    & sdb connect "${TvIp}:26101"
    $BuiltWgt = Get-ChildItem $DistPath -Filter "*.wgt" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($BuiltWgt) {
        & tizen install -n $BuiltWgt.Name -t $TvIp -- $DistPath
        Write-Host "Kurulum tamamlandi! TV'deki Uygulamalar bolumunden 'Nuvio Live' uygulamasini acabilirsiniz." -ForegroundColor Green
    }
}
