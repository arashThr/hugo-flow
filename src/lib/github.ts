import { Octokit } from "@octokit/rest";
import { parseContent, asString, asStringArray } from "./frontmatter";
import { IMAGE_EXT, sectionOf, type ContentEntry, type MediaEntry, type SiteInfo } from "./content";

export function getOctokit(accessToken: string) {
  return new Octokit({ auth: accessToken });
}

export class ConflictError extends Error {}

export async function listUserRepositories(accessToken: string) {
  const octokit = getOctokit(accessToken);
  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    sort: "updated",
    per_page: 100,
  });
  // Only repositories we can actually write to are useful here.
  return repos
    .filter((r) => r.permissions?.push)
    .map((r) => ({
      id: r.id,
      full_name: r.full_name,
      default_branch: r.default_branch,
      private: r.private,
      description: r.description,
      pushed_at: r.pushed_at,
    }));
}

export async function resolveBranch(octokit: Octokit, owner: string, repo: string, branch?: string | null) {
  if (branch) return branch;
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data.default_branch;
}

async function getHead(octokit: Octokit, owner: string, repo: string, branch: string) {
  const { data: refData } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
  const { data: commitData } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: refData.object.sha });
  return { commitSha: refData.object.sha, treeSha: commitData.tree.sha };
}

/** Read many text files in a handful of GraphQL requests instead of one REST call per file. */
async function readTextFiles(octokit: Octokit, owner: string, repo: string, commitSha: string, paths: string[]) {
  const result = new Map<string, string>();
  const chunkSize = 80;
  const chunks: string[][] = [];
  for (let i = 0; i < paths.length; i += chunkSize) chunks.push(paths.slice(i, i + chunkSize));
  await Promise.all(
    chunks.map(async (chunk) => {
      const fields = chunk
        .map((p, j) => `f${j}: object(expression: ${JSON.stringify(`${commitSha}:${p}`)}) { ... on Blob { text } }`)
        .join("\n");
      const data = await octokit.graphql<{ repository: Record<string, { text: string | null } | null> }>(
        `query($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) { ${fields} } }`,
        { owner, repo }
      );
      chunk.forEach((p, j) => {
        const text = data.repository[`f${j}`]?.text;
        if (typeof text === "string") result.set(p, text);
      });
    })
  );
  return result;
}

const CONFIG_RE = /^(hugo|config)\.(toml|ya?ml|json)$|^config\/_default\/(hugo|config)\.(toml|ya?ml|json)$/;

export async function getSiteInfo(
  accessToken: string,
  owner: string,
  repo: string,
  branchParam: string | null,
  contentDir: string,
  imageDir: string
): Promise<SiteInfo> {
  const octokit = getOctokit(accessToken);
  const branch = await resolveBranch(octokit, owner, repo, branchParam);
  const { commitSha, treeSha } = await getHead(octokit, owner, repo, branch);
  const { data: tree } = await octokit.rest.git.getTree({ owner, repo, tree_sha: treeSha, recursive: "true" });

  const blobs = tree.tree.filter((t) => t.type === "blob" && t.path && t.sha) as { path: string; sha: string; size?: number }[];
  const contentPrefix = contentDir.replace(/\/$/, "") + "/";
  const imagePrefix = imageDir.replace(/\/$/, "") + "/";

  const markdown = blobs.filter((b) => b.path.startsWith(contentPrefix) && /\.(md|markdown)$/i.test(b.path));
  const configs = blobs.filter((b) => CONFIG_RE.test(b.path));
  const layouts = blobs.filter((b) => b.path.startsWith("layouts/") && /\.(html|xml)$/.test(b.path));

  const texts = await readTextFiles(
    octokit,
    owner,
    repo,
    commitSha,
    [...markdown, ...configs, ...layouts].map((b) => b.path)
  );

  const entries: ContentEntry[] = markdown.map((b) => {
    const name = b.path.split("/").pop() || "";
    const entry: ContentEntry = {
      path: b.path,
      sha: b.sha,
      section: sectionOf(b.path, contentDir.replace(/\/$/, "")),
      title: "",
      date: null,
      draft: false,
      tags: [],
      format: "none",
      isIndex: name === "_index.md" || name === "index.md",
    };
    const text = texts.get(b.path);
    if (text !== undefined) {
      try {
        const { format, data } = parseContent(text);
        entry.format = format;
        entry.title = asString(data.title);
        entry.date = asString(data.date) || null;
        entry.draft = data.draft === true || data.draft === "true";
        entry.tags = asStringArray(data.tags);
      } catch {
        // Unparseable front matter: still list the file so it can be fixed in the editor.
      }
    }
    return entry;
  });

  // An image counts as used if a path to it appears in any content, config or layout file. Names
  // must follow a path separator, bracket or quote so a file name in alt text doesn't count.
  const mentions = new Map<string, string[]>();
  for (const [path, text] of texts) {
    for (const match of text.matchAll(/(?<=[/("'=]|^)[\w.%-]+\.(?:png|jpe?g|gif|webp|avif|svg)/gim)) {
      const name = decodeURIComponentSafe(match[0]).toLowerCase();
      const list = mentions.get(name) ?? [];
      if (!list.includes(path)) list.push(path);
      mentions.set(name, list);
    }
  }
  const media: MediaEntry[] = blobs
    .filter((b) => b.path.startsWith(imagePrefix) && IMAGE_EXT.test(b.path))
    .map((b) => ({
      path: b.path,
      sha: b.sha,
      size: b.size ?? 0,
      usedBy: mentions.get((b.path.split("/").pop() || "").toLowerCase()) ?? [],
    }));

  const configText = configs.map((c) => texts.get(c.path) ?? "").join("\n");
  const baseURL = configText.match(/baseURL\s*[=:]\s*["']?([^"'\s]+)/i)?.[1] ?? null;

  return {
    branch,
    baseURL,
    allowsRawHtml: /unsafe\s*[=:]\s*["']?true/i.test(configText),
    configPath: configs[0]?.path ?? null,
    entries,
    media,
  };
}

export async function readFile(accessToken: string, owner: string, repo: string, path: string, branchParam: string | null) {
  const octokit = getOctokit(accessToken);
  const branch = await resolveBranch(octokit, owner, repo, branchParam);
  const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref: branch });
  if (Array.isArray(data) || data.type !== "file") throw new Error("Not a file");
  return { content: Buffer.from(data.content, "base64").toString("utf-8"), sha: data.sha, branch };
}

export interface FileChange {
  path: string;
  content?: string;
  encoding?: "utf-8" | "base64";
  delete?: boolean;
}

/**
 * Commit several file changes atomically. `expected` maps paths to the blob sha the client last saw
 * (null = must not exist yet) so we never silently overwrite someone else's edit or an existing file.
 */
export async function commitFiles(
  accessToken: string,
  owner: string,
  repo: string,
  branchParam: string | null,
  message: string,
  changes: FileChange[],
  expected: { path: string; sha: string | null }[] = []
) {
  const octokit = getOctokit(accessToken);
  const branch = await resolveBranch(octokit, owner, repo, branchParam);
  const { commitSha, treeSha } = await getHead(octokit, owner, repo, branch);

  for (const { path, sha } of expected) {
    const current = await currentSha(octokit, owner, repo, path, commitSha);
    if (current !== sha) {
      throw new ConflictError(
        sha === null
          ? `A file already exists at ${path}. Choose a different file name.`
          : `${path} was changed on GitHub after you opened it. Reload to get the latest version.`
      );
    }
  }

  const treeItems = await Promise.all(
    changes.map(async (change) => {
      if (change.delete) {
        return { path: change.path, mode: "100644" as const, type: "blob" as const, sha: null };
      }
      const { data: blobData } = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: change.content ?? "",
        encoding: change.encoding ?? "utf-8",
      });
      return { path: change.path, mode: "100644" as const, type: "blob" as const, sha: blobData.sha };
    })
  );

  const { data: newTreeData } = await octokit.rest.git.createTree({ owner, repo, base_tree: treeSha, tree: treeItems });
  const { data: newCommitData } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: newTreeData.sha,
    parents: [commitSha],
  });
  await octokit.rest.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: newCommitData.sha });

  const blobShas = Object.fromEntries(treeItems.filter((t) => t.sha).map((t) => [t.path, t.sha as string]));
  return { url: newCommitData.html_url, commitSha: newCommitData.sha, blobShas };
}

async function currentSha(octokit: Octokit, owner: string, repo: string, path: string, ref: string) {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    return Array.isArray(data) ? "directory" : data.sha;
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}

function decodeURIComponentSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
