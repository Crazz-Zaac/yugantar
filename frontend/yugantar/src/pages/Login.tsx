import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import Logo from "@/assets/yugantar_logo.svg";
import {
  StockGraphAnimation,
  MoneyFlowAnimation,
  DataChartAnimation,
  NetworkAnimation,
} from "@/components/AnimationSVGs";
import {
  Eye,
  EyeOff,
  Loader2,
  TrendingUp,
  Shield,
  DollarSign,
  ArrowRight,
  Mail,
  Lock,
  User,
  Phone,
} from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  // wouter location
  const [, setLocation] = useLocation();

  const { login, signup } = useAuth();

  // form states
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  // toolkit navigation
  // const navigate = useNavigate();

  // form data
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstname: "",
    middlename: "",
    lastname: "",
    phonenumber: "",
    confirmPassword: "",
  });

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    console.log(import.meta.env.VITE_API_BASE);

    try {
      if (isSignUp) {
        if (!formData.firstname) {
          toast.error("Please enter your name");
          setIsLoading(false);
          return;
        }
        await signup(
          formData.email,
          formData.password,
          formData.firstname,
          formData.middlename,
          formData.lastname,
          formData.phonenumber
        );
        toast.success("Account created successfully!");
      } else {
        await login(formData.email, formData.password);
        toast.success("Logged in successfully!");
      }
      setLocation("/dashboard");
    } catch (error) {
      toast.error(
        isSignUp
          ? "Sign up failed. Please try again."
          : "Login failed. Please check your credentials."
      );
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Password validation function for sign-up
  const validatePassword = (password: string) => {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push("Password must be at least 8 characters");
    }

    if (new TextEncoder().encode(password).length > 72) {
      errors.push("Password cannot exceed 72 bytes");
    }

    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }

    if (!/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    }

    if (!/\d/.test(password)) {
      errors.push("Password must contain at least one digit");
    }

    return errors;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-card flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
        {/* Left Side - Animations and Branding */}
        <div className="hidden lg:flex flex-col justify-center items-center space-y-8">
          <div>
            <h2 className="text-4xl font-bold text-foreground mb-2">
              Yugantar Mutual Fund
            </h2>
            <p className="text-muted-foreground text-lg">
              An internal wealth management system
            </p>
          </div>

          {/* Logo Placeholder */}
          <div className="w-64 h-64 flex items-center justify-center ">
            {/* <span className="text-5xl font-bold text-primary-foreground">ABC</span> */}
            <img
              src={Logo}
              alt="Yugantar Mutual Fund"
              className="w-full h-full"
            />
          </div>

          {/* Animations Grid */}
          <div className="grid grid-cols-2 gap-6 w-full">
            <div className="h-40 bg-card rounded-lg p-4 border border-border shadow-lg">
              <StockGraphAnimation />
            </div>
            <div className="h-40 bg-card rounded-lg p-4 border border-border shadow-lg">
              <MoneyFlowAnimation />
            </div>
            <div className="h-45 bg-card rounded-lg p-4 border border-border shadow-lg">
              <DataChartAnimation />
            </div>
            <div className="h-45 bg-card rounded-lg p-4 border border-border shadow-lg">
              <NetworkAnimation />
            </div>
          </div>
        </div>

        {/* Right Side - Login/SignUp Form */}
        <div className="flex flex-col justify-center items-center w-full max-w-md mx-auto">
          {/* Mobile Logo */}
          <div className="lg:hidden w-50 h-50 from-primary to-secondary flex items-center justify-center mb-6">
            <img
              src={Logo}
              alt="Yugantar Mutual Fund"
              className="w-full h-full"
            />
          </div>

          {/* Form Card */}
          <div className="w-full bg-card rounded-xl border border-border shadow-xl p-6 sm:p-8 space-y-6">
            {/* Tabs */}
            <div className="flex gap-2 rounded-lg bg-muted p-1">
              <button
                onClick={() => setIsLogin(true)}
                className={`flex-1 px-4 py-2 rounded font-medium transition-all ${
                  isLogin
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Log In
              </button>
              <button
                onClick={() => setIsLogin(false)}
                className={`flex-1 px-4 py-2 rounded font-medium transition-all ${
                  !isLogin
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign Up
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name Field - Sign Up Only */}
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-foreground font-medium">
                    First Name
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="firstname"
                      name="firstname"
                      type="text"
                      placeholder="John"
                      value={formData.firstname}
                      onChange={handleChange}
                      className="pl-10 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
                      required={!isLogin}
                    />
                  </div>
                  <Label htmlFor="name" className="text-foreground font-medium">
                    Middle Name
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="middlename"
                      name="middlename"
                      type="text"
                      placeholder="Kumar"
                      value={formData.middlename}
                      onChange={handleChange}
                      className="pl-10 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
                      required={!isLogin}
                    />
                  </div>
                  <Label htmlFor="name" className="text-foreground font-medium">
                    Last Name
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="lastname"
                      name="lastname"
                      type="text"
                      placeholder="Doe"
                      value={formData.lastname}
                      onChange={handleChange}
                      className="pl-10 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
                      required={!isLogin}
                    />
                  </div>
                  <Label htmlFor="name" className="text-foreground font-medium">
                    Phone Number
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="+977 9812345678"
                      pattern="[+0-9]{10,15}"
                      value={formData.phonenumber}
                      onChange={handleChange}
                      className="pl-10 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
                      required={!isLogin}
                    />
                  </div>
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={handleChange}
                    className="pl-10 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="text-foreground font-medium"
                >
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={e => {
                      handleChange(e);

                      if (!isLogin) {
                        // Only validate during signup
                        const errors = validatePassword(e.target.value);
                        setPasswordErrors(errors);
                      } else {
                        // Clear validation errors during login
                        setPasswordErrors([]);
                      }
                    }}
                    className="pl-10 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
                    required
                  />

                  {/* Show/Hide Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-muted-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>

                {/* Password errors */}
                {passwordErrors.length > 0 && (
                  <ul className="text-red-500 text-sm mt-1">
                    {passwordErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Confirm Password - Sign Up Only */}
              {!isLogin && (
                <div className="space-y-2">
                  <Label
                    htmlFor="confirmPassword"
                    className="text-foreground font-medium"
                  >
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className="pl-10 bg-background border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
                      required={!isLogin}
                    />
                  </div>
                </div>
              )}

              {/* Remember Me / Forgot Password - Login Only */}
              {isLogin && (
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="rounded border-border text-primary cursor-pointer"
                    />
                    <span className="text-sm text-foreground">Remember me</span>
                  </label>
                  <a href="#" className="text-sm text-primary hover:underline">
                    Forgot Password?
                  </a>
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium py-2 h-10 gap-2 group"
              >
                {isLogin ? "Log In" : "Sign Up"}
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </form>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-card text-muted-foreground">
                  Secure authentication
                </span>
              </div>
            </div>

            {/* Bottom Text */}
            <p className="text-center text-sm text-muted-foreground">
              {isLogin
                ? "Don't have an account? "
                : "Already have an account? "}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary font-semibold hover:underline"
              >
                {isLogin ? "Sign up now" : "Log in here"}
              </button>
            </p>
          </div>

          {/* Footer */}
          <p className="text-xs text-muted-foreground text-center mt-6">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
