#!/usr/bin/env bash
#
# dev-local.sh — one command to run Doppl locally.
#
# Ensures a local Postgres is up (Docker, only when DATABASE_URL points at a local
# host), then boots the API (migrate → seed → serve on :PORT) and the web dashboard
# together. Ctrl-C cleanly stops both. The Postgres container is left running for the
# next launch (`pnpm db:down` to stop it).
#
# Usage:  pnpm dev   (or)   bash scripts/dev-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="$ROOT/.env"
CONTAINER="doppl-pg"
PG_IMAGE="postgres:16"
AGARDEN_REPO_URL="${AGARDEN_REPO_URL:-https://github.com/Doppl-Life/agarden.git}"
AGARDEN_CACHE_DIR="${AGARDEN_CACHE_DIR:-$ROOT/.cache/agarden}"

# --- verify local runtime -----------------------------------------------------------
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo unknown)"
if [[ "$NODE_MAJOR" != "22" ]]; then
  echo "✗ Doppl local dev expects Node 22 LTS; found Node $(node -v 2>/dev/null || echo unknown)." >&2
  echo "  Try: nvm install 22 && nvm use 22" >&2
  exit 1
fi

# --- load .env (the API also loads it via tsx; we need DATABASE_URL here too) -------
if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ROOT/.env.example" ]]; then
    echo "• No .env found; creating one from .env.example."
    cp "$ROOT/.env.example" "$ENV_FILE"
  else
    echo "✗ No .env found at repo root, and .env.example is missing." >&2
    exit 1
  fi
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "✗ DATABASE_URL is not set in .env." >&2
  exit 1
fi

# An empty DOPPL_FIXTURE_DIR= line in .env defeats the code's module-relative default (it uses
# `?? DEFAULT`, and "" is not nullish), breaking the replay seed. Normalize empty → absolute default.
# (tsx --env-file only fills UNSET vars, so exporting it here wins over the empty .env value.)
if [[ -z "${DOPPL_FIXTURE_DIR:-}" ]]; then
  export DOPPL_FIXTURE_DIR="$ROOT/fixtures/replay"
fi

# --- parse DATABASE_URL with Node's URL parser (robust; node is always present) -----
eval "$(node -e '
  const u = new URL(process.env.DATABASE_URL);
  const out = {
    DB_HOST: u.hostname,
    DB_PORT: u.port || "5432",
    DB_USER: decodeURIComponent(u.username) || "postgres",
    DB_PASS: decodeURIComponent(u.password) || "",
    DB_NAME: u.pathname.replace(/^\//, "") || "postgres",
  };
  for (const [k, v] of Object.entries(out)) console.log(`${k}=${JSON.stringify(v)}`);
')"

# --- bring up a local Postgres if the DB host is local ------------------------------
is_local=0
case "$DB_HOST" in localhost | 127.0.0.1 | 0.0.0.0 | ::1) is_local=1 ;; esac

if [[ "$is_local" == 1 ]]; then
  if ! docker info >/dev/null 2>&1; then
    echo "⚠ DATABASE_URL is local but Docker isn't running."
    echo "  Start Docker (or start your own Postgres on ${DB_HOST}:${DB_PORT}) and re-run." >&2
    exit 1
  fi

  if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "✔ Postgres container '$CONTAINER' already running."
  elif docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "▶ Starting existing Postgres container '$CONTAINER'…"
    docker start "$CONTAINER" >/dev/null
  else
    echo "▶ Creating Postgres container '$CONTAINER' on :${DB_PORT}…"
    docker run -d --name "$CONTAINER" \
      -p "${DB_PORT}:5432" \
      -e POSTGRES_USER="$DB_USER" \
      -e POSTGRES_PASSWORD="${DB_PASS:-doppl}" \
      -e POSTGRES_DB="$DB_NAME" \
      "$PG_IMAGE" >/dev/null
  fi

  printf "⏳ Waiting for Postgres"
  for i in $(seq 1 30); do
    if docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
      echo " — ready."
      break
    fi
    printf "."
    sleep 1
    [[ "$i" == 30 ]] && echo " — timed out; continuing (the API will retry)."
  done
else
  echo "ℹ DATABASE_URL host is '$DB_HOST' (not local) — skipping Docker, using it as-is."
fi

# --- seed curated Agarden islands used by /agarden ---------------------------------
# Keep this best-effort: the inner organism view can still run without the imported
# Agarden demo data, but a fresh checkout should show the outer map with one command.
if [[ "${DOPPL_AUTO_SEED_AGARDEN:-1}" != "0" ]]; then
  if [[ -n "${AGARDEN_FLOW_DIR:-}" ]]; then
    AGARDEN_FLOW_ROOT="$AGARDEN_FLOW_DIR"
  else
    AGARDEN_FLOW_ROOT="$AGARDEN_CACHE_DIR/flow"
    if [[ -d "$AGARDEN_CACHE_DIR/.git" ]]; then
      echo "↻ Updating cached Agarden data…"
      git -C "$AGARDEN_CACHE_DIR" pull --ff-only >/dev/null || \
        echo "⚠ Could not update cached Agarden data; using the local cache."
    elif command -v git >/dev/null 2>&1; then
      echo "↓ Fetching Agarden data into .cache/agarden…"
      mkdir -p "$(dirname "$AGARDEN_CACHE_DIR")"
      git clone --depth 1 "$AGARDEN_REPO_URL" "$AGARDEN_CACHE_DIR" >/dev/null || \
        echo "⚠ Could not fetch Agarden data; /agarden will show only database-local runs."
    else
      echo "⚠ git is not installed; skipping Agarden demo-data fetch."
    fi
  fi

  if [[ -d "$AGARDEN_FLOW_ROOT" ]]; then
    echo "🌱 Seeding Agarden maps…"
    pnpm -C apps/api seed-outer-bloom \
      "$AGARDEN_FLOW_ROOT/jack-drone-privacy-fd080117" \
      jack-drone-privacy-fd080117 >/dev/null || \
      echo "⚠ Could not seed The Rock Star's Drone Problem."
    pnpm -C apps/api seed-outer-bloom \
      "$AGARDEN_FLOW_ROOT/when-the-crashes-dont-come-575845a4" \
      when-the-crashes-dont-come-575845a4 >/dev/null || \
      echo "⚠ Could not seed When the Crashes Don't Come."
  fi
else
  echo "ℹ DOPPL_AUTO_SEED_AGARDEN=0 — skipping Agarden demo-data seed."
fi

# --- run API + web together, clean shutdown on Ctrl-C -------------------------------
pids=()
cleanup() {
  echo
  echo "⏹ Stopping API + web…"
  for pid in "${pids[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "🚀 API on :${PORT:-3000}  ·  web dashboard on Vite (proxies /api → :${PORT:-3000})"
echo "   (Ctrl-C to stop both; Postgres stays up — 'pnpm db:down' to stop it.)"
echo

pnpm -C apps/api start &
pids+=($!)
pnpm -C apps/web dev &
pids+=($!)

wait
