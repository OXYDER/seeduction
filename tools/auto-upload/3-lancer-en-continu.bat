@echo off
chcp 65001 >nul
set "DIR=%~dp0"
where node >nul 2>nul
if errorlevel 1 echo Node.js n'est pas installe. Installe la version LTS depuis https://nodejs.org puis relance ce fichier. & start https://nodejs.org & pause & exit /b 1
if not exist "%DIR%cles.bat" echo Il manque le fichier cles.bat : copie cles.exemple.bat en cles.bat, ouvre-le avec le Bloc-notes et colle tes cles. & pause & exit /b 1
call "%DIR%cles.bat"
if not exist "%DIR%node_modules" echo Installation du module FTP, un instant... & call npm install --omit=dev --no-audit --no-fund --prefix "%DIR%"
if not exist "%DIR%config.json" copy "%DIR%config.appbox.example.json" "%DIR%config.json" >nul
echo.
echo === Import automatique en cours. Laisse cette fenetre ouverte ; ferme-la pour arreter. ===
node "%DIR%auto-upload.mjs" --config "%DIR%config.json" --watch
echo.
pause
