#!/usr/bin/env sh
set -eu

CADDYFILE=/opt/cennomo/deploy/Caddyfile
MARKER='celino.167-99-74-236.sslip.io'
if [ ! -f "$CADDYFILE" ]; then
  echo "shared Caddyfile not found at $CADDYFILE" >&2
  exit 1
fi

if ! grep -q "$MARKER" "$CADDYFILE"; then
  cp "$CADDYFILE" "${CADDYFILE}.before-celino"
  cat >> "$CADDYFILE" <<'EOF'

celino.167-99-74-236.sslip.io {
  encode zstd gzip
  reverse_proxy celino-core:4320
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "no-referrer"
  }
}
EOF
fi

# Reuse Ohmium's already-issued TLS endpoint while the dedicated sslip.io
# certificate remains unavailable. handle_path removes /celino-api before the
# request reaches Celino Core, so its public API contract remains /api/*.
if ! grep -q 'CELINO_SHARED_ROUTE' "$CADDYFILE"; then
  sed -i '/^ohmium\.167-99-74-236\.sslip\.io {$/a\
  # CELINO_SHARED_ROUTE\
  handle_path /celino-api/* {\
    reverse_proxy celino-core:4320\
  }' "$CADDYFILE"
fi

cd /opt/cennomo
docker compose -f docker-compose.production.yml exec -T caddy caddy validate --config /etc/caddy/Caddyfile
docker compose -f docker-compose.production.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile
