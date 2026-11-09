"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { defaultImageModel, defaultTextModel, modelId } from "@/lib/ai";

export type AiProvider = "grok" | "openai";

export interface Settings {
  repository: string; // e.g. "username/repo"
  branch: string; // empty = the repository's default branch
  contentDir: string; // Hugo content root, e.g. "content"
  postsSection: string; // where "New post" goes, e.g. "content/blog"
  imagePath: string; // e.g. "static/images"
  aiProvider: AiProvider; // which key the writing assistant uses
  grokApiKey: string;
  openaiApiKey: string;
  grokTextModel: string;
  grokImageModel: string;
  openaiTextModel: string;
  openaiImageModel: string;
  imageTheme: string; // reusable style added to every featured image
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  isLoaded: boolean;
  /** Style reference for featured images. Kept out of the settings JSON so a large picture cannot wipe the keys. */
  imageTemplate: string;
  saveImageTemplate: (dataUrl: string) => boolean;
}

const STORAGE_KEY = "hugo_cms_settings";
const TEMPLATE_KEY = "hugo_cms_image_template";
const TEMPLATE_MAX = 1_200_000;

const defaultSettings: Settings = {
  repository: "",
  branch: "",
  contentDir: "content",
  postsSection: "content/blog",
  imagePath: "static/images",
  aiProvider: "grok",
  grokApiKey: "",
  openaiApiKey: "",
  grokTextModel: defaultTextModel("grok"),
  grokImageModel: defaultImageModel("grok"),
  openaiTextModel: defaultTextModel("openai"),
  openaiImageModel: defaultImageModel("openai"),
  imageTheme: "",
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
  if (settings.aiProvider !== "grok" && settings.aiProvider !== "openai") settings.aiProvider = "grok";
  if (typeof settings.grokApiKey !== "string") settings.grokApiKey = "";
  if (typeof settings.openaiApiKey !== "string") settings.openaiApiKey = "";
  if (typeof settings.imageTheme !== "string") settings.imageTheme = "";
  settings.grokTextModel = modelId(settings.grokTextModel, defaultTextModel("grok"));
  settings.grokImageModel = modelId(settings.grokImageModel, defaultImageModel("grok"));
  settings.openaiTextModel = modelId(settings.openaiTextModel, defaultTextModel("openai"));
  settings.openaiImageModel = modelId(settings.openaiImageModel, defaultImageModel("openai"));
  return settings;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [imageTemplate, setImageTemplate] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after mount
      if (stored) setSettings(migrate(JSON.parse(stored)));
      const template = localStorage.getItem(TEMPLATE_KEY);
      if (template && template.startsWith("data:image/") && template.length <= TEMPLATE_MAX) setImageTemplate(template);
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

  const saveImageTemplate = (dataUrl: string): boolean => {
    if (dataUrl && (!dataUrl.startsWith("data:image/") || dataUrl.length > TEMPLATE_MAX)) return false;
    try {
      if (dataUrl) localStorage.setItem(TEMPLATE_KEY, dataUrl);
      else localStorage.removeItem(TEMPLATE_KEY);
    } catch {
      return false;
    }
    setImageTemplate(dataUrl);
    return true;
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isLoaded, imageTemplate, saveImageTemplate }}>
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
