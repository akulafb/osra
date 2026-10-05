# Shared settings for the verify-osra helpers. Sourced, not run.
OSRA_PORT=5173
OSRA_DEV_REF=djwqamcfllqziqiyvyjj
OSRA_VERIFY_ROOT=/tmp/osra-verify

osra_repo_root() {
  git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel
}

osra_port_pid() {
  lsof -nP -t -iTCP:"$OSRA_PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true
}

osra_require_run_dir() {
  if [[ -z "${1:-}" || ! -d "$1/state" ]]; then
    echo "usage: $(basename "$0") <run-dir>  (the RUN_DIR printed by launch.sh; state/ missing)" >&2
    exit 2
  fi
}
