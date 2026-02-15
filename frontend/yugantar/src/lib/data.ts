// Mock data for the cooperative dashboard

export const memberProfile = {
  name: "Amara Osei",
  email: "amara.osei@email.com",
  memberId: "COOP-2024-0847",
  joinDate: "2022-03-15",
  avatar: "AO",
  phone: "+233 24 567 8901",
  address: "14 Independence Ave, Accra",
}

export const kpiData = {
  totalSavings: 24850.0,
  savingsGrowth: 12.5,
  activeLoan: 15000.0,
  loanRemaining: 8750.0,
  monthlyPayment: 625.0,
  nextPaymentDate: "2026-03-01",
  dividendEarned: 1245.0,
  dividendRate: 5.2,
  totalInvestments: 35000.0,
  investmentReturn: 8.7,
}

export const externalInvestments = [
  { id: 1, name: "Treasury Bonds 2026", type: "Government Bond", amount: 15000, returnRate: 6.5, maturityDate: "2026-12-15", status: "active" },
  { id: 2, name: "Agri-Fund Portfolio", type: "Mutual Fund", amount: 10000, returnRate: 11.2, maturityDate: "2027-06-30", status: "active" },
  { id: 3, name: "Real Estate Trust", type: "REIT", amount: 10000, returnRate: 8.4, maturityDate: "2028-01-01", status: "active" },
]

export const activeLoan = {
  id: "LN-2025-0312",
  amount: 15000,
  disbursedDate: "2025-06-15",
  dueDate: "2027-06-15",
  interestRate: 8.5,
  monthlyPayment: 625,
  totalPaid: 6250,
  remaining: 8750,
  status: "current" as const,
  purpose: "Business Expansion",
}

export const loanHistory = [
  { id: "LN-2024-0189", amount: 5000, status: "completed" as const, purpose: "Education", disbursedDate: "2024-01-10", completedDate: "2024-12-10" },
  { id: "LN-2023-0056", amount: 3000, status: "completed" as const, purpose: "Emergency", disbursedDate: "2023-03-20", completedDate: "2023-09-20" },
]

export const communityLoans = [
  { member: "Kwame A.", amount: 20000, purpose: "Agriculture", status: "current" as const, dueDate: "2027-01-15" },
  { member: "Fatima B.", amount: 8000, purpose: "Education", status: "current" as const, dueDate: "2026-08-20" },
  { member: "Kofi M.", amount: 12000, purpose: "Housing", status: "current" as const, dueDate: "2028-03-10" },
  { member: "Esi D.", amount: 5000, purpose: "Business", status: "completed" as const, dueDate: "2025-11-30" },
  { member: "Yaw K.", amount: 15000, purpose: "Agriculture", status: "current" as const, dueDate: "2027-05-22" },
  { member: "Abena S.", amount: 7500, purpose: "Emergency", status: "overdue" as const, dueDate: "2025-12-01" },
]

export const depositHistory = [
  { id: "DEP-001", date: "2026-02-01", amount: 500, method: "Bank Transfer", status: "confirmed" as const, voucherRef: "VCH-8834" },
  { id: "DEP-002", date: "2026-01-15", amount: 500, method: "Mobile Money", status: "confirmed" as const, voucherRef: "VCH-8701" },
  { id: "DEP-003", date: "2026-01-01", amount: 750, method: "Bank Transfer", status: "confirmed" as const, voucherRef: "VCH-8590" },
  { id: "DEP-004", date: "2025-12-15", amount: 500, method: "Cash", status: "confirmed" as const, voucherRef: "VCH-8422" },
  { id: "DEP-005", date: "2025-12-01", amount: 500, method: "Bank Transfer", status: "pending" as const, voucherRef: "VCH-8311" },
]

export const notifications = [
  { id: 1, title: "Loan Payment Due", message: "Your monthly payment of $625 is due on March 1, 2026.", type: "warning" as const, time: "2 hours ago", read: false },
  { id: 2, title: "Deposit Confirmed", message: "Your deposit of $500 (VCH-8834) has been confirmed.", type: "success" as const, time: "1 day ago", read: false },
  { id: 3, title: "Dividend Payout", message: "Annual dividend of $1,245 has been credited to your account.", type: "info" as const, time: "3 days ago", read: true },
  { id: 4, title: "Policy Update", message: "New loan interest rates effective from April 2026.", type: "info" as const, time: "1 week ago", read: true },
  { id: 5, title: "New Investment Opportunity", message: "Green Energy Fund now available for member investment.", type: "info" as const, time: "1 week ago", read: true },
]

export const savingsChartData = [
  { month: "Sep", amount: 20100 },
  { month: "Oct", amount: 20850 },
  { month: "Nov", amount: 21600 },
  { month: "Dec", amount: 22600 },
  { month: "Jan", amount: 23850 },
  { month: "Feb", amount: 24850 },
]

export const loanRepaymentChart = [
  { month: "Sep", paid: 625, remaining: 11875 },
  { month: "Oct", paid: 625, remaining: 11250 },
  { month: "Nov", paid: 625, remaining: 10625 },
  { month: "Dec", paid: 625, remaining: 10000 },
  { month: "Jan", paid: 625, remaining: 9375 },
  { month: "Feb", paid: 625, remaining: 8750 },
]

// Admin data

export const adminMembers = [
  { id: "COOP-2024-0847", name: "Amara Osei", email: "amara.osei@email.com", joinDate: "2022-03-15", savings: 24850, loanBalance: 8750, status: "active" as const },
  { id: "COOP-2023-0312", name: "Kwame Asante", email: "kwame.a@email.com", joinDate: "2021-07-20", savings: 42300, loanBalance: 12000, status: "active" as const },
  { id: "COOP-2024-0156", name: "Fatima Bello", email: "fatima.b@email.com", joinDate: "2023-01-10", savings: 18500, loanBalance: 0, status: "active" as const },
  { id: "COOP-2022-0089", name: "Kofi Mensah", email: "kofi.m@email.com", joinDate: "2020-11-05", savings: 56200, loanBalance: 5000, status: "active" as const },
  { id: "COOP-2024-0934", name: "Esi Darko", email: "esi.d@email.com", joinDate: "2024-02-28", savings: 8900, loanBalance: 3500, status: "inactive" as const },
  { id: "COOP-2023-0678", name: "Yaw Kumi", email: "yaw.k@email.com", joinDate: "2022-09-12", savings: 31400, loanBalance: 15000, status: "active" as const },
  { id: "COOP-2024-0445", name: "Abena Sarfo", email: "abena.s@email.com", joinDate: "2023-06-01", savings: 12750, loanBalance: 7500, status: "suspended" as const },
]

export const adminKpis = {
  totalMembers: 248,
  activeMembers: 231,
  totalDeposits: 1850000,
  depositsGrowth: 15.3,
  totalLoansOut: 680000,
  loanDefault: 2.1,
  totalAssets: 3200000,
  assetsGrowth: 18.7,
}

export const memberGrowthChart = [
  { month: "Sep", members: 218 },
  { month: "Oct", members: 224 },
  { month: "Nov", members: 229 },
  { month: "Dec", members: 235 },
  { month: "Jan", members: 241 },
  { month: "Feb", members: 248 },
]

export const depositTrendsChart = [
  { month: "Sep", deposits: 145000, withdrawals: 42000 },
  { month: "Oct", deposits: 162000, withdrawals: 38000 },
  { month: "Nov", deposits: 158000, withdrawals: 51000 },
  { month: "Dec", deposits: 175000, withdrawals: 45000 },
  { month: "Jan", deposits: 182000, withdrawals: 40000 },
  { month: "Feb", deposits: 195000, withdrawals: 48000 },
]

export const activityLog = [
  { id: 1, user: "Kwame Asante", action: "Loan application submitted", amount: 20000, timestamp: "2026-02-14 09:32", type: "loan" as const },
  { id: 2, user: "Fatima Bello", action: "Deposit confirmed", amount: 1200, timestamp: "2026-02-14 08:15", type: "deposit" as const },
  { id: 3, user: "Amara Osei", action: "Monthly payment received", amount: 625, timestamp: "2026-02-13 16:45", type: "payment" as const },
  { id: 4, user: "Yaw Kumi", action: "Loan application submitted", amount: 15000, timestamp: "2026-02-13 14:20", type: "loan" as const },
  { id: 5, user: "Kofi Mensah", action: "Deposit confirmed", amount: 2500, timestamp: "2026-02-13 11:05", type: "deposit" as const },
  { id: 6, user: "Esi Darko", action: "Withdrawal request", amount: 3000, timestamp: "2026-02-12 15:30", type: "withdrawal" as const },
  { id: 7, user: "Abena Sarfo", action: "Account suspended - overdue payment", amount: 0, timestamp: "2026-02-12 10:00", type: "alert" as const },
  { id: 8, user: "System", action: "Monthly interest calculated", amount: 0, timestamp: "2026-02-01 00:00", type: "system" as const },
]

export const policies = [
  { id: 1, title: "Standard Loan Interest Rate", value: "8.5%", category: "Loans", lastUpdated: "2025-10-01", status: "active" as const },
  { id: 2, title: "Maximum Loan Amount", value: "$50,000", category: "Loans", lastUpdated: "2025-10-01", status: "active" as const },
  { id: 3, title: "Minimum Monthly Deposit", value: "$100", category: "Deposits", lastUpdated: "2025-07-15", status: "active" as const },
  { id: 4, title: "Annual Dividend Rate", value: "5.2%", category: "Dividends", lastUpdated: "2026-01-01", status: "active" as const },
  { id: 5, title: "Loan-to-Savings Ratio", value: "3:1", category: "Loans", lastUpdated: "2025-10-01", status: "active" as const },
  { id: 6, title: "Late Payment Penalty", value: "2% per month", category: "Penalties", lastUpdated: "2025-07-15", status: "active" as const },
  { id: 7, title: "Membership Fee", value: "$25 one-time", category: "Membership", lastUpdated: "2024-01-01", status: "under review" as const },
  { id: 8, title: "Emergency Loan Rate", value: "6.0%", category: "Loans", lastUpdated: "2025-10-01", status: "active" as const },
]

export const adminNotifications = [
  { id: 1, title: "Loan Default Alert", message: "Member Abena Sarfo has missed 2 consecutive payments.", type: "destructive" as const, time: "30 mins ago", read: false },
  { id: 2, title: "New Loan Application", message: "Kwame Asante applied for a $20,000 agriculture loan.", type: "info" as const, time: "1 hour ago", read: false },
  { id: 3, title: "Large Deposit", message: "Kofi Mensah deposited $2,500 via bank transfer.", type: "success" as const, time: "3 hours ago", read: false },
  { id: 4, title: "Membership Application", message: "3 new membership applications pending review.", type: "info" as const, time: "5 hours ago", read: true },
  { id: 5, title: "System Maintenance", message: "Scheduled maintenance on Feb 20, 2026 from 2-4 AM.", type: "warning" as const, time: "1 day ago", read: true },
]
