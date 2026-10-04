import type { ReactNode } from "react";
import { signIn } from "next-auth/react";
import { Icon } from "@/components/ui";
import { DashboardMockup, EditorMockup, Photo, PHOTOS } from "./LandingMockups";

const REPO_URL = "https://github.com/arashthr/hugo-flow";

function GitHubMark({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function BrowserFrame({ children, url }: { children: ReactNode; url: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-[0_30px_80px_-20px_rgba(20,40,25,0.35)] dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] overflow-hidden">
      <div className="flex items-center gap-3 px-4 h-10 border-b border-outline-variant bg-surface-container-low">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="mx-auto flex items-center gap-1.5 rounded-md bg-surface-container px-3 py-1 text-[11px] text-on-surface-variant max-w-[60%] truncate">
          <Icon name="lock" className="!text-[12px]" /> {url}
        </div>
        <div className="w-[52px]" aria-hidden="true" />
      </div>
      {children}
    </div>
  );
}

function SignInButton({ children, size = "md" }: { children: ReactNode; size?: "md" | "lg" }) {
  return (
    <button
      onClick={() => signIn("github")}
      className={`btn-primary group ${size === "lg" ? "w-full sm:w-auto !h-12 !px-6 !text-[15px] !rounded-xl" : ""}`}
    >
      <GitHubMark />
      {children}
      <Icon name="arrow_forward" className="!text-[18px] transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto text-center mb-12 sm:mb-16">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-3">{eyebrow}</div>
      <h2 className="font-display text-3xl sm:text-[40px] leading-[1.1] font-bold tracking-tight text-on-surface">{title}</h2>
      {children && <p className="mt-4 text-[17px] leading-relaxed text-on-surface-variant">{children}</p>}
    </div>
  );
}

function FeatureCard({ icon, title, children, visual, className = "" }: { icon: string; title: string; children: ReactNode; visual?: ReactNode; className?: string }) {
  return (
    <div className={`group relative flex flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 sm:p-7 transition-shadow hover:shadow-lg ${className}`}>
      <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center mb-5">
        <Icon name={icon} />
      </div>
      <h3 className="font-display text-lg font-semibold text-on-surface">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-on-surface-variant">{children}</p>
      {visual && <div className="mt-6 flex-1 flex items-end">{visual}</div>}
    </div>
  );
}

/** A tiny commit diff: only the line you changed. */
function DiffVisual() {
  return (
    <div className="w-full rounded-xl border border-outline-variant bg-surface-container-low font-mono text-[12px] leading-6 overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-8 border-b border-outline-variant text-on-surface-variant">
        <Icon name="description" className="!text-[14px]" /> content/lists/books.md
        <span className="ml-auto text-primary">+1 −1</span>
      </div>
      <div className="px-3 py-2">
        <div className="text-on-surface-variant/70 truncate">&nbsp; - [x] Deep work</div>
        <div className="-mx-3 px-3 bg-error-container/70 text-on-error-container truncate">− - [ ] The Man Who Solved the Market</div>
        <div className="-mx-3 px-3 bg-primary-container/80 text-on-primary-container truncate">+ - [x] The Man Who Solved the Market</div>
        <div className="text-on-surface-variant/70 truncate">&nbsp; - [ ] Inside the black box</div>
      </div>
    </div>
  );
}

/** Three photos side by side, the way an image row renders. */
function RowVisual() {
  return (
    <div className="w-full rounded-xl border border-dashed border-outline-variant p-2 flex gap-2">
      {PHOTOS.map((tone, i) => (
        <Photo key={i} tone={tone} className="flex-1 aspect-[4/3]" />
      ))}
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="relative isolate min-h-screen overflow-x-clip bg-background text-on-surface">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-outline-variant/60 bg-background/75 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
          <a href="#" className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-primary text-on-primary flex items-center justify-center">
              <Icon name="draw" className="!text-[18px]" />
            </span>
            <span className="font-display text-[17px] font-bold tracking-tight">HugoFlow</span>
          </a>
          <div className="hidden md:flex items-center gap-6 text-sm text-on-surface-variant">
            <a href="#features" className="hover:text-on-surface transition-colors">Features</a>
            <a href="#how" className="hover:text-on-surface transition-colors">How it works</a>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-on-surface transition-colors">Source</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="icon-btn" title="HugoFlow on GitHub">
              <GitHubMark className="w-[18px] h-[18px]" />
            </a>
            <button onClick={() => signIn("github")} className="btn-primary">
              Sign in
            </button>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-[-12rem] h-[42rem] w-[72rem] -translate-x-1/2 rounded-full bg-primary/[0.13] blur-3xl" />
            <div className="absolute right-[-10rem] top-[18rem] h-[28rem] w-[28rem] rounded-full bg-tertiary/[0.10] blur-3xl" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(var(--c-outline-variant)/0.5)_1px,transparent_1px),linear-gradient(to_bottom,rgb(var(--c-outline-variant)/0.5)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_65%)]" />
          </div>

          <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-16 sm:pt-24 text-center">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest/80 px-3 py-1 text-xs text-on-surface-variant shadow-sm hover:text-on-surface transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Open source · Free · Nothing to install
              <Icon name="chevron_right" className="!text-[14px]" />
            </a>

            <h1 className="mt-7 font-display text-[42px] sm:text-6xl lg:text-[72px] font-bold leading-[1.03] tracking-[-0.035em] text-on-surface max-w-4xl mx-auto">
              Write for your Hugo blog,{" "}
              <span className="bg-gradient-to-br from-primary to-[#7fb08d] dark:to-[#c8e8d0] bg-clip-text text-transparent">right in the browser.</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl leading-relaxed text-on-surface-variant max-w-2xl mx-auto">
              A calm editor for Hugo sites on GitHub. Sign in, pick your repository and start writing. Every save is a clean commit.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-sm sm:max-w-none mx-auto">
              <SignInButton size="lg">Start writing</SignInButton>
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary w-full sm:w-auto !h-12 !px-6 !text-[15px] !rounded-xl">
                View on GitHub
              </a>
            </div>
            <p className="mt-4 text-xs text-on-surface-variant/80">No config files, no GitHub App, no desktop app.</p>
          </div>

          <div className="relative mx-auto max-w-6xl px-5 sm:px-8 mt-14 sm:mt-20">
            <div aria-hidden="true" className="absolute inset-x-16 top-10 bottom-0 -z-10 rounded-[3rem] bg-primary/20 blur-3xl" />
            <BrowserFrame url="hugo-flow.arashtaher.com/editor">
              <EditorMockup />
            </BrowserFrame>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl px-5 sm:px-8 pt-28 sm:pt-36 scroll-mt-16">
          <SectionHeading eyebrow="How it works" title="From sign-in to published in a minute">
            HugoFlow talks to GitHub directly. Your repository stays exactly as it is: no extra files, no build hooks.
          </SectionHeading>
          <ol className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: "login", title: "Sign in with GitHub", text: "One click. HugoFlow uses your GitHub account and keeps nothing on a server." },
              { icon: "folder_open", title: "Pick your repository", text: "Your posts, lists and pages show up automatically, read straight from content/." },
              { icon: "rocket_launch", title: "Write and save", text: "Each save is a commit to your repo, so your usual deploy publishes it." },
            ].map((step, i) => (
              <li key={step.title} className="relative rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
                <div className="flex items-center justify-between">
                  <span className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface">
                    <Icon name={step.icon} />
                  </span>
                  <span className="font-display text-4xl font-bold text-outline-variant">0{i + 1}</span>
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-on-surface-variant">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-5 sm:px-8 pt-28 sm:pt-36 scroll-mt-16">
          <SectionHeading eyebrow="Features" title="Everything a Hugo writer needs. Nothing else.">
            Built around how Hugo sites actually look: front matter, shortcodes, lists, sections and a static folder full of images.
          </SectionHeading>

          <div className="grid gap-4 md:grid-cols-6">
            <FeatureCard className="md:col-span-3" icon="difference" title="Commits that only touch what you changed" visual={<DiffVisual />}>
              Tick one item on a long list and the commit changes one line. Your formatting, shortcodes and front matter stay exactly as you wrote
              them, and saves never overwrite newer changes on GitHub.
            </FeatureCard>
            <FeatureCard className="md:col-span-3" icon="view_column" title="Photos that behave" visual={<RowVisual />}>
              Drop images in, set them side by side in a row, and they are resized to WebP. Nothing is uploaded until you save, and only the
              images still in your post are committed.
            </FeatureCard>
            <FeatureCard className="md:col-span-2" icon="edit_note" title="Visual or Markdown">
              Write in a clean visual editor or switch to raw Markdown at any time. Checklists, code blocks and links all round-trip.
            </FeatureCard>
            <FeatureCard className="md:col-span-2" icon="folder_copy" title="Your whole site">
              Posts, lists, section pages and standalone pages. TOML or YAML front matter, every field preserved.
            </FeatureCard>
            <FeatureCard className="md:col-span-2" icon="photo_library" title="Media library">
              See which pages use each image and clean out the ones nothing points to.
            </FeatureCard>
          </div>
        </section>

        {/* Dashboard shot + zero setup */}
        <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-28 sm:pt-36">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.35fr]">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-3">Zero setup</div>
              <h2 className="font-display text-3xl sm:text-[40px] leading-[1.1] font-bold tracking-tight">Your repo is the CMS.</h2>
              <p className="mt-4 text-[17px] leading-relaxed text-on-surface-variant">
                Other Git-based CMSs ask you to add config files, install an app on your account or download a desktop client. HugoFlow just reads
                and writes your repository through the GitHub API.
              </p>
              <ul className="mt-7 space-y-3">
                {[
                  "Nothing added to your repository",
                  "Works with the Hugo site you already have",
                  "Drafts, tags, dates and featured images built in",
                  "Comfortable on your phone, light or dark",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[15px]">
                    <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center">
                      <Icon name="check" className="!text-[14px]" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <BrowserFrame url="hugo-flow.arashtaher.com">
              <DashboardMockup />
            </BrowserFrame>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-5 sm:px-8 py-28 sm:py-36">
          <div className="relative overflow-hidden rounded-3xl bg-[#1d3a27] dark:bg-primary-container px-6 py-16 sm:px-16 sm:py-20 text-center">
            <div aria-hidden="true" className="absolute -top-24 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-[#8ecf9e]/25 blur-3xl" />
            <h2 className="relative font-display text-3xl sm:text-5xl font-bold tracking-tight text-white">Your next post is two clicks away.</h2>
            <p className="relative mt-4 text-[17px] text-white/75 max-w-xl mx-auto">Free and open source. Sign in with GitHub and pick your Hugo repository.</p>
            <button
              onClick={() => signIn("github")}
              className="relative mt-9 inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-white text-[#1d3a27] text-[15px] font-semibold shadow-lg hover:bg-white/90 transition-colors"
            >
              <GitHubMark /> Start writing
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-outline-variant">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center gap-3 px-5 sm:px-8 py-8 text-sm text-on-surface-variant">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-primary text-on-primary flex items-center justify-center">
              <Icon name="draw" className="!text-[14px]" />
            </span>
            <span className="font-display font-semibold text-on-surface">HugoFlow</span>
          </div>
          <p className="sm:ml-4 text-center">
            An open-source project by{" "}
            <a href="https://arashtaher.com/" target="_blank" rel="noopener noreferrer" className="text-on-surface hover:text-primary underline-offset-4 hover:underline">
              Arash Taher
            </a>
          </p>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="sm:ml-auto inline-flex items-center gap-1.5 hover:text-on-surface transition-colors">
            <GitHubMark /> Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
