#!/usr/bin/env bash
# Back-compat wrapper: install-deps now runs the pending-requirements installer.
set -euo pipefail
exec "$(cd "$(dirname "$0")" && pwd)/install-pending.sh" "$@"
