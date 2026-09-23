import fs from 'node:fs';
import path from 'node:path';

const reportDir = process.argv[2] ?? 'playwright-report';
const indexFile = path.join(reportDir, 'index.html');

const MARKER = 'data-pinned-theme';

// The report stores `system` as its default theme and resolves it through
// `matchMedia('(prefers-color-scheme: dark)')`, so the deliverable renders dark on any
// machine configured that way. Reporting no dark preference to that single query is
// enough to make `system` resolve to light.
//
// The alternatives are worse: seeding `localStorage` is lost wherever storage is
// unavailable, and rewriting the class on `<html>` loses a race against the effect that
// re-applies the theme after mount. Neither problem exists here, and an explicit choice
// made in the report UI is still honoured because it never reaches the query.
const SNIPPET = [
  `<script ${MARKER}>`,
  '(function(){',
  'var native=window.matchMedia;',
  'if(typeof native!=="function")return;',
  'window.matchMedia=function(query){',
  'query=String(query);',
  'if(!/prefers-color-scheme\\s*:\\s*dark/i.test(query))return native.call(window,query);',
  'return{media:query,matches:false,onchange:null,',
  'addEventListener:function(){},removeEventListener:function(){},',
  'addListener:function(){},removeListener:function(){},',
  'dispatchEvent:function(){return false}}};',
  '})()',
  '</script>',
].join('');

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
