#!/usr/bin/env bash
set -euo pipefail

printf "[1/5] Backend build...\n"
npm run build >/dev/null

printf "[2/5] Dashboard build...\n"
npm --prefix web-dashboard run build >/dev/null

printf "[3/5] Clinician app build...\n"
npm --prefix clinician-app run build >/dev/null

printf "[4/5] Backend smoke check endpoint list (static)...\n"
rg -n "app\.(get|post|put|delete)\(" src/local-server.ts >/dev/null

printf "[5/5] Kaggle smoke script syntax...\n"
python3 -m py_compile kaggle/smoke_test.py

printf "PREFLIGHT_OK\n"
