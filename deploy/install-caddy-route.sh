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

# Put both applications in mutually-exclusive handle blocks. A bare fallback
# reverse_proxy is sorted before handle_path by Caddy, so the old form sent
# Celino requests to Ohmium. This migration also upgrades the earlier route
# wrapper without touching any other virtual host.
if grep -q 'CELINO_ORDERED_ROUTE' "$CADDYFILE"; then
  awk '
    /# CELINO_ORDERED_ROUTE/ { skip_route_open = 1; next }
    skip_route_open && /^  route \{$/ { skip_route_open = 0; next }
    /^  reverse_proxy ohmium-core:4210$/ {
      print "  handle {"
      print "    reverse_proxy ohmium-core:4210"
      print "  }"
      skip_close = 1
      next
    }
    skip_close && /^  \}$/ { skip_close = 0; next }
    { print }
  ' "$CADDYFILE" > "${CADDYFILE}.celino-tmp"
  mv "${CADDYFILE}.celino-tmp" "$CADDYFILE"
fi

# Fresh installs also need the Ohmium fallback wrapped so the two handle
# directives form one exclusive routing group.
if ! grep -q 'CELINO_HANDLE_FALLBACK' "$CADDYFILE"; then
  sed -i '/# CELINO_SHARED_ROUTE/i\  # CELINO_HANDLE_FALLBACK' "$CADDYFILE"
  if grep -q '^  reverse_proxy ohmium-core:4210$' "$CADDYFILE"; then
    sed -i '/^  reverse_proxy ohmium-core:4210$/c\  handle {\
    reverse_proxy ohmium-core:4210\
  }' "$CADDYFILE"
  fi
fi

cd /opt/cennomo
docker compose -f docker-compose.production.yml exec -T caddy caddy validate --config /etc/caddy/Caddyfile
docker compose -f docker-compose.production.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile
