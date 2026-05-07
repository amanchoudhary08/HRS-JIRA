import { useCallback, useEffect, useState } from "react";

export function useDarkMode(): [boolean, () => void, () => void] {
  const [dark, setDark] = useState(
    () => localStorage.getItem("taskflow_dark") === "true",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("taskflow_dark", String(dark));
  }, [dark]);

  const toggle = useCallback(() => setDark((d) => !d), []);
  const reset = useCallback(() => setDark(false), []);
  return [dark, toggle, reset];
}
