"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useSettings } from "@/components/SettingsProvider";
import { useSite } from "@/components/SiteProvider";
import { LandingPage } from "@/components/dashboard/LandingPage";
import { SettingsView } from "@/components/dashboard/SettingsView";
import { AppSidebar, type DashboardView } from "@/components/dashboard/AppSidebar";
import { ContentList } from "@/components/dashboard/ContentList";
import { MediaLibrary } from "@/components/dashboard/MediaLibrary";
import { Icon, Spinner } from "@/components/ui";

function FullScreenLoading() {
  return (
    <div className="flex h-screen w-full items-center justify-center gap-2 text-on-surface-variant">
      <Spinner /> Loading…
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<FullScreenLoading />}>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const { data: session, status } = useSession();
  const { settings, updateSettings, isLoaded } = useSettings();
  const { site, loading, error, refresh } = useSite();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);

  if (status === "loading" || !isLoaded) return <FullScreenLoading />;
  if (!session) return <LandingPage />;

  const sections = Array.from(new Set(site?.entries.map((e) => e.section) ?? [])).sort();

  if (!settings.repository) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 gap-6">
        <div className="text-center">
          <div className="mx-auto mb-4 w-11 h-11 rounded-xl bg-primary text-on-primary flex items-center justify-center">
            <Icon name="draw" />
          </div>
          <h1 className="font-display text-2xl font-bold text-on-surface">Pick your Hugo site</h1>
          <p className="text-on-surface-variant mt-1">Choose the repository you want to write in.</p>
        </div>
        <div className="w-full max-w-lg">
          <SettingsView settings={settings} updateSettings={updateSettings} sections={sections} isInitialSetup />
        </div>
      </div>
    );
  }

  const viewParam = searchParams.get("view");
  const view: DashboardView =
    viewParam === "media"
      ? { kind: "media" }
      : viewParam === "settings"
        ? { kind: "settings" }
        : { kind: "content", section: searchParams.get("section") || "all" };

  return (
    <div className="min-h-screen md:pl-64">
      <AppSidebar
        session={session}
        settings={settings}
        site={site}
        view={view}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSignOut={() => signOut()}
      />

      {/* Mobile header */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 h-14 px-3 bg-background/90 backdrop-blur border-b border-outline-variant">
        <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <Icon name="menu" />
        </button>
        <span className="font-display font-bold text-on-surface truncate">{settings.repository.split("/")[1]}</span>
      </header>

      <main className="px-4 py-6 sm:px-8 sm:py-10">
        {error && (
          <div className="max-w-5xl mx-auto mb-5 flex items-center gap-3 rounded-xl bg-error-container text-on-error-container px-4 py-3 text-sm">
            <Icon name="error" />
            <span className="flex-1">{error}</span>
            <button className="btn-secondary !h-8" onClick={refresh}>
              Retry
            </button>
          </div>
        )}

        {view.kind === "settings" ? (
          <SettingsView settings={settings} updateSettings={updateSettings} sections={sections} />
        ) : view.kind === "media" ? (
          <MediaLibrary media={site?.media ?? []} settings={settings} branch={site?.branch ?? settings.branch} loading={loading} onChanged={refresh} />
        ) : (
          <ContentList
            key={view.section}
            section={view.section}
            entries={site?.entries ?? []}
            settings={settings}
            loading={loading}
            repoUrl={`https://github.com/${settings.repository}`}
            branch={site?.branch ?? (settings.branch || "main")}
          />
        )}
      </main>
    </div>
  );
}
