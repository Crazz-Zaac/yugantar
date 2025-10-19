# Project Journal

## TODO:

- [x] Create virtual environment and install packages
- [x] Create DB schema
- [x] Define model definitions
- [x] Setup initial PgAdmin Docker container
- [x] Connect Postgres DB
- [x] Migrate DB
- [x] Define api and routes
- [x] User registration
- [ ] User Login
- [ ] Update and Delete operations on User table
- [ ] Forgot Password

---

# Important commands

## Generating secret key:

```python
python -c "import secrets; print(secrets.token_hex(32))"
```

## Alembic

1. To create secrets for docker to read

   ```bash
   mkdir -p secrets # in root folder
   echo "password" > secrets/db_password.txt
   echo "password" > secrets/pgadmin_password.txt"
   ```

2. Alembic migrations

```bash
    alembic revision --autogenerate -m 'initial tables'
    alembic upgrade head
```

**Note**: For all the models with `table=True` for fields with `List[str]` use `JSON` and `Columns` from `sqlalchemy`. [Link](https://stackoverflow.com/questions/79296853/sqlmodel-valueerror-class-list-has-no-matching-sqlalchemy-type)

- For a new migration:

```bash
    alembic revision --autogenerate -m "your message"
    # then apply the migration
    alembic upgrade head
```

## Docker

- `docker build -f docker/Dockerfile.backend -t backend:latest .`
- `docker run backend:latest`

- When you need to rebuild (dependencies changed, Dockerfile changed) -> `docker compose up -d --build`

- More closely:
- `docker compose up --watch`
- `docke rcompose down` or `docker compose down -v` (to remove volumes)
- `docker compose run backend /bin/bash --remove-orphans` (name of service)
- OR: `docker compose run backend python --remove-orphans`

---

# History

## 2025-10-09

- Adjusted the `Dockerfile.backend` to properly install packages and run the container
- Re-migrated the database after:
  1. The `id` column of the table changed to `UUID`
  2. Properly adjusting the _foreign key_ relationship between the models for the `id` column
- Changed the port number of `backend` container to `8001` since portainer is hosted in `8000`

---

## 2025-10-11

- Defined the password hashing logics:

  - Created `app/core/config.py` for fetching all the environment variables from `.env`
  - Created token creation, password verification and password hashing in `app/core/security.py` using `jwt` and `passlib`

- Defined db sessions in `app/core/db.py` for initializing database for super user and creating session

- Re-built the docker image with updated python packages

- Re-adjusted some fields of `user_model` and migrated the DB

- Created `app/services/user_service.py` for user related CRUD operations.

- Defined an endpoints for user login `app/api/v1/endpoints/user.py`

---

## 2025-10-13

- Solved the issue of API not updating the change to route:

  - Initially I had tested with a `/ping` route which even after creating a new endpoint `/api/v1/endpoints/user` it kept showing
  - Had to completely delete the `yugantar-backend` and rebuild it

- There was a mis-match in the data model. I was re-defining the `id` field which is `uuid` in the base model, as `int`

- The fields that take enum data such as `access roles`, `cooperative roles` and `deposit status` are now strictly defined in the respetive fields creating consistency between schema and the model

---

## 2025-10-16

- Solved the issues with field name inconsistency. In the DB I had the column `Full_name` while in the user schemas I had `First_name` which was problematic.
- Another issue was, I had defined the `backend` to depend on `db` while I in `.env` file I was setting `POSTGRES_SERVER` to `localhost` due to which the connection was being refused.
- Now with `localhost` changed to `db`, I was unable to locally make migrations because the db was now in the docker container. That's why a `is_running_in_docker()` method is now added to the `core/config.py` that would dynamically set the `host`. And this solved the issue.
- The `email` field is now set to pydantic's `EmailStr` type which previously I had set to `str`
- Docker containers now take credentials directly from the `../backend/.env` file

---

## 2025-10-17

- Created `dependencies/admin.py` that returns the current admin or moderator

- Created `endpoints/admin.py` to:

  - list all users
  - if user is admin, then get user's ID
  - As an admin update and delete user's data
  - Disable user as an admin

- Created `api/dependencies/auth.py` for authentication to:

  - `get_current_user`
    - Use `JWT` to decode using token and secret key
    - Extract the user ID from the payload
    - Retrieve the user from the database and return
  - `get_current_active_user`
    - get current user
    - check if the user is active and not disabled

- Created `api/endpoints/user_login.py` to:

  - `login_for_access_token`:
    - authenticates the user by email and password
    - calculate the token expiry in minutes
    - create the access token using the `user_id` and `access_token_expire` using the `create_access_token` method
    - get the refresh token expiry in minutes with 7 days
    - calculate the refresh token using `create_access_token` and pass it to `TokenResponse` method
  - `refresh_access_token` to issue new access token:
  - Verify refresh token
  - Retrieve user from the database
  - Create a new access token and return the updated token

- Updated `endpoints/user_route.py` to:

  - allow currently logged in user to get own details, update and delete account

- Updated `app/services/user_service.py` for admin related functionality:
  - `get_all_users` returns the list of all the users
  - `admin_update_user` to allow the admin to update user's `access_roles`, `cooperative_roles` and enable or disable the user
  - `admin_delete_user` to allow the admin to delete the user
