# Hugo-Flow: Front-end interface for Hugo blogs on GitHub

A web-based front-end interface for Hugo static blogs hosted on GitHub.

**Start writing blog posts:** [hugo-flow.arashtaher.com/](https://hugo-flow.arashtaher.com/)

## Features
- **GitHub Integration:** Commit files directly to your repository via the GitHub API, with conflict detection so you never overwrite newer changes.
- **Edit any page:** Browse every section under `content/` (posts, lists, section `_index.md` pages, top-level pages) and edit them in place. TOML, YAML and JSON front matter are preserved, including fields the editor doesn't know about.
- **Dual Editor Mode:** Switch between a WYSIWYG editor and raw Markdown. Checklists, Hugo shortcodes and code blocks round-trip safely, and saves only change the lines you edited.
- **Images:** Upload, drag in or paste images. They are converted to WebP and stay in the browser until you save, and only images still in the post are committed. Put several images side by side in a row.
- **Media library:** See every image in your image folder, which pages use it, and clean up unused ones.
- **Drafts:** Toggle Hugo's `draft` flag, and unsaved work is kept locally so a closed tab doesn't lose it.

> Image rows are saved as HTML, so your Hugo config needs `unsafe = true` under `[markup.goldmark.renderer]`. The editor warns you if it isn't set.

## Philosophy & Niche

There are several established alternatives in the Git CMS space (like Decap CMS, Sveltia CMS, Pages CMS, and Quiqr). However, they generally require you to trade simplicity for flexibility. For example:
- **Decap CMS / Sveltia CMS:** You must install and configure the CMS directly inside your repository.
- **Pages CMS:** Requires you to install a GitHub App on your account/organization and manage a config file.
- **Quiqr:** Requires downloading a desktop app.

**Hugo-Flow is different.** The goal is total **zero-setup simplicity**. 

By exclusively supporting GitHub repositories and interacting entirely through the GitHub API, the application remains completely stateless, secure, and configuration-free. There are no extra files added to your repo and no intrusive permission scopes required. 

You are literally two clicks away from editing a post: just **Sign in with GitHub**, select your repository, and start writing.

## Local Development

1. Set up your `.env.local` file:
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_random_secret_here
GITHUB_ID=your_github_oauth_id
GITHUB_SECRET=your_github_oauth_secret
```

2. Run the development server:
```bash
npm install
npm run dev
```

## Production Deployment (Standard Node.js)

If you are not using Docker, you can run the application directly using Node.js:

1. Ensure your `.env.local` is configured with your production keys and URL.
2. Build the optimized production bundle:
```bash
npm run build
```
3. Start the production server:
```bash
npm start
```
The application will be running on `http://localhost:3000`.

## Production Deployment (Docker + Caddy)

This application is ready to be deployed using Docker and Docker Compose. It leverages Next.js standalone output for a highly optimized, minimal container size.

### 1. Update GitHub OAuth App
Update your GitHub OAuth App's "Authorization callback URL" to your production domain:
`https://your-domain.com/api/auth/callback/github`

### 2. Set Production Environment Variables
Create a `.env` file on your server in the same directory as `docker-compose.yml`:
```env
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your_secure_random_string (generate via: openssl rand -base64 32)
GITHUB_ID=your_production_github_id
GITHUB_SECRET=your_production_github_secret
```

### 3. Get the code onto the server
Clone the repository on the server and put the `.env` from step 2 inside it:
```bash
git clone https://github.com/arashThr/hugo-flow.git ~/repos/hugo-flow
```

### 4. Deploy
Images are built by GitHub Actions (`.github/workflows/deploy.yml`) on every push to `main`, and pushed to `ghcr.io/arashthr/hugo-flow`. The server never builds; it only pulls and restarts:
```bash
~/repos/hugo-flow/deploy/deploy.sh               # latest build of main
~/repos/hugo-flow/deploy/deploy.sh sha-1a2b3c4   # a specific commit
~/repos/hugo-flow/deploy/deploy.sh previous      # undo the last deploy
```
`deploy.sh` pulls the latest `compose.yml`, starts the new image and waits for its health check. If the new version doesn't come up, it switches back to the previous image automatically.

The app listens on port `9000` of the host. Without CI, `docker compose up -d --build` still builds and runs everything on the server.

> The first image GitHub publishes is private. Either make it public (GitHub → your profile → Packages → hugo-flow → Package settings → Change visibility), or log the server in once with `docker login ghcr.io` using a token with the `read:packages` scope.

### 5. Deploy automatically after each push (optional)
The workflow can trigger `deploy.sh` over SSH when a build finishes. The key it uses can only run `deploy.sh`, nothing else.

1. On any machine, create a key just for this: `ssh-keygen -t ed25519 -N "" -f hugo-flow-deploy`
2. On the server, add the public key to `~/.ssh/authorized_keys`, locked to the deploy script:
   ```
   command="$HOME/repos/hugo-flow/deploy/deploy.sh",restrict ssh-ed25519 AAAA... hugo-flow-deploy
   ```
   (`authorized_keys` doesn't expand `$HOME`, so write the full path.)
3. In the GitHub repository → Settings → Secrets and variables → Actions, add:
   - **Secrets:** `DEPLOY_SSH_KEY` (contents of the private key file) and `DEPLOY_KNOWN_HOSTS` (output of `ssh-keyscan your-server`)
   - **Variables:** `DEPLOY_HOST`, `DEPLOY_USER`, and `DEPLOY_PORT` if SSH isn't on port 22

From then on, merging to `main` builds the image and deploys it. If `DEPLOY_HOST` isn't set, the workflow only builds images.

### 6. Setup Caddy Reverse Proxy
If you are using Caddy to serve your domain, add this block to your `Caddyfile`:

```caddyfile
your-domain.com {
    reverse_proxy localhost:9000
}
```

Reload Caddy (`caddy reload`), and your application will be securely available over HTTPS!
