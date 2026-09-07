import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import api from "../services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Lock, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuthStore();

  // Autofill detection & Credential Management API support on mount
  useEffect(() => {
    // 1. Try Credential Management API to retrieve earlier saved password
    if (typeof window !== "undefined" && "credentials" in navigator && (window as any).PasswordCredential) {
      navigator.credentials
        .get({
          password: true,
          mediation: "optional"
        } as any)
        .then((cred: any) => {
          if (cred && cred.id) {
            setEmail(cred.id);
            if (cred.password) {
              setPassword(cred.password);
            }
          }
        })
        .catch(() => {
          // Fall back gracefully to standard browser autofill
        });
    }

    // 2. Detect browser native autofill (fills DOM values directly without firing onChange)
    const timer = setTimeout(() => {
      if (emailInputRef.current?.value && !email) {
        setEmail(emailInputRef.current.value);
      }
      if (passwordInputRef.current?.value && !password) {
        setPassword(passwordInputRef.current.value);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    // Read directly from DOM in case browser autofilled without firing React onChange
    const target = e.currentTarget;
    const usernameInput = (target.elements.namedItem("username") || target.elements.namedItem("email")) as HTMLInputElement | null;
    const passwordInput = target.elements.namedItem("password") as HTMLInputElement | null;

    const rawEmail = usernameInput?.value !== undefined && usernameInput?.value !== "" ? usernameInput.value : email;
    const rawPassword = passwordInput?.value !== undefined && passwordInput?.value !== "" ? passwordInput.value : password;

    const finalEmail = rawEmail.trim().toLowerCase();
    const finalPassword = rawPassword;

    if (!finalEmail || !finalPassword) {
      setError("Please enter both email and password.");
      setIsLoading(false);
      return;
    }

    try {
      const formData = new URLSearchParams();
      formData.append("username", finalEmail);
      formData.append("password", finalPassword);

      const response = await api.post("/auth/login", formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
      
      login(response.data.access_token);

      // Trigger Browser "Save Password" prompt via Credential Management API
      if (typeof window !== "undefined" && "credentials" in navigator && (window as any).PasswordCredential) {
        try {
          const cred = new (window as any).PasswordCredential({
            id: finalEmail,
            password: finalPassword,
            name: finalEmail,
          });
          await navigator.credentials.store(cred);
        } catch (credErr) {
          console.debug("Credential save prompt request:", credErr);
        }
      }
      
      const from = location.state?.from?.pathname || "/admin";
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error("Login attempt error:", err);
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else if (err.message === "Network Error" || !err.response) {
        setError(`Unable to reach backend API at ${api.defaults.baseURL}. Please ensure the backend server is running.`);
      } else {
        setError(err.response?.data?.message || err.message || "Invalid email or password.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <Lock className="text-primary" size={24} />
          </div>
          <CardTitle className="text-2xl font-bold">Staff Login</CardTitle>
          <CardDescription>
            Enter your credentials to access the admin portal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form 
            ref={formRef}
            onSubmit={handleLogin} 
            method="post"
            action="#"
            autoComplete="on"
            className="space-y-4"
          >
            {error && (
              <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm flex items-start gap-2 border border-red-100 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="username">Email Address</Label>
              <Input 
                ref={emailInputRef}
                id="username" 
                name="username"
                type="email" 
                placeholder="admin@medxpharmacy.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required 
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <div className="relative">
                <Input 
                  ref={passwordInputRef}
                  id="password" 
                  name="password"
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required 
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
