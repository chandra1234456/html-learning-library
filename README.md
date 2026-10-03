# HTML Learning Library

A personal web app for saving HTML pages you want to learn from. Paste HTML, preview it live, save it to **Firebase Firestore**, and later browse, search, read the source, view the rendered page, edit, copy or delete it — from any device.

```
HTML page → JavaScript → Firestore → Dashboard → Viewer → sandboxed iframe → rendered HTML
```

Firebase Hosting serves only the app itself. Your pages are stored as **Firestore documents**, not as hosted files.

## Features

Dashboard with stats, search (title / description / category / tags), category filter, add/edit/delete, live preview editor, viewer with **Preview / Code** tabs, Copy HTML, Fullscreen preview, dark/light mode, toasts, loading skeletons, responsive layout.

## Folder structure

```
html-learning-library/
├── public/                    ← what Firebase Hosting serves
│   ├── index.html             dashboard
│   ├── editor.html            add / edit (editor.html?id=PAGE_ID)
│   ├── viewer.html            read / learn (viewer.html?id=PAGE_ID)
│   ├── css/  style.css  editor.css  viewer.css
│   ├── js/
│   │   ├── firebase-config.js ← YOUR Firebase config goes here
│   │   ├── common.js          theme, toasts, login gate, dialog, sandbox iframe
│   │   ├── app.js             dashboard logic
│   │   ├── editor.js          editor logic
│   │   └── viewer.js          viewer logic
│   └── assets/icons/
├── firebase.json              hosting + firestore config
├── firestore.rules            security rules
├── firestore.indexes.json     (no composite indexes needed)
└── README.md
```

## Setup

### 1. Create a Firebase project
1. Go to <https://console.firebase.google.com> → **Add project**.
2. Name it (e.g. `html-learning-library`). Google Analytics is optional — you can turn it off.

### 2. Create a Web App and copy its config
1. Project overview → click the **`</>`** (Web) icon → give it a nickname.
2. You can skip "Also set up Firebase Hosting" here (we do it with the CLI below).
3. Copy the `firebaseConfig` values shown.

### 3. Put the config in the app
Open `public/js/firebase-config.js` and replace every `YOUR_…` placeholder with the values from step 2. Until you do, the app shows a "Firebase is not configured" screen.

> These web config values are not secrets; access is controlled by the Firestore rules, not by hiding these values. Never put a service-account key or Admin SDK credentials in this project.

### 4. Enable Firestore
Console → **Build → Firestore Database → Create database**. Choose a location near you and start in **production mode** (the rules from this repo are deployed in step 6).

### 5. Install the Firebase CLI
```powershell
npm install -g firebase-tools
```

### 6. Initialise and deploy
```powershell
cd D:\private\html-learning-library
firebase login
firebase init hosting
firebase init firestore
firebase deploy
```

Answers during `firebase init`:

| Prompt | Choose |
|---|---|
| Use an existing project | Select the project you created |
| Hosting: public directory | `public` |
| Single-page app (rewrite all to /index.html)? | **No** |
| Set up automatic builds with GitHub? | No |
| Overwrite `public/index.html`? | **No** |
| Firestore rules file | `firestore.rules` (keep) — **No** to overwrite |
| Firestore indexes file | `firestore.indexes.json` (keep) — **No** to overwrite |

`firebase deploy` publishes both the site and the Firestore rules. Your app will be at `https://YOUR_PROJECT_ID.web.app`.

## Run locally

The app uses ES modules, so it must be served over HTTP (opening the file directly will not work).

```powershell
cd D:\private\html-learning-library
firebase serve --only hosting
```
or: `npx serve public`, then open the printed `http://localhost:…` URL. Local runs use your real Firebase project.

## Using the app

1. Click **+ Add HTML Page**, enter a title, paste HTML — the preview updates as you type.
2. **Save Page** returns to the dashboard; **Save & Preview** opens the viewer. `Ctrl+S` also saves.
3. On the dashboard use **Open**, **Edit**, **Delete** (with confirmation). In the viewer switch between **Preview** and **Code**, **Copy HTML**, or go **Fullscreen**.

## How the database works

Pages live at `pages/{pageId}`:

```js
{
  title: "HTML Forms Tutorial",
  description: "Learn HTML forms and form controls.",
  category: "HTML",
  tags: ["html", "forms", "beginner"],
  html: "<!DOCTYPE html>...",
  createdAt: serverTimestamp(),   // set once on create
  updatedAt: serverTimestamp()    // refreshed on every update
}
```

The dashboard queries `orderBy("updatedAt", "desc")`; search and category filtering happen in the browser. A Firestore document is limited to 1 MiB, so the editor caps HTML at 900 KB.

## Firestore rules and security (no login)

This version has **no sign-in**, as requested. `firestore.rules` therefore allows anyone who can reach the app to read, create, edit and delete pages in `pages/`. Writes are validated (non-empty string `title` ≤150 chars, non-empty `html`, `tags` list); everything outside `pages/` is denied.

- The URL and web config are not secret, so treat the library as **public**. Don't store anything private in it, and don't share the link if you don't want others to edit or delete pages.
- **Untrusted HTML:** saved HTML is only shown in an `<iframe sandbox="allow-scripts allow-forms allow-modals allow-popups">` via `srcdoc`, without `allow-same-origin`, so it cannot reach the app's DOM or storage. The code tab and cards use `textContent`.
- `firebase.json` sets `X-Frame-Options: DENY`.

### Adding login later
Enable Authentication in the console, store pages under `users/{uid}/pages/{pageId}`, and change the rules to `allow read, write: if request.auth != null && request.auth.uid == userId;`. The code touching Firestore paths is the two helpers at the top of `public/js/common.js`.

## Troubleshooting

- **"Firebase is not configured"**: fill in `public/js/firebase-config.js`.
- **"Permission denied"**: run `firebase deploy --only firestore:rules`.
