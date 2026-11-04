#!/bin/sh
# Reinicia los datos del emulador, crea 3 sedes de prueba y corre la prueba E2E.
cd "$(dirname "$0")"
curl -s -X DELETE "http://127.0.0.1:8680/emulator/v1/projects/sano-farmacia/databases/(default)/documents" > /dev/null
curl -s -X DELETE "http://127.0.0.1:9699/emulator/v1/projects/sano-farmacia/accounts" > /dev/null
rm -f .accounts-emu.json
node provision.mjs 3 --emu > /dev/null && node e2e.mjs "http://127.0.0.1:5121" "${1:-shots}"
