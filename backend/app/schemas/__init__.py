from .deposit_schema import DepositBase, DepositCreate, DepositModeratorUpdate, DepositUserUpdate
from .receipt_schema import ReceiptBase, ReceiptCreate, ReceiptUpdate
from .user_schema import UserBase, UserCreate, UserUpdate, CooperativeRole
from .loan_schema import LoanBase, LoanUpdate #, LoanCreate
from .expense_schema import ExpenditureBase

all_schemas = [
    UserBase,
    UserCreate,
    UserUpdate,
    CooperativeRole,
    DepositBase,
    DepositCreate,
    DepositModeratorUpdate,
    DepositUserUpdate,
    ReceiptBase,
    ReceiptCreate,
    ReceiptUpdate,
    LoanBase,
    # LoanCreate,
    LoanUpdate,
    ExpenditureBase,
]
__all__ = [
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "CooperativeRole",
    "DepositBase",
    "DepositCreate",
    "DepositModeratorUpdate",
    "DepositUserUpdate",
    "ReceiptBase",
    "ReceiptCreate",
    "ReceiptUpdate",
    "LoanBase",
    # "LoanCreate",
    "LoanUpdate"
]
# Add all schemas to __all__ for easier import
# This is useful for dynamic imports or when you want to expose all schemas
__all__ += [schema.__name__ for schema in all_schemas]
__all__ += ["all_schemas"]
