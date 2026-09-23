import fs from 'node:fs';
import path from 'node:path';

const reportDir = process.argv[2] ?? 'playwright-report';
const indexFile = path.join(reportDir, 'index.html');

const MARKER = 'data-pinned-theme';

// The report reads `localStorage.theme` when it boots and falls back to the operating
// system preference, which renders the deliverable in dark mode on most machines.
//
// A first visit makes the report store `system` on its own, so an absent key and that
// value both mean "no preference expressed" and are the only cases overwritten here.
// An explicit `light-mode` or `dark-mode` chosen from the report UI is left untouched.
const SNIPPET =
  `<script ${MARKER}>try{var t=localStorage.getItem("theme");if(!t||t==="system")localStorage.setItem("theme","light-mode")}catch{}</script>`;

// The report bundle is a module script and therefore deferred. A classic inline script
// placed before it is guaranteed to run first.
const BUNDLE = '<script type="module">';

const EXISTING = new RegExp(`<script ${MARKER}>.*?</script>`, 's');

const html = fs.readFileSync(indexFile, 'utf8');

const current = html.match(EXISTING)?.[0];

if (current === SNIPPET) {
  console.log(`${indexFile}: theme already pinned`);
  process.exit(0);
}

if (current) {
  fs.writeFileSync(indexFile, html.replace(EXISTING, SNIPPET));
  console.log(`${indexFile}: replaced an outdated theme pin`);
  process.exit(0);
}

if (!html.includes(BUNDLE)) {
  console.error(`${indexFile}: the report bundle script was not found, nothing was pinned`);
  process.exit(1);
}

fs.writeFileSync(indexFile, html.replace(BUNDLE, `${SNIPPET}\n    ${BUNDLE}`));
console.log(`${indexFile}: pinned the report theme to light mode`);
