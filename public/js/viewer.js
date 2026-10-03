// Viewer: shows one page (?id=PAGE_ID) as rendered preview and as source code.
import { getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
    el, initTheme, requireUser, toast, flash, showFlash, formatDate,
    friendlyError, confirmDialog, createSandboxFrame, pageDoc
} from "./common.js";

const $ = (id) => document.getElementById(id);
const pageId = new URLSearchParams(location.search).get("id");

let pageData = null;

initTheme();
showFlash();
requireUser(loadPage);

function showError(message) {
    $("viewer-loading").hidden = true;
    $("viewer-content").hidden = true;
    $("viewer-error").hidden = false;
    $("viewer-error-text").textContent = message;
}

async function loadPage() {
    // Firestore IDs never contain "/", so this also rejects malformed URLs early.
    if (!pageId || pageId.includes("/")) {
        showError("Invalid page link. No page ID was provided.");
        return;
    }
    try {
        const snap = await getDoc(pageDoc(pageId));
        if (!snap.exists()) {
            showError("This page could not be found. It may have been deleted.");
            return;
        }
        pageData = snap.data();
        renderPage();
    } catch (error) {
        showError(friendlyError(error, "Unable to load this page."));
    }
}

function renderPage() {
    document.title = `${pageData.title} – HTML Learning Library`;
    $("page-title").textContent = pageData.title;
    $("page-description").textContent = pageData.description || "";
    $("page-description").hidden = !pageData.description;
    $("page-category").textContent = pageData.category || "Other";
    $("page-tags").replaceChildren(...(pageData.tags || []).map((tag, i) => el("span", { class: `tag tag-${i % 5}`, text: `#${tag}` })));
    $("page-dates").textContent = `Created: ${formatDate(pageData.createdAt)} · Updated: ${formatDate(pageData.updatedAt)}`;
    $("edit-link").href = `editor.html?id=${encodeURIComponent(pageId)}`;

    // Source is shown with textContent (shown as text, never parsed as HTML);
    // the rendered view lives in a sandboxed iframe.
    $("code-view").textContent = pageData.html || "";
    $("preview-frame").replaceChildren(createSandboxFrame(pageData.html || "", pageData.title));

    $("viewer-loading").hidden = true;
    $("viewer-content").hidden = false;
}

/* ---------- Tabs ---------- */
const tabs = [$("tab-preview"), $("tab-code")];
function selectTab(selected) {
    for (const tab of tabs) {
        const active = tab === selected;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        $(tab.getAttribute("aria-controls")).hidden = !active;
    }
    $("fullscreen-btn").hidden = selected !== $("tab-preview");
}
for (const tab of tabs) {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            const next = tabs[(tabs.indexOf(tab) + 1) % tabs.length];
            selectTab(next);
            next.focus();
        }
    });
}

/* ---------- Copy ---------- */
$("copy-btn").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(pageData.html || "");
        toast("✓ HTML copied");
    } catch {
        // Fallback for browsers/contexts without the async clipboard API.
        const temp = el("textarea", { "aria-hidden": "true" });
        temp.value = pageData.html || "";
        document.body.append(temp);
        temp.select();
        const ok = document.execCommand("copy");
        temp.remove();
        toast(ok ? "✓ HTML copied" : "⚠ Unable to copy HTML", ok ? "success" : "error");
    }
});

/* ---------- Fullscreen ---------- */
$("fullscreen-btn").addEventListener("click", async () => {
    try {
        await $("preview-frame").requestFullscreen();
    } catch {
        toast("⚠ Fullscreen is not available in this browser", "warning");
    }
});

/* ---------- Delete ---------- */
$("delete-btn").addEventListener("click", async () => {
    const confirmed = await confirmDialog({
        title: "Delete this page?",
        detail: pageData.title,
        message: "This action cannot be undone."
    });
    if (!confirmed) return;
    try {
        await deleteDoc(pageDoc(pageId));
        flash("✓ Page deleted");
        location.href = "index.html";
    } catch (error) {
        toast(`⚠ ${friendlyError(error, "Unable to delete page. Please try again.")}`, "error");
    }
});
