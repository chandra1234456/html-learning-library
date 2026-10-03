// Editor: create a new page or edit an existing one (?id=PAGE_ID).
import { getDoc, addDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
    CATEGORIES, MAX_HTML_BYTES, el, initTheme, requireUser, toast, flash, parseTags,
    friendlyError, confirmDialog, createSandboxFrame, pagesCollection, pageDoc
} from "./common.js";

const $ = (id) => document.getElementById(id);
const pageId = new URLSearchParams(location.search).get("id");
const isEdit = Boolean(pageId);

let saving = false;
let previewTimer = null;

initTheme();
buildCategoryOptions();
requireUser(async () => {
    if (isEdit) await loadExistingPage();
    else updatePreview();
});

/* ---------- Setup ---------- */
function buildCategoryOptions() {
    const select = $("category");
    select.replaceChildren(
        ...CATEGORIES.map((name) => el("option", { value: name, text: name })),
        el("option", { value: "__custom__", text: "Custom…" })
    );
    select.addEventListener("change", () => {
        $("custom-category").hidden = select.value !== "__custom__";
        if (select.value === "__custom__") $("custom-category").focus();
    });
}

function setCategory(category) {
    const select = $("category");
    if (CATEGORIES.includes(category)) {
        select.value = category;
    } else {
        select.value = "__custom__";
        $("custom-category").value = category || "";
        $("custom-category").hidden = false;
    }
}

function getCategory() {
    const select = $("category");
    return select.value === "__custom__" ? ($("custom-category").value.trim() || "Other") : select.value;
}

if (isEdit) {
    $("editor-heading").textContent = "Edit HTML Page";
    $("save-btn").textContent = "Update Page";
    $("cancel-btn").href = `viewer.html?id=${encodeURIComponent(pageId)}`;
}

/* ---------- Load existing ---------- */
async function loadExistingPage() {
    $("editor-form").hidden = true;
    try {
        const snap = await getDoc(pageDoc(pageId));
        if (!snap.exists()) {
            showLoadError("This page could not be found. It may have been deleted.");
            return;
        }
        const data = snap.data();
        $("title").value = data.title || "";
        $("description").value = data.description || "";
        $("tags").value = (data.tags || []).join(", ");
        $("html-code").value = data.html || "";
        setCategory(data.category);
        $("editor-form").hidden = false;
        updatePreview();
    } catch (error) {
        showLoadError(friendlyError(error, "Unable to load this page."));
    }
}

function showLoadError(message) {
    const box = $("editor-error");
    box.hidden = false;
    box.replaceChildren(el("span", { text: `⚠ ${message}` }), el("br"), el("a", { class: "btn", href: "index.html", text: "← Back to library" }));
}

/* ---------- Live preview (sandboxed iframe) ---------- */
function updatePreview() {
    const html = $("html-code").value;
    $("preview-wrap").replaceChildren(createSandboxFrame(html, "Live preview"));
    const bytes = new Blob([html]).size;
    const note = $("size-note");
    note.textContent = `${(bytes / 1024).toFixed(1)} KB of ${MAX_HTML_BYTES / 1024} KB`;
    note.classList.toggle("over", bytes > MAX_HTML_BYTES);
}

$("html-code").addEventListener("input", () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 400); // debounce so typing stays smooth
});

/* ---------- Actions ---------- */
$("editor-form").addEventListener("submit", (event) => {
    event.preventDefault();
    savePage("index.html");
});
$("save-preview-btn").addEventListener("click", () => savePage("viewer"));

$("clear-btn").addEventListener("click", async () => {
    if (!$("html-code").value) return;
    const ok = await confirmDialog({ title: "Clear HTML?", message: "The HTML editor will be emptied. Other fields are kept.", confirmLabel: "Clear" });
    if (!ok) return;
    $("html-code").value = "";
    updatePreview();
});

document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        savePage("index.html");
    }
});

function validate() {
    if (!$("title").value.trim()) {
        toast("⚠ Please enter a title", "warning");
        $("title").focus();
        return false;
    }
    const html = $("html-code").value;
    if (!html.trim()) {
        toast("⚠ HTML content cannot be empty", "warning");
        $("html-code").focus();
        return false;
    }
    if (new Blob([html]).size > MAX_HTML_BYTES) {
        toast(`⚠ HTML is too large (limit ${MAX_HTML_BYTES / 1024} KB)`, "warning");
        return false;
    }
    return true;
}

async function savePage(destination) {
    if (saving || !validate()) return;
    saving = true;
    setBusy(true);

    const fields = {
        title: $("title").value.trim(),
        description: $("description").value.trim(),
        category: getCategory(),
        tags: parseTags($("tags").value),
        html: $("html-code").value,
        updatedAt: serverTimestamp() // server-side time, not the device clock
    };

    try {
        let savedId = pageId;
        if (isEdit) {
            // updateDoc leaves createdAt untouched.
            await updateDoc(pageDoc(pageId), fields);
        } else {
            const ref = await addDoc(pagesCollection(), { ...fields, createdAt: serverTimestamp() });
            savedId = ref.id;
        }
        flash(isEdit ? "✓ Page updated successfully" : "✓ Page saved successfully");
        location.href = destination === "viewer" ? `viewer.html?id=${encodeURIComponent(savedId)}` : "index.html";
    } catch (error) {
        toast(`⚠ ${friendlyError(error, isEdit ? "Unable to update page. Please try again." : "Unable to save page. Please try again.")}`, "error");
        saving = false;
        setBusy(false);
    }
}

function setBusy(busy) {
    for (const id of ["save-btn", "save-preview-btn", "clear-btn"]) $(id).disabled = busy;
}
