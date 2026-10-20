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

# Keep Ohmium isolated and serve Celino from its own TLS virtual host. Earlier
# dedicated-host checks read a stale bind mount; the host itself is valid.
if ! grep -q 'CELINO_ROUTE_V5' "$CADDYFILE"; then
  awk '
    /^ohmium\.167-99-74-236\.sslip\.io \{$/ {
      print
      print "  # CELINO_ROUTE_V5"
      print "  encode zstd gzip"
      print "  reverse_proxy ohmium-core:4210"
      replacing = 1
      next
    }
    replacing && /^  header \{$/ { replacing = 0; print; next }
    replacing { next }
    { print }
  ' "$CADDYFILE" > "${CADDYFILE}.celino-tmp"
  cat "${CADDYFILE}.celino-tmp" > "$CADDYFILE"
  rm "${CADDYFILE}.celino-tmp"
fi

cd /opt/cennomo
# Older deployments replaced the bind-mounted file inode. Recreate Caddy once
# when its mounted view lags behind the host file; subsequent edits preserve
# the inode and only require a zero-downtime reload.
if ! docker compose -f docker-compose.production.yml exec -T caddy grep -q 'CELINO_ROUTE_V5' /etc/caddy/Caddyfile; then
  docker compose -f docker-compose.production.yml up -d --force-recreate caddy
fi
docker compose -f docker-compose.production.yml exec -T caddy caddy validate --config /etc/caddy/Caddyfile
docker compose -f docker-compose.production.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile
