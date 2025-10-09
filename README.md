# yugantar


## Docker 
- `docker build -t backend:latest -f Dockerfile.backend .`
- `docker run backend:latest`

More closely

- `docker compose up --watch`
- `docke rcompose down` or `docker compose down -v` (to remove volumes)
- `docker compose run backend /bin/bash --remove-orphans` (name of service)
- OR: `docker compose run backend python --remove-orphans`