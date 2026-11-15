import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";

const FALLBACK = "0.11.0";

export function useAppVersion(): string {
  const [version, setVersion] = useState(FALLBACK);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(FALLBACK));
  }, []);

  return version;
}
