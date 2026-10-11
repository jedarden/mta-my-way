#!/bin/sh
set -eu

cd /app

PROTO_MODULE=/app/packages/server/dist/proto/compiled.js
if [ ! -s "$PROTO_MODULE" ]; then
  echo "Runtime image is missing required GTFS protobuf module: $PROTO_MODULE" >&2
  exit 1
fi
node --check "$PROTO_MODULE"

smoke_dir=$(mktemp -d /tmp/mta-runtime-smoke.XXXXXX)
server_pid=

cleanup() {
  if [ -n "$server_pid" ]; then
    kill -TERM "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -f /app/packages/server/data/vapid-keys.json
  rm -rf "$smoke_dir"
}
trap cleanup EXIT HUP INT TERM

run_mode() {
  mode=$1
  core_only=$2
  port=$3
  log_file="$smoke_dir/$mode.log"
  health_file="$smoke_dir/$mode-health.json"

  echo "Starting runtime image in $mode mode"
  CORE_ONLY="$core_only" \
    NODE_ENV=production \
    TEST_MODE=true \
    ALLOWED_HOSTS=localhost \
    EMAIL_PROVIDER=console \
    PORT="$port" \
    PUSH_DB_PATH="$smoke_dir/$mode.sqlite" \
    node packages/server/dist/index.js >"$log_file" 2>&1 &
  server_pid=$!

  ready=false
  attempt=0
  while [ "$attempt" -lt 30 ]; do
    if curl --silent --show-error --fail \
      "http://127.0.0.1:$port/healthz" >"$health_file" 2>/dev/null; then
      ready=true
      break
    fi
    if ! kill -0 "$server_pid" 2>/dev/null; then
      break
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  if [ "$ready" != true ] || ! grep -q '"status":"ok"' "$health_file"; then
    echo "Runtime image failed to become healthy in $mode mode" >&2
    cat "$log_file" >&2
    return 1
  fi
  if ! grep -q 'All startup checks passed.' "$log_file"; then
    echo "Runtime artifact checks did not run in $mode mode" >&2
    cat "$log_file" >&2
    return 1
  fi

  kill -TERM "$server_pid"
  if ! wait "$server_pid"; then
    server_pid=
    echo "Runtime image failed to stop cleanly in $mode mode" >&2
    cat "$log_file" >&2
    return 1
  fi
  server_pid=
}

run_mode core true 38173
run_mode stateful false 38174
echo "Runtime startup smoke check passed in core and stateful modes."
