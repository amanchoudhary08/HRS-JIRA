import React, { useEffect, useState } from "react";
import { API_URL } from "../api/client";
import type { SSETaskEvent } from "../types";

export function useProjectEvents(
  projectId: string | undefined,
  token: string | null,
  onEvent: (e: SSETaskEvent) => void,
): boolean {
  const [connected, setConnected] = useState(false);
  const onEventRef = React.useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

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
    return () => {
      es.close();
      setConnected(false);
    };
  }, [projectId, token]);

  return connected;
}
