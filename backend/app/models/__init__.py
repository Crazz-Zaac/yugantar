from .base import BaseModel
from .users_model import User
from .deposit_model import Deposit
from .loan_model import Loan
from .receipt_model import Receipt
from .fine_model import Fine

# Dictionary to map model names to their classes
ALL_MODELS = {
    "base": BaseModel,
    "user": User,
    "deposit": Deposit,
    "loan": Loan,
    "fine": Fine,
    "receipt": Receipt,
}

# Utility functions to get models information
def get_model(model_name: str):
    """
    Get the model class based on the model name.
    """
    if model_name in ALL_MODELS:
        return ALL_MODELS.get(model_name.lower())
    else:
        raise ValueError(f"Model {model_name} not found.")

# Functions to create and drop tables
def create_table(model_name: str, engine):
    """
    Create a table based on the model name.
    """
    model = get_model(model_name)
    if model:
        model.metadata.create_all(engine)
        return f"Table {model_name} created successfully."
    else:
        raise ValueError(f"Model {model_name} not found.")

def drop_table(model_name: str, engine):
    """
    Drop a table based on the model name.
    """
    model = get_model(model_name)
    if model:
        model.metadata.drop_all(engine)
        return f"Table {model_name} dropped successfully."
    else:
        raise ValueError(f"Model {model_name} not found.")

__all__ = [
    "Base",
    "User",
    "Deposit",
    "Loan",
    "create_table",
    "drop_table",
    "get_model",
]