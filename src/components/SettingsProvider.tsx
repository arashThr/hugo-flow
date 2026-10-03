"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface Settings {
  repository: string; // e.g. "username/repo"
  branch: string; // empty = the repository's default branch
  contentDir: string; // Hugo content root, e.g. "content"
  postsSection: string; // where "New post" goes, e.g. "content/blog"
  imagePath: string; // e.g. "static/images"
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  isLoaded: boolean;
}

const STORAGE_KEY = "hugo_cms_settings";

const defaultSettings: Settings = {
  repository: "",
  branch: "",
  contentDir: "content",
  postsSection: "content/blog",
  imagePath: "static/images",
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

function migrate(stored: Record<string, string>): Settings {
  const settings = { ...defaultSettings, ...stored };
  // Older versions only had a single "contentPath" pointing at the posts folder.
  if (stored.contentPath && !stored.postsSection) {
    settings.postsSection = stored.contentPath.replace(/\/$/, "");
    settings.contentDir = stored.contentPath.split("/")[0] || "content";
  }
  delete (settings as Partial<Settings> & { contentPath?: string }).contentPath;
  return settings;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after mount
      if (stored) setSettings(migrate(JSON.parse(stored)));
    } catch (e) {
      console.error("Failed to load settings", e);
    }
    setIsLoaded(true);
  }, []);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Storage unavailable (private mode); settings still apply for this session.
      }
      return updated;
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isLoaded }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
