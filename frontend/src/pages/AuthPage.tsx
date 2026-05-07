import React, { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Field } from "../components/Field";
import { EyeIcon, EyeOffIcon } from "../components/icons";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("password123");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.includes("@")) return setError("Use a valid email address.");
    if (password.length < 8)
      return setError("Password must be at least 8 characters.");
    if (mode === "register" && name.trim().length < 2)
      return setError("Name is required.");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        navigate("/projects");
      } else {
        await register(name, email, password);
        setRegistrationSuccess(true);
        window.setTimeout(() => navigate("/projects"), 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-art">
        <h1>Shared project work, clear task ownership.</h1>
      </section>
      <section className="auth-panel">
        <form className="card auth-card stack" onSubmit={submit}>
          <div>
            <h2 className="title">
              {mode === "login" ? "Welcome back" : "Create account"}
            </h2>
            <p className="subtitle">
              Use the seed credentials or register a new user.
            </p>
          </div>
          {error && <div className="error">{error}</div>}
          {mode === "register" && (
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <div className="password-field">
              <input
                className="password-input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="password-toggle"
                title={showPassword ? "Hide password" : "Show password"}
                type="button"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </Field>
          <button className="button" disabled={loading}>
            {loading ? "Working..." : mode === "login" ? "Log in" : "Register"}
          </button>
          <Link to={mode === "login" ? "/register" : "/login"}>
            {mode === "login" ? "Need an account?" : "Already registered?"}
          </Link>
        </form>
      </section>
      {registrationSuccess && (
        <div className="success-toast" role="status">
          <strong>You have successfully registered.</strong>
          <span>Taking you to your projects...</span>
        </div>
      )}
    </div>
  );
}
