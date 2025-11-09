# @property
# def is_overdue(self) -> bool:
#     return (
#         self.loan_status == LoanStatus.ACTIVE
#         and datetime.now(timezone.utc) > self.end_date
#         and self.remaining_amount > 0
#     )