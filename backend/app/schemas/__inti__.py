from .deposit_schema import DepositBase, DepositCreate, DepositUpdate
from .receipt_schema import ReceiptBase, ReceiptCreate, ReceiptUpdate
from .user_schema import UserBase, UserCreate, UserUpdate, UserOut, Role, CooperativeRole
from .loan_schema import LoanBase, LoanCreate, LoanUpdate

all_schemas = [
    UserBase,
    UserCreate,
    UserUpdate,
    UserOut,
    Role,
    CooperativeRole,
    DepositBase,
    DepositCreate,
    DepositUpdate,
    ReceiptBase,
    ReceiptCreate,
    ReceiptUpdate,
    LoanBase,
    LoanCreate,
    LoanUpdate
]
__all__ = [
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "Role",
    "CooperativeRole",
    "DepositBase",
    "DepositCreate",
    "DepositUpdate",
    "ReceiptBase",
    "ReceiptCreate",
    "ReceiptUpdate",
    "LoanBase",
    "LoanCreate",
    "LoanUpdate"
]
# Add all schemas to __all__ for easier import
# This is useful for dynamic imports or when you want to expose all schemas
__all__ += [schema.__name__ for schema in all_schemas]
__all__ += ["all_schemas"]
