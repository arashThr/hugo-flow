// Static, non-interactive replicas of the editor and dashboard for the landing page.
// Built from the app's own design tokens, so they follow light/dark mode, stay sharp at any
// size, reflow on phones and never go stale the way screenshots do.
import { Icon } from "@/components/ui";

export const PHOTOS = [
  "from-[#e7b48f] via-[#c9805d] to-[#8f4f3a]",
  "from-[#a9d3b2] via-[#6a9f78] to-[#355f43]",
  "from-[#b6c6ea] via-[#7c92c9] to-[#45588f]",
];

/** A photo-like tile: sky gradient, a sun and two hills. */
export function Photo({ tone, className = "" }: { tone: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-gradient-to-b ${tone} ${className}`} aria-hidden="true">
      <div className="absolute right-[18%] top-[18%] w-[16%] aspect-square rounded-full bg-white/70" />
      <div className="absolute -left-[10%] bottom-[-35%] w-[80%] aspect-square rounded-full bg-black/20" />
      <div className="absolute -right-[20%] bottom-[-45%] w-[90%] aspect-square rounded-full bg-black/25" />
    </div>
  );
}

function ToolbarIcon({ name, active }: { name: string; active?: boolean }) {
  return (
    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${active ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant"}`}>
      <Icon name={name} className="!text-[17px]" />
    </span>
  );
}

export function EditorMockup() {
  return (
    <div className="flex flex-col text-left select-none" role="img" aria-label="The HugoFlow editor: a blog post with a row of three photos, and the page settings panel">
      {/* App bar */}
      <div className="flex items-center gap-2 h-12 px-3 sm:px-4 border-b border-outline-variant">
        <Icon name="arrow_back" className="!text-[18px] text-on-surface-variant" />
        <span className="hidden sm:inline text-[13px] text-on-surface-variant">Blog</span>
        <span className="hidden sm:inline-flex">
          <Icon name="chevron_right" className="!text-[15px] text-on-surface-variant/60" />
        </span>
        <span className="truncate text-[13px] font-medium text-on-surface">A weekend in the archipelago</span>
        <span className="hidden md:inline-flex items-center gap-1.5 ml-2 text-[11px] text-on-surface-variant">
          <span className="w-1.5 h-1.5 rounded-full bg-tertiary" /> Unsaved changes
        </span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-2.5 h-7 text-[12px] font-medium text-on-primary">
          <Icon name="check" className="!text-[15px]" /> Save
        </span>
      </div>

      <div className="flex">
        {/* Writing canvas */}
        <div className="flex-1 min-w-0 px-4 sm:px-10 pt-5 sm:pt-8 pb-6 sm:pb-10">
          <div className="font-display text-[22px] sm:text-[32px] font-bold leading-tight tracking-tight text-on-surface">
            A weekend in the archipelago
          </div>

          <div className="mt-3 sm:mt-4 flex items-center gap-0.5 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest p-1">
            <ToolbarIcon name="undo" />
            <span className="mx-1 h-4 w-px bg-outline-variant" />
            <span className="px-1.5 text-[11px] font-semibold text-on-surface-variant">H2</span>
            <ToolbarIcon name="format_bold" active />
            <ToolbarIcon name="format_italic" />
            <ToolbarIcon name="link" />
            <span className="mx-1 h-4 w-px bg-outline-variant" />
            <ToolbarIcon name="checklist" />
            <ToolbarIcon name="image" />
            <ToolbarIcon name="view_column" />
            <span className="ml-auto hidden sm:inline-flex items-center gap-1 rounded-md bg-surface-container px-2 h-6 text-[11px] text-on-surface">
              <Icon name="edit" className="!text-[13px]" /> Visual
            </span>
          </div>

          <div className="mt-4 sm:mt-6 font-serif text-[13px] sm:text-[15px] leading-[1.75] text-on-surface">
            <p>
              We took the early ferry out of Stockholm and spent two slow days hopping between islands. <strong>No plans</strong>, just a
              thermos of coffee and a camera.
            </p>
            <div className="mt-4 flex gap-1.5 sm:gap-2 rounded-lg border border-dashed border-outline-variant p-1.5">
              {PHOTOS.map((tone, i) => (
                <Photo key={i} tone={tone} className={`flex-1 aspect-[4/3] ${i === 1 ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest" : ""}`} />
              ))}
            </div>
            <p className="mt-4 hidden sm:block">
              The light out there is something else. By eight in the evening the whole sky turns the colour of the rocks.
            </p>
            <ul className="mt-3 space-y-1 text-[12px] sm:text-[14px]">
              <li className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-[4px] bg-primary text-on-primary inline-flex items-center justify-center">
                  <Icon name="check" className="!text-[11px]" />
                </span>
                <span className="text-on-surface-variant">Pack the waterproof jacket</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-[4px] border border-outline" />
                Book the cabin for next summer
              </li>
            </ul>
          </div>
        </div>

        {/* Page settings */}
        <div className="hidden md:block w-60 shrink-0 border-l border-outline-variant bg-surface-container-low p-4 space-y-4">
          <div className="text-[13px] font-semibold text-on-surface">Page settings</div>
          <div className="flex items-center gap-2.5 rounded-lg border border-outline-variant bg-surface-container-lowest p-2.5">
            <span className="relative w-8 h-[18px] rounded-full bg-primary shrink-0">
              <span className="absolute right-0.5 top-0.5 w-3.5 h-3.5 rounded-full bg-white" />
            </span>
            <span className="text-[12px] font-medium text-on-surface">Published</span>
          </div>
          <div>
            <div className="mb-1 text-[11px] text-on-surface-variant">Date</div>
            <div className="rounded-md border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-[12px] text-on-surface">Jun 14, 2026, 09:30</div>
          </div>
          <div>
            <div className="mb-1 text-[11px] text-on-surface-variant">Tags</div>
            <div className="flex flex-wrap gap-1 rounded-md border border-outline-variant bg-surface-container-lowest p-1.5">
              {["travel", "sweden", "photos"].map((t) => (
                <span key={t} className="rounded bg-surface-container-high px-1.5 py-0.5 text-[11px] text-on-surface">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] text-on-surface-variant">Featured image</div>
            <Photo tone={PHOTOS[2]} className="aspect-video" />
          </div>
        </div>
      </div>
    </div>
  );
}

const POSTS = [
  { title: "A weekend in the archipelago", section: "Blog", tags: ["travel", "photos"], date: "Jun 14", draft: true },
  { title: "Self-hosting my productivity apps", section: "Blog", tags: ["self-host", "docker"], date: "Jun 2" },
  { title: "Books", section: "Lists", tags: ["reading"], date: "" },
  { title: "Notes on learning Go", section: "Blog", tags: ["go"], date: "May 21" },
  { title: "Contact", section: "Pages", tags: [], date: "" },
];

export function DashboardMockup() {
  return (
    <div className="flex text-left select-none" role="img" aria-label="The HugoFlow dashboard listing a site's posts, lists and pages">
      <div className="hidden sm:flex w-44 shrink-0 flex-col gap-0.5 border-r border-outline-variant bg-surface-container-low p-3">
        <span className="mb-2 inline-flex items-center justify-center gap-1 rounded-md bg-primary h-8 text-[12px] font-medium text-on-primary">
          <Icon name="add" className="!text-[16px]" /> New post
        </span>
        {[
          { icon: "dashboard", label: "All content", n: 68, active: true },
          { icon: "edit_note", label: "Blog", n: 53 },
          { icon: "checklist", label: "Lists", n: 12 },
          { icon: "description", label: "Pages", n: 2 },
          { icon: "photo_library", label: "Media", n: 18 },
        ].map((item) => (
          <span
            key={item.label}
            className={`flex items-center gap-2 rounded-md px-2 h-8 text-[12px] ${item.active ? "bg-primary-container text-on-primary-container font-medium" : "text-on-surface-variant"}`}
          >
            <Icon name={item.icon} className="!text-[16px]" />
            <span className="flex-1">{item.label}</span>
            <span className="text-[11px] opacity-70">{item.n}</span>
          </span>
        ))}
      </div>
      <div className="flex-1 min-w-0 p-3 sm:p-5">
        <div className="flex items-center gap-2 rounded-md border border-outline-variant bg-surface-container-lowest px-2.5 h-8 text-[12px] text-on-surface-variant/70">
          <Icon name="search" className="!text-[15px]" /> Search by title, tag or file…
        </div>
        <ul className="mt-3 divide-y divide-outline-variant rounded-lg border border-outline-variant bg-surface-container-lowest">
          {POSTS.map((p) => (
            <li key={p.title} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium text-on-surface">{p.title}</span>
                  {p.draft && <span className="shrink-0 rounded-full bg-tertiary-container px-1.5 text-[10px] font-medium text-on-tertiary-container">Draft</span>}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                  <span className="font-medium">{p.section}</span>
                  {p.tags.map((t) => (
                    <span key={t} className="hidden sm:inline rounded bg-surface-container px-1">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-on-surface-variant">{p.date}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
