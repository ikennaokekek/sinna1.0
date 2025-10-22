#!/usr/bin/env bash
set -eux
pwd
git rev-parse HEAD
node -v
yarn -v || true
echo "==== grep for ^3.0.8 across repo ===="
grep -R "\"rate-limiter-flexible\": \"\\^3\\.0\\.8\"" -n || true
grep -R "rate-limiter-flexible@\\^3\\.0\\.8" -n || true
echo "==== show package.json + lockfile from build root ===="
(cd apps/api && cat package.json && [ -f yarn.lock ] && echo "lockfile present" || echo "no lockfile")
echo "==== install+build from build root ===="
(cd apps/api && yarn install && yarn build) || true
