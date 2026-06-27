#!/bin/sh
set -eu

if [ -z "${ADMIN_BASIC_AUTH_USERNAME:-}" ]; then
  echo "ADMIN_BASIC_AUTH_USERNAME is required for the internal admin console" >&2
  exit 1
fi

if [ -z "${ADMIN_BASIC_AUTH_PASSWORD:-}" ]; then
  echo "ADMIN_BASIC_AUTH_PASSWORD is required for the internal admin console" >&2
  exit 1
fi

if [ "${#ADMIN_BASIC_AUTH_PASSWORD}" -lt 16 ]; then
  echo "ADMIN_BASIC_AUTH_PASSWORD must be at least 16 characters" >&2
  exit 1
fi

printf '%s\n' "$ADMIN_BASIC_AUTH_PASSWORD" | htpasswd -ciB \
  /etc/nginx/admin.htpasswd \
  "$ADMIN_BASIC_AUTH_USERNAME" >/dev/null
chown root:nginx /etc/nginx/admin.htpasswd
chmod 640 /etc/nginx/admin.htpasswd
