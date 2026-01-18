#!/bin/sh
set -e

ROLE="${ROLE:-web}"

if [ "$ROLE" = "web" ]; then
  echo "Running web container"

  python -m app.scripts.create_admin_user

  exec uvicorn main:app --host 0.0.0.0 --port 8000

elif [ "$ROLE" = "worker" ]; then
  echo "Running celery worker"

  exec celery -A app.worker.celery_app worker --loglevel=info

else
  echo "Unknown ROLE=$ROLE"
  exit 1
fi
