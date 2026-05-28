import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuthStore } from "../stores/auth";
import type { User } from "../types";

export default function SSOPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const refresh = params.get("refresh");

    if (!token || !refresh) {
      navigate("/login", { replace: true });
      return;
    }

    axios
      .get<User>("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        setAuth(res.data, token, refresh);
        navigate("/", { replace: true });
      })
      .catch(() => {
        navigate("/login", { replace: true });
      });
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--surface-0)" }}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm animate-pulse"
          style={{
            background: "linear-gradient(135deg,#22d3ee,#6366f1)",
            color: "#000",
            boxShadow: "0 0 24px rgba(34,211,238,0.3)",
          }}
        >
          H
        </div>
        <p className="text-sm font-mono" style={{ color: "var(--text-2)" }}>
          Signing you in…
        </p>
      </div>
    </div>
  );
}
