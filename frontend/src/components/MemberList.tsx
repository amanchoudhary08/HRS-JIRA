import React from "react";
import type { ProjectMember } from "../types";

const ROLE_COLORS: Record<ProjectMember["role"], string> = {
  owner: "var(--role-owner, #b45309)",
  admin: "var(--role-admin, #1d4ed8)",
  member: "var(--role-member, #374151)",
  viewer: "var(--role-viewer, #6b7280)",
};

const ROLE_BG: Record<ProjectMember["role"], string> = {
  owner: "var(--role-owner-bg, #fef3c7)",
  admin: "var(--role-admin-bg, #dbeafe)",
  member: "var(--role-member-bg, #f3f4f6)",
  viewer: "var(--role-viewer-bg, #f9fafb)",
};

function avatarInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface MemberListProps {
  members: ProjectMember[];
  currentUserId: string;
  isOwner: boolean;
  onChangeRole: (userId: string, role: ProjectMember["role"]) => void;
  onRemove: (userId: string) => void;
}

export function MemberList({
  members,
  currentUserId,
  isOwner,
  onChangeRole,
  onRemove,
}: MemberListProps) {
  if (members.length === 0) {
    return <div className="empty">No members yet.</div>;
  }

  return (
    <ul className="member-list">
      {members.map((m) => (
        <li key={m.user_id} className="member-row">
          <div className="member-avatar" title={m.user_name}>
            {avatarInitials(m.user_name)}
          </div>
          <div className="member-info">
            <span className="member-name">
              {m.user_name}
              {m.user_id === currentUserId && (
                <span
                  className="muted"
                  style={{ fontWeight: 400, marginLeft: 6, fontSize: "0.8rem" }}
                >
                  (you)
                </span>
              )}
            </span>
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              {m.user_email}
            </span>
          </div>
          <span
            className="pill member-role-badge"
            style={{
              color: ROLE_COLORS[m.role],
              background: ROLE_BG[m.role],
              border: `1px solid ${ROLE_COLORS[m.role]}33`,
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            {m.role}
          </span>
          {isOwner && m.role !== "owner" && (
            <div className="member-actions row">
              <select
                value={m.role}
                onChange={(e) =>
                  onChangeRole(
                    m.user_id,
                    e.target.value as ProjectMember["role"],
                  )
                }
                style={{ fontSize: "0.82rem", padding: "2px 6px" }}
                title="Change role"
              >
                <option value="admin">admin</option>
                <option value="member">member</option>
                <option value="viewer">viewer</option>
              </select>
              <button
                className="button danger"
                style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                onClick={() => onRemove(m.user_id)}
              >
                Remove
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
