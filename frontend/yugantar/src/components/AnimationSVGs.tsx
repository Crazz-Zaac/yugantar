export const StockGraphAnimation = () => (
  <svg
    viewBox="0 0 300 200"
    className="w-full h-auto animate-fade-in"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="graphGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#274add", stopOpacity: 0.8 }} />
        <stop offset="100%" style={{ stopColor: "#274add", stopOpacity: 0.1 }} />
      </linearGradient>
    </defs>

    {/* Grid */}
    <line
      x1="20"
      y1="160"
      x2="280"
      y2="160"
      stroke="hsl(var(--border))"
      strokeWidth="1"
    />
    <line
      x1="20"
      y1="120"
      x2="280"
      y2="120"
      stroke="hsl(var(--border))"
      strokeWidth="0.5"
      opacity="0.5"
    />
    <line
      x1="20"
      y1="80"
      x2="280"
      y2="80"
      stroke="hsl(var(--border))"
      strokeWidth="0.5"
      opacity="0.5"
    />
    <line
      x1="20"
      y1="40"
      x2="280"
      y2="40"
      stroke="hsl(var(--border))"
      strokeWidth="0.5"
      opacity="0.5"
    />

    {/* Rising graph line with animation */}
    <polyline
      points="20,160 60,130 100,100 140,80 180,60 220,50 260,40"
      fill="none"
      stroke="hsl(var(--primary))"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        animation: "drawLine 3s ease-in-out infinite",
      }}
    />

    {/* Filled area under line */}
    <polygon
      points="20,160 60,130 100,100 140,80 180,60 220,50 260,40 260,160 20,160"
      fill="url(#graphGradient)"
      opacity="0.3"
      style={{
        animation: "fadeIn 3s ease-in-out infinite",
      }}
    />

    {/* Animated dots */}
    <circle cx="60" cy="130" r="3" fill="#e33400" style={{ animation: "pulse-soft 2s ease-in-out infinite" }} />
    <circle cx="140" cy="80" r="3" fill="#e33400" style={{ animation: "pulse-soft 2s ease-in-out infinite 0.5s" }} />
    <circle cx="260" cy="40" r="3" fill="#e33400" style={{ animation: "pulse-soft 2s ease-in-out infinite 1s" }} />

    <style>{`
      @keyframes drawLine {
        0% { stroke-dashoffset: 300; stroke-dasharray: 300; }
        50% { stroke-dashoffset: 0; }
        100% { stroke-dashoffset: 300; }
      }
      @keyframes fadeIn {
        0% { opacity: 0; }
        30% { opacity: 0.3; }
        50% { opacity: 0.5; }
        100% { opacity: 0.3; }
      }
    `}</style>
  </svg>
);

export const MoneyFlowAnimation = () => (
  <svg
    viewBox="0 0 300 200"
    className="w-full h-auto animate-fade-in"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="moneyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style={{ stopColor: "#2c804c" }} />
        <stop offset="100%" style={{ stopColor: "#ffd900" }} />
      </linearGradient>
    </defs>

    {/* Dollar sign circles */}
    <circle cx="50" cy="50" r="15" fill="none" stroke="#2c804c" strokeWidth="2" />
    <text
      x="50"
      y="58"
      textAnchor="middle"
      fill="#2c804c"
      fontSize="20"
      fontWeight="bold"
    >
      $
    </text>

    <circle cx="150" cy="100" r="15" fill="none" stroke="#e33400" strokeWidth="2" />
    <text
      x="150"
      y="108"
      textAnchor="middle"
      fill="#e33400"
      fontSize="20"
      fontWeight="bold"
    >
      $
    </text>

    <circle cx="250" cy="150" r="15" fill="none" stroke="#ffd900" strokeWidth="2" />
    <text
      x="250"
      y="158"
      textAnchor="middle"
      fill="#ffd900"
      fontSize="20"
      fontWeight="bold"
    >
      $
    </text>

    {/* Connecting arrows with animation */}
    <path
      d="M 65 55 Q 100 70 135 95"
      fill="none"
      stroke="url(#moneyGradient)"
      strokeWidth="2"
      strokeLinecap="round"
      style={{
        animation: "flowLine 2s ease-in-out infinite",
      }}
    />

    <path
      d="M 165 105 Q 200 120 235 145"
      fill="none"
      stroke="url(#moneyGradient)"
      strokeWidth="2"
      strokeLinecap="round"
      style={{
        animation: "flowLine 2s ease-in-out infinite 0.5s",
      }}
    />

    <style>{`
      @keyframes flowLine {
        0% { stroke-dashoffset: 100; stroke-dasharray: 100; }
        50% { stroke-dashoffset: 0; }
        100% { stroke-dashoffset: -100; }
      }
    `}</style>
  </svg>
);

export const DataChartAnimation = () => (
  <svg
    viewBox="0 0 300 200"
    className="w-full h-auto animate-fade-in"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Animated bars */}
    <g style={{ animation: "chartBars 3s ease-in-out infinite" }}>
      <rect x="30" y="120" width="30" height="50" fill="#274add" rx="4" />
      <rect x="75" y="80" width="30" height="90" fill="#e33400" rx="4" />
      <rect x="120" y="100" width="30" height="70" fill="#2c804c" rx="4" />
      <rect x="165" y="50" width="30" height="120" fill="#ffd900" rx="4" />
      <rect x="210" y="70" width="30" height="100" fill="#c3252c" rx="4" />
    </g>

    {/* Labels */}
    <text x="45" y="185" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="12">
      Q1
    </text>
    <text x="90" y="185" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="12">
      Q2
    </text>
    <text x="135" y="185" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="12">
      Q3
    </text>
    <text x="180" y="185" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="12">
      Q4
    </text>
    <text x="225" y="185" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="12">
      Q5
    </text>

    {/* Axis */}
    <line x1="20" y1="170" x2="240" y2="170" stroke="hsl(var(--border))" strokeWidth="1" />

    <style>{`
      @keyframes chartBars {
        0% { opacity: 0.5; }
        50% { opacity: 1; }
        100% { opacity: 0.5; }
      }
    `}</style>
  </svg>
);

export const NetworkAnimation = () => (
  <svg
    viewBox="0 0 300 200"
    className="w-full h-auto animate-fade-in"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Animated connecting lines */}
    <g style={{ animation: "networkPulse 3s ease-in-out infinite" }}>
      <line x1="50" y1="100" x2="150" y2="60" stroke="#274add" strokeWidth="2" opacity="0.6" />
      <line x1="150" y1="60" x2="250" y2="100" stroke="#274add" strokeWidth="2" opacity="0.6" />
      <line x1="50" y1="100" x2="250" y2="100" stroke="#274add" strokeWidth="2" opacity="0.6" />
      <line x1="150" y1="60" x2="150" y2="150" stroke="#274add" strokeWidth="2" opacity="0.6" />
    </g>

    {/* Nodes */}
    <circle
      cx="50"
      cy="100"
      r="12"
      fill="#274add"
      style={{
        animation: "nodePulse 2s ease-in-out infinite",
      }}
    />
    <circle
      cx="150"
      cy="60"
      r="12"
      fill="#e33400"
      style={{
        animation: "nodePulse 2s ease-in-out infinite 0.3s",
      }}
    />
    <circle
      cx="250"
      cy="100"
      r="12"
      fill="#2c804c"
      style={{
        animation: "nodePulse 2s ease-in-out infinite 0.6s",
      }}
    />
    <circle
      cx="150"
      cy="150"
      r="12"
      fill="#ffd900"
      style={{
        animation: "nodePulse 2s ease-in-out infinite 0.9s",
      }}
    />

    <style>{`
      @keyframes networkPulse {
        0% { opacity: 0.3; }
        50% { opacity: 1; }
        100% { opacity: 0.3; }
      }
      @keyframes nodePulse {
        0% { r: 12; }
        50% { r: 16; }
        100% { r: 12; }
      }
    `}</style>
  </svg>
);
