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

# Reuse Ohmium's issued TLS endpoint. A route block preserves exact order:
# Celino's matched prefix is proxied first and Ohmium remains the fallback.
# Celino Core accepts the prefix, avoiding path-rewrite ordering ambiguity.
if ! grep -q 'CELINO_ROUTE_V3' "$CADDYFILE"; then
  awk '
    /^ohmium\.167-99-74-236\.sslip\.io \{$/ {
      print
      print "  # CELINO_ROUTE_V3"
      print "  encode zstd gzip"
      print "  route {"
      print "    reverse_proxy /celino-api/* celino-core:4320"
      print "    reverse_proxy ohmium-core:4210"
      print "  }"
      replacing = 1
      next
    }
    replacing && /^  header \{$/ { replacing = 0; print; next }
    replacing { next }
    { print }
  ' "$CADDYFILE" > "${CADDYFILE}.celino-tmp"
  mv "${CADDYFILE}.celino-tmp" "$CADDYFILE"
fi

cd /opt/cennomo
docker compose -f docker-compose.production.yml exec -T caddy caddy validate --config /etc/caddy/Caddyfile
docker compose -f docker-compose.production.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile
