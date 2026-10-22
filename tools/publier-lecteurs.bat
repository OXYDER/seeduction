@echo off
cd /d "%~dp0.."
node tools\publier-lecteurs.mjs %*
echo.
pause
