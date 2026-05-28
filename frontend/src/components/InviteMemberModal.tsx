import React, { FormEvent, useEffect, useRef, useState } from "react";
import { Field } from "./Field";
import type { ProjectMember } from "../types";
import type { User } from "../types";
import * as cx from "../styles/classes";
import { searchUsers, request } from "../api/client";

interface InviteMemberModalProps {
  projectId: string;
  token: string | null;
  onClose: () => void;
  onInvited: (member: ProjectMember) => void;
}

export function InviteMemberModal({
  projectId,
  token,
  onClose,
  onInvited,
}: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = email.trim();
    if (q.length < 2 || !token) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const { users } = await searchUsers(q, token);
        setSuggestions(users);
        setShowSuggestions(users.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [email, token]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectSuggestion(user: User) {
    setEmail(user.email);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return setError("Email is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return setError("Enter a valid email address.");
    }
    setLoading(true);
    setError("");
    try {
      const member = await request<ProjectMember>(
        `/projects/${projectId}/members`,
        { method: "POST", token, body: { email: trimmed, role } },
      );
      onInvited(member);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not invite member");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cx.modalBackdrop} onClick={onClose}>
      <div
        className={cx.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Invite member"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>Invite member</h2>
        {error && <p className={cx.errorBox}>{error}</p>}
        <form className={cx.stack} onSubmit={handleSubmit}>
          <Field label="User email">
            <div ref={wrapperRef} style={{ position: "relative" }}>
              <input
                className={cx.fieldInput}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() =>
                  suggestions.length > 0 && setShowSuggestions(true)
                }
                placeholder="colleague@example.com"
                autoComplete="off"
                autoFocus
              />
              {showSuggestions && (
                <ul
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    margin: "2px 0 0",
                    padding: 0,
                    listStyle: "none",
                    background: "var(--color-surface, #1e1e2e)",
                    border: "1px solid var(--color-border, #333)",
                    borderRadius: 6,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  {suggestions.map((u) => (
                    <li
                      key={u.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectSuggestion(u);
                      }}
                      style={{
                        padding: "8px 12px",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        color: "#f0f0f0",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "var(--color-surface-hover, #2a2a3e)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <span
                        style={{
                          fontWeight: 500,
                          fontSize: 13,
                          color: "#f0f0f0",
                        }}
                      >
                        {u.name}
                      </span>
                      <span
                        style={{ fontSize: 12, color: "rgba(240,240,240,0.6)" }}
                      >
                        {u.email}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
          <Field label="Role">
            <select
              className={cx.fieldSelect}
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              <option value="admin">
                Admin — can manage members &amp; tasks
              </option>
              <option value="member">
                Member — can create &amp; edit tasks
              </option>
              <option value="viewer">Viewer — read only</option>
            </select>
          </Field>
          <div
            className={cx.row}
            style={{ justifyContent: "flex-end", gap: 10, marginTop: 4 }}
          >
            <button className={cx.btnSecondary} type="button" onClick={onClose}>
              Cancel
            </button>
            <button className={cx.btn} type="submit" disabled={loading}>
              {loading ? "Inviting…" : "Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
