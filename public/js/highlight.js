// Tiny HTML syntax highlighter. Builds DOM nodes with textContent only
// (never innerHTML), so highlighting untrusted HTML source is safe.
import { el } from "./common.js";

// Order matters: comments, doctype, tags (with attributes, possibly multi-line), then text.
const TOKEN = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^\s/>]*(?:"[^"]*"|'[^']*'|[^'">])*>?/g;
const TAG_PARTS = /^(<\/?)([^\s/>]+)([\s\S]*?)(\/?>?)$/;
const ATTR = /([^\s=]+)(\s*=\s*)?("[^"]*"|'[^']*'|[^\s"'>]+)?|\s+/g;

function tagTokens(raw) {
    const m = TAG_PARTS.exec(raw);
    if (!m) return [["tk-text", raw]];
    const out = [["tk-punc", m[1]], ["tk-tag", m[2]]];
    for (const a of m[3].matchAll(ATTR)) {
        if (a[1] === undefined) { out.push(["tk-text", a[0]]); continue; }
        out.push(["tk-attr", a[1]]);
        if (a[2]) out.push(["tk-punc", a[2]]);
        if (a[3]) out.push([/^["']/.test(a[3]) ? "tk-str" : "tk-text", a[3]]);
    }
    if (m[4]) out.push(["tk-punc", m[4]]);
    return out;
}

function tokenize(source) {
    const tokens = [];
    let last = 0;
    for (const m of source.matchAll(TOKEN)) {
        if (m.index > last) tokens.push(["tk-text", source.slice(last, m.index)]);
        const raw = m[0];
        if (raw.startsWith("<!--")) tokens.push(["tk-cmt", raw]);
        else if (raw.startsWith("<!")) tokens.push(["tk-doc", raw]);
        else tokens.push(...tagTokens(raw));
        last = m.index + raw.length;
    }
    if (last < source.length) tokens.push(["tk-text", source.slice(last)]);
    return tokens;
}

// Returns a fragment of one <span class="line"> per source line (line numbers via CSS counter).
export function highlightHtml(source) {
    const fragment = document.createDocumentFragment();
    let line = el("span", { class: "line" });
    fragment.append(line);
    for (const [cls, text] of tokenize(source)) {
        const parts = text.split("\n");
        parts.forEach((part, i) => {
            if (i > 0) {
                line.append("\n");
                line = el("span", { class: "line" });
                fragment.append(line);
            }
            if (part) line.append(el("span", { class: cls, text: part }));
        });
    }
    return fragment;
}
