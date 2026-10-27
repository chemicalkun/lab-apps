param([switch]$DistributionZip)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$dist = Split-Path $root -Parent
$version = Get-Date -Format 'yy.MM.dd'
$zip = Join-Path $dist ("Chromato BRO Windows ver$version.zip")
$project = Join-Path $root 'src/GPCAnalyzer.csproj'
(Get-Content $project -Raw) -replace '<Version>[^<]+</Version>', "<Version>$version</Version>" | Set-Content $project -Encoding utf8
[xml]$projectXml = Get-Content $project -Raw
$fileVersionNode = $projectXml.SelectSingleNode('//FileVersion')
$revision = $fileVersionNode.InnerText.Split('.')[-1]
$fileVersionNode.InnerText = "$version.$revision"
$projectXml.Save($project)
$index = Join-Path $root 'Resources/www/index.html'
(Get-Content $index -Raw -Encoding utf8) -replace 'バージョン [0-9]+\.[0-9]+\.[0-9]+', "バージョン $version" | Set-Content $index -Encoding utf8
$out = Join-Path $dist 'Chromato BRO Windows'
$stage = Join-Path $root ('build/stage-' + [guid]::NewGuid())
try {
    dotnet publish (Join-Path $root 'src/GPCAnalyzer.csproj') -c Release -r win-x64 --self-contained true -p:EnableWindowsTargeting=true -o $stage
    if ($LASTEXITCODE -ne 0) { throw 'Windows build failed' }
    Copy-Item (Join-Path $root 'README.md') $stage
    Copy-Item (Join-Path $root 'WINDOWS_CHECKLIST.md') $stage
    Copy-Item (Join-Path $root 'VALIDATION.md') $stage
    Copy-Item (Join-Path $root 'はじめに.txt') $stage
    Copy-Item (Join-Path $root 'UPDATES.md') $stage
    Copy-Item (Join-Path $root 'インストール手順.txt') $stage
    if (Test-Path $out) { Remove-Item -LiteralPath $out -Recurse -Force }
    Move-Item -LiteralPath $stage -Destination $out
    $fileVersion = ([xml](Get-Content $project -Raw)).Project.PropertyGroup.FileVersion | Where-Object { $_ }
    @{version=$version;build=[int]($fileVersion.Split('.')[-1])} | ConvertTo-Json | Set-Content (Join-Path $out 'release-info.json') -Encoding utf8
    if ($DistributionZip) {
    $tempZip = Join-Path $root 'build/release.zip'
    Compress-Archive -LiteralPath $out -DestinationPath $tempZip -Force
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($tempZip)
    try { if ($archive.Entries.Count -eq 0) { throw 'Empty ZIP' } } finally { $archive.Dispose() }
    Move-Item -LiteralPath $tempZip -Destination $zip -Force
    foreach ($folder in @($dist, (Join-Path $root 'build'))) {
        Get-ChildItem -LiteralPath $folder -Filter 'Chromato BRO*.zip' -File | Where-Object { $_.FullName -ne $zip } | Remove-Item -Force
    }
    $hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath (Join-Path $root 'build/SHA256SUMS.txt') -Value ($hash + '  ' + (Split-Path $zip -Leaf)) -Encoding ascii
    }
    Write-Host "Build complete: $out"
} finally {
    if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
