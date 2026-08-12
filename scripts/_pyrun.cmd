@echo off
REM Cross-platform Python launcher for AI log hooks (Windows cmd.exe).
REM Tries py -3 -> python -> python3 in order, falling through whenever a
REM candidate exists on PATH but still fails to run (e.g. Scoop's py.exe
REM stub exists but "py -3" can't resolve a registered interpreter).
REM
REM Uses `cmd1 && cmd2` chaining rather than `if %ERRORLEVEL%==0 ...` inside
REM a parenthesized block: %ERRORLEVEL% expands once when a ( ) block is
REM parsed, so a check placed right after the command it's meant to test
REM silently reads the *previous* command's exit code instead (classic cmd.exe
REM delayed-expansion gotcha) and would always "succeed" here since the
REM preceding `where` check already returned 0.
REM
REM Exits 0 silently if no Python is found - hooks must never block the AI tool.

where py >nul 2>nul && py -3 %* && exit /b 0
where python >nul 2>nul && python %* && exit /b 0
where python3 >nul 2>nul && python3 %* && exit /b 0

set CODEX_PY=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
if exist "%CODEX_PY%" (
  "%CODEX_PY%" %*
  exit /b 0
)

exit /b 0
