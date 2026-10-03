"use client";

import Link from "next/link";
import type { Session } from "next-auth";
import { Icon } from "@/components/ui";
import { sectionLabel, type SiteInfo } from "@/lib/content";
import type { Settings } from "@/components/SettingsProvider";

export type DashboardView = { kind: "content"; section: string } | { kind: "media" } | { kind: "settings" };

export function viewHref(view: DashboardView): string {
  if (view.kind === "media") return "/?view=media";
  if (view.kind === "settings") return "/?view=settings";
  return view.section === "all" ? "/" : `/?section=${encodeURIComponent(view.section)}`;
}

const SECTION_ICONS: Record<string, string> = {
  blog: "edit_note",
  posts: "edit_note",
  post: "edit_note",
  lists: "checklist",
  tags: "sell",
  notes: "sticky_note_2",
  projects: "deployed_code",
  docs: "menu_book",
};

interface Props {
  session: Session;
  settings: Settings;
  site: SiteInfo | null;
  view: DashboardView;
  open: boolean;
  onClose: () => void;
  onSignOut: () => void;
}

export function AppSidebar({ session, settings, site, view, open, onClose, onSignOut }: Props) {
  const entries = site?.entries ?? [];
  const sections = Array.from(new Set(entries.map((e) => e.section))).sort((a, b) => {
    // Posts first, then alphabetical, with top-level pages last.
    const rank = (s: string) => (s === settings.postsSection ? 0 : s === settings.contentDir ? 2 : 1);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  const drafts = entries.filter((e) => e.draft).length;
  const unusedMedia = site?.media.filter((m) => m.usedBy.length === 0).length ?? 0;
  const repoUrl = `https://github.com/${settings.repository}`;

  const isActive = (target: DashboardView) => {
    if (target.kind !== view.kind) return false;
    return target.kind !== "content" || view.kind !== "content" || target.section === view.section;
  };

  const item = (target: DashboardView, icon: string, label: string, count?: number, badge?: React.ReactNode) => {
    const active = isActive(target);
    return (
      <Link
        key={viewHref(target)}
        href={viewHref(target)}
        onClick={onClose}
        className={`group flex items-center gap-2.5 rounded-lg px-2.5 h-9 text-sm transition-colors ${
          active ? "bg-primary-container text-on-primary-container font-medium" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
        }`}
      >
        <Icon name={icon} className={`!text-[19px] ${active ? "" : "opacity-80"}`} filled={active} />
        <span className="flex-1 truncate">{label}</span>
        {badge}
        {count !== undefined && <span className={`text-xs tabular-nums ${active ? "" : "text-on-surface-variant/70"}`}>{count}</span>}
      </Link>
    );
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden animate-[fadeIn_120ms_ease-out]" onClick={onClose} />}
      <nav
        className={`fixed inset-y-0 left-0 z-50 w-72 md:w-64 flex flex-col bg-surface-container-low border-r border-outline-variant transition-transform md:translate-x-0 ${
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
        aria-label="Main"
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 h-14 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary text-on-primary flex items-center justify-center">
            <Icon name="draw" className="!text-[17px]" />
          </div>
          <span className="font-display text-[17px] font-bold tracking-tight text-on-surface">HugoFlow</span>
          <button onClick={onClose} className="icon-btn ml-auto md:hidden" aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>

        {/* Site card */}
        <div className="mx-3 mb-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-on-surface" title={settings.repository}>
                {settings.repository.split("/")[1]}
              </div>
              <div className="flex items-center gap-1 text-xs text-on-surface-variant truncate">
                <span className="truncate">{settings.repository.split("/")[0]}</span>
                {site && (
                  <>
                    <span>·</span>
                    <Icon name="call_split" className="!text-[13px]" />
                    <span className="truncate">{site.branch}</span>
                  </>
                )}
              </div>
            </div>
            <Link href={viewHref({ kind: "settings" })} onClick={onClose} className="icon-btn !w-7 !h-7" title="Switch repository">
              <Icon name="swap_horiz" className="!text-[18px]" />
            </Link>
          </div>
          <div className="mt-2.5 flex gap-1.5">
            {site?.baseURL && (
              <a href={site.baseURL} target="_blank" rel="noopener noreferrer" className="btn-secondary !h-7 !px-2 !text-xs flex-1">
                <Icon name="public" className="!text-[15px]" /> Site
              </a>
            )}
            <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary !h-7 !px-2 !text-xs flex-1">
              <Icon name="code" className="!text-[15px]" /> GitHub
            </a>
          </div>
        </div>

        <div className="px-3 mb-4">
          <Link href={`/editor?new=${encodeURIComponent(settings.postsSection)}`} className="btn-primary w-full !h-10" onClick={onClose}>
            <Icon name="add" className="!text-[19px]" /> New post
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-5">
          <div className="space-y-0.5">
            <div className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70">Content</div>
            {item({ kind: "content", section: "all" }, "dashboard", "All content", entries.length)}
            {sections.map((s) =>
              item(
                { kind: "content", section: s },
                s === settings.contentDir ? "description" : SECTION_ICONS[s.split("/").pop() || ""] ?? "folder",
                sectionLabel(s, settings.contentDir),
                entries.filter((e) => e.section === s).length
              )
            )}
            {drafts > 0 && item({ kind: "content", section: "drafts" }, "edit_document", "Drafts", drafts)}
          </div>

          <div className="space-y-0.5">
            <div className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70">Library</div>
            {item(
              { kind: "media" },
              "photo_library",
              "Media",
              site?.media.length,
              unusedMedia > 0 ? (
                <span className="rounded-full bg-tertiary-container text-on-tertiary-container px-1.5 text-[10px] font-semibold leading-4" title={`${unusedMedia} unused`}>
                  {unusedMedia} unused
                </span>
              ) : null
            )}
            {item({ kind: "settings" }, "settings", "Settings")}
          </div>
        </div>

        {/* Account */}
        <div className="flex items-center gap-2.5 border-t border-outline-variant px-4 h-14 shrink-0">
          {session.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="w-7 h-7 rounded-full border border-outline-variant" />
          ) : (
            <Icon name="account_circle" />
          )}
          <span className="flex-1 truncate text-sm text-on-surface">{session.user?.name}</span>
          <button onClick={onSignOut} className="icon-btn !w-8 !h-8" title="Sign out">
            <Icon name="logout" className="!text-[18px]" />
          </button>
        </div>
      </nav>
    </>
  );
}
