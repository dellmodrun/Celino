#!/usr/bin/env sh
set -eu

cd /opt/celino
mkdir -p data
chown -R 1000:1000 data

if [ ! -f .env.production ]; then
  umask 077
  cat > .env.production <<'EOF'
CELINO_ALLOWED_ORIGINS=https://celino.run,https://dellmodrun.github.io,http://127.0.0.1:4210,http://localhost:4210
CELINO_PUBLIC_URI=https://celino.run/
CELINO_SIGNIN_DOMAIN=celino.run
EOF
fi

if ! docker network inspect cennomo_default >/dev/null 2>&1; then
  echo "required Docker network cennomo_default is missing" >&2
  exit 1
fi

docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml ps
