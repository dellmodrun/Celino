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

# Reuse Ohmium's issued TLS endpoint without requesting another certificate.
# Both routes use handle, so Caddy treats them as one mutually-exclusive group.
if ! grep -q 'CELINO_ROUTE_V6' "$CADDYFILE"; then
  awk '
    /^ohmium\.167-99-74-236\.sslip\.io \{$/ {
      print
      print "  # CELINO_ROUTE_V6"
      print "  encode zstd gzip"
      print "  handle_path /celino-api/* {"
      print "    reverse_proxy celino-core:4320"
      print "  }"
      print "  handle {"
      print "    reverse_proxy ohmium-core:4210"
      print "  }"
      replacing = 1
      next
    }
    replacing && /^  header \{$/ { replacing = 0; print; next }
    replacing { next }
    /^celino\.167-99-74-236\.sslip\.io \{$/ { dropping = 1; depth = 1; next }
    dropping {
      copy = $0
      opens = gsub(/\{/, "{", copy)
      copy = $0
      closes = gsub(/\}/, "}", copy)
      depth += opens - closes
      if (depth <= 0) dropping = 0
      next
    }
    { print }
  ' "$CADDYFILE" > "${CADDYFILE}.celino-tmp"
  cat "${CADDYFILE}.celino-tmp" > "$CADDYFILE"
  rm "${CADDYFILE}.celino-tmp"
fi

cd /opt/cennomo
export CENNOMO_HOST="${CENNOMO_HOST:-167-99-74-236.sslip.io}"
COMPOSE='docker compose --env-file .env.production -f docker-compose.production.yml'
# Older deployments replaced the bind-mounted file inode. Recreate Caddy once
# when its mounted view lags behind the host file; subsequent edits preserve
# the inode and only require a zero-downtime reload.
if ! $COMPOSE exec -T caddy grep -q 'CELINO_ROUTE_V6' /etc/caddy/Caddyfile; then
  $COMPOSE up -d --force-recreate caddy
fi
$COMPOSE exec -T caddy caddy validate --config /etc/caddy/Caddyfile
$COMPOSE exec -T caddy caddy reload --config /etc/caddy/Caddyfile
