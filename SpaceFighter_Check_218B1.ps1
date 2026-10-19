#Requires -Version 5.1
<#
    Space Fighter Graphics 2.1.8-B1 - Windows pre-B2 technical audit v1.1
    Run from PowerShell 5.1 or 7. Does not install/update packages,
    delete assets, change Firebase, or start the production game/server.
    Note: npm run build invokes the project's prebuild manifest generation
    and writes client/dist. Use -SkipBuild to avoid these build writes.
#>
[CmdletBinding()]
param(
    [string]$ProjectRoot = '',
    [switch]$SkipBuild,
    [switch]$SkipHashBaseline,
    [switch]$IncludeServerTests,
    [switch]$RefreshManifest,
    [switch]$ManualQAConfirmed
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ExpectedVersion = '1.2.1-graphics21.8-assetsB1.0'
$ExpectedTests = 136
$ExpectedVisualProfiles = 101
$ExpectedAtlases = 30
$ExpectedStates = 7
$script:Results = New-Object 'System.Collections.Generic.List[object]'
$script:Runs = New-Object 'System.Collections.Generic.List[object]'

function Add-AuditResult {
    param([string]$Status, [string]$Name, [string]$Detail)
    $script:Results.Add([pscustomobject]@{
        Status = $Status; Check = $Name; Detail = $Detail
    }) | Out-Null
    $color = switch ($Status) { 'PASS' { 'Green' } 'WARN' { 'Yellow' } default { 'Red' } }
    Write-Host "[$Status] $Name - $Detail" -ForegroundColor $color
}

function Get-Metric {
    param([string]$Text, [string]$Name)
    $pattern = '(?m)^[^\r\n]*?\b' + [regex]::Escape($Name) + '\s+(\d+)\s*$'
    $hits = [regex]::Matches($Text, $pattern)
    if ($hits.Count -gt 0) { return [int]$hits[$hits.Count - 1].Groups[1].Value }
    return -1
}

function Invoke-AuditCommand {
    param([string]$Name, [string]$WorkDir, [string[]]$Arguments)
    $safeName = $Name -replace '[^A-Za-z0-9_-]', '_'
    $logPath = Join-Path $script:RunDirectory ($safeName + '.log')
    Write-Host "[RUN ] $Name ($($Arguments -join ' ')) ..." -ForegroundColor Cyan
    $exitCode = 999
    $previousPreference = $ErrorActionPreference
    try {
        Push-Location -LiteralPath $WorkDir
        try {
            # npm.cmd instead of npm.ps1: works with common Windows execution policies.
            $ErrorActionPreference = 'Continue'
            & $script:NpmPath @Arguments 2>&1 | ForEach-Object { $_.ToString() } |
                Out-File -LiteralPath $logPath -Encoding UTF8
            $exitCode = [int]$LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousPreference
            Pop-Location
        }
    } catch {
        $ErrorActionPreference = $previousPreference
        ("COMMAND ERROR: " + $_.Exception.Message) | Out-File -LiteralPath $logPath -Encoding UTF8 -Append
    }
    $text = if (Test-Path -LiteralPath $logPath) {
        [string](Get-Content -LiteralPath $logPath -Raw -Encoding UTF8)
    } else { '' }
    $record = [pscustomobject]@{ Name=$Name; ExitCode=$exitCode; Log=$logPath }
    $script:Runs.Add($record) | Out-Null
    return [pscustomobject]@{ ExitCode=$exitCode; Text=$text; Log=$logPath }
}

function Assert-AuditCommand {
    param([string]$Name, [string[]]$Arguments, [string]$Pattern, [string]$WorkDir)
    if (-not $WorkDir) { $WorkDir = $script:ClientDir }
    $result = Invoke-AuditCommand -Name $Name -WorkDir $WorkDir -Arguments $Arguments
    $matched = ([string]::IsNullOrWhiteSpace($Pattern) -or [regex]::IsMatch($result.Text,$Pattern))
    if ($result.ExitCode -eq 0 -and $matched) {
        Add-AuditResult 'PASS' $Name 'Command exit=0; expected output found.'
    } else {
        Add-AuditResult 'FAIL' $Name "Exit=$($result.ExitCode); expected pattern=$Pattern; see $($result.Log)"
    }
    return $result
}

function Save-Report {
    param([string]$Root, [string]$Version)
    $countPass = @($script:Results | Where-Object Status -eq 'PASS').Count
    $countWarn = @($script:Results | Where-Object Status -eq 'WARN').Count
    $countFail = @($script:Results | Where-Object Status -eq 'FAIL').Count
    $status = if ($countFail -gt 0) { 'FAIL' } elseif ($countWarn -gt 0) { 'PASS_WITH_WARNINGS' } else { 'PASS' }
    # PS 5.1 can throw 'Argument types do not match' on @($genericList).
    # Explicit ToArray() serializes the actual records, not the list wrapper.
    $payload = [ordered]@{
        Audit='Graphics 2.1.8-B1 pre-B2'
        Timestamp=(Get-Date).ToString('o')
        ProjectRoot=$Root
        Version=$Version
        Status=$status
        Summary=[ordered]@{PASS=$countPass; WARN=$countWarn; FAIL=$countFail}
        ManualQA=[ordered]@{ ConfirmedByUser=[bool]$ManualQAConfirmed; VerifiedByScript=$false; Criteria=7 }
        ReleaseArtworkApproval='Not tested as release-ready; temporary assets are for development.'
        Results=$script:Results.ToArray()
        CommandLogs=$script:Runs.ToArray()
    }
    $json = $payload | ConvertTo-Json -Depth 8
    $jsonPath = Join-Path $script:RunDirectory 'B1_Audit_Report.json'
    $txtPath = Join-Path $script:RunDirectory 'B1_Audit_Report.txt'
    [System.IO.File]::WriteAllText($jsonPath,$json,[System.Text.UTF8Encoding]::new($false))
    $lines = New-Object 'System.Collections.Generic.List[string]'
    $lines.Add("SpaceFighter B1 audit: $status ($countPass PASS, $countWarn WARN, $countFail FAIL)")
    $lines.Add("Project: $Root")
    $lines.Add("Version: $Version")
    $lines.Add('---')
    foreach ($row in $script:Results) { $lines.Add("[$($row.Status)] $($row.Check): $($row.Detail)") }
    $lines.Add('---')
    $lines.Add('Manual QA is not automatable here; the 7 gameplay checks must be confirmed by a human.')
    $lines.Add('B1 does not claim enemy/Boss GLB, skeletal animation, persistent death animation, or production asset approval.')
    $lines.Add("Logs: $($script:RunDirectory)")
    [System.IO.File]::WriteAllLines($txtPath,[string[]]$lines,[System.Text.UTF8Encoding]::new($false))
    Write-Host ''
    Write-Host "RESULT: $status | PASS=$countPass WARN=$countWarn FAIL=$countFail" -ForegroundColor $(if ($countFail -eq 0) { 'Green' } else { 'Red' })
    Write-Host "Text report: $txtPath"
    Write-Host "JSON report: $jsonPath"
    return $countFail
}

# Baseline fingerprints are pinned to the verified B1 FULL SOURCE.
# The GENERATED asset availability manifest is intentionally excluded:
# it must change when the user installs 30 temporary atlases.
$PinnedB1Sha256 = @{
    "client/package.json" = "79a08d4b98549216fdcadd93a2cfcea5a0fd253a2d41e6c793b4b4f6e5004998"
    "client/src/components/Campaign/CampaignScene.js" = "681de20b3d1a68f7b5098e413b2b2c145a02b8fbfbb4148609cd31125c6d9117"
    "client/src/components/Dungeon/DungeonScene.js" = "818db89c2d62a2793f473913a2aeca0ee95236b967c12802154be996b20a77e9"
    "client/src/game/assets/AssetPlaceholder.js" = "51960b142bec8d9e76e884e11daf56c41d75c05e2c9c019cbfc9952fe5bac479"
    "client/src/game/assets/AssetRegistry.js" = "2a2d07f0fc6b3c823bbc6bd3ecf4b92ac8afe3339b561b548d155b90998bc0ce"
    "client/src/game/assets/EnemyBossAnimationCatalog.js" = "bf854e0e9a8afa9dcbe70624e62d35708f52b2d183c8df8ed7ddf6dfbaa60eb3"
    "client/src/game/catalog/BackgroundArtDirection.js" = "08f74b979fbb5e374e7bf31ef45627ccf2c82b2c3ca7649f5b3ce7a059f2864c"
    "client/src/game/catalog/BackgroundCatalog.js" = "c08a7787428acbd7ad081e2fc0dcbb77db142a036efc1261c5192ecb2b270e53"
    "client/src/game/catalog/aircraft.js" = "e4d5f6b29f48f6859d1712705ff16e9e0788af01a3f5909edb6b59b6606b17a2"
    "client/src/game/catalog/economy.js" = "06f013ebbbfa8750ea0aff16e948e32c6f7df8a7b555a5fe0930a20647ddfa9d"
    "client/src/game/catalog/events.js" = "bd07c999a7239b0365d76755e31de77862346c7965f541e0e836d8c4a73b1c37"
    "client/src/game/catalog/gear.js" = "ac3065f66ceac968650fb4a52246d0cea6dc70cc7e17d5795ae014dae0411dea"
    "client/src/game/catalog/missions.js" = "f2fdfe877c3257325bce575448df9b16c59068572c9dc4d4fc96edede220c6d8"
    "client/src/game/catalog/pilots.js" = "1cd2655cecb34fe33f051eb26a75f5f8a400f2a663e4a5448c6587e41560c7cf"
    "client/src/game/catalog/profileDefaults.js" = "87061bb3904faa2dad4eed1e4c658cf4f2abfd66d770c85947911adde0cabb6e"
    "client/src/game/catalog/progression.js" = "b147571abc833ec2e01743b7de38001d1cfa8662795be8a240728ef5a5142812"
    "client/src/game/catalog/uiLegacy.js" = "11b7a9b52be7daa2400384978ddf520df2fd8c3ac90a4b299b8cfc7b89fe6caa"
    "client/src/game/catalog/worlds.js" = "2c0392a66014db6946f46c78a74456f2ba4492f73ed8ebf224bd4a69998f481d"
    "client/src/game/combat/ActiveEffects.js" = "d24f400b320a33bda01e9f24c0a08475d653f2ca158ea7d2e975dd96ea1c3490"
    "client/src/game/combat/BattlePassives.js" = "4ebc218075740a39e0524d442af03d4efd2fe3d1d1e5843bdb91345be3f89ed6"
    "client/src/game/combat/PlayerWeapons.js" = "5b0373bd0bcee36d9a2cf45eea49d92f8a080a8d9408b8cfbb819499c203df63"
    "client/src/game/combat/ProjectileEmitter.js" = "8851f7f0eb3e6c4ba3d4c1a8173fd4ec3df2ff21ab2d4f62da942c979121d903"
    "client/src/game/combat/ShipInputController.js" = "8a9e5557cbe3863c9b5ceb1458ab71e91c6c055a121c753a438b5142d3ea8f6d"
    "client/src/game/config/BattleRules.js" = "9e8d02de7173960280757364d7f96572a54bb84511e0f1b80b9f31b1013ab4c0"
    "client/src/game/config/DungeonDifficulty.js" = "a1f187dd8aecac24bbbbf3018bdc74f428b6e5335022e5388d94d1c0ee993782"
    "client/src/game/config/PerformanceProfiles.js" = "5f8e2ad41162fc632e60d2dcab7230be54339961eee3b0f381dea4f673531aed"
    "client/src/game/rendering/BattleBackgroundProfiler.js" = "7b9e2c29ceef4ce43db388881b3f98d28aca74ac20dfc494a896bf63b1c7e1a8"
    "client/src/game/rendering/BattleEntityVisual.js" = "f62754960f638ef9bc5afebb7175a6101bc8e7deb3d474b479018f9528fa2d58"
    "client/src/game/rendering/PlayerFxProfiles.js" = "3a5ada0237f1f7ac9e37e13670c31ca6590485dda2be395983b3563811f919d4"
    "client/src/game/rendering/ScrollingBackgroundRenderer.js" = "82a2390be90df8ef91bb3359856fc709c0fc111cf5ac4f5120b4c467656015a1"
    "client/src/game/rendering/ShipEngineFx.js" = "6950b06491e34b0e515ced14e9b69e2ecd4f42938e5f3583bd762c69e07f3d21"
    "client/src/game/rendering/ShipVisualCatalog.js" = "0413f60403cf6e2202e69b44b2860d79d8dcd037511cb3ba21f7fea053ac31f3"
    "client/src/game/rendering/ShipVisualFactory.js" = "ce06ccbe1ec1654518ed2156a3c40cf568268c0ccec8c567a9aa7d004670dbc3"
    "client/src/hooks/useAuth.jsx" = "fa2ea4da6451f5e78bfb03cdac022cdc4b135c1764bd86535da26364fb27152c"
    "client/src/services/gameApi.js" = "e71343ad195846892d1842c7afdaff54d122cfe10f63981b312371a017542233"
    "firebase.json" = "ad655190fde33d007f75e5867513c6000d61c4c3f8b574acacac2f676cc9007a"
    "security/firestore.rules" = "559742e1df00c0eb6f38f42172af526cfdf4c3184d0e2fad7b42d637ff10e674"
    "server/lib/economy.cjs" = "0633b05d2245c003adb6464f3d32b6622f38f9c91adf3f623efa7f3edda3b7d3"
    "server/lib/gameService.cjs" = "d65d860817001d1758f5a366af938e7f4158f9956f0a0b1e5c5578aba23ac1f7"
    "server/lib/legacyAttendanceRepair.cjs" = "c833e954ccb2bd24e7c5b7f697059f9880cc4218cee3822448f9009fb1814668"
    "server/lib/missionHistoryReconcile.cjs" = "d1bde58a74ca5a1261dc26f228740f4e6e0e3d5b35e955eba9a727834cf0cf10"
    "server/package.json" = "e966699b3df9904edf364e9e7b60dc5cfbbf12f39f4fbd801d555632269a8fd2"
    "server/server.js" = "6c9c253148a3e3731fa20d39eea08605d8051a92b834055256a4ea0dcaf6e3bb"
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'client/package.json')) {
        $ProjectRoot = $PSScriptRoot
    } else {
        $ProjectRoot = Join-Path $env:USERPROFILE 'Desktop/SpaceFighter'
    }
}
if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
    Write-Host "FAIL: ProjectRoot does not exist: $ProjectRoot" -ForegroundColor Red
    Write-Host 'Example: .\SpaceFighter_Check_218B1.ps1 -ProjectRoot "C:\Users\TVH01374\Desktop\SpaceFighter"'
    exit 2
}
$Root = (Resolve-Path -LiteralPath $ProjectRoot).Path
$script:ClientDir = Join-Path $Root 'client'
$ServerDir = Join-Path $Root 'server'
$AuditDirectory = Join-Path $Root 'B1_AUDIT_REPORTS'
$script:RunDirectory = Join-Path $AuditDirectory ('B1_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $script:RunDirectory -Force | Out-Null
Write-Host '============================================================='
Write-Host 'SPACE FIGHTER 2.1.8-B1 - PRE-B2 CHECK' -ForegroundColor Cyan
Write-Host "PROJECT: $Root"
Write-Host "REPORT : $($script:RunDirectory)"
Write-Host '============================================================='
$version = '(unavailable)'

try {
    # 1. Source version and prerequisites.
    $package = Join-Path $script:ClientDir 'package.json'
    if (-not (Test-Path -LiteralPath $package -PathType Leaf)) {
        throw "Missing client/package.json: $package"
    }
    $version = [string]((Get-Content -LiteralPath $package -Raw -Encoding UTF8 | ConvertFrom-Json).version)
    if ($version -eq $ExpectedVersion) {
        Add-AuditResult 'PASS' 'B1 source version' $version
    } else {
        Add-AuditResult 'FAIL' 'B1 source version' "Actual=$version, expected=$ExpectedVersion"
    }
    $node = Get-Command 'node.exe' -ErrorAction SilentlyContinue
    $npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    if ($null -eq $node -or $null -eq $npm) {
        throw 'node.exe or npm.cmd not found. Install Node.js >= 20 and reopen PowerShell.'
    }
    $script:NpmPath = $npm.Source
    $nodeVersion = [string]((& $node.Source --version | Out-String).Trim())
    if ($nodeVersion -match '^v(\d+)\.' -and [int]$Matches[1] -ge 20) {
        Add-AuditResult 'PASS' 'Node.js version' $nodeVersion
    } else {
        Add-AuditResult 'FAIL' 'Node.js version' "Need >=20, found $nodeVersion"
    }
    if (Test-Path -LiteralPath (Join-Path $script:ClientDir 'node_modules/@babylonjs/core') -PathType Container) {
        Add-AuditResult 'PASS' 'Client dependencies' 'Babylon.js found in client/node_modules.'
    } else {
        Add-AuditResult 'FAIL' 'Client dependencies' 'Missing node_modules; run npm ci in client and retry.'
    }

    # 2. Protected-source hash comparison. Detect silent edits to combat/Firebase/server.
    if ($SkipHashBaseline) {
        Add-AuditResult 'WARN' 'B1 SHA-256 baseline' 'Skipped by -SkipHashBaseline. No assertion about source integrity.'
    } else {
        $drift = New-Object 'System.Collections.Generic.List[string]'
        foreach ($relativePath in $PinnedB1Sha256.Keys) {
            $file = Join-Path $Root $relativePath
            if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
                $drift.Add("MISSING $relativePath")
                continue
            }
            $realHash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
            if ($realHash -ine $PinnedB1Sha256[$relativePath]) { $drift.Add("CHANGED $relativePath") }
        }
        if ($drift.Count -eq 0) {
            Add-AuditResult 'PASS' 'B1 SHA-256 baseline' "$($PinnedB1Sha256.Count) critical source files unchanged (incl. Firebase, server, combat and scene adapters)."
        } else {
            $driftPath = Join-Path $script:RunDirectory 'B1_Source_Drift.txt'
            [System.IO.File]::WriteAllLines($driftPath,[string[]]$drift,[System.Text.UTF8Encoding]::new($false))
            Add-AuditResult 'FAIL' 'B1 SHA-256 baseline' "$($drift.Count) files differ; review $driftPath (legitimate local edits may require re-baselining)."
        }
    }

    # 3. Mandatory artifact inventory for the temporary B1 atlas rollout.
    $expectByKind = [ordered]@{enemy=12; boss=6; dungeon_enemy=9; dungeon_boss=3}
    $artBase = Join-Path $script:ClientDir 'public/images/visuals'
    $wrong = New-Object 'System.Collections.Generic.List[string]'
    $total = 0
    foreach ($kind in $expectByKind.Keys) {
        $dir = Join-Path $artBase $kind
        $found = if (Test-Path -LiteralPath $dir -PathType Container) {
            @(Get-ChildItem -LiteralPath $dir -Filter '*_sheet.webp' -File).Count
        } else { 0 }
        $total += $found
        if ($found -ne $expectByKind[$kind]) { $wrong.Add("$kind=$found/$($expectByKind[$kind])") }
    }
    if ($total -eq $ExpectedAtlases -and $wrong.Count -eq 0) {
        Add-AuditResult 'PASS' 'Temporary atlas folders' 'enemy=12, boss=6, dungeon_enemy=9, dungeon_boss=3 (30 sheets).'
    } else {
        Add-AuditResult 'FAIL' 'Temporary atlas folders' "Found=$total/30; $($wrong -join '; '). Check extraction under SpaceFighter root."
    }

    $approvalsFile = Join-Path $script:ClientDir 'assets/visual-art-approvals.json'
    if (Test-Path -LiteralPath $approvalsFile) {
        $approvals = (Get-Content -LiteralPath $approvalsFile -Raw -Encoding UTF8 | ConvertFrom-Json).approved
        $approvalCount = if ($null -eq $approvals) { 0 } else { @($approvals.PSObject.Properties).Count }
        if ($approvalCount -eq 0) {
            Add-AuditResult 'PASS' 'Temporary asset release gate' '0 commercially approved assets; correct for B1 development placeholders.'
        } else {
            Add-AuditResult 'WARN' 'Temporary asset release gate' "$approvalCount artwork approval entries; inspect review/license evidence."
        }
    } else {
        Add-AuditResult 'FAIL' 'Temporary asset release gate' 'Missing assets/visual-art-approvals.json.'
    }

    if ($RefreshManifest) {
        $refresh = Assert-AuditCommand 'refresh_manifest' @('run','assets:manifest') 'Generated\s+\d+\s+existing catalog art paths' $script:ClientDir
        if ($refresh.ExitCode -ne 0) { throw 'Manifest generation failed.' }
    }

    # 4. Existing project validators - do not simulate their results.
    $atlasRun = Invoke-AuditCommand 'enemy_boss_atlases' $script:ClientDir @('run','check:enemy-boss-art')
    $atlasPattern = '30 profiles,\s*30 delivered atlases,\s*7 states each'
    if ($atlasRun.ExitCode -eq 0 -and [regex]::IsMatch($atlasRun.Text,$atlasPattern)) {
        Add-AuditResult 'PASS' 'Enemy/Boss atlas validator' '30 profiles; 30 valid delivered WebP atlases; 7 states per profile.'
    } else {
        Add-AuditResult 'FAIL' 'Enemy/Boss atlas validator' "30/30 atlas check failed; see $($atlasRun.Log)"
    }
    $contracts = Invoke-AuditCommand 'visual_asset_contracts' $script:ClientDir @('run','check:asset-contracts')
    $contractOK = ($contracts.ExitCode -eq 0) -and
        ($contracts.Text -match 'Asset contracts\s+101\s+IDs:') -and
        ($contracts.Text -match 'PASS Asset availability manifest\s+\(\d+ existing catalog art paths\)') -and
        ($contracts.Text -match $atlasPattern)
    if ($contractOK) {
        Add-AuditResult 'PASS' 'Visual contract + manifest' '101 visual IDs, current generated manifest, 30 enemy/boss atlas profiles.'
    } else {
        Add-AuditResult 'FAIL' 'Visual contract + manifest' "Contract or manifest mismatch; see $($contracts.Log)."
    }
    [void](Assert-AuditCommand 'product_and_background_catalog' @('run','check:catalog') 'PASS manifest SHA-256 and dimensions:\s*8 assets verified' $script:ClientDir)
    [void](Assert-AuditCommand 'gameplay' @('run','check:gameplay') 'Phase2 gameplay static checks:\s*14/14 PASS' $script:ClientDir)
    [void](Assert-AuditCommand 'ship_graphics' @('run','check:graphics21') 'Graphics 2\.1 static checks:\s*12/12' $script:ClientDir)
    [void](Assert-AuditCommand 'security' @('run','check:safety') 'Phase1 static security checks:\s*14/14 PASS' $script:ClientDir)
    [void](Assert-AuditCommand 'relative_imports' @('run','check:imports') 'All relative import targets exist\.' $script:ClientDir)

    # 5. Comprehensive unit tests (including Babylon NullEngine).
    $tests = Invoke-AuditCommand 'npm_test' $script:ClientDir @('test')
    $testCount = Get-Metric $tests.Text 'tests'
    $testPass = Get-Metric $tests.Text 'pass'
    $testFail = Get-Metric $tests.Text 'fail'
    $testSkipped = Get-Metric $tests.Text 'skipped'
    if ($tests.ExitCode -eq 0 -and $testCount -ge $ExpectedTests -and $testPass -eq $testCount -and $testFail -eq 0 -and $testSkipped -eq 0) {
        Add-AuditResult 'PASS' 'Full client tests' "$testPass/$testCount PASS, 0 FAIL, 0 SKIP (min expected $ExpectedTests)."
    } else {
        Add-AuditResult 'FAIL' 'Full client tests' "count=$testCount pass=$testPass fail=$testFail skipped=$testSkipped exit=$($tests.ExitCode); see $($tests.Log)"
        # Log is preserved even when report serialization fails; print candidate headings for fast triage.
        $failureLines = @([regex]::Matches($tests.Text, '(?m)^\s*not ok\s+\d+\s+-\s+(.+)$') | ForEach-Object { $_.Groups[1].Value.Trim() })
        foreach ($heading in ($failureLines | Select-Object -First 10)) {
            Write-Host "[TEST FAIL] $heading" -ForegroundColor Red
        }
    }

    # 6. Build and optional bundle check.
    if ($SkipBuild) {
        Add-AuditResult 'WARN' 'Vite production build' 'Skipped by -SkipBuild. Existing dist may be outdated.'
    } else {
        $build = Invoke-AuditCommand 'vite_production_build' $script:ClientDir @('run','build')
        $builtIndex = Join-Path $script:ClientDir 'dist/index.html'
        $indexExists = Test-Path -LiteralPath $builtIndex -PathType Leaf
        $completedMarker = [regex]::IsMatch($build.Text, 'built in\s+[\d.,]+\s*s')
        if ($build.ExitCode -eq 0 -and $indexExists -and $completedMarker) {
            Add-AuditResult 'PASS' 'Vite production build' 'Exit=0; Vite completion marker and dist/index.html both verified.'
            [void](Assert-AuditCommand 'built_bundle_validation' @('run','check:bundle') 'PASS bundle output available for release review\.' $script:ClientDir)
            if ($build.Text -match 'Some chunks are larger than 500') {
                Add-AuditResult 'WARN' 'Large production chunks' 'Large lazy Babylon chunks remain; mobile/network performance needs separate QA.'
            }
        } elseif ($build.ExitCode -eq 0 -and $indexExists) {
            # Do not declare a source failure just because PowerShell mangled a Vite completion glyph/line.
            Add-AuditResult 'WARN' 'Vite production build' "Exit=0 and dist/index.html exists, but completion text could not be parsed; inspect $($build.Log)"
            [void](Assert-AuditCommand 'built_bundle_validation' @('run','check:bundle') 'PASS bundle output available for release review\.' $script:ClientDir)
        } else {
            Add-AuditResult 'FAIL' 'Vite production build' "Exit=$($build.ExitCode); dist/index.html exists=$indexExists; Vite marker=$completedMarker; see $($build.Log)"
        }
    }

    # 7. Optional server-side tests. Never connect to production.
    if ($IncludeServerTests) {
        if (-not (Test-Path -LiteralPath (Join-Path $ServerDir 'package.json'))) {
            Add-AuditResult 'FAIL' 'Server test prerequisite' 'Missing server/package.json.'
        } else {
            $serverTests = Invoke-AuditCommand 'server_tests' $ServerDir @('test')
            $serverPass = Get-Metric $serverTests.Text 'pass'
            $serverFail = Get-Metric $serverTests.Text 'fail'
            $serverSkip = Get-Metric $serverTests.Text 'skipped'
            if ($serverTests.ExitCode -eq 0 -and $serverPass -gt 0 -and $serverFail -eq 0 -and $serverSkip -eq 0) {
                Add-AuditResult 'PASS' 'Server tests' "$serverPass PASS, 0 FAIL, 0 SKIP"
            } elseif ($serverTests.ExitCode -eq 0 -and $serverSkip -gt 0) {
                Add-AuditResult 'WARN' 'Server tests' "$serverPass PASS, $serverSkip SKIPPED; server node_modules may be missing. See log."
            } else {
                Add-AuditResult 'FAIL' 'Server tests' "exit=$($serverTests.ExitCode) pass=$serverPass fail=$serverFail; see log."
            }
        }
    } else {
        Add-AuditResult 'WARN' 'Server test coverage' 'Not run (optional -IncludeServerTests). SHA baseline and client security checks still run.'
    }

    if ($ManualQAConfirmed) {
        Add-AuditResult 'PASS' 'Human B1 gameplay QA' 'User-confirmed 7/7 earlier; this script did not autonomously verify WebGL or FPS.'
    } else {
        Add-AuditResult 'WARN' 'Human B1 gameplay QA' 'Verify 7 in-game criteria independently; or pass -ManualQAConfirmed if already checked.'
    }

    Add-AuditResult 'WARN' 'B2 scope gate' 'Enemy/Boss GLB, skeletal animation, persistent death animation and runtime GPU LOD are NOT B1 features.'
} catch {
    Add-AuditResult 'FAIL' 'Audit execution' $_.Exception.Message
}

$failures = Save-Report -Root $Root -Version $version
if ($failures -gt 0) { exit 1 }
exit 0
