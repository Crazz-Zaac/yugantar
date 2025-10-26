from sqlmodel import SQLModel
from .base import BaseModel
from .user_model import User
from .deposit_model import Deposit
from .loan_model import Loan
from .receipt_model import Receipt
from .fine_model import Fine
from .expense_model import ExpenditureModel

# Dictionary to map model names to their classes
ALL_MODELS = {
    "base": BaseModel,
    "user": User,
    "deposit": Deposit,
    "loan": Loan,
    "fine": Fine,
    "receipt": Receipt,
    "expendituremodel": ExpenditureModel,
}

# Utility functions to get models information
def get_model(model_name: str):
    """
    Get the model class based on the model name.
    """
    model_name = model_name.lower()
    if model_name in ALL_MODELS:
        return ALL_MODELS[model_name]
    else:
        raise ValueError(f"Model {model_name} not found.")

# Functions to create and drop tables
def create_table(model_name: str, engine):
    """
    Create a table based on the model name.
    """
    model = get_model(model_name)
    if model:
        SQLModel.metadata.create_all(engine, tables=[model.__table__])
        return f"Table {model_name} created successfully."
    else:
        raise ValueError(f"Model {model_name} not found.")

def drop_table(model_name: str, engine):
    """
    Drop a table based on the model name.
    """
    model = get_model(model_name)
    if model:
        SQLModel.metadata.drop_all(engine, tables=[model.__table__])
        return f"Table {model_name} dropped successfully."
    else:
        raise ValueError(f"Model {model_name} not found.")

def create_all_tables(engine):
    """
    Create all tables defined in SQLModel models.
    """
    SQLModel.metadata.create_all(engine)
    return "All tables created successfully."

def drop_all_tables(engine):
    """
    Drop all tables defined in SQLModel models.
    """
    SQLModel.metadata.drop_all(engine)
    return "All tables dropped successfully."

__all__ = [
    "BaseModel",
    "User",
    "Deposit", 
    "Loan",
    "Receipt",
    "Fine",
    "create_table",
    "drop_table",
    "create_all_tables",
    "drop_all_tables",
    "get_model",
    "ALL_MODELS",
]