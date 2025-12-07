# Script to create .env files

Write-Host "Creating .env files..."

# Create .env.test
$envTest = "DATABASE_URL=`"postgresql://postgres:123456@localhost:5432/postgres?schema=public`"`nDB_HOST=localhost`nDB_USER=postgres`nDB_PASSWORD=123456`nDB_NAME=postgres`nDB_PORT=5432`nJWT_SECRET=your_jwt_secret`nJWT_EXPIRES_IN=1d`nPORT=5000`nNODE_ENV=development"

$envTest | Out-File -FilePath ".env.test" -Encoding ASCII

# Create .env.production
$envProd = "DATABASE_URL=`"postgresql://postgres:123456@localhost:5432/bluecode?schema=public`"`nDB_HOST=localhost`nDB_USER=postgres`nDB_PASSWORD=123456`nDB_NAME=bluecode`nDB_PORT=5432`nJWT_SECRET=your_jwt_secret`nJWT_EXPIRES_IN=1d`nPORT=5000`nNODE_ENV=production"

$envProd | Out-File -FilePath ".env.production" -Encoding ASCII

# Verify
if (Test-Path ".env.test") {
    Write-Host ".env.test created successfully"
}

if (Test-Path ".env.production") {
    Write-Host ".env.production created successfully"
}

Write-Host ""
Write-Host "Done! You can now use:"
Write-Host "  npm run dev:test      (postgres - TEST)"
Write-Host "  npm run dev:prod      (bluecode - PROD)"
