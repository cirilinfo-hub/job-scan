# Starts a private MySQL 8 instance for local development (port 3307, data in .dev/mysql-data).
# It reuses the installed MySQL binaries and never touches the machine's MySQL80 service or its data.
param([string]$Bin = "C:\Program Files\MySQL\MySQL Server 8.0\bin", [int]$Port = 3307)
$root = Split-Path -Parent $PSScriptRoot
$data = Join-Path $root ".dev\mysql-data"
if (-not (Test-Path $data)) {
  New-Item -ItemType Directory -Force (Join-Path $root ".dev") | Out-Null
  & "$Bin\mysqld.exe" --no-defaults --initialize-insecure --datadir="$data" --console
}
Start-Process -FilePath "$Bin\mysqld.exe" -WindowStyle Hidden -ArgumentList @(
  "--no-defaults", "--datadir=`"$data`"", "--port=$Port", "--bind-address=127.0.0.1",
  "--mysqlx=OFF", "--enable-named-pipe=OFF", "--character-set-server=utf8mb4", "--collation-server=utf8mb4_0900_ai_ci"
)
Write-Output "MySQL dev instance starting on 127.0.0.1:$Port"
