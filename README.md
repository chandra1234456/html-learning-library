# 📚 HTML Learning Library

A personal web app for collecting HTML pages you want to learn from. Paste HTML, preview it live, save it to **Firebase Firestore**, then browse, search, read the source, view the rendered page, edit, copy or delete it from any device.

**Live sites:** Firebase Hosting <https://learning-library-c4f41.web.app> · GitHub Pages <https://chandra1234456.github.io/html-learning-library/>

```
Paste HTML → Live preview → Save → Firestore → Library → Viewer (Preview / Code)
```

Firebase Hosting serves only the app itself. Your pages are stored as Firestore documents, not as hosted files.

---

## Features

| Area | What you get |
|---|---|
| **Library** | Card grid of saved pages, newest-updated first, page count, category chips, search by title / description / category / tags |
| **Editor** | Title, description, category (presets or custom), tags, large HTML editor with side-by-side live preview (stacked on mobile), `Ctrl+S` to save |
| **Viewer** | **Preview** and **Code** tabs, 📋 Copy HTML, ⛶ Fullscreen preview, Edit, Delete |
| **Safety** | Delete confirmation, sandboxed iframes, friendly error messages |
| **Speed** | Local caching, so the app avoids unnecessary Firestore reads (see [Caching](#caching)) |
| **UI** | Responsive layout, dark / light mode, toast notifications, loading skeletons |

Built with plain HTML, CSS and JavaScript (ES modules). There is no build step and no framework.

## Project structure

```
html-learning-library/
├── public/                     ← served by Firebase Hosting
│   ├── index.html              library / dashboard
│   ├── editor.html             add page  (editor.html?id=PAGE_ID to edit)
│   ├── viewer.html             read page (viewer.html?id=PAGE_ID)
│   ├── css/
│   │   ├── style.css           shared styles + dashboard
│   │   ├── editor.css
│   │   └── viewer.css
│   ├── js/
│   │   ├── firebase-config.js  Firebase config + Firestore setup
│   │   ├── common.js           theme, toasts, dialog, sandbox iframe, Firestore paths
│   │   ├── data.js             cached reads (list + single page)
│   │   ├── app.js              dashboard logic
│   │   ├── editor.js           editor logic
│   │   └── viewer.js           viewer logic
│   └── assets/icons/
├── firebase.json               hosting + Firestore config
├── firestore.rules             security rules
├── firestore.indexes.json      (no composite indexes needed)
└── README.md
```

---

## Setup from scratch

Already deployed? Skip to [Updating the site](#updating-the-site).

### 1. Create the Firebase project and web app
1. Open the [Firebase console](https://console.firebase.google.com) → **Add project**.
2. Project overview → **`</>` Web** icon → register an app (skip Hosting there).
3. Copy the `firebaseConfig` values.

### 2. Add the config
Edit `public/js/firebase-config.js` and set `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`. You don't need `measurementId` or the Analytics code.

> These web config values identify your project to the browser. They are **not secrets**. Access is controlled by `firestore.rules`. Never put a service-account key or Admin SDK credentials in this project.

### 3. Create the database
Console → **Build → Firestore Database → Create database** (choose a nearby region, **Production mode**).
Use **Firestore**, not *Realtime Database*.

### 4. Install the CLI and deploy
```bash
npm install -g firebase-tools
```
```bash
cd D:\private\html-learning-library
```
```bash
firebase login
```
```bash
firebase init hosting
```
```bash
firebase init firestore
```
```bash
firebase deploy
```

Answers for `firebase init`:

| Prompt | Answer |
|---|---|
| Project | Use an existing project → select yours |
| Public directory | `public` |
| Single-page app (rewrite all URLs to `/index.html`) | **No** |
| Automatic GitHub builds | No |
| Overwrite `public/index.html`, `firestore.rules`, `firestore.indexes.json` | **No** |

> ⚠ If you ever re-run `firebase init`, check `firebase.json` afterwards. Wrong answers can change the public directory or add a rewrite rule. It should say `"public": "public"` and contain no `"rewrites"`.

## Updating the site

After changing any file:

```bash
firebase deploy --only hosting
```

After changing `firestore.rules`:

```bash
firebase deploy --only firestore:rules
```

Hard-refresh the browser (`Ctrl+Shift+R`) to see changes straight away.

## Publishing to GitHub Pages

The workflow `.github/workflows/pages.yml` publishes the `public/` folder on every push to `main`. Both sites use the same Firestore data.

One-time setup: GitHub repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then push to `main` (or run the workflow from the **Actions** tab). The site appears at `https://<your-username>.github.io/html-learning-library/`.

## Running locally

The app uses ES modules, so it must be served over HTTP. Opening the file directly will not work.

```bash
cd D:\private\html-learning-library
```
```bash
firebase serve --only hosting
```

Or use `npx serve public`. Open the printed `http://localhost:…` address. Local runs use your **real** Firestore data.

---

## Using the app

1. Click **+ New Page**.
2. Enter a title, pick a category, add tags, and paste your HTML. The preview updates as you type.
3. **Save Page** returns to the library; **Save & Preview** opens the viewer.
4. In the library, click a card (or **Edit** / **Delete**). In the viewer, switch **Preview ↔ Code**, copy the HTML, or go fullscreen.

URLs: `/index.html`, `/editor.html`, `/editor.html?id=PAGE_ID`, `/viewer.html?id=PAGE_ID`.

## How the data is stored

Collection `pages`, one document per page:

```js
{
  title: "HTML Forms Tutorial",
  description: "Learn HTML forms and form controls.",
  category: "HTML",
  tags: ["html", "forms", "beginner"],
  html: "<!DOCTYPE html>...",
  createdAt: serverTimestamp(),   // set once when created
  updatedAt: serverTimestamp()    // refreshed on every update
}
```

The library queries `orderBy("updatedAt", "desc")`. Search and category filtering run in the browser. A Firestore document is limited to 1 MiB, so the editor caps HTML at 900 KB.

## Caching

To avoid unnecessary Firestore reads (`public/js/data.js`):

- Firestore's **persistent local cache** (IndexedDB, shared across tabs) stores every page the app loads or saves.
- While the library was synced within the last **10 minutes**, the list and the viewer are served from the cache with **no network reads**.
- When the cache is older, it is shown immediately, then refreshed in the background (stale-while-revalidate).
- The **editor always loads the latest version** from the server so it never overwrites newer edits.
- Saves and deletes update the cache instantly.
- The **↻ Refresh** button forces a reload from the server. Change `SYNC_TTL_MS` in `data.js` to adjust the 10-minute window.
- Static `.html` / `.js` / `.css` files are sent with `Cache-Control: no-cache`, so browsers re-check them on every visit (cheap `304` responses) and never run a stale mix of old and new files.

Trade-off: a change made on another device can take up to 10 minutes to appear here, unless you press Refresh.

## Security

This version has **no login**, so `firestore.rules` lets anyone who can reach the app read, create, edit and delete pages in `pages/`. Writes are validated (non-empty `title` ≤ 150 characters, non-empty `html` within a size limit, `tags` must be a list), and everything outside `pages/` is denied.

- Treat the library as **public**: don't store private material in it, and don't share the link if you don't want others to change it.
- **Saved HTML is untrusted.** It is only displayed inside `<iframe sandbox="allow-scripts allow-forms allow-modals allow-popups">` using `srcdoc`, **without** `allow-same-origin`, so it cannot access the app's DOM or storage. The Code tab and cards use `textContent`, never `innerHTML`. Pasted pages can still run scripts and make requests *inside* the sandbox, so only paste HTML you are comfortable running.
- `firebase.json` adds `X-Frame-Options: DENY` so other sites cannot embed the app.

### Adding login later
1. Console → **Authentication** → enable a sign-in provider.
2. Store pages under `users/{uid}/pages/{pageId}`. Only the two helpers at the top of `public/js/common.js` define the Firestore paths.
3. Tighten the rules: `allow read, write: if request.auth != null && request.auth.uid == userId;`.
4. Add a sign-in screen using `firebase-auth.js`.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Firebase is not configured" | Fill in `public/js/firebase-config.js` |
| "Permission denied" | Run `firebase deploy --only firestore:rules` |
| Site shows Firebase's "Welcome" page or a blank page | `firebase.json` or `public/index.html` was overwritten by `firebase init`. Check `"public": "public"` and re-deploy |
| Changes don't appear after deploy | Hard-refresh (`Ctrl+Shift+R`) |
| Newly added page missing on another device | Press **↻ Refresh** (see [Caching](#caching)) |
| Works in one browser but not another | Hard-refresh (`Ctrl+Shift+R`), try an Incognito window, then disable ad-blocker / privacy extensions for the site (they can block `firestore.googleapis.com`), and clear the site's data in Chrome (Settings → Privacy → Site settings → View permissions and data) |
| Page won't save | Check the title is filled in, the HTML isn't empty, and it's under 900 KB |
| Blank page when opening `index.html` as a file | Serve it over HTTP (see [Running locally](#running-locally)) |
