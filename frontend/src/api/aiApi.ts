/**
 * Thin wrapper around aiClient that provides the `api.get / api.post / …`
 * calling convention used by the ported HRS.AI pages.
 */
import { aiClient } from "./aiClient";

const aiApi = {
  get: (url: string, config?: object) => aiClient.get(url, config),
  post: (url: string, data?: unknown, config?: object) =>
    aiClient.post(url, data, config),
  patch: (url: string, data?: unknown) => aiClient.patch(url, data),
  delete: (url: string) => aiClient.delete(url),
};

export default aiApi;
