import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { BarChart3, TrendingUp, Users, Zap } from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      if (user?.role === 'admin') {
        setLocation('/admin');
      } else {
        setLocation('/dashboard');
      }
    }
  }, [isAuthenticated, user, setLocation]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-gray-200 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#274add] to-[#062497] flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-lg text-gray-900">Cooperative</span>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => setLocation("/login")}
              className="text-gray-700 hover:text-[#274add]"
            >
              Log In
            </Button>
            <Button
              onClick={() => setLocation("/login")}
              className="bg-[#274add] hover:bg-[#062497] text-white"
            >
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                  Empower Your <span className="bg-gradient-to-r from-[#274add] to-[#e33400] bg-clip-text text-transparent">Financial Community</span>
                </h1>
                <p className="text-xl text-gray-600">
                  A modern platform designed for cooperatives to manage finances, track deposits, loans, and grow together as a community.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  size="lg"
                  onClick={() => setLocation("/login")}
                  className="bg-[#274add] hover:bg-[#062497] text-white text-lg px-8"
                >
                  Sign Up
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setLocation("/login")}
                  className="border-[#274add] text-[#274add] hover:bg-[#274add] hover:text-white text-lg px-8"
                >
                  Log In
                </Button>
              </div>

              <div className="flex items-center gap-8 pt-4">
                <div>
                  <p className="text-3xl font-bold text-[#274add]">500+</p>
                  <p className="text-gray-600">Active Cooperatives</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-[#2c804c]">$50M+</p>
                  <p className="text-gray-600">Managed Assets</p>
                </div>
              </div>
            </div>

            {/* Right Visual - Animated Chart */}
            <div className="relative h-96 hidden lg:flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-[#274add]/10 to-[#e33400]/10 rounded-3xl blur-3xl"></div>
              
              {/* Animated Chart Visualization */}
              <div className="relative w-full h-full flex items-end justify-center gap-4 p-8">
                {[40, 60, 45, 75, 55, 80, 65].map((height, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-lg transition-all duration-1000 ease-in-out"
                    style={{
                      height: `${height}%`,
                      backgroundColor: [
                        '#274add',
                        '#e33400',
                        '#2c804c',
                        '#c3252c',
                        '#ffd900',
                        '#274add',
                        '#062497'
                      ][i],
                      animation: `pulse ${2 + i * 0.2}s ease-in-out infinite`
                    }}
                  ></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-white/50">
        <div className="container max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-16">
            Why Choose Cooperative Platform?
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: Users,
                title: "Community Focused",
                description: "Built for cooperatives with features designed for collective financial management"
              },
              {
                icon: TrendingUp,
                title: "Growth Tracking",
                description: "Monitor deposits, loans, and member participation in real-time"
              },
              {
                icon: BarChart3,
                title: "Analytics",
                description: "Comprehensive reports and insights to guide cooperative decisions"
              },
              {
                icon: Zap,
                title: "Fast & Secure",
                description: "Enterprise-grade security with lightning-fast performance"
              }
            ].map((feature, i) => (
              <div
                key={i}
                className="p-6 rounded-xl bg-white border border-gray-200 hover:border-[#274add] transition-all hover:shadow-lg"
              >
                <feature.icon className="w-12 h-12 text-[#274add] mb-4" />
                <h3 className="font-bold text-lg text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-r from-[#274add] to-[#062497] rounded-2xl p-12 text-white">
            <h2 className="text-4xl font-bold mb-4">Ready to Transform Your Cooperative?</h2>
            <p className="text-lg mb-8 text-blue-100">
              Join hundreds of cooperatives already using our platform to manage finances and grow together.
            </p>
            <Button
              size="lg"
              onClick={() => setLocation("/login")}
              className="bg-white text-[#274add] hover:bg-gray-100 text-lg px-8"
            >
              Get Started Now
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 px-4 bg-gray-50">
        <div className="container max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#274add] to-[#062497] flex items-center justify-center">
                <span className="text-white font-bold text-xs">C</span>
              </div>
              <span className="font-semibold text-gray-900">Cooperative Platform</span>
            </div>
            <p className="text-gray-600 text-sm">© 2024 Cooperative Financial Dashboard. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
