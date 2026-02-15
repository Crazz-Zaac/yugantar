#!/bin/sh
set -e

ROLE="${ROLE:-web}"

# Common startup tasks
echo "==================================="
echo "Container Role: $ROLE"
echo "Python Version: $(python --version)"
echo "==================================="

# Wait for dependencies 
# if [ -n "$WAIT_FOR_DB" ]; then
#   echo "Waiting for database..."
#   python -m app.scripts.wait_for_db
# fi

case "$ROLE" in
  web)
    echo "Initializing web server..."
    
    # Run migrations (if using Alembic)
    if [ "$RUN_MIGRATIONS" = "true" ]; then
      echo "Running database migrations..."
      alembic upgrade head
    fi
    
    # Create admin user
    python -m app.scripts.create_admin_user
    
    echo "Starting Uvicorn..."
    exec uvicorn main:app \
      --host 0.0.0.0 \
      --port "${PORT:-8000}" \
      --reload
    ;;
    
  worker)
    echo "Starting Celery worker..."
    exec celery -A app.celery_app worker \
      --loglevel="${CELERY_LOG_LEVEL:-info}" \
      --concurrency="${CELERY_CONCURRENCY:-4}" \
      --max-tasks-per-child="${CELERY_MAX_TASKS_PER_CHILD:-50}"
    ;;
    
  beat)
    echo "Starting Celery beat scheduler..."
    exec celery -A app.celery_app beat \
      --loglevel="${CELERY_LOG_LEVEL:-info}"
    ;;
    
  # flower)
  #   echo "Starting Flower monitoring..."
  #   exec celery -A app.tasks flower \
  #     --port="${FLOWER_PORT:-5555}"
  #   ;;
    
  *)
    echo "ERROR: Unknown ROLE='$ROLE'"
    echo "Available roles:"
    echo "  - web: Run FastAPI/Uvicorn server"
    echo "  - worker: Run Celery worker"
    echo "  - beat: Run Celery beat scheduler"
    # echo "  - flower: Run Flower monitoring UI"
    exit 1
    ;;
esac