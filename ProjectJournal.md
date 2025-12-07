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
- [x] User Login
- [x] Update and Delete operations on User table
- [x] Create loan policy
- [x] Create loan schema
- [x] Create loan service
- [x] Registration Successful Email Notifications
- [ ] Forgot/Reset/renew account password
- [x] Account Login and Logout
- [x] Account verification (send link using `itsdangerous` package)
- [ ] Log every user's activity
- [x] Create Deposit policy
- [ ] Edit and Delete polity (must be either admin/moderator)
- [ ] Create Deposit api
- [ ] Make deposits based on the active policy
- [ ] Create celery docker service with proper configs
- [ ] Upload receipts to make deposit
- [ ] Use OCR to read voucher data
- [ ] Assign Celery OCR task in background

---

# Important commands

## Poetry

- `poetry add <PACKAGE_NAME>`
- `poetry lock`

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
- `docker compose build --no-cache <container-name>`
- Restarting the container after making changes (e.g. backend container):
  `docker compose restart backend`

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

---

## 2025-10-26

- Created an App passwords for google account -> [Link](https://dtptips.com/%F0%9F%94%91-how-to-generate-app-passwords-in-google-account-even-if-the-option-is-hidden/)
- Tested Admin rights (CRUD operations on user table)
- Updated `user_schema` for not allowing users to update `access_roles` and `cooperative_roles`. Only admin has that right to change
- Updated `SMTP` related configurations
- Renamed `endpoints/user_login.py` to `endpoints/auth.py` as it is only responsible to token creation

---

## 2025-11-01

- Team meeting

- Feedbacks:

  - Expense Policy
    - Meeting expense
  - Investment Policy

    - invested by
    - asset
    - amount
    - return (monthly / weekly)
    - REQUEST FOR INVESTMENT

  - Cooperative Roles
    - gets notified for all the financial activities
  - Secretary / Treasurer
    - Moderator
      - Send EMail
      - Report generate
  - President
    - Approves loan
  - ADMIN

    - Role assignment
    - Full IT department
    - Renew password every 6 months

  - Loan
    - Request loan -> Treasurer check -> notify President -> President approves loan

---

## 2025-11-02

- Working with loan model

#### Policy Management

- Policies are versioned (effective_from/effective_to)
- Only one active policy at a time
- Historical policies retained for auditing

#### Loan Creation

1. Fetch active policy
2. Validate loan against policy rules
3. Snapshot policy values into loan
4. Store reference to policy (loan_policy_id)

#### Loan Modification

- Policy changes don't affect existing loans
- Renewals may use current policy or keep original
- All changes are audited

---

## 2025-11-07

- Enums should be explicitly created in alembic migrations (`alembic/env.py`)

  - First define the enum
  - Create it
  - Set the type of the respective column to this enum type
  - Use `postgresql_using`

- Created `deposit_policy` and `loan_policy`
- Defined the relationship between `deposit_model` and `deposit_policy`, `loan_model` and `loan_policy`

---

## 2025-11-08

- Create admin user using the `create_admin_user.py` script by the `entrypoint.sh` shell script
  - This automatically adds admin credentials in the database
- Only `Admin` can assign user `AccessRole` and `CooperativeRole`

---

## 2025-11-09

- User email notification upon successful user registration
- Updated `email_notify.py`
- Useful resource: [Fast API Beyond CRUD](https://github.com/jod35/fastapi-beyond-CRUD)

---

## 2025-11-13

- User email registration and verification
  - How it works?
  ```bash
  user registers -----> send welcome email with verification link.
                        1. Upon registration a safe url token is generated: app/core/security.py -----> create_url_token() method
                        2. The verification link calls the endpoint: `api/v1/auth/verify-email?token`  ------> decode_url_token() method
  ```

## 2025-11-15

- Solved the issues with email verification
  - For the verification, my endpoint was supposed to hit the backend (localhost:8001) but it was hitting the frontend (localhost:3000)
  - Earlier I had changed the user route from `/token` to `/login` but hadn't updated the endpoint to `login` in my `dependencies/auth.py` that was responsible for OAuth. Due to which, I was wrongly defining my login endpoint as: "api/v1/login/token" for which I was supposed to define it: "api/v1/auth/login"
  - I was using `subtype=MessageType.plain` instead of `subtype=MessageType.html` due to which the html tags were not processed.
  - Another error I was making was by defining the endpoint as `verify-email/token`. That was totally wrong because the token would be coming as a query parameter. This led to wrong endpoint throwing errors.

---

## 2025-11-16

- Deposit policy workflow

  ```bash
  CLIENT
    │
    ▼
  ENDPOINT (deposit_policy_router.py)
    │  receives JSON (DepositPolicyCreate / Update)
    ▼
  SCHEMAS (DepositPolicyCreate, DepositPolicyUpdate)
    │  validate data
    ▼
  SERVICES
    ├── PolicyService          ← generic framework (logging + versioning)
    └── DepositPolicyService   ← deposit-specific logic
    │
    ▼
  MODELS
    ├── DepositPolicy
    └── PolicyChangeLog
    │
    ▼
  DATABASE

  ```

---

## 2025-11-30

- User login updates
  - Created a `pages/Login.tsx` and `contexts/AuthContext.tsx`
  - `AuthContext.tsx` handles authentication during login and signup creating tokens calling the fastapi endpoint
  - `Login.tsx` calls the endpoints defined in the `AuthContext.tsx` and POST/GETs form data to and from the DB

---

## 2025-12-07

- Solved the issue of token local storage. This resolved the issue of login, signup and user edit profile.

  - The way the backend was send the token and the way frontend was retrieving the token wasn't aligned.
  - This caused the token mismatch.

- Added a new endpoint for `users/me/change-password`
