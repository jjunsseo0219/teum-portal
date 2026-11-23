@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [틈 Teum] 로컬 스튜디오 서버를 시작합니다...

where uv >nul 2>nul
if %errorlevel%==0 (
    uv run python scripts\dev_server.py
) else (
    python scripts\dev_server.py
)
pause
