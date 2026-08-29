# Deployment — draft.graydonwasil.com

Architecture: **GitHub repo → Cloudflare Pages (Git integration) → custom subdomain.**
Every push to `main` builds (`npm ci && npm run build`, Node 22 per `.node-version`) and publishes `dist/`.

## One-time setup (the original runbook)

### 1. Create the GitHub repo and push (run from this project root)

Create an **empty** repo on github.com first (no README/license — this directory already has both):
name suggestion `writers-block`, private is fine (Cloudflare Pages does not require public repos).

Then run exactly these three commands, substituting your GitHub username:

```bash
git remote add origin https://github.com/<your-username>/writers-block.git
git push -u origin main
git log --oneline -1   # verify: prints the initial commit hash
```

(The first commit is already made locally — `git init`, branch `main`.)

### 2. Connect Cloudflare Pages (dashboard, ~1 minute)

Workers & Pages → **Create** → Pages tab → **Connect to Git**:
- Select the `writers-block` repo, production branch `main`.
- Build command: `npm run build` · Build output directory: `dist`
- (Node 22 comes from `.node-version`; no env vars needed.)
- Deploy. First build takes ~1 min; subsequent pushes are faster.

### 3. Attach the custom subdomain (dashboard, ~1 minute)

Pages project → **Custom domains** → **Set up a custom domain** → `draft.graydonwasil.com`.
Because graydonwasil.com's DNS already lives in this Cloudflare account, the CNAME record is
created automatically and the SSL certificate provisions on its own (usually minutes).
Leave the DNS record **proxied** (orange cloud).

### 4. Verify

- `https://draft.graydonwasil.com` loads the setup console.
- The favicon is a split-flap glyph; theme-color darkens the mobile tab strip.
- Run one GENTLE session end-to-end on the live URL.

## Updating the live site

Push to `main`. That's the whole workflow — Cloudflare builds and swaps atomically.
Rollback: Pages project → Deployments → any previous deployment → **Rollback to this deployment**.
