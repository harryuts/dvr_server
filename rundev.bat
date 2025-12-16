@echo off
echo Starting DVR Server and Client for Development...

start "DVR Server" cmd /k "npm run dev"
cd client
start "NVR Client" cmd /k "npm run dev"

echo Development environment started.
