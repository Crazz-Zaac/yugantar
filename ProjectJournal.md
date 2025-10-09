# Project Journal

## TODO:
- [x] Create virtual environment and install packages
- [x] Create DB schema
- [x] Define model definitions
- [x] Setup initial PgAdmin Docker container
- [x] Connect Postgres DB
- [x] Migrate DB
- [ ] User API
- [ ] CRUD on User table
- [ ] User authentication using JWT tokens
- [ ] Define api and routes

## Important commands
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