"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useSettings } from "./SettingsProvider";
import type { SiteInfo } from "@/lib/content";

interface SiteContextType {
  site: SiteInfo | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const SiteContext = createContext<SiteContextType | undefined>(undefined);

/** Loads the repository's content index once and shares it between the dashboard and the editor. */
export function SiteProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const { settings, isLoaded } = useSettings();
  const [site, setSite] = useState<SiteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { repository, branch, contentDir, imagePath } = settings;

  const refresh = useCallback(async () => {
    if (!repository) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ repository, branch, contentDir, imageDir: imagePath });
      const res = await fetch(`/api/github/site?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load repository");
      setSite(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [repository, branch, contentDir, imagePath]);

  useEffect(() => {
    if (status !== "authenticated" || !isLoaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale data when the repo changes
    setSite(null);
    refresh();
  }, [status, isLoaded, refresh]);

  return <SiteContext.Provider value={{ site, loading, error, refresh }}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const context = useContext(SiteContext);
  if (!context) throw new Error("useSite must be used within a SiteProvider");
  return context;
}
