import React, { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Field } from "../components/Field";
import { EyeIcon, EyeOffIcon } from "../components/icons";
import * as cx from "../styles/classes";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(""), 2000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "register" && !email.includes("@"))
      return setError("Use a valid email address.");
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
    <div className={cx.authLayout}>
      <section className={cx.authArt}>
        <h1 className="max-w-[650px] text-[2.8rem] leading-[1.05] m-0 max-[720px]:text-[2rem]">
          Shared project work, clear task ownership.
        </h1>
      </section>
      <section className={cx.authPanel}>
        <form
          className={`${cx.card} ${cx.authCard} ${cx.stack}`}
          onSubmit={submit}
        >
          <div>
            <h2 className={cx.pageTitle}>
              {mode === "login" ? "Welcome back" : "Create account"}
            </h2>
            <p className={cx.pageSubtitle}>
              Use the seed credentials or register a new user.
            </p>
          </div>
          {error && <div className={cx.errorBox}>{error}</div>}
          {mode === "register" && (
            <Field label="Name">
              <input
                className={cx.fieldInput}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          <Field label="Email or Employee ID">
            <input
              className={cx.fieldInput}
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <div className={cx.passwordField}>
              <input
                className={`${cx.fieldInput} ${cx.passwordInput}`}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className={cx.passwordToggle}
                title={showPassword ? "Hide password" : "Show password"}
                type="button"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </Field>
          <button className={cx.btn} type="submit" disabled={loading}>
            {loading ? "Working..." : mode === "login" ? "Log in" : "Register"}
          </button>
          <div className={cx.authDivider}>
            <span>or</span>
          </div>
          <a
            href={`${import.meta.env.VITE_API_URL ?? "http://localhost:4000"}/oauth2/authorization/google`}
            className={cx.btnSecondary}
            style={{
              textAlign: "center",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
              <path fill="none" d="M0 0h48v48H0z" />
            </svg>
            Continue with Google
          </a>
          <Link to={mode === "login" ? "/register" : "/login"}>
            {mode === "login" ? "Need an account?" : "Already registered?"}
          </Link>
        </form>
      </section>
      {registrationSuccess && (
        <div className={cx.successToast} role="status">
          <strong>You have successfully registered.</strong>
          <span>Taking you to your projects...</span>
        </div>
      )}
    </div>
  );
}
