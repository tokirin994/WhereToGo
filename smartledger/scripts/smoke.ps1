$ErrorActionPreference = 'Stop'
$authUrl = 'http://127.0.0.1:8091/realms/local/mock-session'
$apiUrl = 'http://127.0.0.1:8090'
$webUrl = 'http://127.0.0.1:5174'
$subject = "smoke-$([guid]::NewGuid().ToString('N'))"
$passed = [System.Collections.Generic.List[string]]::new()

function Assert($condition, $message) {
    if (-not $condition) { throw "FAILED: $message" }
    $script:passed.Add($message)
}

function Get-Json($url, $headers = @{}) { Invoke-RestMethod $url -Headers $headers -TimeoutSec 10 }
function Post-Json($url, $body, $headers = @{}) { Invoke-RestMethod $url -Method Post -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 10 }

$health = Get-Json "$apiUrl/actuator/health"
Assert ($health.status -eq 'UP') 'SmartLedger API health'

try {
    Invoke-WebRequest "$apiUrl/api/v1/books" -UseBasicParsing -TimeoutSec 10 | Out-Null
    throw 'Unauthenticated request unexpectedly succeeded'
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Assert ($status -eq 401) 'API rejects requests without a token'
}

$session = Get-Json "$authUrl`?sub=$subject"
$headers = @{ Authorization = "Bearer $($session.access_token)" }
$otherSession = Get-Json "$authUrl`?sub=$subject-other"
$otherHeaders = @{ Authorization = "Bearer $($otherSession.access_token)" }

$bookBody = @{ name = 'Smoke daily book'; displayName = 'isolated smoke user' } | ConvertTo-Json
$book = Post-Json "$apiUrl/api/v1/books" $bookBody $headers
$books = Get-Json "$apiUrl/api/v1/books" $headers
Assert ($books.id -contains $book.id) 'create and list owned books'

$detail = Get-Json "$apiUrl/api/v1/books/$($book.id)" $headers
Assert ($detail.name -eq 'Smoke daily book') 'read book detail'
$emptySummary = Get-Json "$apiUrl/api/v1/books/$($book.id)/summary" $headers
Assert ($emptySummary.transactionCount -eq 0) 'empty book summary'

$transactionBody = @{
    title = 'Smoke coffee'; amount = 12.5; kind = 'expense'; happenedAt = (Get-Date).ToUniversalTime().ToString('o')
    merchant = 'Smoke cafe'; paymentMethod = 'WeChat'; currency = 'CNY'; note = 'isolated API smoke record'
} | ConvertTo-Json
$transaction = Post-Json "$apiUrl/api/v1/books/$($book.id)/transactions" $transactionBody $headers
$transactions = Get-Json "$apiUrl/api/v1/books/$($book.id)/transactions" $headers
$summary = Get-Json "$apiUrl/api/v1/books/$($book.id)/summary" $headers
Assert ($transaction.title -eq 'Smoke coffee' -and $transactions.Count -eq 1) 'create and list transaction'
Assert ([decimal]$summary.expenses -eq [decimal]12.5 -and $summary.transactionCount -eq 1) 'transaction summary totals'

try {
    Invoke-WebRequest "$apiUrl/api/v1/books/$($book.id)" -Headers $otherHeaders -UseBasicParsing -TimeoutSec 10 | Out-Null
    throw 'Cross-account book access unexpectedly succeeded'
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Assert ($status -eq 404) 'book ownership isolation'
}

$initial = Get-Json "$apiUrl/api/v1/sync/snapshot" $headers
Assert ($initial.revision -eq 0) 'cloud snapshot starts at revision zero'
$cloudBody = @{
    schemaVersion = 3; expectedRevision = 0
    snapshot = @{ schemaVersion = 3; books = @(@{ id = $book.id; name = 'Smoke daily book' }); transactions = @(@{ id = $transaction.id; title = 'Smoke coffee'; amount = 12.5 }); budgets = @(); categories = @() }
} | ConvertTo-Json -Depth 20
$uploaded = Invoke-RestMethod "$apiUrl/api/v1/sync/snapshot" -Method Put -Headers $headers -ContentType 'application/json' -Body $cloudBody -TimeoutSec 10
$downloaded = Get-Json "$apiUrl/api/v1/sync/snapshot" $headers
Assert ($uploaded.revision -eq 1 -and $downloaded.snapshot.transactions.Count -eq 1) 'cloud snapshot push and pull'

try {
    $stale = @{ schemaVersion = 3; expectedRevision = 0; snapshot = @{ books = @(); transactions = @() } } | ConvertTo-Json -Depth 10
    Invoke-WebRequest "$apiUrl/api/v1/sync/snapshot" -Method Put -Headers $headers -ContentType 'application/json' -Body $stale -UseBasicParsing -TimeoutSec 10 | Out-Null
    throw 'Stale snapshot write unexpectedly succeeded'
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Assert ($status -eq 409) 'cloud snapshot stale revision conflict'
}

$tripId = [guid]::NewGuid().ToString()
$tripBody = @{ tripName = 'Smoke trip'; destination = 'Tokyo'; startsOn = '2026-11-01'; endsOn = '2026-11-03'; displayName = 'isolated smoke user' } | ConvertTo-Json
$tripOne = Post-Json "$apiUrl/api/v1/integrations/wheretogo/trips/$tripId/open" $tripBody $headers
$tripTwo = Post-Json "$apiUrl/api/v1/integrations/wheretogo/trips/$tripId/open" $tripBody $headers
Assert ($tripOne.bookId -eq $tripTwo.bookId) 'WhereToGo trip book creation is idempotent'

$webPage = Invoke-WebRequest $webUrl -UseBasicParsing -TimeoutSec 10
$worker = Invoke-WebRequest "$webUrl/tesseract/worker.min.js" -UseBasicParsing -TimeoutSec 10
$pdfWorker = Invoke-WebRequest "$webUrl/pdf.worker.min.mjs" -UseBasicParsing -TimeoutSec 10
Assert ($webPage.StatusCode -eq 200 -and $webPage.Content.Contains('SmartLedger')) 'SmartLedger Web workspace is served'
Assert ($worker.StatusCode -eq 200 -and $pdfWorker.StatusCode -eq 200) 'local OCR and PDF worker assets are served'

Write-Host "Passed $($passed.Count) SmartLedger smoke checks for isolated subject $subject"
$passed | ForEach-Object { Write-Host "  OK  $_" }
