import { Agentation } from "https://esm.sh/agentation@3.1.2?external=react,react-dom";
// Agentation visual-feedback toolbar bootstrap — what GET /agentation.js
// serves. Vendored from dashboard-site's public/agentation.js, the
// workspace-standard wiring in ~/.claude/rules/agentation.md. Bare `react`
// specifiers resolve through the page's own import map, which every HTML
// entry point loads BEFORE this module (the map after the module dies with
// "Failed to resolve module specifier" while the page renders fine). The
// esm.sh version pins are deliberate — no floating tags, matching the
// pinned map entries in each page head.
import React from "react";
import { createRoot } from "react-dom/client";

const mount = document.createElement("div");
mount.id = "agentation-root";
document.body.appendChild(mount);
createRoot(mount).render(React.createElement(Agentation));
