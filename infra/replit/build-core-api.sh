#!/usr/bin/env bash
set -euo pipefail
corepack pnpm@10.26.1 install --frozen-lockfile
corepack pnpm@10.26.1 -C packages/types build
corepack pnpm@10.26.1 -C apps/api build
