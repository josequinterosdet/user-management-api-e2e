import fs from 'node:fs';
import path from 'node:path';

const reportDir = process.argv[2] ?? 'playwright-report';
const indexFile = path.join(reportDir, 'index.html');

const MARKER = 'data-pinned-theme';

// The report reads `localStorage.theme` when it boots and falls back to the operating
// system preference, which renders the deliverable in dark mode on most machines. The
// value is only written when absent, so a theme chosen from the report UI still wins.
const SNIPPET =
  `<script ${MARKER}>try{if(!localStorage.getItem("theme"))localStorage.setItem("theme","light-mode")}catch{}</script>`;

// The report bundle is a module script and therefore deferred. A classic inline script
// placed before it is guaranteed to run first.
const BUNDLE = '<script type="module">';

const html = fs.readFileSync(indexFile, 'utf8');

if (html.includes(MARKER)) {
  console.log(`${indexFile}: theme already pinned`);
  process.exit(0);
}

if (!html.includes(BUNDLE)) {
  console.error(`${indexFile}: the report bundle script was not found, nothing was pinned`);
  process.exit(1);
}

fs.writeFileSync(indexFile, html.replace(BUNDLE, `${SNIPPET}\n    ${BUNDLE}`));
console.log(`${indexFile}: pinned the report theme to light mode`);
