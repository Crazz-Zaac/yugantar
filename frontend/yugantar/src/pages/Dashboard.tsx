import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DepositLoanChart,
  TransactionChart,
  MembersGrowthChart,
  PortfolioChart,
} from "@/components/FinanceCharts";
import {
  Users,
  Wallet,
  PiggyBank,
  BarChart3,
  Settings,
  Calendar,
  DollarSign,
} from "lucide-react";
import { set } from "react-hook-form";

const KPICard = ({
  title,
  value,
  change,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  change: string;
  icon: React.ReactNode;
  color: string;
}) => (
  <div className="bg-card border border-border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between mb-4">
      <div className={`p-3 rounded-lg ${color}`}>{Icon}</div>
      <span className="text-sm font-medium text-success">↑ {change}</span>
    </div>
    <h3 className="text-muted-foreground text-sm font-medium mb-1">{title}</h3>
    <p className="text-2xl font-bold text-foreground">{value}</p>
  </div>
);

const ChartCard = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
    <h3 className="text-lg font-semibold text-foreground mb-4">{title}</h3>
    {children}
  </div>
);

export default function Dashboard() {
  const { user, isLoading, logout } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // const authToken = localStorage.getItem("authToken");
    if (!user && !isLoading) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header showLogout={true} onLogout={handleLogout} />

      {/* Main Content */}
      <main className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Welcome Section */}
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
              Welcome Back, Member
            </h1>
            <p className="text-muted-foreground">
              Here's your financial overview for today
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 border-b border-border">
            <Button
              variant="ghost"
              className="text-primary font-medium border-b-2 border-primary rounded-none px-4 py-2 hover:bg-transparent"
            >
              Overview
            </Button>
            <Link to="/members">
              <Button
                variant="ghost"
                className="text-muted-foreground font-medium rounded-none px-4 py-2 hover:bg-transparent"
              >
                Members
              </Button>
            </Link>
            <Link to="/deposits">
              <Button
                variant="ghost"
                className="text-muted-foreground font-medium rounded-none px-4 py-2 hover:bg-transparent"
              >
                Deposits
              </Button>
            </Link>
            <Link to="/loans">
              <Button
                variant="ghost"
                className="text-muted-foreground font-medium rounded-none px-4 py-2 hover:bg-transparent"
              >
                Loans
              </Button>
            </Link>
            <Link to="/reports">
              <Button
                variant="ghost"
                className="text-muted-foreground font-medium rounded-none px-4 py-2 hover:bg-transparent"
              >
                Reports & Analytics
              </Button>
            </Link>
            <Link to="/settings">
              <Button
                variant="ghost"
                className="text-muted-foreground font-medium rounded-none px-4 py-2 hover:bg-transparent"
              >
                Settings
              </Button>
            </Link>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KPICard
              title="Personal Loans"
              value="₹2,45,000"
              change="12%"
              icon={<Wallet className="h-5 w-5 text-primary" />}
              color="bg-primary/10"
            />
            <KPICard
              title="Total Deposits"
              value="₹5,80,000"
              change="8%"
              icon={<PiggyBank className="h-5 w-5 text-success" />}
              color="bg-success/10"
            />
            <KPICard
              title="Active Members"
              value="2,340"
              change="5%"
              icon={<Users className="h-5 w-5 text-info" />}
              color="bg-info/10"
            />
            <KPICard
              title="Next Repayment"
              value="Jan 15, 2024"
              change="3 days"
              icon={<Calendar className="h-5 w-5 text-warning" />}
              color="bg-warning/10"
            />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Deposits & Loans Trend">
              <DepositLoanChart />
            </ChartCard>
            <ChartCard title="Portfolio Distribution">
              <PortfolioChart />
            </ChartCard>
            <ChartCard title="Weekly Transactions">
              <TransactionChart />
            </ChartCard>
            <ChartCard title="Active Members Growth">
              <MembersGrowthChart />
            </ChartCard>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 gap-2 justify-start"
            >
              <DollarSign className="h-5 w-5" />
              Apply for Loan
            </Button>
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-card h-12 gap-2 justify-start"
            >
              <Wallet className="h-5 w-5" />
              Make Deposit
            </Button>
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-card h-12 gap-2 justify-start"
            >
              <BarChart3 className="h-5 w-5" />
              View Reports
            </Button>
            <Link to="/admin">
              <Button
                variant="outline"
                className="border-border text-foreground hover:bg-card h-12 gap-2 justify-start w-full"
              >
                <Settings className="h-5 w-5" />
                Settings
              </Button>
            </Link>
          </div>

          {/* Summary Stats */}
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-border rounded-lg p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              <div>
                <p className="text-muted-foreground text-sm mb-2">Total Balance</p>
                <p className="text-2xl font-bold text-foreground">₹8,25,000</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm mb-2">This Month Interest</p>
                <p className="text-2xl font-bold text-success">₹2,450</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm mb-2">Loan Balance</p>
                <p className="text-2xl font-bold text-accent">₹2,45,000</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm mb-2">Credit Score</p>
                <p className="text-2xl font-bold text-info">750/1000</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );

}

