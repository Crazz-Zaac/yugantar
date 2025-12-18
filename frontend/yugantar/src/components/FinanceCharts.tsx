import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const lineChartData = [
  { month: "Jan", deposits: 4000, loans: 2400 },
  { month: "Feb", deposits: 5200, loans: 2800 },
  { month: "Mar", deposits: 4800, loans: 3200 },
  { month: "Apr", deposits: 6200, loans: 2900 },
  { month: "May", deposits: 7100, loans: 3900 },
  { month: "Jun", deposits: 6900, loans: 4800 },
];

const barChartData = [
  { month: "Mon", amount: 2400 },
  { month: "Tue", amount: 1398 },
  { month: "Wed", amount: 9800 },
  { month: "Thu", amount: 3908 },
  { month: "Fri", amount: 4800 },
  { month: "Sat", amount: 3800 },
];

const areaChartData = [
  { day: "1", members: 1200 },
  { day: "4", members: 2210 },
  { day: "7", members: 2290 },
  { day: "10", members: 2000 },
  { day: "13", members: 2181 },
  { day: "16", members: 2500 },
  { day: "19", members: 2100 },
  { day: "22", members: 3100 },
  { day: "25", members: 3200 },
];

const pieData = [
  { name: "Deposits", value: 45, fill: "#274add" },
  { name: "Loans", value: 35, fill: "#e33400" },
  { name: "Savings", value: 20, fill: "#2c804c" },
];

export const DepositLoanChart = () => (
  <div className="w-full h-80">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={lineChartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis stroke="hsl(var(--muted-foreground))" />
        <YAxis stroke="hsl(var(--muted-foreground))" />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
          labelStyle={{ color: "hsl(var(--foreground))" }}
        />
        <Line
          type="monotone"
          dataKey="deposits"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ fill: "hsl(var(--primary))", r: 4 }}
          name="Deposits"
        />
        <Line
          type="monotone"
          dataKey="loans"
          stroke="hsl(var(--accent))"
          strokeWidth={2}
          dot={{ fill: "hsl(var(--accent))", r: 4 }}
          name="Loans"
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

export const TransactionChart = () => (
  <div className="w-full h-80">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={barChartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis stroke="hsl(var(--muted-foreground))" />
        <YAxis stroke="hsl(var(--muted-foreground))" />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
          labelStyle={{ color: "hsl(var(--foreground))" }}
        />
        <Bar
          dataKey="amount"
          fill="hsl(var(--primary))"
          radius={[8, 8, 0, 0]}
          name="Transaction Amount"
        />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export const MembersGrowthChart = () => (
  <div className="w-full h-80">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={areaChartData}>
        <defs>
          <linearGradient id="colorMembers" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis stroke="hsl(var(--muted-foreground))" />
        <YAxis stroke="hsl(var(--muted-foreground))" />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
          labelStyle={{ color: "hsl(var(--foreground))" }}
        />
        <Area
          type="monotone"
          dataKey="members"
          stroke="hsl(var(--primary))"
          fillOpacity={1}
          fill="url(#colorMembers)"
          name="Active Members"
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

export const PortfolioChart = () => (
  <div className="w-full h-80">
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={pieData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, value }) => `${name}: ${value}%`}
          outerRadius={120}
          fill="#8884d8"
          dataKey="value"
        >
          {pieData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
          labelStyle={{ color: "hsl(var(--foreground))" }}
        />
      </PieChart>
    </ResponsiveContainer>
  </div>
);
