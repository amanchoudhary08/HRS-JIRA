import React, { useEffect, useState } from "react";
import { API_URL } from "../api/client";
import type { ActivityEvent, SSETaskEvent } from "../types";

export function useProjectEvents(
  projectId: string | undefined,
  token: string | null,
  onEvent: (e: SSETaskEvent) => void,
  onActivityEvent?: (e: ActivityEvent) => void,
): boolean {
  const [connected, setConnected] = useState(false);
  const onEventRef = React.useRef(onEvent);
  const onActivityRef = React.useRef(onActivityEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);
  useEffect(() => {
    onActivityRef.current = onActivityEvent;
  }, [onActivityEvent]);

  useEffect(() => {
    if (!projectId || !token) return;
    const url = `${API_URL}/projects/${projectId}/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    // Named ping events confirm the stream is alive (sent every 15 s by the server).
    es.addEventListener("ping", () => setConnected(true));
    const handle = (type: SSETaskEvent["type"]) => (e: Event) => {
      try {
        onEventRef.current({
          type,
          data: JSON.parse((e as MessageEvent).data),
        } as SSETaskEvent);
      } catch (_e) {
        // ignore malformed events
      }
    };
    es.addEventListener("task_created", handle("task_created"));
    es.addEventListener("task_updated", handle("task_updated"));
    es.addEventListener("task_deleted", handle("task_deleted"));
    es.addEventListener("task_moved", handle("task_moved"));
    es.addEventListener("comment_added", handle("comment_added"));
    es.addEventListener("comment_updated", handle("comment_updated"));
    es.addEventListener("comment_deleted", handle("comment_deleted"));
    es.addEventListener("sprint_started", handle("sprint_started"));
    es.addEventListener("sprint_completed", handle("sprint_completed"));
    es.addEventListener("activity_created", (e: Event) => {
      try {
        if (onActivityRef.current) {
          onActivityRef.current(
            JSON.parse((e as MessageEvent).data) as ActivityEvent,
          );
        }
      } catch (_e) {
        // ignore malformed events
      }
    });
    return () => {
      es.close();
      setConnected(false);
    };
  }, [projectId, token]);

  return connected;
}
