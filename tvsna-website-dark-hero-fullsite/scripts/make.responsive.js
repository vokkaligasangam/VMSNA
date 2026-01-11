
/**
 * Make all HTML files under ./public mobile-friendly:
 *  - Injects <meta name="viewport"> in <head> (if missing)
 *  - Adds responsive.css before </head> (if missing)
 *  - Adds a minimal mobile menu toggle script before </body> (only if a .nav/.menu exists & script missing)
 * Idempotent: safe to re-run.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const VIEWPORT_TAG = '<meta name="viewport" content="width=device-width, initial-scale=1" />';
const LINK_TAG = 'responsive.css';
const TOGGLE_SCRIPT = `
<script>
document.addEventListener('DOMContentLoaded',function(){
  const btn=document.querySelector('.nav .toggle');
  const menu=document.querySelector('.nav .menu');
  if(btn && menu){
    btn.addEventListener('click',()=>{const open=menu.style.display==='block';menu.style.display=open?'none':'block';});
  }
});
</script>`;

function getHtmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...getHtmlFiles(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) out.push(full);
  }
  return out;
}

function ensureViewport(html) {
  const hasViewport = /<meta[^>]*name=["']viewport["'][^>]*>/i.test(html);
  if (!hasViewport) {
    html = html.replace(/<head[^>]*>/i, m => `${m}\n  ${VIEWPORT_TAG}`);
  }
  return html;
}

function ensureResponsiveLink(html) {
  const hasLink = /<link[^>]*href=["']responsive\.css["'][^>]*>/i.test(html);
  if (!hasLink) {
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `  ${LINK_TAG}\n</head>`);
    } else {
      html = LINK_TAG + '\n' + html;
    }
  }
  return html;
}

function shouldAddToggle(html) {
  const hasNav = /class=["'][^"']*\bnav\b[^"']*["']/.test(html) && /class=["'][^"']*\bmenu\b[^"']*["']/.test(html);
  const hasScript = /document\.addEventListener\(['"]DOMContentLoaded['"]\)/.test(html) && /\.nav \.toggle/.test(html);
  return hasNav && !hasScript;
}

function ensureToggleScript(html) {
  if (shouldAddToggle(html)) {
    if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, `${TOGGLE_SCRIPT}\n</body>`);
    } else {
      html = html + '\n' + TOGGLE_SCRIPT;
    }
  }
  return html;
}

function processFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  let out = src;
  out = ensureViewport(out);
  out = ensureResponsiveLink(out);
  out = ensureToggleScript(out);
  if (out !== src) {
    fs.writeFileSync(file, out, 'utf8');
    console.log('Updated:', path.relative(process.cwd(), file));
  } else {
    console.log('No changes needed:', path.relative(process.cwd(), file));
  }
}

function run() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    console.error('ERROR: ./public directory not found. Run this from the repo root.');
    process.exit(1);
  }
  const files = getHtmlFiles(PUBLIC_DIR);
  if (files.length === 0) {
    console.warn('WARNING: No HTML files found under ./public');
    return;
  }
  console.log('Found HTML files:', files.map(f => path.relative(process.cwd(), f)));
  files.forEach(processFile);
  console.log('\nDone. Commit your changes:');
  console.log('  git add public/*.html');
  console.log('  git commit -m "Make public pages responsive (viewport + CSS + menu toggle)"');
}

if (require.main === module) {
  run();
}
