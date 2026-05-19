import React, { useRef, useState } from "react";
import {
  fetchAttachments,
  uploadAttachment,
  deleteAttachment,
  API_URL,
} from "../api/client";
import type { Attachment } from "../types";
import * as cx from "../styles/classes";

// ─── File icon by MIME type ───────────────────────────────────────────────────

function FileIcon({ mime }: { mime: string }) {
  let emoji = "📄";
  if (mime.startsWith("image/")) emoji = "🖼️";
  else if (mime === "application/pdf") emoji = "📕";
  else if (mime.includes("spreadsheet") || mime.includes("excel")) emoji = "📊";
  else if (mime.includes("presentation") || mime.includes("powerpoint"))
    emoji = "📰";
  else if (mime.includes("word") || mime.includes("document")) emoji = "📝";
  else if (mime.startsWith("text/")) emoji = "📄";
  return <span style={{ fontSize: "1.3rem" }}>{emoji}</span>;
}

// ─── Format bytes ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── AttachmentList ───────────────────────────────────────────────────────────

export function AttachmentList({
  attachments,
  projectId,
  taskId,
  token,
  currentUserId,
  isOwner,
  onDelete,
}: {
  attachments: Attachment[];
  projectId: string;
  taskId: string;
  token: string | null;
  currentUserId: string | undefined;
  isOwner: boolean;
  onDelete: (id: string) => void;
}) {
  const [downloading, setDownloading] = useState<string | null>(null);

  async function handleDownload(a: Attachment) {
    if (!token) return;
    setDownloading(a.id);
    try {
      const res = await fetch(
        `${API_URL}/projects/${projectId}/tasks/${taskId}/attachments/${a.id}/download`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = a.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore
    } finally {
      setDownloading(null);
    }
  }

  if (attachments.length === 0) {
    return (
      <div
        className={cx.empty}
        style={{ padding: "10px 14px", fontSize: "0.85rem" }}
      >
        No attachments yet.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {attachments.map((a) => {
        const canDelete = a.uploaded_by_id === currentUserId || isOwner;
        const isThisDownloading = downloading === a.id;
        return (
          <div
            key={a.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 8,
              background: "var(--bg)",
              border: "1px solid var(--border)",
            }}
          >
            <FileIcon mime={a.mime_type} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <button
                  type="button"
                  onClick={() => handleDownload(a)}
                  disabled={isThisDownloading}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: isThisDownloading ? "default" : "pointer",
                    color: "var(--brand)",
                    fontWeight: 600,
                    fontSize: "inherit",
                    textAlign: "left",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  }}
                >
                  {isThisDownloading ? "Downloading…" : a.filename}
                </button>
              </div>
              <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                {formatBytes(a.size_bytes)} · {a.uploaded_by_name}
              </div>
            </div>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(a.id)}
                title="Delete attachment"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: "2px 6px",
                  fontSize: "1rem",
                  borderRadius: 4,
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── AttachmentZone ───────────────────────────────────────────────────────────

export function AttachmentZone({
  projectId,
  taskId,
  token,
  currentUserId,
  isOwner,
}: {
  projectId: string;
  taskId: string;
  token: string | null;
  currentUserId: string | undefined;
  isOwner: boolean;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Reload attachments whenever the task changes
  React.useEffect(() => {
    if (!token) return;
    setAttachments([]);
    setError("");
    setLoading(true);
    fetchAttachments(projectId, taskId, token)
      .then((d) => setAttachments(d.attachments))
      .catch(() => setAttachments([]))
      .finally(() => setLoading(false));
  }, [projectId, taskId, token]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !token) return;
    const file = files[0];
    setUploading(true);
    setProgress(0);
    setError("");
    try {
      const created = await uploadAttachment(
        projectId,
        taskId,
        file,
        token,
        setProgress,
      );
      setAttachments((prev) => [...prev, created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    try {
      await deleteAttachment(projectId, taskId, id, token);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "var(--brand)" : "var(--border)"}`,
          borderRadius: 8,
          padding: "14px 12px",
          textAlign: "center",
          cursor: uploading ? "default" : "pointer",
          background: dragOver
            ? "var(--brand-subtle, rgba(99,102,241,0.06))"
            : "var(--bg-card)",
          color: "var(--text-muted)",
          fontSize: "0.85rem",
          marginBottom: 10,
          transition: "border-color 0.15s",
        }}
      >
        {uploading ? (
          <div>
            <div style={{ marginBottom: 6 }}>Uploading… {progress}%</div>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: "var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: "var(--brand)",
                  transition: "width 0.1s",
                }}
              />
            </div>
          </div>
        ) : (
          <>
            📎 Drop a file here or{" "}
            <span style={{ color: "var(--brand)", fontWeight: 600 }}>
              click to upload
            </span>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading}
        />
      </div>

      {error && (
        <p
          style={{
            color: "var(--danger, #e53e3e)",
            fontSize: "0.82rem",
            marginBottom: 8,
          }}
        >
          {error}
        </p>
      )}

      {loading ? (
        <div
          className={cx.empty}
          style={{ padding: "8px 12px", fontSize: "0.85rem" }}
        >
          Loading…
        </div>
      ) : (
        <AttachmentList
          attachments={attachments}
          projectId={projectId}
          taskId={taskId}
          token={token}
          currentUserId={currentUserId}
          isOwner={isOwner}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
