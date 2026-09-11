@echo off
title FloraCast 3D Server
cd /d "%~dp0server"
echo [FloraCast 3D] Starting server on http://localhost:5174 ...
node --dns-result-order=ipv4first server.js
pause
