"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { Placeholder } from "@tiptap/extensions";
import "highlight.js/styles/github-dark.css";

import { useSettings } from "@/components/SettingsProvider";
import { useSite } from "@/components/SiteProvider";
import { useToast } from "@/components/Toast";
import { Badge, Icon, Modal, Spinner } from "@/components/ui";
import { EditorToolbar, type ViewMode } from "@/components/editor/EditorToolbar";
import { EditorSidebar } from "@/components/editor/EditorSidebar";
import { ImageInsertModal, type ImageTarget } from "@/components/editor/ImageInsertModal";
import { buildExtensions, imageRowHtml, type ImageResolver } from "@/lib/editor/extensions";
import { protectShortcodes, restoreShortcodes } from "@/lib/editor/shortcodes";
import { rebaseOntoOriginal } from "@/lib/editor/rebase";
import { altFromFile, prepareImage, type PendingUpload } from "@/lib/editor/images";
import {
  asString,
  parseContent,
  parseFields,
  stringifyContent,
  stringifyFields,
  type FrontMatter,
  type FrontMatterFormat,
} from "@/lib/frontmatter";
import { sectionLabel, sectionOf, sitePathToRepoPath, slugify } from "@/lib/content";

/** What the file looked like when it was loaded (or last saved), used for change detection and conflict checks. */
interface Original {
  path: string;
  sha: string;
  prefix: string; // front matter block, verbatim
  body: string; // markdown body, verbatim
  normalizedBody: string; // the same body after a pass through the rich editor
  fmJson: string;
}

interface StoredDraft {
  savedAt: number;
  baseSha: string | null;
  format: FrontMatterFormat;
  fm: FrontMatter;
  folder: string;
  fileName: string | null;
  body: string;
  uploads: PendingUpload[];
}

const DESKTOP = "(min-width: 1024px)";
function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const draftKey = (repo: string, path: string | null) => `hugoflow:draft:${repo}:${path ?? "new"}`;

function readDraft(key: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredDraft) : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: StoredDraft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch (e) {
    // Usually the storage quota (large images). The editor still works; only crash recovery is lost.
    console.warn("Could not store local draft", e);
  }
}

function omit(fm: FrontMatter, keys: Set<string>): FrontMatter {
  return Object.fromEntries(Object.entries(fm).filter(([k]) => !keys.has(k)));
}

interface ResolverContext {
  repository: string;
  branch: string;
  dir: string; // folder of the file being edited, for page-bundle relative images
}

/** Where the browser loads an image from, given the path written in markdown. */
function displaySrc(src: string, ctx: ResolverContext, uploads: PendingUpload[]): string {
  const pending = uploads.find((u) => u.sitePath === src);
  if (pending) return pending.dataUrl;
  if (!src || /^(https?:|data:|blob:|\/\/)/i.test(src)) return src;
  const clean = decodeURIComponent(src.split(/[?#]/)[0]);
  const path = clean.startsWith("/") ? sitePathToRepoPath(clean) : `${ctx.dir}/${clean}`;
  return `/api/github/raw?${new URLSearchParams({ repository: ctx.repository, branch: ctx.branch, path })}`;
}

/** Maps between the paths written in markdown and URLs the browser can display. */
function createResolver(ctxRef: RefObject<ResolverContext>, uploadsRef: RefObject<PendingUpload[]>): ImageResolver {
  return {
    toDisplay: (src) => displaySrc(src, ctxRef.current, uploadsRef.current),
    fromDisplay(src) {
      const { repository, dir } = ctxRef.current;
      if (src.startsWith("/api/github/raw?")) {
        const path = new URLSearchParams(src.split("?")[1]).get("path") || "";
        if (path.startsWith("static/")) return "/" + path.slice("static/".length);
        if (dir && path.startsWith(dir + "/")) return path.slice(dir.length + 1);
        return "/" + path;
      }
      const pending = uploadsRef.current.find((u) => u.dataUrl === src);
      if (pending) return pending.sitePath;
      // Earlier versions saved preview URLs into posts; turn them back into site paths.
      const raw = src.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/[^/]+\/static(\/.*)$/i);
      if (raw && raw[1].toLowerCase() === repository.toLowerCase()) return raw[2];
      return src;
    },
  };
}

function EditorScreen() {
  const { status } = useSession();
  const { settings, isLoaded } = useSettings();
  const { site, refresh } = useSite();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editPath = searchParams.get("path");
  const newSection = searchParams.get("new");

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [original, setOriginal] = useState<Original | null>(null);
  const [format, setFormat] = useState<FrontMatterFormat>("toml");
  const [fm, setFm] = useState<FrontMatter>({});
  const [originalKeys, setOriginalKeys] = useState<string[]>([]);
  const [descriptionKey, setDescriptionKey] = useState("description");
  const [imageKey, setImageKey] = useState("image");
  const [folder, setFolder] = useState("");
  const [fileName, setFileName] = useState<string | null>(null); // null = derive from the title
  const [otherText, setOtherText] = useState("");
  const [otherError, setOtherError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("rich");
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [contentVersion, setContentVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sidebarPref, setSidebarOpen] = useState<boolean | null>(null);
  const isDesktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);
  const sidebarOpen = sidebarPref ?? isDesktop;
  const [imagePick, setImagePick] = useState<{ files: File[]; target: ImageTarget; rowPos?: number } | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [prompt, setPrompt] = useState<{ kind: "link" | "alt"; value: string } | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draftOffer, setDraftOffer] = useState<StoredDraft | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickRef = useRef<{ target: ImageTarget; rowPos?: number }>({ target: "cursor" });
  const uploadsRef = useRef<PendingUpload[]>([]);
  const ctxRef = useRef<ResolverContext>({ repository: "", branch: "", dir: "" });
  const loadedKeyRef = useRef<string | null>(null);

  const branch = site?.branch ?? settings.branch;
  useEffect(() => {
    ctxRef.current.repository = settings.repository;
    ctxRef.current.branch = branch;
  }, [settings.repository, branch]);

  const setPendingUploads = useCallback((next: PendingUpload[]) => {
    uploadsRef.current = next;
    setUploads(next);
  }, []);

  // The resolver only reads the refs later, when tiptap renders or parses an image.
  // eslint-disable-next-line react-hooks/refs
  const [resolver] = useState(() => createResolver(ctxRef, uploadsRef));

  const editor = useEditor({
    extensions: [...buildExtensions(resolver), Placeholder.configure({ placeholder: "Start writing…" })],
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral dark:prose-invert max-w-none font-serif text-[18px] leading-[1.75] prose-headings:font-display prose-headings:tracking-tight prose-a:text-primary prose-pre:rounded-xl prose-code:before:content-none prose-code:after:content-none prose-code:bg-surface-container prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:font-normal pb-[30vh]",
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (moved || !files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (pos) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos.pos))));
        setImagePick({ files, target: "cursor" });
        return true;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        setImagePick({ files, target: "cursor" });
        return true;
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          openLinkPrompt();
          return true;
        }
        return false;
      },
    },
    onUpdate: () => setContentVersion((v) => v + 1),
  });

  const managedKeys = useMemo(() => new Set(["title", "date", "draft", "tags", descriptionKey, imageKey]), [descriptionKey, imageKey]);
  const isNew = !original;
  const isBundle = !!fileName && /^_?index$/.test(fileName) && !isNew;
  const isPostsSection = folder === settings.postsSection;

  const autoFileName = useMemo(() => {
    const slug = slugify(asString(fm.title));
    if (!slug) return "";
    const date = asString(fm.date);
    return isPostsSection && date ? `${new Date(date).toISOString().slice(0, 10)}-${slug}` : slug;
  }, [fm.title, fm.date, isPostsSection]);
  const effectiveFileName = fileName ?? autoFileName;
  const path = `${folder}/${effectiveFileName}.md`;

  const setEditorMarkdown = useCallback(
    (md: string) => {
      editor?.chain().setMeta("addToHistory", false).setContent(protectShortcodes(md)).run();
    },
    [editor]
  );

  const getBody = useCallback(() => {
    if (viewMode === "rich" && editor) {
      return restoreShortcodes((editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown());
    }
    return markdown;
  }, [viewMode, editor, markdown]);

  /* ---------- Loading ---------- */

  const applyFrontMatter = useCallback((fmt: FrontMatterFormat, data: FrontMatter) => {
    const desc = "description" in data ? "description" : "summary" in data ? "summary" : "description";
    const img = "image" in data ? "image" : "featured_image" in data ? "featured_image" : "image";
    setFormat(fmt);
    setFm(data);
    setDescriptionKey(desc);
    setImageKey(img);
    setOtherText(stringifyFields(fmt, omit(data, new Set(["title", "date", "draft", "tags", desc, img]))));
    setOtherError(null);
  }, []);

  const loadKey = editPath ? `path:${editPath}` : `new:${newSection ?? ""}`;

  useEffect(() => {
    if (!editor || !isLoaded || !settings.repository) return;
    if (loadedKeyRef.current === loadKey) return;
    loadedKeyRef.current = loadKey;
    let cancelled = false;
    let completed = false;

    (async () => {
      setLoadState("loading");
      setDraftOffer(null);
      setPendingUploads([]);
      try {
        if (editPath) {
          const params = new URLSearchParams({ repository: settings.repository, branch: settings.branch, path: editPath });
          const res = await fetch(`/api/github/file?${params}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Could not load the file");
          if (cancelled) return;

          const parsed = parseContent(data.content);
          const dir = editPath.split("/").slice(0, -1).join("/");
          ctxRef.current.dir = dir;
          applyFrontMatter(parsed.format === "none" ? "toml" : parsed.format, parsed.data);
          setOriginalKeys(Object.keys(parsed.data));
          setFolder(dir);
          setFileName((editPath.split("/").pop() || "").replace(/\.(md|markdown)$/, ""));
          setMarkdown(parsed.body);
          setEditorMarkdown(parsed.body);
          const normalizedBody = editor
            ? restoreShortcodes((editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown())
            : parsed.body;
          setOriginal({
            path: editPath,
            sha: data.sha,
            prefix: parsed.prefix,
            body: parsed.body,
            normalizedBody,
            fmJson: JSON.stringify(parsed.data),
          });
          const draft = readDraft(draftKey(settings.repository, editPath));
          if (draft) setDraftOffer(draft);
        } else {
          const section = newSection || settings.postsSection;
          const isPosts = section === settings.postsSection;
          ctxRef.current.dir = section;
          const formats = (site?.entries ?? []).filter((e) => e.section === section && e.format !== "none").map((e) => e.format);
          const fmt = formats.length ? (formats.sort((a, b) => formats.filter((f) => f === b).length - formats.filter((f) => f === a).length)[0] as FrontMatterFormat) : "toml";
          applyFrontMatter(fmt, isPosts ? { title: "", date: new Date().toISOString() } : { title: "" });
          setOriginalKeys([]);
          setFolder(section);
          setFileName(null);
          setMarkdown("");
          setEditorMarkdown("");
          setOriginal(null);
          const draft = readDraft(draftKey(settings.repository, null));
          if (draft) setDraftOffer(draft);
        }
        completed = true;
        setLoadState("ready");
        setContentVersion((v) => v + 1);
      } catch (e) {
        if (cancelled) return;
        completed = true;
        setLoadError((e as Error).message);
        setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
      if (!completed) loadedKeyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the target file changes
  }, [editor, isLoaded, settings.repository, loadKey]);

  useEffect(() => {
    if (status === "unauthenticated" || (isLoaded && !settings.repository)) router.replace("/");
  }, [status, isLoaded, settings.repository, router]);

  /* ---------- Change tracking ---------- */

  const currentBody = useMemo(
    () => (loadState === "ready" ? getBody() : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- contentVersion tracks editor changes
    [loadState, getBody, contentVersion]
  );
  const bodyChanged = original ? currentBody !== original.body && currentBody !== original.normalizedBody : currentBody.trim() !== "";
  const fmChanged = original ? JSON.stringify(fm) !== original.fmJson : asString(fm.title).trim() !== "";
  const dirty = loadState === "ready" && (bodyChanged || fmChanged || (!!original && path !== original.path));
  const hasImageRows = currentBody.includes('class="image-row"');

  // Keep a local copy so a closed tab or crash never loses work.
  useEffect(() => {
    if (loadState !== "ready" || draftOffer) return;
    const key = draftKey(settings.repository, original?.path ?? null);
    const timer = setTimeout(() => {
      writeDraft(
        key,
        dirty
          ? { savedAt: Date.now(), baseSha: original?.sha ?? null, format, fm, folder, fileName, body: currentBody, uploads: uploadsRef.current }
          : null
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [dirty, currentBody, fm, folder, fileName, format, uploads, loadState, draftOffer, original, settings.repository]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty && !saving) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving]);

  const restoreDraft = () => {
    if (!draftOffer) return;
    setPendingUploads(draftOffer.uploads ?? []);
    applyFrontMatter(draftOffer.format, draftOffer.fm);
    setFolder(draftOffer.folder);
    ctxRef.current.dir = draftOffer.folder;
    setFileName(draftOffer.fileName);
    setMarkdown(draftOffer.body);
    if (viewMode === "rich") setEditorMarkdown(draftOffer.body);
    setDraftOffer(null);
    setContentVersion((v) => v + 1);
  };

  const discardDraft = () => {
    writeDraft(draftKey(settings.repository, original?.path ?? null), null);
    setDraftOffer(null);
  };

  /* ---------- Front matter ---------- */

  const setField = useCallback(
    (key: string, value: unknown) => {
      setFm((prev) => {
        const next = { ...prev };
        const empty =
          value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0) || (key === "draft" && value === false);
        if (empty && (key === "date" || !originalKeys.includes(key))) delete next[key];
        else next[key] = value ?? "";
        return next;
      });
    },
    [originalKeys]
  );

  const onOtherText = (text: string) => {
    setOtherText(text);
    let parsed: FrontMatter;
    try {
      parsed = parseFields(format, text);
      setOtherError(null);
    } catch (e) {
      setOtherError((e as Error).message.split("\n")[0]);
      return;
    }
    setFm((prev) => {
      const next: FrontMatter = {};
      for (const k of Object.keys(prev)) {
        if (managedKeys.has(k)) next[k] = prev[k];
        else if (k in parsed) next[k] = parsed[k];
      }
      for (const k of Object.keys(parsed)) if (!(k in next) && !managedKeys.has(k)) next[k] = parsed[k];
      return next;
    });
  };

  /* ---------- Saving ---------- */

  /** Parse markdown into a throwaway editor and serialise it again, exactly like the live editor would. */
  const roundTrip = (md: string) => {
    const scratch = new Editor({ extensions: buildExtensions(resolver), content: "" });
    scratch.commands.setContent(protectShortcodes(md));
    const out = restoreShortcodes((scratch.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown());
    scratch.destroy();
    return out;
  };

  const buildFileContent = (body: string) => {
    let bodyOut = body;
    if (original && !bodyChanged) bodyOut = original.body;
    // Keep untouched parts of the file exactly as they were, so commits only show real edits.
    else if (original && viewMode === "rich") bodyOut = rebaseOntoOriginal(original.body, original.normalizedBody, body, roundTrip);
    bodyOut = bodyOut.replace(/\s*$/, "\n");
    if (original && JSON.stringify(fm) === original.fmJson) return original.prefix + bodyOut;
    return stringifyContent(format, fm, bodyOut);
  };

  const save = async () => {
    if (saving || loadState !== "ready") return;
    if (otherError) {
      toast("Fix the front matter fields before saving.", "error");
      setSidebarOpen(true);
      return;
    }
    if (!effectiveFileName) {
      toast("Add a title or a file name first.", "error");
      setSidebarOpen(true);
      return;
    }

    setSaving(true);
    const body = getBody();
    const content = buildFileContent(body);
    // Only images that are still in the page get committed; removed ones never reach the repo.
    const used = uploadsRef.current.filter((u) => content.includes(u.sitePath));
    const title = asString(fm.title);
    const message = !original
      ? `Add ${title ? `"${title}"` : path}`
      : original.path !== path
        ? `Rename ${original.path} to ${path}`
        : `Update ${title ? `"${title}"` : path}`;

    try {
      const res = await fetch("/api/github/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: settings.repository,
          branch,
          message,
          path,
          content,
          originalPath: original?.path ?? null,
          originalSha: original?.sha ?? null,
          uploads: used.map((u) => ({ path: u.repoPath, base64: u.dataUrl })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      writeDraft(draftKey(settings.repository, original?.path ?? null), null);
      const parsed = parseContent(content);
      ctxRef.current.dir = folder;
      setPendingUploads(uploadsRef.current.filter((u) => !used.includes(u)));
      setOriginal({ path, sha: data.fileSha, prefix: parsed.prefix, body: parsed.body, normalizedBody: body, fmJson: JSON.stringify(fm) });
      setOriginalKeys(Object.keys(fm));
      setFileName(effectiveFileName);
      if (editPath !== path) {
        loadedKeyRef.current = `path:${path}`;
        window.history.replaceState(null, "", `/editor?path=${encodeURIComponent(path)}`);
      }
      toast(
        <span>
          Saved to GitHub.{" "}
          {data.url && (
            <a href={data.url} target="_blank" rel="noopener noreferrer" className="underline">
              View commit
            </a>
          )}
        </span>
      );
      refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const deleteFile = async () => {
    if (!original) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/github/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: settings.repository,
          branch,
          message: `Delete ${original.path}`,
          files: [{ path: original.path, sha: original.sha }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      writeDraft(draftKey(settings.repository, original.path), null);
      toast(`Deleted ${original.path}`);
      await refresh();
      router.push(backHref);
    } catch (e) {
      toast((e as Error).message, "error");
      setDeleting(false);
    }
  };

  /* ---------- Navigation ---------- */

  const section = folder ? sectionOf(path, settings.contentDir) : settings.postsSection;
  const backHref = `/?section=${encodeURIComponent(section)}`;
  const goBack = () => (dirty ? setLeaveOpen(true) : router.push(backHref));

  const switchMode = (mode: ViewMode) => {
    if (mode === viewMode) return;
    if (mode === "markdown") setMarkdown(getBody());
    else setEditorMarkdown(markdown);
    setViewMode(mode);
  };

  /* ---------- Images & links ---------- */

  const openPicker = (target: ImageTarget, rowPos?: number) => {
    pickRef.current = { target, rowPos };
    if (fileInputRef.current) {
      fileInputRef.current.multiple = target !== "featured";
      fileInputRef.current.click();
    }
  };

  const onFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (files.length) setImagePick({ files, ...pickRef.current });
  };

  const insertImages = async ({ width, asRow }: { width: number; asRow: boolean }) => {
    if (!imagePick) return;
    setImageBusy(true);
    try {
      const { files, target, rowPos } = imagePick;
      const prepared = await Promise.all(files.map((f, i) => prepareImage(f, width, settings.imagePath, i)));
      setPendingUploads([...uploadsRef.current, ...prepared]);
      const images = prepared.map((p, i) => ({ src: p.sitePath, alt: altFromFile(files[i]) }));

      if (target === "featured") {
        setField(imageKey, prepared[0].sitePath);
      } else if (viewMode === "markdown") {
        const snippet = asRow ? imageRowHtml(images).join("\n") : images.map((img) => `![${img.alt}](${img.src})`).join("\n\n");
        const el = textareaRef.current;
        const at = el ? el.selectionStart : markdown.length;
        const next = `${markdown.slice(0, at).replace(/\s*$/, "")}\n\n${snippet}\n\n${markdown.slice(at).replace(/^\s*/, "")}`;
        setMarkdown(next.replace(/^\n+/, ""));
      } else if (editor) {
        const nodes = images.map((img) => ({ type: "image", attrs: img }));
        const row = rowPos !== undefined ? editor.state.doc.nodeAt(rowPos) : null;
        if (target === "into-row" && row?.type.name === "imageRow") {
          editor.chain().focus().insertContentAt(rowPos! + row.nodeSize - 1, nodes).run();
        } else if (asRow) {
          editor.chain().focus().insertContent([{ type: "imageRow", content: nodes }, { type: "paragraph" }]).run();
        } else {
          editor.chain().focus().insertContent(nodes.map((n) => ({ type: "paragraph", content: [n] }))).run();
        }
      }
      setImagePick(null);
    } catch (e) {
      toast(`Could not process image: ${(e as Error).message}`, "error");
    } finally {
      setImageBusy(false);
    }
  };

  /** Put the selected image into a row (creating one if needed) and ask for more images to go beside it. */
  const addImageBeside = () => {
    if (!editor) return;
    const { selection } = editor.state;
    if (!(selection instanceof NodeSelection)) return;
    if (selection.node.type.name === "imageRow") return openPicker("into-row", selection.from);
    const $pos = selection.$from;
    const parent = $pos.parent;
    if (parent.type.name === "imageRow") return openPicker("into-row", $pos.before());

    const image = selection.node.toJSON();
    if (parent.type.name === "paragraph" && parent.childCount === 1) {
      const paraPos = $pos.before();
      editor.chain().insertContentAt({ from: paraPos, to: paraPos + parent.nodeSize }, { type: "imageRow", content: [image] }).run();
      openPicker("into-row", paraPos);
    } else {
      const after = $pos.after();
      editor.chain().insertContentAt(after, { type: "imageRow", content: [image] }).deleteRange({ from: selection.from, to: selection.to }).run();
      openPicker("into-row", after - selection.node.nodeSize);
    }
  };

  function openLinkPrompt() {
    if (!editor) return;
    setPrompt({ kind: "link", value: editor.getAttributes("link").href ?? "" });
  }

  const applyPrompt = () => {
    if (!editor || !prompt) return;
    const value = prompt.value.trim();
    if (prompt.kind === "alt") {
      editor.chain().focus().updateAttributes("image", { alt: value }).run();
    } else if (!value) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else if (editor.state.selection.empty && !editor.isActive("link")) {
      editor.chain().focus().insertContent({ type: "text", text: value, marks: [{ type: "link", attrs: { href: value } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: value }).run();
    }
    setPrompt(null);
  };

  /* ---------- Render ---------- */

  const tagSuggestions = useMemo(() => Array.from(new Set((site?.entries ?? []).flatMap((e) => e.tags))).sort(), [site]);
  const folders = useMemo(() => {
    const set = new Set((site?.entries ?? []).map((e) => e.section));
    set.add(settings.postsSection);
    if (folder) set.add(folder);
    return Array.from(set).sort();
  }, [site, settings.postsSection, folder]);
  const featured = asString(fm[imageKey]);
  const isDraft = fm.draft === true;
  const saveLabel = isNew ? (isDraft ? "Save draft" : "Publish") : "Save";

  if (loadState === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card max-w-md w-full p-6 text-center">
          <Icon name="error" className="!text-[32px] text-error" />
          <h1 className="mt-2 font-semibold text-on-surface">Couldn&apos;t open this file</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{loadError}</p>
          <button className="btn-secondary mt-4" onClick={() => router.push("/")}>
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-2 h-14 px-2 sm:px-4 border-b border-outline-variant bg-surface-container-lowest shrink-0 z-30">
        <button onClick={goBack} className="icon-btn" title="Back">
          <Icon name="arrow_back" />
        </button>
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <div className="min-w-0 flex items-center gap-1.5 text-sm">
            <button onClick={goBack} className="hidden sm:inline text-on-surface-variant hover:text-on-surface shrink-0">
              {sectionLabel(section, settings.contentDir)}
            </button>
            <span className="hidden sm:inline-flex shrink-0">
              <Icon name="chevron_right" className="!text-[16px] text-on-surface-variant/60" />
            </span>
            <span className="truncate font-medium text-on-surface">{asString(fm.title) || (isNew ? "New page" : effectiveFileName)}</span>
          </div>
          {isDraft && <Badge tone="draft">Draft</Badge>}
          <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-on-surface-variant shrink-0">
            {loadState === "loading" ? (
              <>
                <Spinner className="w-3 h-3" /> Loading
              </>
            ) : saving ? (
              <>
                <Spinner className="w-3 h-3" /> Saving
              </>
            ) : dirty ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary" /> Unsaved changes
              </>
            ) : !isNew ? (
              <>
                <Icon name="cloud_done" className="!text-[15px]" /> Saved
              </>
            ) : null}
          </span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`icon-btn ${sidebarOpen ? "lg:bg-surface-container lg:text-on-surface" : ""}`} title="Page settings">
          <Icon name="tune" />
        </button>
        <button onClick={save} disabled={saving || !dirty || loadState !== "ready"} className="btn-primary" title="Save (Ctrl+S)">
          {saving ? <Spinner /> : <Icon name={isNew ? "publish" : "check"} className="!text-[18px]" />}
          <span>{saveLabel}</span>
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-[760px] px-4 sm:px-8 pt-6 sm:pt-12">
            {draftOffer && (
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-tertiary/30 bg-tertiary-container/60 px-4 py-3 text-sm text-on-tertiary-container">
                <Icon name="history" />
                <div className="flex-1">
                  You have unsaved changes from {new Date(draftOffer.savedAt).toLocaleString()}.
                  {original && draftOffer.baseSha && draftOffer.baseSha !== original.sha && " The file has changed on GitHub since then."}
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary !h-8" onClick={discardDraft}>
                    Discard
                  </button>
                  <button className="btn-primary !h-8" onClick={restoreDraft}>
                    Restore
                  </button>
                </div>
              </div>
            )}

            {hasImageRows && site && !site.allowsRawHtml && (
              <div className="mb-6 flex gap-3 rounded-xl bg-error-container text-on-error-container px-4 py-3 text-sm">
                <Icon name="warning" />
                <p>
                  Image rows are saved as HTML, which your Hugo config doesn&apos;t render yet. Add{" "}
                  <code className="font-mono text-xs">unsafe = true</code> under <code className="font-mono text-xs">[markup.goldmark.renderer]</code>
                  {site.configPath && <> in {site.configPath}</>}.
                </p>
              </div>
            )}

            <textarea
              className="w-full resize-none overflow-hidden bg-transparent font-display text-[32px] sm:text-[40px] font-bold leading-tight tracking-tight text-on-surface placeholder:text-on-surface-variant/40 outline-none"
              placeholder="Title"
              rows={1}
              value={asString(fm.title)}
              onChange={(e) => setField("title", e.target.value.replace(/\n/g, " "))}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  editor?.commands.focus("start");
                }
              }}
              disabled={loadState !== "ready"}
            />

            <EditorToolbar
              editor={editor}
              viewMode={viewMode}
              onViewMode={switchMode}
              onImage={() => openPicker("cursor")}
              onImageRow={() => openPicker("row")}
              onLink={openLinkPrompt}
            />

            <div className="mt-6 relative">
              {loadState === "loading" && (
                <div className="absolute inset-0 z-10 flex items-start justify-center pt-16 bg-background/70">
                  <span className="flex items-center gap-2 text-sm text-on-surface-variant">
                    <Spinner /> Loading content…
                  </span>
                </div>
              )}
              <div className={viewMode === "rich" ? "" : "hidden"}>
                {editor && (
                  <>
                    <BubbleMenu
                      editor={editor}
                      pluginKey="linkMenu"
                      shouldShow={({ editor: e }) => e.isActive("link") && !(e.state.selection instanceof NodeSelection)}
                    >
                      <div className="flex items-center gap-0.5 rounded-lg border border-outline-variant bg-surface-container-lowest p-1 shadow-lg text-sm">
                        <a
                          href={editor.getAttributes("link").href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="max-w-[220px] truncate px-2 text-primary hover:underline"
                        >
                          {editor.getAttributes("link").href}
                        </a>
                        <button className="btn-ghost !h-7 !px-2" onClick={openLinkPrompt}>
                          Edit
                        </button>
                        <button className="btn-ghost !h-7 !px-2 hover:!text-error" onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}>
                          Remove
                        </button>
                      </div>
                    </BubbleMenu>
                    <BubbleMenu
                      editor={editor}
                      pluginKey="imageMenu"
                      shouldShow={({ state }) =>
                        state.selection instanceof NodeSelection && ["image", "imageRow"].includes(state.selection.node.type.name)
                      }
                    >
                      <div className="flex items-center gap-0.5 rounded-lg border border-outline-variant bg-surface-container-lowest p-1 shadow-lg text-sm">
                        {editor.isActive("image") && (
                          <button className="btn-ghost !h-7 !px-2" onClick={() => setPrompt({ kind: "alt", value: editor.getAttributes("image").alt ?? "" })}>
                            <Icon name="text_fields" className="!text-[17px]" /> Alt text
                          </button>
                        )}
                        <button className="btn-ghost !h-7 !px-2" onClick={addImageBeside}>
                          <Icon name="add_photo_alternate" className="!text-[17px]" /> {editor.state.selection instanceof NodeSelection &&
                          (editor.state.selection.node.type.name === "imageRow" || editor.state.selection.$from.parent.type.name === "imageRow")
                            ? "Add image"
                            : "Add beside"}
                        </button>
                        <button className="btn-ghost !h-7 !px-2 hover:!text-error" onClick={() => editor.chain().focus().deleteSelection().run()}>
                          <Icon name="delete" className="!text-[17px]" />
                        </button>
                      </div>
                    </BubbleMenu>
                  </>
                )}
                <EditorContent editor={editor} />
              </div>
              {viewMode === "markdown" && (
                <textarea
                  ref={textareaRef}
                  className="w-full min-h-[60vh] resize-none bg-transparent font-mono text-[14px] leading-[1.7] text-on-surface outline-none pb-[30vh]"
                  value={markdown}
                  onChange={(e) => {
                    setMarkdown(e.target.value);
                    e.currentTarget.style.height = "auto";
                    e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                  }}
                  placeholder="Write markdown…"
                  spellCheck
                />
              )}
            </div>
          </div>
        </main>

        <EditorSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isNew={isNew}
          format={format}
          fm={fm}
          setField={setField}
          descriptionKey={descriptionKey}
          imageKey={imageKey}
          showDate={isPostsSection}
          showImage={isPostsSection}
          tagSuggestions={tagSuggestions}
          featuredSrc={featured ? displaySrc(featured, { repository: settings.repository, branch, dir: folder }, uploads) : null}
          onFeaturedPick={() => openPicker("featured")}
          onFeaturedRemove={() => setField(imageKey, undefined)}
          folder={folder}
          folders={folders}
          onFolder={(f) => {
            setFolder(f);
            ctxRef.current.dir = f;
          }}
          fileName={effectiveFileName}
          onFileName={(n) => setFileName(n)}
          fileNameLocked={isBundle}
          otherText={otherText}
          onOtherText={onOtherText}
          otherError={otherError}
          onDelete={original ? () => setDeleteOpen(true) : undefined}
          githubUrl={original ? `https://github.com/${settings.repository}/blob/${branch}/${original.path}` : undefined}
        />
      </div>

      <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={onFilesChosen} />

      <ImageInsertModal
        files={imagePick?.files ?? null}
        target={imagePick?.target ?? "cursor"}
        busy={imageBusy}
        onCancel={() => setImagePick(null)}
        onConfirm={insertImages}
      />

      <Modal
        open={!!prompt}
        onClose={() => setPrompt(null)}
        title={prompt?.kind === "alt" ? "Alt text" : "Link"}
        size="sm"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setPrompt(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={applyPrompt}>
              Apply
            </button>
          </>
        }
      >
        <input
          className="field"
          autoFocus
          value={prompt?.value ?? ""}
          placeholder={prompt?.kind === "alt" ? "Describe the image" : "https://… or /blog/another-post/"}
          onChange={(e) => setPrompt((p) => p && { ...p, value: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && applyPrompt()}
        />
        {prompt?.kind === "link" && <p className="mt-2 text-xs">Leave empty to remove the link.</p>}
      </Modal>

      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Leave without saving?"
        footer={
          <>
            <button
              className="btn-ghost hover:!text-error"
              onClick={() => {
                writeDraft(draftKey(settings.repository, original?.path ?? null), null);
                router.push(backHref);
              }}
            >
              Discard changes
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                writeDraft(draftKey(settings.repository, original?.path ?? null), {
                  savedAt: Date.now(),
                  baseSha: original?.sha ?? null,
                  format,
                  fm,
                  folder,
                  fileName,
                  body: getBody(),
                  uploads: uploadsRef.current,
                });
                router.push(backHref);
              }}
            >
              Keep as draft
            </button>
          </>
        }
      >
        Your changes aren&apos;t on GitHub yet. Keep them on this device to continue later, or discard them.
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="Delete this file?"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </button>
            <button className="btn-danger" onClick={deleteFile} disabled={deleting}>
              {deleting ? <Spinner /> : <Icon name="delete" className="!text-[17px]" />} Delete
            </button>
          </>
        }
      >
        <span className="font-mono text-xs break-all">{original?.path}</span> will be removed from {settings.repository} in a new commit. It stays in the
        git history.
      </Modal>
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center gap-2 text-on-surface-variant">
          <Spinner /> Loading editor…
        </div>
      }
    >
      <EditorScreen />
    </Suspense>
  );
}
