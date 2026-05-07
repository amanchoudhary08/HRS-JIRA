import React, { FormEvent, useState } from "react";
import { Field } from "./Field";
import type { ProjectMember } from "../types";

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
      const { request } = await import("../api/client");
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
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Invite member"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>Invite member</h2>
        {error && <p className="error">{error}</p>}
        <form className="stack" onSubmit={handleSubmit}>
          <Field label="User email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              autoFocus
            />
          </Field>
          <Field label="Role">
            <select
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
            className="row"
            style={{ justifyContent: "flex-end", gap: 10, marginTop: 4 }}
          >
            <button
              className="button secondary"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button" type="submit" disabled={loading}>
              {loading ? "Inviting…" : "Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
