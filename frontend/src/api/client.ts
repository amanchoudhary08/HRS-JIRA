export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function request<T>(
  path: string,
  options: { method?: string; token?: string | null; body?: unknown } = {},
): Promise<T> {
  const isAuthEndpoint = path.startsWith("/auth/");
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  if (res.status === 401) {
    if (!isAuthEndpoint) {
      localStorage.removeItem("taskflow_token");
      localStorage.removeItem("taskflow_user");
      window.location.href = "/login";
      throw new Error("Session expired. Please log in again.");
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.fields
      ? Object.values(data.fields).join(", ")
      : data.error;
    throw new Error(detail || "Request failed");
  }
  return data as T;
}

import type { Task, SearchResult, Label, Notification } from "../types";

export function getSseToken(
  token: string,
): Promise<{ token: string; expiresIn: number }> {
  return request<{ token: string; expiresIn: number }>("/auth/sse-token", {
    token,
  });
}

export function searchInProject(
  projectId: string,
  q: string,
  token: string,
): Promise<{ tasks: Task[] }> {
  return request<{ tasks: Task[] }>(
    `/projects/${projectId}/tasks/search?q=${encodeURIComponent(q)}`,
    { token },
  );
}

export function globalSearch(
  q: string,
  token: string,
): Promise<{ results: SearchResult[] }> {
  return request<{ results: SearchResult[] }>(
    `/search?q=${encodeURIComponent(q)}`,
    { token },
  );
}

// ─── Label API helpers ────────────────────────────────────────────────────────

export function fetchLabels(
  projectId: string,
  token: string,
): Promise<{ labels: Label[] }> {
  return request<{ labels: Label[] }>(`/projects/${projectId}/labels`, {
    token,
  });
}

export function createLabel(
  projectId: string,
  body: { name: string; color: string },
  token: string,
): Promise<Label> {
  return request<Label>(`/projects/${projectId}/labels`, {
    method: "POST",
    body,
    token,
  });
}

export function updateLabel(
  projectId: string,
  labelId: string,
  body: { name?: string; color?: string },
  token: string,
): Promise<Label> {
  return request<Label>(`/projects/${projectId}/labels/${labelId}`, {
    method: "PATCH",
    body,
    token,
  });
}

export function deleteLabel(
  projectId: string,
  labelId: string,
  token: string,
): Promise<void> {
  return request<void>(`/projects/${projectId}/labels/${labelId}`, {
    method: "DELETE",
    token,
  });
}

export function attachLabel(
  projectId: string,
  taskId: string,
  labelId: string,
  token: string,
): Promise<Task> {
  return request<Task>(
    `/projects/${projectId}/tasks/${taskId}/labels/${labelId}`,
    { method: "POST", token },
  );
}

export function detachLabel(
  projectId: string,
  taskId: string,
  labelId: string,
  token: string,
): Promise<Task> {
  return request<Task>(
    `/projects/${projectId}/tasks/${taskId}/labels/${labelId}`,
    { method: "DELETE", token },
  );
}

// ─── Notification API helpers ─────────────────────────────────────────────────

export function fetchNotifications(
  token: string,
  page = 1,
  limit = 20,
): Promise<{ notifications: Notification[]; total: number }> {
  return request(`/notifications?page=${page}&limit=${limit}`, { token });
}

export function fetchNotificationCount(
  token: string,
): Promise<{ unread: number }> {
  return request(`/notifications/count`, { token });
}

export function markNotificationRead(
  id: string,
  token: string,
): Promise<Notification> {
  return request(`/notifications/${id}/read`, { method: "PATCH", token });
}

export function markAllNotificationsRead(token: string): Promise<void> {
  return request(`/notifications/read-all`, { method: "PATCH", token });
}

// ─── Attachment API helpers ───────────────────────────────────────────────────

import type { Attachment } from "../types";

export function fetchAttachments(
  projectId: string,
  taskId: string,
  token: string,
): Promise<{ attachments: Attachment[] }> {
  return request<{ attachments: Attachment[] }>(
    `/projects/${projectId}/tasks/${taskId}/attachments`,
    { token },
  );
}

export async function uploadAttachment(
  projectId: string,
  taskId: string,
  file: File,
  token: string,
  onProgress?: (pct: number) => void,
): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `${API_URL}/projects/${projectId}/tasks/${taskId}/attachments`,
    );
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as Attachment);
        } catch {
          reject(new Error("Invalid response"));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || "Upload failed"));
        } catch {
          reject(new Error("Upload failed"));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(form);
  });
}

export function deleteAttachment(
  projectId: string,
  taskId: string,
  attachmentId: string,
  token: string,
): Promise<void> {
  return request<void>(
    `/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}`,
    { method: "DELETE", token },
  );
}

// ─── Task Link API helpers ────────────────────────────────────────────────────

import type { TaskLink } from "../types";

export function fetchTaskLinks(
  projectId: string,
  taskId: string,
  token: string,
): Promise<{ links: TaskLink[] }> {
  return request<{ links: TaskLink[] }>(
    `/projects/${projectId}/tasks/${taskId}/links`,
    { token },
  );
}

export function createTaskLink(
  projectId: string,
  taskId: string,
  body: { targetTaskId: string; linkType: string },
  token: string,
): Promise<TaskLink> {
  return request<TaskLink>(`/projects/${projectId}/tasks/${taskId}/links`, {
    method: "POST",
    body: { target_task_id: body.targetTaskId, link_type: body.linkType },
    token,
  });
}

export function deleteTaskLink(
  projectId: string,
  taskId: string,
  linkId: string,
  token: string,
): Promise<void> {
  return request<void>(
    `/projects/${projectId}/tasks/${taskId}/links/${linkId}`,
    { method: "DELETE", token },
  );
}

// ─── User search (for @mention typeahead) ─────────────────────────────────────

import type { User } from "../types";

export function searchUsers(
  q: string,
  token: string,
): Promise<{ users: User[] }> {
  return request<{ users: User[] }>(
    `/users/search?q=${encodeURIComponent(q)}`,
    { token },
  );
}
