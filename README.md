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

### 3. Run with Docker Compose
Start the application in the background:
```bash
docker-compose up -d --build
```
This will expose the app on port `3000` of your host machine.

### 4. Setup Caddy Reverse Proxy
If you are using Caddy to serve your domain, simply add this block to your `Caddyfile`:

```caddyfile
your-domain.com {
    reverse_proxy localhost:3000
}
```

Reload Caddy (`caddy reload`), and your application will be securely available over HTTPS!

+++