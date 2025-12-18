#!/bin/sh
set -e



# Create admin user if not exists
echo "Creating admin user if not exists..."
python -m app.scripts.create_admin_user

# Start FastAPI using the venv Python
exec uvicorn main:app --host 0.0.0.0 --port 8000 "$@"
