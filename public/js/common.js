// Shared helpers used by every page: theme, toasts,
// confirmation dialog, sandboxed preview frames and error messages.
import { db, isFirebaseConfigured } from "./firebase-config.js";
import { collection, doc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const CATEGORIES = ["HTML", "CSS", "JavaScript", "Firebase", "Web Development", "Programming", "Other"];
// Firestore documents are limited to 1 MiB; leave room for the other fields.
export const MAX_HTML_BYTES = 900 * 1024;

/* ---------- Firestore paths: pages/{pageId} ---------- */
export const pagesCollection = () => collection(db, "pages");
export const pageDoc = (pageId) => doc(db, "pages", pageId);

/* ---------- Small DOM helper ---------- */
export function el(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(options)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === "text") node.textContent = value;
        else if (key === "class") node.className = value;
        else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of [].concat(children)) {
        if (child) node.append(child);
    }
    return node;
}

/* ---------- Theme ---------- */
export function initTheme() {
    let stored = null;
    try { stored = localStorage.getItem("hll-theme"); } catch { /* storage blocked */ }
    const preferred = stored || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(preferred);
    document.getElementById("theme-toggle")?.addEventListener("click", () => {
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        applyTheme(next);
        try { localStorage.setItem("hll-theme", next); } catch { /* ignore */ }
    });
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const button = document.getElementById("theme-toggle");
    if (button) {
        button.textContent = theme === "dark" ? "☀️" : "🌙";
        button.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    }
}

/* ---------- Toasts ---------- */
export function toast(message, type = "success") {
    let host = document.getElementById("toast-host");
    if (!host) {
        host = el("div", { id: "toast-host", class: "toast-host", "aria-live": "polite" });
        document.body.append(host);
    }
    const item = el("div", { class: `toast toast-${type}`, role: type === "error" ? "alert" : "status", text: message });
    host.append(item);
    setTimeout(() => {
        item.classList.add("toast-out");
        setTimeout(() => item.remove(), 300);
    }, 3500);
}

// A message that survives a page navigation (e.g. "saved" then redirect).
export function flash(message, type = "success") {
    try { sessionStorage.setItem("hll-flash", JSON.stringify({ message, type })); } catch { /* ignore */ }
}
export function showFlash() {
    try {
        const raw = sessionStorage.getItem("hll-flash");
        if (!raw) return;
        sessionStorage.removeItem("hll-flash");
        const { message, type } = JSON.parse(raw);
        toast(message, type);
    } catch { /* ignore */ }
}

/* ---------- Formatting ---------- */
export function formatDate(timestamp) {
    // serverTimestamp() values are null locally until the server confirms them.
    const date = timestamp?.toDate ? timestamp.toDate() : null;
    return date ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

export function parseTags(raw) {
    const tags = raw.split(",")
        .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean);
    return [...new Set(tags)].slice(0, 20);
}

/* ---------- Errors ---------- */
export function friendlyError(error, fallback = "Something went wrong. Please try again.") {
    console.error(error); // details for the developer console only
    switch (error?.code) {
        case "permission-denied": return "Permission denied. Check that your Firestore rules are deployed.";
        case "unavailable":
        case "network-request-failed": return "Firebase is unavailable. Check your internet connection.";
        case "not-found": return "That page could not be found.";
        default: return fallback;
    }
}

/* ---------- Sandboxed preview iframe ---------- */
// User HTML is never injected into this app's DOM. It is loaded into an iframe
// WITHOUT allow-same-origin, so it runs in an opaque origin and cannot touch
// the app's DOM, cookies, storage or Firebase session.
export function createSandboxFrame(html, title = "HTML preview") {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-popups");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.setAttribute("title", title);
    frame.srcdoc = html;
    return frame;
}

/* ---------- Confirmation dialog ---------- */
export function confirmDialog({ title, message, detail, confirmLabel = "Delete" }) {
    return new Promise((resolve) => {
        const dialog = el("dialog", { class: "dialog", "aria-labelledby": "dialog-title" });
        const cancelBtn = el("button", { type: "button", class: "btn", text: "Cancel" });
        const confirmBtn = el("button", { type: "button", class: "btn btn-danger", text: confirmLabel });
        dialog.append(
            el("h2", { id: "dialog-title", text: title }),
            detail ? el("p", { class: "dialog-detail", text: `"${detail}"` }) : null,
            el("p", { text: message }),
            el("div", { class: "dialog-actions" }, [cancelBtn, confirmBtn])
        );
        const finish = (result) => { dialog.close(); dialog.remove(); resolve(result); };
        cancelBtn.addEventListener("click", () => finish(false));
        confirmBtn.addEventListener("click", () => finish(true));
        dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
        document.body.append(dialog);
        dialog.showModal();
        cancelBtn.focus();
    });
}

/* ---------- Startup ---------- */
// No login: shows a setup notice if Firebase is not configured, otherwise runs onReady().
export function requireUser(onReady) {
    const root = document.getElementById("app-root");
    const gate = document.getElementById("auth-gate");
    if (!isFirebaseConfigured) {
        root.hidden = true;
        gate.hidden = false;
        gate.replaceChildren(el("div", { class: "auth-card" }, [
            el("h1", { text: "⚙ Firebase is not configured" }),
            el("p", { text: "Open public/js/firebase-config.js and replace the placeholder values with your Firebase Web App configuration. See README.md for step-by-step instructions." })
        ]));
        return;
    }
    root.hidden = false;
    onReady();
}
