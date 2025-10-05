from fastapi import FastAPI, Depends, HTTPException
from sqlmodel import Session, select
from contextlib import asynccontextmanager

from db import create_db_and_tables, init_db
from models import User, Deposit, Receipt, Loan, Fine
