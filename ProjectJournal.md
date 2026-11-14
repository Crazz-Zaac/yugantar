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
- [x] Implement `react-helmet-async` or `document.title` to dynamically set web page title
- [x] Forgot/Reset/renew account password
- [x] Change Password
- [x] Account Login and Logout
- [x] Account verification (send link using `itsdangerous` package)
- [x] Update user profile
- [ ] Log every user's activity
- [x] Create Deposit policy
- [x] Edit and Delete policy (must be either admin/moderator)
- [x] Create Deposit api
- [x] Make deposits based on the active policy
- [x] Create celery docker service with proper configs
- [x] Upload receipts to make deposit
- [x] Use OCR to read voucher data
- [x] Assign Celery OCR task in background
  
- [ ] Only one deposit policy can be active at a time. If a new policy is created, the previous policy should be set to `EXPIRED` and the new policy should be set to `ACTIVE`.
- [ ] Apart from the main deposit policy, only one occasional deposit policy can be active at a time. If a new occasional deposit policy is created, the previous occasional deposit policy should be set to `EXPIRED` and the new occasional deposit policy should be set to `ACTIVE`.
- [ ] There should be a separate policy for `Fine` and `Interest`. These policies should also be versioned and only one active policy at a time.
- [ ] Similarly, only one loan policy can be active at a time. If a new loan policy is created, the previous loan policy should be set to `EXPIRED` and the new loan policy should be set to `ACTIVE`.
- [ ] Apart from the main loan policy, exceptional loan policies can be created for specific users. These policies should also be versioned and only one active policy at a time for that user.
- [ ] There should be a separate policy for `Collateral` and `Loan Repayment`. These policies should also be versioned and only one active policy at a time.
- [ ] Create fine and interest policy endpoints to manage the policies. These endpoints should be accessible only by the treasurer and require president's approval.
- [ ] Notify all the user once a new policy is approved and active in the app's notification system as well as email notifications.
- [ ] Create a notification system to notify the user about the new policy, policy changes, and policy expiry. The notification should be sent to the user via email and in-app notifications.
- [ ] Allow `SECRETARY` to call for a meeting and notify all the users about the meeting. The notification should be sent to the user via email and in-app notifications.
---

# Important commands

## Poetry

- `poetry add <PACKAGE_NAME>`
- `poetry lock`

## Generating secret key:

```python
python -c "import secrets; print(secrets.token_hex(32))"
```

- To create secrets for docker to read

```bash
mkdir -p secrets # in root folder
echo "password" > secrets/db_password.txt
echo "password" > secrets/pgadmin_password.txt"
```

## Alembic

1. Alembic migrations

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

**Note**: Before making migrations, make sure the models have been imported in their respective `.init.py` file

## Docker

- `docker build -f docker/Dockerfile.backend -t backend:latest .`
- `docker run backend:latest`
- `docker compose build --no-cache <container-name>`
- Restarting the container after making changes (e.g. backend container):
  `docker compose restart backend`

- When you need to rebuild (dependencies changed, Dockerfile changed) -> `docker compose up -d --build`

- More closely:
- `docker compose up --watch`
- `docker compose down` or `docker compose down -v` (to remove volumes)
- `docker compose run backend /bin/bash --remove-orphans` (name of service)
- OR: `docker compose run backend python --remove-orphans`

- To access the terminal of a running container use `docker exec -it <container_name_or_id> /bin/bash`

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

### Policy Management

- Policies are versioned (effective_from/effective_to)
- Only one active policy at a time
- Historical policies retained for auditing

### Loan Creation

1. Fetch active policy
2. Validate loan against policy rules
3. Snapshot policy values into loan
4. Store reference to policy (loan_policy_id)

### Loan Modification

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
  - The way the backend was sending the token and the way frontend was retrieving the token wasn't aligned.
  - This caused the token mismatch.

- Added a new endpoint for `users/me/change-password`

---

## 2025-12-13

- Storing tokens in redis with expiry time
- Handling tokens when user logs out

---

## 2025-12-14

- Fixed the issue with `getAllUsers()` method. `UserListResponse` schema wasn't sending the `is_verified` field due to which
  the value wasn't being properly displayed in the AdminDashboard `Verification Status` which was all being set to `Unverified`.
- Was being unable to update the user `Verification Status` because I hadn't included the `is_verified` flag in the `UserListResponse()` class
  - Including the flag in the schema solved the issue

---

## 2025-12-18

- I was re-creating `refresh_token` using the `create_access_token()` method
- Due to token expiry, the UI would silently log user out
  - This was handled by passing a http token using `WithCredentials = True`
- During user login, the data entered in the `Email` and `Password` field would be copied to `Email` and `Password` even when switched `Sign Up` form. This was because the same form field was being share between among `Login` and `Sign Up`
  - This was solved by creating a separate `signUpData` and `loginData` using `{isLogin ? loginData.password : signupData.password}`

---

## 2025-12-24

- Initially Deposit and Loan Policies can never be deleted. Every changes to them are logged to policy change table. The problem is,
  how to handle, when the authorized person created a policy with the wrong inputs?
  - To handle this a new column `status` was defined for each policy as an `Enum`
    ```python
      class PolicyStatus(str, Enum):
        DRAFT = "draft"
        ACTIVE = "active"
        EXPIRED = "expired"
        VOID = "void"
    ```
  - With this the newly created policy will be set to `DRAFT` by default and therefore can be deleted.
  - BUT the policies cannot deleted once the `effective_from == datetime.now()`

---

## 2025-12-25

- Alembic migrations wasn't straight forward while creating `Enum`s data type for `status` column. Simply `alembic upgrade head` didn't work.
  - Therefore, the migration script needed to be edited manually to create the enum fields. For example:

  ```python
    policy_status = sa.Enum("DRAFT", "ACTIVE", "EXPIRED", "VOID", name="policystatus")
    policy_status.create(op.get_bind(), checkfirst=True)
  ```

  - Next thing is, we must provide the default value for such fields and for that use `server_default="DRAFT"` for example.

  ```python
    op.add_column(
        "interestpolicy",
        sa.Column(
            "status",
            sa.Enum("DRAFT", "ACTIVE", "EXPIRED", "VOID", name="policystatus"),
            nullable=False,
            server_default="DRAFT",
        ),
    )
  ```

---

## 2025-12-27

- Added newer fields to `Deposit`, `Receipt`, `Fine` and `Loan` models
- Created a new model `loan_payment` which can better handle user's different payment situations:
  ```python
    Only deposit
    Deposit + Fine
    Current Deposit + Advanced deposit
    Current Deposit + Advanced deposit + Fine
    Only loan
    Complete Principle + Interest
    Only Interest
    Only Principle
    All
  ```

---

## 2025-12-30

- Created `models/mixins/money.py` to convert money into rupees to avoid storing money as a float
- Removed duplicate fields from `deposit` and `fine` models
- Added field validations in deposit model
- Created `deposit_service` for deposit model
- Created schema response and service for the fine model

---

## 2026-01-01

- I received `INTEGER NOT NULL` error as I was trying to add a NOT NULL column to an existing table that already has rows
  - The workaround was to edit the migration script in alembic and set a `server_default=` some value
- Added some important utilities for deposit and currency conversion
  - `deposit_date_utils.py` will calculate the due date and fine amount
  - `financial_utils.py` converts NPR rupees to paisa, paisa to rupess and some formatting

---

## 2026-01-26

- Created `ocr_service`
  - use opencv to read image
  - extract data using `pytesseract`
  - use regex to match the pattern to extract `amount`, `charge`(if exists), `date` and `reference`
  - return as a dictionary

- Created `ocr_task`
  - take `image_path`
  - Calls the `ocr_service`
  - Extracts the data
  - Returns the data in `JSON` format

- Created a shared volumes, an upload directory for `backend` and `clery-worker` containers

- Created `celery_app`
  - auto discovers tasks registered as `@celery_app.task` inside `/app/tasks/*.py`

- Created `ocr.py`
  - creates `/tmp/ocr_uploads` directory if not present
  - validates the file size, max 10MB
  - provides unique file name to the uploaded file
  - queues the ocr processing task and celery handles it
  - returns JSON response with `status`, `task_id` and `message`

---

## 2026-02-01

- Moved `alembic.ini` inside `backend/`
- Corrected the `backend/alembic/env.py` to import package from `app/` instead of `backend/`
- Now using a fixed version of postgres. `postgres: 18`

---

## 2026-02-15
- Totally changed the frontend UI into black and green theme
- Added a new font `JetBrains Mono`
- Created the following endpoints to track the policy creation states properly:
  - `/submit` - Treasurer submits the policy
  - `/approve` - President approves the policy before coming into effect
  - `/reject` - President rejects the policy
  - `/delete` - Only possible when the policy is in _Draft_ state
  - `/delete` - Only possible when the policy is in _Draft_ state
- Added the following endpoints for notification:
  - `/notifications` - lists all the notification
  - `/read-all` - mark the notification as read

---

## 2026-03-01
- Added `get_current_policy_manager` to get check the user's _access role_ and _cooperative role_
  - Now the during the policy creation methods depends on `get_current_policy_manager`
- Updated the Deposit Tab
- Created `loan-payments` endpoints able to perform all the CRUD operations

---

## 2026-03-08
- Loan application -> Verification -> Approval / Rejection
  - User applies for loan -> Notifies Treasurer
  - Treasurer verifies fund availability -> Notifies President after verification
  - President Approves/Rejects -> Notifies the user to collect the check

- Added additional fields (_purpose_, _fund verified by_ and _fund verified at_) to the `loan_model`

- Changed the `loan_schema` to include loan application
  - Methods redefined: `LoanFundVerification`, `LoanApprovalAction`, `LoanRejectAction`, `LoanResponse`, `LoanList`, `LoanCalculatorRequest` and `LoanCalculator`
  
- Updated `LoanService` 
  - Checks active loan policy
  - Verifies the loan amount follows the policy
  - Checks for collateral requirement
  - `get_my_loans` returns user's personal loans
  - `get_loan` return single loan 
  - `get_pending_loans` used only for _Treasurer_ and _President_
  - `get_community_loans` returns loans of all the members
  - `verify_funds` is called only by the _Treasurer_
  - `approve_loan` and `reject_loan` is called only by the _President_
  - `calculate_loan` a method that helps user to do some basic Simple Interest calculations while applying for loan

- Updated `notification_model`
  - Added Notification Type fields and loan id

- Updated the `notification_schema` to include the `loan_id` as well

- Updated the `api/dependencies/admin.py` to get the current loan reviewer. This basically fetches current _Treasurer_ and _President_ 

- Added `api/v1/endpoints/loan.py` 
  - loan apply endpoint: `loans/apply`
  - my own loans: `loans/me`
  - community loans: `loans/community`
  - pending loans: `loans/pending`
  - loan calculator: `loans/calculator`
  - And other dynamic routes for loan verification and loan approval
  
---

## 2026-03-13
 
- Updated `deposit_schema.py`:
  - the `set_policy_values()` fetches the values of the respective deposit policy from the payload
- Updated `smart_deposit_schema.py`:
  - `SplitCategory` - enum defining the possible splits
  - `DepositPreview` - deposit preview read from the OCR
  - `LoanSummary` - defines what to read from the loan
  - `SplitAllocation` - defines splitting preview 
  - `DepositPreviewResponse` - defines the values to include in the deposit response
  - `SmartDepositAllocation` - a preview of the submit schema
  - `SmartDepositCreate` - values to be submitted from the frontend
  - `SmartDepositResponse` - values sent to the API
- Updated `deposit_service.py`
  - a method to check cooperative and access role
  - check deposit verification status 
  - methods to list my deposits, community deposits, deposit history
  - method to list the pending deposits for review
- Updated `smart_deposit_service.py`
  - conditions to check total allocation, policy id and policy before during submission
- Updated `notification_model.py`:
  - added notification types for deposit submitted, verified and rejected
- Updated the deposit endpoint `/api/v1/endpoints/deposit.py`:
  - `_notify_treasurers_new_deposit`: check cooperative role -> write notification -> add to background task
  - `_notify_depositor_review_outcome`: get deposit verification status -> write notification -> update the table -> add to background task
  - `create_deposit`: for any new deposit calls the `_notify_treasurers_new_deposit` private method
  - `moderator_update_deposit`: calls the `_notify_depositor_review_outcome` method
  - added `get_my_deposits()`, `get_community_deposits()`, `get_my_deposit_history()`, `get_pending_review_deposits()` 
  - updated `create_smart_deposit()`: for deposit with smart split allocations

---

## 2026-11-11 — Security fixes

### 1. Committed credentials & exposed DB ports
- **Issue:** `backend/.dev.env` and `docker/secrets/*.txt` were tracked in git, and the live `backend/.env` reused the same admin, Postgres and pgAdmin passwords. Postgres (5432) and pgAdmin (8080) were published on all host interfaces (Docker bypasses ufw).
- **Fix:**
  - Untracked `backend/.dev.env` and `docker/secrets/` (`git rm --cached`; files kept locally) and added them to `.gitignore`.
  - Added `backend/.env.example` with placeholder values as the template.
  - Bound Postgres and pgAdmin to `127.0.0.1` in `docker-compose.yml`.
- **Manual follow-up:** rotate the admin, Postgres and pgAdmin passwords. The old values remain in git history, so treat them as public.

### 2. Loan payments credited without verification
- **Issue:** `POST /loan-payments/` and smart-deposit loan allocations added to `loan.total_paid_paisa` immediately (a renewal could even mark the loan `PAID`), while the money was unverified. Rejecting the deposit did not undo it, and owners could edit payment amounts at any time.
- **Fix:**
  - `LoanPayment` got `status` (`PENDING`/`VERIFIED`/`REJECTED`), `deposit_id`, `verified_by` and `verified_at`. Migration `f2d73ca04f9e` backfills existing rows as `VERIFIED`.
  - Loan totals change only when a payment is verified (`LoanPaymentService.apply_verified_payment`). Only verified *principal* payments can mark a loan `PAID`.
  - Owners can edit or withdraw only `PENDING` standalone payments.
  - New reviewer endpoints (treasurer/moderator/admin): `GET /loan-payments/review/pending` and `PUT /loan-payments/{id}/review`.
  - Smart-deposit loan allocations become `PENDING` payments linked to the deposit. Verifying or rejecting the deposit (`DepositService.verify_deposit`) does the same to them. Withdrawing a deposit removes them, and moderator deletion reverses any verified ones.
  - Smart deposits now also reject payments on loans that aren't `ACTIVE`/`APPROVED`.

### 3. Disabled users kept access
- **Issue:** `get_current_user` never checked `disabled`, and `/auth/refresh` issued new tokens to disabled users. A disabled admin kept admin rights indefinitely. There was also no way to end all of a user's sessions.
- **Fix:**
  - `get_current_user` rejects disabled accounts on every request (401), so disabling takes effect immediately. Roles were already re-read from the DB on each request.
  - New `app/core/refresh_tokens.py`: a per-user index of refresh tokens in Redis (`user_refresh_tokens:{user_id}`) with issue, rotate, revoke and revoke-all helpers. Both login endpoints, refresh and logout now use it.
  - `/auth/refresh` refuses disabled or deleted users and revokes all their tokens.
  - All sessions are revoked when an admin disables or deletes a user, or a user deletes their account. A password change revokes the other sessions and keeps the current one.
- **Note:** refresh tokens issued before this change aren't in the index until their next rotation (or 7-day expiry). The disabled check on refresh still covers them.

### 4. Password reset link contained a login token
- **Issue:** `POST /users/me/reset-password` emailed a normal 15-minute JWT access token, so anyone with the link (mail logs, browser history, Referer) was logged in as that user. The endpoint revealed whether an email was registered, and no endpoint actually reset the password.
- **Fix:**
  - New single-purpose reset token in `core/security.py` (`create_password_reset_token` / `read_password_reset_token`): `itsdangerous` with its own salt, a 30-minute expiry, and a fingerprint of the current password hash, so it is single-use and dies after any password change.
  - `POST /users/me/reset-password` now takes a JSON body `{email}`, always returns the same message, and sends the email in a background task.
  - New `POST /users/reset-password/confirm` `{token, new_password}`: validates the token, sets the password, and logs out all sessions.
  - Password strength rules moved into a shared `validate_password_strength()` (register, change, reset). Change-password now also requires an uppercase letter.
- **TODO:** the frontend still needs a `/reset-password` page that calls the confirm endpoint.

### 5. OCR endpoints unauthenticated + OCR accuracy
- **Security issue:** `/v1/ocr/*` had no authentication: anyone could upload files, queue CPU-heavy OCR jobs, read results and revoke tasks. Uploads were read fully into memory before the 10 MB check. The type check trusted the client's `Content-Type`, and the client's filename was used in the saved path.
- **Security fix** (`api/v1/endpoints/ocr.py`):
  - All endpoints require login. Task ownership is stored in Redis (`ocr_task:{id}`) and only the uploader can read or delete a task (others get 404).
  - Uploads are read in 1 MB chunks and rejected past 10 MB (413). The real image type is checked with Pillow (JPEG/PNG/WEBP only). Images over 40 MP are rejected (decompression bombs).
  - Saved as `{uuid}.{ext}`; the client filename is never used. The worker refuses paths outside `/tmp/ocr_uploads`.
  - Rate limit: 20 uploads per user per 10 minutes (429).
  - `delete-task` now actually deletes the result (`forget()` instead of `revoke()`). Failure messages no longer leak internal errors.
  - Removed the `upload-data` volume from the frontend container (it never used it).
- **OCR bugs found** (tested against the 13 receipts in `ocr_test/receipts`):
  - Bordered-table receipts (Sajilo eBanking) returned nothing: Tesseract skips cells inside grid lines.
  - Times where AM/PM wrapped onto the next line were parsed as 24-hour, so 5 of 13 dates were **12 hours off**. This affects late-fine calculation.
  - The Celery retry ran after `finally` had already deleted the image, so every retry failed.
- **OCR fix** (`services/ocr_service.py`):
  - Preprocessing: invert dark-mode screenshots, upscale images narrower than 1000 px, erase table grid lines (morphology).
  - Parse the full text instead of single rows. AM/PM is looked up after the time, even across a line break.
  - Amount priority: Txn/Transaction Amount > Amount (NPR) > "NPR x"; never "Total Amount" (it includes the bank charge).
  - Two passes: the preprocessed image first, then the raw image fills any missing fields.
  - Removed task retries (OCR is deterministic).
  - Result: amount 11/13 → 13/13, date 6/13 → 13/13, reference 10/13 → 12/13 (remaining miss: O/0/Q confusion in an alphanumeric TXN ID).

### 5b. Editable voucher details (OCR fallback)
- **Issue:** the OCR results in the deposit form were read-only. A misread value couldn't be corrected, and if OCR missed the amount or failed, the preview never loaded, so the member couldn't deposit at all.
- **Fix** (`frontend/.../member/DepositTab.tsx`):
  - Amount, date/time and reference are now editable inputs, pre-filled from OCR. Each field shows "Edited. OCR read: …" when changed.
  - If OCR fails, the form switches to manual entry instead of a dead end.
  - Preview needs a positive amount and a date that isn't in the future. Preview requests are debounced by 500 ms while typing.
- **Security note:** editing doesn't widen trust. The API already accepted any client-sent amount, and since fix #2 nothing affects balances until a treasurer verifies the deposit.
- **Open gap:** the treasurer can't see the voucher image (deleted after OCR) or what OCR originally read, so verification relies on checking the bank statement.

### 5c. Receipt images kept for treasurer review (15 days)
- **Why:** treasurers verified deposits blind. The voucher image was deleted after OCR, and nothing recorded what OCR read versus what the member submitted.
- **Storage:** `core/receipt_storage.py` keeps images on a private Docker volume `receipts-data` at `/data/receipts/YYYY/MM/<uuid>.jpg`, mounted in the backend and worker only.
  - Every image is re-encoded as a plain JPEG (rotation fixed, EXIF/GPS stripped, max 1200×2600).
  - Behind a small `save` / `path_for` / `delete` interface, so it can move to MinIO/S3/R2 later.
  - Never served statically.
- **Retention:** `RECEIPT_RETENTION_DAYS=15` from upload (`.env`).
  - Celery Beat runs `purge_expired_receipts` hourly. A receipt that was never submitted is removed entirely. For submitted ones only the image is deleted; the OCR values stay for the record.
  - It also sweeps orphaned files older than 15 days.
  - Note: a deposit still pending after 15 days loses its image.
- **Model:** `Receipt` reworked (migration `0f366a8f8155`). `txn_number:int` was replaced by text `reference` plus `reference_key`. New fields: `file_key`, `content_hash` (sha256), `size_bytes`, `expires_at`, `image_deleted_at`, `ocr_status`, `ocr_amount_paisa`, `ocr_charge_paisa`, `ocr_date`.
- **Flow:**
  - `POST /v1/ocr/process-image` stores the image, creates a `Receipt` and returns `receipt_id`. The worker writes the OCR values onto the receipt server-side, so they can't be faked by the client.
  - `POST /deposits/smart` takes `receipt_id`. It must be the member's own receipt, not expired, and not already used.
  - `GET /receipts/{id}` returns OCR vs submitted values, "edited" flags and duplicates. `GET /receipts/{id}/image` returns the image with `Cache-Control: private, no-store`, or 410 once purged. Both endpoints are for the uploader or treasurer/moderator/admin; everyone else gets 404.
  - Duplicate detection: same image hash, or the same bank reference after normalising OCR look-alikes (O/Q→0, I/L→1).
  - Loan payments can only reference the member's own receipts.
- **Frontend:**
  - `DepositTab` sends `receipt_id` and tells the member the image is kept for 15 days.
  - The treasurer review tab has a "View receipt" button that opens the new `ReceiptReviewDialog`: the image, OCR vs submitted values, and warnings for edits and duplicates.
- **Ops:** back up the `receipts-data` volume together with Postgres.

### 6. Any member could read every member's personal details
- **Issue:** `GET /users/{user_id}` returned the full profile (email, phone, address, date of birth, gender) to any logged-in user. The docstring described privacy rules that weren't implemented. Deposit lists expose `user_id`s, so anyone who registered could collect every member's details.
- **Fix:** the endpoint now returns the full `UserResponse` only to the user themselves and to admins and moderators. Every other member gets `UserPublic`: id, names, **email, phone**, roles, join date. Contact details are shared because this is a closed group and members, the treasurer and the president need to reach each other. Address, date of birth and gender stay private (`gender` was removed from `UserPublic`).
- The frontend uses `/admin/users/{id}` (admin only), so no UI change was needed.

### 7. Record visibility: transparent, but not for pending/rejected items
- **Decision:** the cooperative is a closed group and deliberately transparent. Every member can see other members' approved/active/paid loans (amount, term, rate, purpose, payments) and verified deposits and loan payments in full, with full names.
- **Issue:** the by-ID endpoints also exposed **pending and rejected** records to everyone: loan applications under review (with collateral offered), the President's rejection reasons, and unverified deposits and loan payments.
- **Fix:**
  - New `services/visibility.py` holds the rule in one place. Owner and office bearers (Treasurer, President, Moderator, Admin) see everything; other members see only approved/active/paid loans and verified deposits and payments. Hidden records return 404.
  - Applied to `GET /loans/{id}`, `GET /loan-payments/{id}`, `GET /loan-payments/loan/{loan_id}` (others get verified payments only) and `GET /deposits/deposit/{id}`.
  - Community views use full names: `applicant_name` on community loans (was "First L."), and a new `depositor_name` on deposit responses, shown in the community deposit table and the treasurer review queue (both showed raw user IDs before).

### 8. Separation of duties
- **Issue:** nothing stopped office bearers acting on their own money. A Treasurer could verify their own deposit or loan funds, a President could approve their own loan, and one person holding both roles could verify and approve the same loan. Admin/Moderator (technical access roles) could also verify deposits and payments and manage policies.
- **Rules agreed** (all in `services/duties.py`):
  1. Nobody acts on their own deposit, loan, loan payment, or a policy they created.
  2. A loan's fund verification and approval must be done by two different people.
  3. Each duty has one primary office role. When that person is the one asking, the **Secretary** steps in.
  4. Money decisions belong to office bearers only (President, Treasurer, Secretary). Admin/Moderator manage accounts and roles; they have no financial powers.

  | Duty | Primary | Backup |
  |---|---|---|
  | Verify / delete deposit | Treasurer | Secretary |
  | Review / delete loan payment | Treasurer | Secretary |
  | Verify loan funds | Treasurer | Secretary |
  | Approve / reject loan | President (not whoever verified funds) | Secretary |
  | ~~Approve / reject policy~~ | replaced by member signatures (see 9) | |
  | Create / edit / delete policy | Treasurer | none |

- **Applied to:**
  - Deposit verify/delete and review queue; loan-payment review/delete and queue; loan verify-funds/approve/reject (plus the two-person check via `fund_verified_by`); policy approve/reject (creator via `created_by`); `get_current_policy_manager` (Treasurer only); `get_current_loan_reviewer` (office bearers).
  - Review queues only list items the user may act on.
  - Visibility of pending/rejected items and receipt access: office bearers only (Admin/Moderator removed).
- **Notifications:** `responsible_users()` uses the same rule, so the Treasurer's own deposit or loan notifies the Secretary, and the President's own loan approval request goes to the Secretary.
- **Frontend:**
  - The Secretary now sees the deposit and loan review tabs.
  - The pending-loan queue returns per-loan `viewer_can_verify_funds` / `viewer_can_decide` / `is_own_application`, computed by the same backend rule. Buttons appear only when the action will succeed; otherwise the card says why (e.g. "Your own application: another office bearer handles it").
- **Not covered:** `MemberPoliciesTab` still shows approve/reject to the President only. The Secretary-approves-the-President's-policy case (rare: only when a Treasurer is also President) works in the API but has no button yet. The admin Policies tab is still mock data (`@/lib/data`).

### 9. Policies approved by every member's signature
- **Decision:** a new policy needs the approval of *all* members, office bearers included, not just the President. Each signature records the member's name and date. In extreme cases an Admin can sign for an absent member, but only after consulting them (e.g. by phone) and with the President's, Treasurer's and Secretary's authorisation.
- **Lifecycle** (`services/policy_signing_service.py`):
  - `DRAFT`: the Treasurer creates and edits it.
  - `FINALIZED`, shown as "Open for signing": the Treasurer signs and opens it, which creates a signature row for every required signer. Signers are a snapshot of active accounts with a cooperative role; a pure system-admin account doesn't sign.
  - Members approve, or reject with a reason, and can change their response while it's open. A rejection blocks activation and notifies the Treasurer, who can withdraw the policy to `DRAFT` to revise it (this clears the signatures).
  - `ACTIVE` once every counted signer has approved; everyone is notified. Members disabled during signing stop counting (re-checked when an admin toggles a user).
- **Proxy signing:**
  - The Admin files a request with the member, their decision (and reason if rejecting), and a note on how they were consulted.
  - It's applied only once each office role (President, Treasurer, Secretary) has authorised it, with at least two different people. The absent member and the requesting Admin can't authorise.
  - The signature shows "Signed by Admin X on their behalf (consultation), authorised by …", and the member is notified. Any office bearer can decline; the Admin can cancel.
- **Data:** new tables `policysignature`, `policyproxyrequest`, `policyproxyauthorisation` (migration `f83cd6bcc6c3`).
- **API** (`endpoints/policy_signing.py`): `POST /policies/{type}/{id}/submit` (sign and open), `/withdraw`, `GET …/signatures`, `POST …/sign`, `POST …/proxy-requests`, `GET /policies/proxy-requests`, `POST /policies/proxy-requests/{id}/authorise | cancel`. The old President `approve`/`reject` endpoints are removed, and `DECIDE_POLICY` is gone from `duties.py`.
- **Frontend:**
  - Shared `components/policies/`: `PolicySigningDialog` (progress, signer list with dates/reasons/proxy details, sign/reject, Treasurer withdraw, Admin proxy form) and `ProxyRequestsPanel` (authorise/decline for office bearers; overview and cancel for the Admin).
  - `MemberPoliciesTab`: the President's approve/reject became a "Signatures" button for every member; "Submit for review" became "Sign & open for signing".
  - The admin Policies tab was a mock (`@/lib/data`); it's now real (all policies, signing progress, proxy requests).
  - Notifications about a policy link to the Policies tab.

### 9b. One-week signing deadline
- **Decision:** members have **1 week** (`POLICY_SIGNING_DAYS=7`) to sign a new policy and can change their decision until the deadline. The outcome is decided **at the deadline**, so nobody's change of mind is cut off early. Every member sees everyone's decisions, reasons and proxy details in the Signatures dialog.
- **How:**
  - `signing_deadline` column on policies (migration `cce2093badc1`).
  - Signing, changing a decision and proxy requests/authorisations are refused after the deadline.
  - At the deadline the policy becomes ACTIVE if every counted member approved, otherwise VOID ("not adopted"), and members are notified.
  - Closed by the hourly Celery Beat task `close_policy_signings`, and also on read, so the UI is never stale.
  - The Treasurer can revise a lapsed policy back into a draft.
- Signing API timestamps are now sent as UTC (`…Z`). The DB stores naive UTC, which browsers would otherwise show 5h45 off in Nepal. *Other endpoints still send naive timestamps; see open items.*

### 10. Registration requires email verification + admin approval (also fixes 11)
- **Issue:** anyone could register and immediately act as a member and see other members' contact details. Registration also accepted `is_verified`/`disabled` from the client, and changing your email skipped verification.
- **Fix:**
  - New `user.is_approved` / `approved_by` / `approved_at`. Existing accounts were grandfathered as approved, and the script-created admin was marked verified.
  - `create_user` ignores client-supplied account-state fields. New accounts start unverified and unapproved.
  - `UserService.account_block_reason()` (disabled / unverified / unapproved) is enforced at both login endpoints (only *after* the password checks out, so strangers learn nothing), on token refresh, and on every request via `get_current_user`.
  - Verifying the email notifies admins. `POST /admin/users/{id}/approve` emails the member; `/reject` removes a never-approved registration and emails them. `GET /admin/users?pending=true` lists pending registrations. `POST /users/resend-verification` gives the same answer for unknown emails.
  - **#11:** changing your email marks the account unverified, sends a link to the new address and ends all sessions until it's verified. Taking another member's email is refused.
  - Signer pools, notified office bearers and proxy authorisers count only active members (enabled, verified, approved).
  - Also fixed: `GET /admin/users` returned a bare `[]` for an empty page (a 500 with its response model).
- **Frontend:**
  - Sign-up now ends on a "check your email → admin approval → sign in" screen with a resend button. Before, it pretended the user was signed in.
  - Removed `console.log` of the sign-up request body, **which included the password**.
  - Sign-in shows the reason and offers "Resend verification email".
  - The admin Members tab has a "Registrations awaiting approval" card (Approve/Reject) and a "Pending approval" status/filter.

### 11. Email change without re-verification
- Fixed as part of 10: changing your email marks the account unverified, emails a link to the new address and ends all sessions until it's verified. Taking another member's email is refused.

### 12. No rate limiting on auth endpoints
- **Issue:** passwords could be brute-forced, and registration, password reset and verification emails could be spammed.
- **Fix:** `core/rate_limit.py`, fixed-window counters in Redis (no new dependency):
  - **Login** (both endpoints, shared): 5 *failed* attempts per account+IP and 30 per IP per 15 min, then 429 with `Retry-After`. A successful login resets the account counter.
  - **Registration:** 5 per IP per hour.
  - **Password reset / resend verification:** 10 per IP per hour (429). Emails to one address are capped at 3 per hour, *silently* (same response), so the cap reveals nothing about which emails are registered.
  - Client IP comes from `request.client.host`. Behind nginx, uvicorn now runs with `--proxy-headers --forwarded-allow-ips=$FORWARDED_ALLOW_IPS` (set it to the nginx address in production).

### 13. Empty/weak SECRET_KEY accepted
- **Fix:** settings refuse to start if `SECRET_KEY` is shorter than 32 characters or `ALGORITHM` isn't HS256/384/512, in every environment. `ALGORITHM` now defaults to HS256.

### 14. Loan re-application and deposits under non-active policies
- A member with an **APPROVED** (not yet disbursed) loan could apply again; the check now covers pending, approved and active loans.
- Deposits (regular and smart, including the preview) are only accepted under an **ACTIVE** deposit policy (`require_active_deposit_policy`). Drafts, policies still being signed and lapsed ones are rejected.

### 15. Deposit input validation
- `DepositCreate.deposited_amount` must be > 0. `verified_by` / `verification_status` from the client are ignored; the deposit is built explicitly from server-decided values.
- Found while testing: `POST /deposits/deposit` crashed on **every** call (`verification_status` passed twice), and its late fine used non-existent fields (`amount_rupees`, `fine_type="LATE_DEPOSIT"`). Both fixed. Editing a pending deposit's amount now actually updates `amount_paisa`; before, it set an unused attribute.

### 16. Hardening
- `entrypoint.sh`: uvicorn `--reload` only when `ENVIRONMENT=local`; `--proxy-headers` for real client IPs. Removed the stray `CMD ["--reload"]` from the production Dockerfile.
- `/docs`, `/redoc` and `/openapi.json` are disabled when `ENVIRONMENT=production`.
- Refresh cookie is `Secure` everywhere except local http dev (was production-only, so staging sent it over http).
- Pinned `redis:7.4` and `dpage/pgadmin4:8.14` (were `latest`). Note: swapping the Redis container logged everyone out once.
- nginx: Content-Security-Policy (self + Google Fonts), `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, `server_tokens off`; removed the obsolete X-XSS-Protection; HSTS ready to enable once on HTTPS. The production frontend must be built with `VITE_API_BASE=/api/v1` (relative), or the CSP blocks API calls.
- **Deferred:** moving the access token out of `localStorage` into memory. It touches the whole frontend auth flow and needs testing in a real browser. The CSP above limits what an XSS could do in the meantime.

### 17. Config printed DB details on import
- Removed the `print()` of DB host/user/name and "Running in Docker?" from `core/config.py`.

### 18. Access token kept in memory (OWASP SPA pattern)
- **Before:** the 30-minute access token was in `localStorage`, so any injected script could read it and reuse it elsewhere until it expired.
- **Now** (`frontend/src/api/api.ts`):
  - The access token lives only in a module variable, gone when the tab closes. The refresh token stays an `httpOnly`, `Secure` cookie that JavaScript never sees.
  - On page load, `AuthContext.restoreSession()` calls `/auth/refresh` to get a new access token. Any 401 triggers one refresh and a retry.
  - Refreshes are **single-flight** within a tab, and **serialised across tabs with the Web Locks API** (`navigator.locks`, lock `yugantar-auth-refresh`). The backend rotates the refresh token on every refresh; without the lock, two tabs refreshing together would log one out. With it, the second tab uses the freshly rotated cookie from the shared cookie jar.
  - Login and logout are broadcast across tabs (`BroadcastChannel('yugantar-auth')`): logging out in one tab logs out all of them, and logging in picks up the session in the others.
  - Any token left in `localStorage` by the old version is removed. Deleted the unused `api/interceptor.ts`, which wasn't imported anywhere and read the wrong response field.
- Backend contract checked: the login body carries the access token, the refresh cookie is `httpOnly`, refresh returns a top-level `access_token`, a second refresh with the rotated cookie works, and CORS allows credentials from the dev origin. The cross-tab lock itself needs a real browser to test.

### 19. All dates in UTC, the same for every member
- **Issue:** timestamps were stored as UTC but returned *without* a timezone (`2026-11-11T09:30:00`). Browsers read them as local time, so members saw different dates and times depending on their device: 5h45 off in Nepal. Notification "x minutes ago" was off too. Each screen also had its own formatter (en-US, en-IN, browser default).
- **Policy forms bug:** effective dates were filled in as UTC but parsed on submit as browser-local time, so saving shifted them by the browser's offset.
- **Backend:** `core/utc_datetimes.py` is a SQLAlchemy `load`/`refresh` listener on every table model that marks loaded datetimes as UTC (without marking rows dirty). The API now always sends `…Z`, and Python only compares aware datetimes. No migration needed: columns are `timestamp without time zone`, and the DB session runs in UTC, so aware writes are stored as UTC.
- **Frontend:** `src/lib/datetime.ts` is the one place for dates.
  - Everything is displayed in `DISPLAY_TIME_ZONE = "UTC"` and labelled ("11 Nov 2026, 09:30 UTC"), so every member sees the same value regardless of browser timezone (checked under Asia/Kathmandu and America/New_York).
  - Date/time inputs (deposit voucher date, policy effective dates) are entered in UTC and labelled.
  - Timestamps without an offset are treated as UTC.
  - Replaced the formatters in DepositTab, LoansTab, MemberPoliciesTab, MembersTab, NotificationPanel, ReceiptReviewDialog and the policy signing UI.
- To show Nepal time instead, change `DISPLAY_TIME_ZONE` (and the input helpers) in that one file.

### 19b. Nepal Time (NPT) for everything people see
- **Decision:** show and enter all dates in **Nepal Time** (NPT, UTC+5:45, no DST), the same for every member wherever they are. Storage and the API stay UTC.
- **Frontend:** `lib/datetime.ts` now uses `DISPLAY_TIME_ZONE = "Asia/Kathmandu"`, labelled "NPT" (e.g. "12 Nov 2026, 02:15 NPT"). The datetime-local inputs (deposit voucher, policy effective dates) are entered in NPT and converted to UTC with the zone's real offset. Checked identical under browser timezones UTC, Asia/Kathmandu and America/New_York. Replaced the Settings tab's unused placeholder timezone picker (Accra/Lagos/Nairobi) with a read-only "Nepal Time (NPT, UTC+5:45)".
- **Backend:**
  - New `COOPERATIVE_TIMEZONE=Asia/Kathmandu` setting and `utils/local_time.py` (`LOCAL_TZ`, `to_local`, `format_local`).
  - **Deposit due dates are now Nepal calendar days:** due "on the 10th" means until 23:59:59 NPT on the 10th (= 18:14:59 UTC). Before, it was 23:59:59 *UTC*, i.e. 05:44 NPT on the 11th, so a deposit at 00:15 NPT on the 11th used to count as on time and is now late. The month boundary and `days_until_due` follow the Nepal day too. This only affects newly calculated due dates.
  - Email/notification dates (policy signing deadline) are written in NPT. OCR uses the same shared `LOCAL_TZ` (receipts show Nepal time); accuracy unchanged at 13/13.

### 20. UI/UX overhaul
Checked visually with headless screenshots (Playwright/Chromium in a throwaway container, desktop 1440 px and phone 390 px, as member, treasurer and admin demo accounts).
- **Real dashboards** (they showed hard-coded mock data, in **USD**):
  - `GET /dashboard/me` gives the member Home: savings, next deposit due (NPT) and whether it's paid, loan with repayment progress, a 12-month savings and repayments history, recent activity, and a **"Needs your attention"** list. That list covers policies to sign plus, for office bearers, deposits, loans, payments and proxy requests waiting for them, using the same duty rules as the endpoints and linking straight to the task.
  - `GET /dashboard/admin` gives the admin Overview: members (incl. pending approvals), total savings, loans outstanding, items with office bearers, open policies with signing progress, 12-month trends, recent registrations.
  - `GET /dashboard/activity`: the **admin Activity tab was broken** (it fetched a non-existent URL and showed a JSON parse error). It now has a real log derived from existing records (registrations, approvals, deposits, loans, payments, policy signatures), filterable, searchable and grouped by Nepal day.
- **Global look:**
  - Tailwind v4 drew every `border` in `currentColor` (near-black) because the base layer never mapped it to `--border`; fixed once in `index.css`.
  - Amounts use Inter with tabular figures instead of monospace.
  - Shared `lib/money.ts` (Rs. 1,00,000 grouping; compact K/L/Cr chart axes).
- **Feedback:**
  - All 10 `alert`/`confirm`/`prompt` replaced by a styled `useConfirm()` dialog (destructive variant, optional note field) and Sonner toasts.
  - Suspending a member now asks for confirmation (it signs them out everywhere).
  - Skeleton loaders, empty states and error-with-retry on the dashboards.
- **Fixed along the way:**
  - `?subtab=` links never worked (wouter's `useLocation()` has no query string); now `useSearch()`.
  - Policy cards said "Due day 31" for every schedule, including occasional ones; they now show "Due on day N each month" / "Within N months".
  - Deposit policy creation now validates the schedule (monthly needs a due day 1–31, occasional needs months). Deposits under an existing misconfigured policy get a clear 400 instead of a crash.
  - `DepositPolicyCreate.effective_from` defaulted to the *server start time* (evaluated at import); now per request.
  - Admin user list lacked `joined_at` ("—" join dates).
  - Loan and receipt-duplicate labels show the loan amount or member name instead of UUID fragments. The sidebar shows the member's office instead of a fake "COOP-xxxx" ID.
- **Removed fake settings:** a "Two-Factor Authentication" switch (no 2FA exists), "Login notifications", per-topic notification toggles, and a language (French/Spanish/Portuguese) and currency (USD/GBP) picker with a Save button that did nothing. Replaced by an honest list of what members are notified about and read-only regional settings (Rs., English AD dates, NPT). The dead "Add Member" button is gone (members register; admins approve).
- **Mobile:**
  - Bottom navigation bar on phones (Home, Deposit, Loans, Policies, Settings).
  - Tab bars scroll instead of overlapping.
  - Deposit tables and the admin member list become stacked cards on phones; the toolbars stack.
  - The dashboard KPIs are a 2×2 grid.
- **Demo data:** demo accounts (`demo.*@example.com`) were seeded in the dev DB for screenshots and have since been removed, along with the screenshot container, its browser cache and the screenshots.

### 21. Loan calculator redesign
- **Before:** a small side card with two empty inputs and a "Calculate" button that called the backend, showing four numbers.
- **Now** (`components/member/LoanCalculator.tsx`, maths in `lib/loanMath.ts`), at the top of the Apply tab:
  - Defaults to the **most recent active loan policy** (`latestPolicy()`, also the application form's default). Other active policies are one tap away as chips ("Rs 50K–1L · 1% p.a." with a "Latest" tag).
  - Amount: slider limited to the policy's min–max, plus an exact-amount field. Term: 1–60 month slider, quick picks (6 months, 1/2/3 years) and an exact field up to 120 months.
  - **Live results**, no button: monthly instalment (principal + interest), monthly interest, total interest, total to repay, a principal-vs-interest bar, the payoff date if disbursed today, the grace period and a collateral note.
  - Full month-by-month **repayment schedule** (principal, interest, payment, still owed).
  - Policies with `emi_applicable` also offer a reducing-balance EMI option.
  - **"Apply with these numbers"** fills the application form below (policy, amount, term), scrolls to it and confirms with a toast.
- **Accuracy:** the simple-interest maths mirrors the backend (`POST /loans/calculator`: `amount × rate% ÷ 12` per month on the full amount). Checked identical to the paisa on 6 cases incl. 12.5% and 8.75%; EMI checked against the textbook value (Rs 1,00,000 @ 12% × 12 = Rs 8,884.88).
- **Open question:** the policy's `interest_rate` is treated as **per year** everywhere (backend calculator, "% p.a." labels). Both current policies are "1", i.e. 1% per year, which is unusually low. If the committee means 1% **per month**, the stored rates or the interpretation need changing.

### 22. Deposit and Policies tabs redesign
- **Policies** (`components/policies/PolicyBoard.tsx`; `MemberPoliciesTab` went from 1,097 to 690 lines): the spreadsheet tables and count cards are replaced by sections that answer what members need:
  1. **Open for signing** goes first, as spotlight cards: plain-language terms, "2 of 9 members signed · 1 rejected", a deadline countdown, *your* status ("You haven't signed yet" / "You signed" / "You rejected") and a clear **Review & sign** button. The old pencil-style "Signatures" icon looked like "edit".
  2. **In force:** active policies as readable cards ("Rs. 500 every month · due on day 31 · late fine 2.5%", "Loans of Rs. 50,000 – Rs. 1,00,000 · 1% interest per year · 150 days' grace"). Policies adopted before member signing say so instead of showing "0 of 0 signed". **Active policies whose end date has passed are flagged** (two such: Rs. 500 ended 1 Jun 2026, Rs. 10,000 ended 25 Mar 2026). They still accept deposits; the Treasurer should review them.
  3. **Drafts** (Treasurer only): Edit, Delete and **Sign & open** in one row.
  4. **Not adopted or ended:** collapsed, with Revise for the Treasurer.
  - A single All / Deposit / Loan filter. The create/edit/delete dialogs and signing/proxy dialogs are unchanged.
- **Deposits** (`DepositTab`):
  - A **this-period banner**: "Rs. 500 due by 30 Nov · 18 days left", or "This period's deposit is in" (from `/dashboard/me`).
  - A **step indicator** (Policy → Voucher → Check & split → Submit) that follows progress.
  - Policy facts on one line instead of disabled "Policy Amount"/"Late Fine" inputs.
  - The right column now explains **how deposits work** (pay, upload, split, Treasurer verifies, voucher kept 15 days) instead of repeating the policy dropdown as cards.
  - The upload accepts `image/*` types, so phones offer the camera; the text says "Tap to take a photo or choose a screenshot" on phones.
  - **My Deposits** opens with a verified / awaiting / rejected summary (amounts and counts). Tables show dates, not times.
  - **Review:** member initials and name, a large amount, paid vs due date, and an **On time / Late** badge.
  - The page title says "Deposits" on every sub-tab (it said "Make Deposit").
- Checked with temporary headless screenshots (desktop and phone, member and treasurer); the demo data and screenshot tooling were removed afterwards.

### 23. Deposits follow the single current policy; one loan policy choice
- **Decision:** deposits strictly use the **most current active deposit policy**.
- **Rule** (`services/policy_lifecycle.py`): a policy is *in force* when it is ACTIVE, has started and hasn't ended. The **current deposit policy** is the in-force one with the latest `effective_from`. Other in-force deposit policies are **superseded**.
  - `require_current_deposit_policy()` is used by the regular deposit, the smart deposit and the preview. A deposit naming any other policy is refused ("Deposits must use the current deposit policy (Rs. 5,000)").
  - `GET /policies/deposit/current` returns it.
  - The Home "next deposit due" uses it (it used the member's last policy).
  - `expire_ended_policies()` marks ACTIVE policies whose `effective_to` has passed as **EXPIRED**, hourly (in the `close_policy_signings` job) and on every current-policy lookup.
- **Effect on the dev data:** the Rs. 500 monthly (ended 1 Jun 2026) and Rs. 10,000 occasional (ended 25 Mar 2026) policies are now EXPIRED. **The current deposit policy is Rs. 5,000 monthly** (from 2 Jan 2026 NPT). Rs. 20,000 monthly (from 1 Jan 2026) was superseded and has been expired (end date 12 Nov 2026), so Rs. 5,000 is the only active deposit policy. Before this, the deposit form defaulted to the ended Rs. 500 policy.
- **Frontend:**
  - The Deposit tab has no policy picker any more; it shows the current policy as fixed facts, or a warning that deposits can't be made if none is in force.
  - The Policies board marks the deposit policies **Current** / **Superseded**; expired ones move to "Not adopted or ended".
- **Loans:** the calculator and the application form had separate policy choices (chips vs dropdown) that could disagree. There's now **one "Choose a loan policy" step** at the top of the Apply tab (cards, latest first). The calculator is based on that policy, and the form shows it instead of its own dropdown.

### 24. Community filters; loan guarantor signing and agreement PDF
- **Community filters** (`components/CommunityFilters.tsx`, `lib/communityFilters.ts`):
  - Both community tabs now have a filter bar: member name, From/To date (Nepal calendar days, converted with `local_day_bounds`), plus a dropdown and optional text search. Results update 300 ms after typing.
  - Deposits: `GET /deposits/community?member=&date_from=&date_to=&type=current|advance`.
  - Loans: `GET /loans/community?member=&date_from=&date_to=&status=approved|active|paid&purpose=`. Pending and rejected loans still can't be requested.
- **Guarantor:**
  - When applying, a member may choose a guarantor: any other active member, listed by `GET /users/directory`. Accounts with the system **admin** access role are left out of the list and refused as guarantors (`duties.can_be_guarantor`). If the policy requires collateral, a guarantor is required, and the old free-text collateral box becomes optional notes.
  - The guarantor is notified and sees "A request to be a guarantor" on the Loans tab and Home. They **sign** (their full name and the time are recorded) or **decline** (with an optional note) via `POST /loans/{id}/guarantee`.
  - Declining closes the application as rejected.
  - The Treasurer is notified only after the guarantor signs. Fund verification and approval are blocked while the signature is pending (400).
  - The guarantor can't act on a loan they guarantee (403).
  - The guarantor can view the loan.
- **Agreement PDF** (`services/loan_agreement.py`, fpdf2):
  - On approval, an A4 record is generated once. It lists the borrower, the terms (simple-interest totals), the guarantor's signature with name and date, and who verified funds and approved, with all times in NPT.
  - It's stored under `DOCUMENT_STORAGE_DIR` (the `documents-data` Docker volume), and its SHA-256 is kept on the loan.
  - `GET /loans/{id}/agreement` serves it to the applicant, the guarantor and office bearers. Everyone else gets 404.
  - Treasurers are notified that the agreement is ready. The applicant gets a "Loan agreement (PDF)" button on their loan card. Office bearers, the applicant and the guarantor get a PDF button in the community table.
- **Migration** `64b90a2ed9f5`: new guarantor and agreement columns on `loan`, with a named FK (`fk_loan_guarantor_user_id_user`).
- **New dependency:** `fpdf2` (in `pyproject.toml`/`poetry.lock`). The backend and celery images were rebuilt.
- **Operations:** the `documents-data` volume holds permanent records and must be included in backups.
- Tests: `test_guarantor` (25 checks) and `test_filters` (11). All 13 suites pass (205 checks).
- **Reviewer names:** `approved_by`, `rejected_by` and `fund_verified_by` still store emails (the duty checks use them), but loan responses now also carry `approved_by_name`, `rejected_by_name` and `fund_verified_by_name`. My Loans ("Approved by") and the review cards ("Funds Verified By") show "Name (Role)", e.g. "Pres Gx (President)", instead of emails; the agreement PDF uses the same format (`duties.name_with_role`).

### 25. Fix: creating, editing and deleting policies crashed (500)
- **Symptom:** clicking Create Policy left the dialog open. The request failed with a 500, and the page's error banner was hidden behind the dialog.
- **Cause:** the policy-signing change (b06322f) removed the module-level `deposit_policy_service` / `loan_policy_service` instances, but the create/update/delete routes still used them (`NameError`). Restored them.
- **Two more bugs found while testing:**
  - The deposit update schema had no `change_reason`, so editing a deposit policy crashed. Added the field, as the loan schema already has it.
  - Both update routes did `policy_in.status = None` to block status changes. That marked `status` as set, so it was written as NULL, and the database refused it. The services now leave `status`, `change_reason`, `updated_by` and `updated_at` out of the update data instead.
- **Frontend:** saving shows a success toast. A failure now shows the server's message as a toast, which is visible above the dialog.
- Tests: `test_policy_crud` (create, update and delete for both policy types; an update can't change the status). 7/7 pass.
- Pyflakes reports no other undefined names in `app/`.

### 26. Policies: admin accounts don't sign, the policy is shown before signing, adoption record PDF
- **Late fine in Rs:** the deposit-policy form shows the fine in rupees under the % ("= Rs. 250 on a Rs. 5,000 deposit"). The fine is a one-off % of the deposit amount (`calculate_late_fine`). The policy cards show "Late fine 5% (Rs. 250)".
- **Signers:**
  - Accounts with the system **admin** access role are no longer required signers, even if they also carry the member role. Admin is an extra role, and that person signs from their member account. (This replaces the earlier rule that an admin who is also a member signs.)
  - In policies opened before this change, existing admin rows are ignored: hidden and not counted.
  - An admin account trying to sign gets 403. An admin can't be the target of a proxy signature, but admins can still *request* proxies.
- **The policy is shown before signing:**
  - `services/policy_document.py` holds the single source of the wording. `policy_statement()` gives a plain-language paragraph, e.g. "Every member shall deposit Rs. 5,000 by the 15th of every month. A deposit made after the due date carries a late fine of 5% of the deposit (Rs. 250). This policy is effective from …". `policy_terms()` gives the label/value rows.
  - The signing summary (`GET /policies/{type}/{id}/signatures`) now includes `title`, `statement`, `terms`, `record_available` and `record_reference`.
  - The signing dialog is titled with the policy and opens with a "The policy" section (the statement and a terms grid) above the signatures.
- **Adoption record (PDF):**
  - When a policy is adopted, a letter on Yugantar letterhead is generated:
    - the logo, "YUGANTAR Cooperative", a unique **Ref. No.** (`YUG/DP/2026/0001` for deposits, `YUG/LP/…` for loans, one sequence per year) and the date;
    - a blue/red/green rule taken from the logo;
    - a subject line, the policy statement, and who adopted it and when ("All 6 members listed below signed and approved this policy by …, and it took effect immediately on adoption …");
    - a terms table and a members' approval table (no., name, role, decision, signed on in NPT, proxy marked);
    - a closing line and the **Treasurer's signature block** (the Treasurer who created the policy, else the current Treasurer);
    - a footer with the reference, page x of y and a checksum note.
  - It's stored in the `documents-data` volume (`policy-records/…`), with a new `policyrecord` table holding the reference, file key, SHA-256 and certifying Treasurer. Migration `bd9e87df7c79`, round trip tested.
  - It's generated once, at adoption (in `close_if_due`; a PDF failure never undoes the adoption), or on the first download for policies adopted earlier.
  - `GET /policies/{type}/{id}/record`: any member may download it once the policy is adopted (active or ended); otherwise 404. The file is named by its reference.
  - Download buttons are in the signing dialog ("Adoption record (PDF)"), on the in-force cards and on ended policies.
  - The logo is a cropped copy of `public/main_logo.png` at `backend/app/assets/yugantar_logo.png`. The Celery worker also has the logo and fpdf2, because the hourly job adopts policies.
- Tests: `test_policy_record` (15 checks); `test_signing` updated to the new admin rule (34), and it now deletes the record files it creates.
- **Fix: the signing dialog "blinked" after Sign.** The dialog's `onChanged` refresh (`fetchPolicies`) set the page's `loading` flag, which replaced the whole Policies tab with the spinner. That unmounted the open dialog, which re-opened fresh and lost its "You signed" notice. Now only the first load shows the spinner; later refreshes update the page in place.

### 27. Hand signatures on policies; members on every adoption record
- **Why the record had no members:** the record you downloaded (`YUG/LP/2026/0001`) was for a loan policy adopted before in-app signing, so there were no signature rows to list.
- **Older policies:** the record now prints a "Members' signatures" sheet listing the current members, with blank "Signature and date" boxes to sign on the printed copy.
- **Signed policies:** the members' approval table gains a **Signature** column showing each member's hand signature. Members who signed before hand signatures existed show "Signed in app". The Treasurer's hand signature is placed above the signature line.
- **Hand signature input** (`components/signature/SignaturePad.tsx`):
  - **Draw** with a finger, stylus or mouse. It uses Pointer Events with `touch-action: none`, so the page doesn't scroll while signing on a phone, plus coalesced events and smoothed curves. The canvas is sized for the screen's pixel density and redrawn on resize or rotation. Undo and Clear buttons are included.
  - **Upload image**: a photo or scan (any format the browser can open, re-encoded in the browser, max 8 MB).
  - Members must provide a signature to "Sign (approve)". The Treasurer's "Sign & open" now opens `SignatureDialog` with the pad.
- **Backend:**
  - `services/signature_image.py` decodes the data URL with Pillow, refuses non-images and empty or too-small drawings, makes a paper background transparent, crops to the ink, caps the size at 900×300 and stores a PNG (`signatures/…` in the documents volume).
  - New `PolicySignature.signature_file_key` / `signature_sha256` fields (migration `30bcc7a59cb3`, round trip tested).
  - The sign and submit routes accept `signature_image`. Rejecting removes the hand signature, and withdrawing deletes the images.
  - `GET /policies/{type}/{id}/signatures/{user_id}/image` lets any member view a signature. The signing dialog shows each member's signature under their name.
  - The backend still accepts an approval without an image, for proxy signatures and older clients.
- **PDF layout:** the closing paragraph and signature block are kept together on one page.
- **Dev data:** the two records generated earlier were deleted. They are rebuilt in the new layout on their next download, and their reference numbers are issued again.
- Tests: `test_hand_signature` (10 checks): drawn and photo signatures, refusal of empty or non-image data, background removal, removal on rejection, and the PDF embedding the signatures. All 16 suites pass (264 checks).

### 28. Policy wording in Nepali; Treasurer can edit the wording
- **Nepali text from templates** (`policy_document.policy_statement_ne`): written from the terms by fixed sentence templates (no translation service or ML), so it costs nothing to run.
  - Numbers use Devanagari digits (रु. ५०,०००, १%).
  - Dates are Bikram Sambat with the AD date in Nepali (वि.सं. २०८३ कार्तिक २६ (ई.सं. २०२६ नोभेम्बर १२)), converted with `nepali-datetime`.
  - Deposit due days are days of the AD month, so the text says "हरेक अंग्रेजी महिनाको १५ तारिखभित्र" rather than गते (BS).
- **Editable wording:**
  - New nullable `statement_en` / `statement_ne` on policies (migration `18cbd62e7fb4`; the column is on the shared base, so the unused interest, penalty and investment policy tables got it too). Null means automatic.
  - Create and update accept both fields. They can only be changed while the policy is a draft, so the wording is locked once it's opened for signing.
  - `POST /policies/{deposit|loan}/statement-preview` (policy managers) returns the generated text for the form's current terms, without saving anything.
  - The policy forms have a "Policy wording" section (`components/policies/PolicyWordingEditor.tsx`) with English and नेपाली boxes. The text is generated as the Treasurer types (400 ms debounce) and can be edited. An edited box is marked "edited", with a warning that it no longer follows the terms and a "Use automatic text" reset.
  - The form-to-request conversion was pulled into `depositPayload` / `loanPayload`, shared by save and preview.
- **Members see both:** the signing dialog shows the English and the Nepali text. `SigningSummary` gained `statement_ne` and `statement_custom`, and `statement` is now the edited English if there is one.
- **PDF:** prints the English then the Nepali paragraph.
  - The Nepali uses Noto Sans Devanagari with HarfBuzz text shaping (`uharfbuzz`), so conjuncts and vowel signs render correctly.
  - Noto Sans is the fallback for Latin letters inside the Nepali (e.g. "EMI").
  - The fonts are in `backend/app/assets/fonts/` (regular weights only, about 0.85 MB, SIL Open Font License).
- **Web:** Noto Sans Devanagari is added to the Google Fonts link and the font stack. It's served split by script, so it only downloads when Nepali text is shown.
- **Cost:** `uharfbuzz` (2 MB wheel) and `nepali-datetime` (18 KB) were added to `pyproject.toml` / `poetry.lock`, and the backend and celery images rebuilt. CPU cost only arises when a PDF is generated (once per adoption), plus a tiny preview request while editing a form.
- Tests: `test_policy_nepali` (11 checks). All 17 suites pass (275 checks).
- **Fix: phantom "New Deposit Requires Verification" notifications.** The receipts test suite (a scratch test, not in the repo) commits real rows and deletes them afterwards. Its cleanup removed the test user ("Tst R"), deposits and receipts, but not the notifications those deposits sent to the real Treasurer accounts, so every test run left two behind (68 in total). They were deleted, and the test's cleanup now removes them. Nothing in the app itself was wrong.
- The PDF record prints the Nepali paragraph as well. No records were stored before the Nepali change (the earlier ones were cleared in entry 27), so every record generated from now on includes it.

### 29. Policy record: Nepali-only wording; preview PDF while signing is open
- **Why the PDF looked empty:** the record downloaded (`YUG/DP/2026/0001`) was for a policy adopted before in-app signing, so it showed the blank "Signature and date" sheet for signing on paper. The policy actually signed with hand signatures was still open (it's adopted at its one-week deadline), so it had no record yet.
- **Preview PDF:**
  - `GET /policies/{type}/{id}/record/preview` lets any member download it while signing is open: the record as it stands, with the hand signatures collected so far.
  - It's watermarked "PREVIEW - NOT ADOPTED", its Ref. No. reads "PREVIEW", a red note says it isn't the adoption record, and the footer reads "Not an official record".
  - It isn't stored, and it's no longer available once the policy is adopted.
  - The signing dialog has a "Preview PDF" button (`preview_available` in the summary).
- **Rows with hand signatures** are taller (9 mm), so the signatures are legible.
- **Nepali-only wording:**
  - The PDF prints only the Nepali paragraph.
  - The policy form's wording editor has only the नेपाली box.
  - The signing dialog shows the Nepali first, with the English under "Read in English".
  - The rest of the PDF (headings, terms table) is still in English.
- The stored record `YUG/DP/2026/0001` (old layout, dev data) was cleared; it's rebuilt on the next download.
- Tests: `test_policy_record` gained 3 preview checks (18). All 17 suites pass (278 checks).

### 30. The whole system in English and Nepali
- **Choice:** English by default. Each user's choice is saved on their account (`User.preferred_language`, "en" | "ne"; migration `80fe1322cf51`, existing users default to "en").
  - Members change it in **Settings → Preferences → Language**.
  - There's also a **language button** in the header (members, admin) and on the sign-in and sign-up pages, where the choice is kept in the browser and sent with the registration.
  - The Settings page remembers its open tab, because switching language re-renders the app.
- **Nepali style:** Devanagari digits (रु. १,००,०००, ३ वटा) and **Bikram Sambat dates** (२०८३ कार्तिक २६).
  - `lib/bs.ts` converts AD→BS from a 1.2 KB month-length table for BS 2000–2099, exported from the backend's `nepali-datetime`, so both sides agree. Spot-checked against it, including the year boundary.
  - Times stay in NPT. Chart months are AD months named in Nepali, because deposits follow the AD calendar.
- **Frontend** (`lib/i18n.ts`, `contexts/LanguageContext.tsx`, `locales/ne.ts`):
  - English stays in the code; `t("…")` returns the Nepali, and values go in as `{0}`, `{1}`, so whole sentences are translated in Nepali word order.
  - `n()` converts numbers to Nepali digits; `roleName()` and `enumLabel()` cover roles and API status values. `formatRs`, `formatRsCompact`, `formatDate*` and `monthLabel` follow the language.
  - Text wasn't wrapped by hand. A TypeScript-compiler codemod wrapped JSX text, text props, toasts, confirm dialogs and error fallbacks, and used the type checker to wrap number values in `n()`; the rest (template strings, plurals, label constants) was done by hand.
  - Local variables named `t`/`n` were renamed first so they can't shadow the functions.
  - About 860 texts are translated. The Nepali dictionary is a separate chunk (about 20 KB gzipped), loaded only when Nepali is chosen.
  - Every API request sends `X-Language`.
- **Backend** (`app/i18n.py`):
  - **Notifications and emails** use a message catalogue (key + values) with English and Nepali text. A new `services/notify.py` `notify()` replaces the per-endpoint notification and email code (deposits, loans, guarantor, agreement, policy signing, proxies, new members).
  - Notifications store the English text plus `i18n_key`/`i18n_args`, and are shown in the reader's language. Emails go out in each recipient's saved language; the verification, password-reset, approval and rejection emails have Nepali versions too.
  - **Error messages:** an exception handler translates `HTTPException.detail` from a table of about 130 exact texts plus patterns for the dynamic ones (amounts, statuses). Home action items, the admin activity log and policy labels are translated the same way. Anything unknown stays English.
  - Amounts and dates in server text use Nepali digits and BS dates.
- **PDF records:** the policy wording is already Nepali-only; the rest of the record is still English.
- **Not covered:**
  - Date pickers (`<input type="date">`) remain in the browser's AD calendar.
  - Some legacy screens' marketing copy is translated as is.
  - **The Nepali texts should be reviewed by a native speaker**; they are all in `frontend/yugantar/src/locales/ne.ts` and `backend/app/i18n.py`.
- **Tests:** the new `test_i18n` (13 checks) covers the setting, translated errors, notifications in both languages, emails in the recipient's language, BS date-time and the activity and dashboard patterns. All 18 suites pass, including test files updated for the new email helper.
  - The frontend type-checks, a production build succeeds, and lint shows no new problems.

---

## ## Adding New Tools

### 31. Tools: Calendar and online Meetings (Jitsi as a Service)
- **Where:** a new **Tools** group in the member sidebar with **Calendar** and **Meetings** (`/dashboard/calendar`, `/dashboard/meetings`), laid out like Teams.
  - On phones the bottom bar is Home · Deposit · Loans · Calendar · **More**; More opens the full menu (Policies, Meetings, Settings).
  - Home has a **Coming up** card with the next 4 items. Bare admin accounts don't get the calendar.
- **Who does what:**
  - Every active member sees "All members" events. Office bearers (President, Treasurer, Secretary) also see "Office bearers only" events.
  - Only office bearers create, edit and cancel events.
  - A member can't see or open an event they aren't allowed to see; the API returns 404.
- **Events** (`calendar_event`, `event_rsvp`; migration `a08f0e9018ce`, round-trip tested):
  - Fields: title, type (meeting, general assembly, holiday, notice, other), time or all-day, place, details.
  - **Repeats:** weekly or monthly, with an optional end date. A monthly event on the 31st falls on the last day of shorter months. Editing a repeating event changes the whole series.
  - Cancelled events stay on the calendar, struck through.
  - **Replies:** Going / Maybe / Can't go, per occurrence. The counts are shown, and anyone can expand the list to see who replied. Changing an event's time clears the replies.
- **Due dates on the calendar** are computed from existing data, never copied, so they can't go stale. Members can switch them off.
  - The monthly deposit due day under the policy in force.
  - Policy signing deadlines.
  - The member's own loan maturity date, which only they see.
- **Views:** Month, Week and Agenda (next 30 days).
  - In Nepali the month grid is the **BS month** (वैशाख…चैत्र), with BS day numbers and the AD day in small print. Saturdays and holidays are in red. `lib/bs.ts` gained `bsToAd` and `bsMonthLength`.
  - On phones, a day shows coloured dots and the selected day's list appears below the grid.
  - **Add to my phone calendar** downloads an `.ics` file, including the repeat rule.
- **Notifications:**
  - Members get an in-app notification and an email, in their own language, when an event or meeting is added, its time or place changes, or it's cancelled. Members who lose access because visibility was narrowed are told it's cancelled.
  - Celery beat (`send_event_reminders`, every 5 minutes) sends a reminder 30 minutes before each timed event, once per occurrence.
  - Clicking an event notification opens the Calendar; a meeting notification opens the Meetings page.
- **Online meetings (8x8 JaaS):**
  - **Join:** any event can be an online meeting, and office bearers can also **Meet now**. Members join inside the app (full-screen; the Jitsi script loads from 8x8 only when someone joins) from 15 minutes before the start until 60 minutes after the scheduled end.
  - **Tokens:** `services/jaas.py` signs a short-lived RS256 token per person and per room with the JaaS private key. The token carries the member's name. Office bearers and the organiser are hosts (moderators). Recording, live streaming, dial-out and transcription are off. The token response isn't cached.
  - **Room names** are random (`yugantar-` + 24 hex characters). They're sent only in a join response, never in the feed, emails or `.ics` files.
- **Configuration:**
  - New settings: `JAAS_APP_ID`, `JAAS_API_KEY_ID`, `JAAS_PRIVATE_KEY_PATH` (default `/app/secrets/jaas_private_key.pk`), plus the join window and reminder minutes. They're set in `backend/.env` and documented in `.env.example`.
  - The private key is in `backend/secrets/` (mode 600).
  - `.gitignore` now ignores `jitsi_keys/`, `backend/secrets/`, `*.pk` and `*.pem`.
  - Meetings switch off cleanly when the key is missing.
- **Production (`docker/nginx.conf`):**
  - The CSP allows `https://8x8.vc` for scripts and frames only.
  - `Permissions-Policy` allows camera, microphone, screen sharing and fullscreen for the site and 8x8 only (it was `camera=()`, which would have blocked meetings).
- **Nepali:** about 120 new interface texts, 7 notification messages and 14 error messages.
- **Tests:** the new `test_calendar` (47 checks) covers permissions, visibility, replies, edits, cancellation, repeat rules, all-day handling, due dates, Nepali output, meeting tokens (room, name, host role, expiry, no caching), Meet now, reminders and `.ics` export. All 19 suites pass. The frontend type-checks and builds, and lint shows no new errors.

### 32. Personal events; BS/AD date pickers (patrojs); one Bikram Sambat table everywhere
- **Personal events:**
  - Any member can add events that only they see: "Who can see it" = **Only me (personal)**, stored as `visibility = "private"` with category `personal` (teal on the calendar). No migration was needed.
  - Nobody else is notified; the owner still gets the 30-minute reminder.
  - A personal event can't be an online meeting and has no replies.
  - The owner edits or deletes it (`DELETE /calendar/events/{id}`, personal events only). Cooperative events are still cancelled, not deleted, so members can see what happened.
  - Office bearers can't see other people's personal events. Their own personal events are private too.
- **Cooperative events** (all members, or office bearers only) are still created and changed only by office bearers. A member who tries is told they can add a personal event instead.
- The calendar's **New event** button is shown to everyone; for members it says **Personal event** and the form shows only personal options.
- **patrojs 1.0.2** (MIT, pinned exactly), a React BS/AD calendar and date picker:
  - **Checked before adding:** no install scripts, no network, `eval` or storage use in its code, about 64 KB, and the installed files match the inspected tarball.
  - It moved `@floating-ui/dom`/`core`/`utils` (shared with Radix) from 1.7 to 1.8 (published July 2026).
  - **`components/DateField.tsx`:** `DateField` and `DateTimeField` (date picker plus time) replace every `<input type="date">` and `datetime-local` in the app: community filters, voucher date, policy effective dates and the event form.
  - In Nepali the picker shows the **BS calendar** with the AD date under each day; in English it's the other way round. Saturday is the weekend, and "today" is the Nepal date.
  - **Theme:** it's styled with the app's colours (`index.css`, `._patro` tokens) in light and dark. Inside dialogs its popover renders in the dialog.
  - Values are still AD `YYYY-MM-DD` in NPT, so nothing changed for the API.
- **One BS table everywhere:** patrojs's table and the backend's `nepali-datetime` disagreed:
  - **BS 2062 Baisakh–Jestha (2005):** the sources found put 1 Jestha 2062 on 14 May 2005, which matches patrojs.
  - **From BS 2084 Jestha (May 2027) onward:** the official calendar isn't published yet, so both libraries use projections.

  Both sides now use **patrojs's table**: `lib/bs.ts` wraps `patrojs/utils`, and the backend has `app/utils/bs_calendar.py` (generated from patrojs; BS 1978–2099). `nepali-datetime` was removed from `pyproject.toml` and `poetry.lock`. All 44,561 days in the supported range were compared, both directions: no differences. **When patrojs is upgraded, regenerate the backend table** (export `daysInBsMonth` for each month) and compare again.
- **Test fix:** the `test_policy_record` cleanup deleted the PDF files of every record it touched, including the real `YUG/DP/2026/0001`. That file was rebuilt with the same reference and date, and the test now skips policies that already have a record.
- **Nepali:** 13 more interface texts and 4 error messages.
- **Tests:** `test_calendar` has 16 more checks for personal events (63 in all). All 19 suites pass (`test_policy_record`: 17 pass, 1 skipped because no active policy is without a record). The frontend type-checks and builds, and lint shows no new problems.

### 33. Calendar: click a date to add an event
- **Month view:** clicking a date opens the event form for that day (a **+** appears when hovering over a date). This replaces the hidden double-click.
  - On phones, where days only show dots, the first tap shows that day's events below the grid and tapping the same day again adds an event.
  - Clicking an event still opens it, and **+N more** shows the day's full list.
- **Week view:** every day has an **+ Add** button under its events.
- The toolbar's **New event** button and the day list's **Add** stay as other ways in. Members still add personal events only.
