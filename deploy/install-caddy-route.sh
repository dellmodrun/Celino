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

# Reuse Ohmium's issued TLS endpoint. This Caddy adapter collapses repeated
# proxy directives inside route/handle groups, so select one upstream through
# a URI map and execute a single reverse_proxy directive.
if ! grep -q 'CELINO_ROUTE_V4' "$CADDYFILE"; then
  awk '
    /^ohmium\.167-99-74-236\.sslip\.io \{$/ {
      print
      print "  # CELINO_ROUTE_V4"
      print "  encode zstd gzip"
      print "  map {path} {celino_backend} {"
      print "    /celino-api/* celino-core:4320"
      print "    default ohmium-core:4210"
      print "  }"
      print "  reverse_proxy {celino_backend}"
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
