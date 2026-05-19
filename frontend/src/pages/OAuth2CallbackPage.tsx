import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function decodeJwt(token: string): Record<string, string> {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join(""),
  );
  return JSON.parse(json);
}

export function OAuth2CallbackPage() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    try {
      const claims = decodeJwt(token);
      loginWithToken(token, {
        id: claims.user_id,
        name: claims.name,
        email: claims.email,
      });
      navigate("/projects", { replace: true });
    } catch {
      navigate("/login", { replace: true });
    }
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <p>Signing you in...</p>
    </div>
  );
}
