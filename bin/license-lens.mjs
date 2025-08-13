#!/usr/bin/env node
// License Lens — zero-dep license scanner for Node >= 18
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const cmd = (args[0] && !args[0].startsWith('-')) ? args[0] : 'check';
const flags = Object.fromEntries(
  args.filter(a => a.startsWith('--')).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);

const cwd = process.cwd();
const root = getProjectRoot(cwd);
const cfg = loadConfig(root, flags);

if (cmd !== 'check') {
  usage();
  process.exit(1);
}

const nodeModules = path.join(root, 'node_modules');
if (!fs.existsSync(nodeModules)) {
  console.error('✖ node_modules not found. Run npm ci / pnpm i / yarn install first.');
  process.exit(2);
}

const results = scanNodeModules(nodeModules);
const report = evaluate(results, cfg);

if (flags.format === 'json') {
  console.log(JSON.stringify({ config: cfg, ...report }, null, 2));
} else {
  printTable(report, cfg);
}

process.exit(report.fail ? 1 : 0);

// --------------- functions ---------------

function usage() {
  console.log(`License Lens
Usage:
  npx license-lens check [--format json] [--disallow GPL-3.0,AGPL-3.0] [--warn LGPL-3.0] [--no-allow-unlicensed]
`);
}

function getProjectRoot(start) {
  let dir = start;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return start;
}

function loadConfig(root, flags) {
  const p = path.join(root, 'license-lens.config.json');
  let cfg = { disallow: [], warn: [], allowUnlicensed: false, ignore: [] };
  if (fs.existsSync(p)) {
    try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(p, 'utf8')) }; } catch {}
  }
  if (flags.disallow) cfg.disallow = String(flags.disallow).split(',').map(s => s.trim()).filter(Boolean);
  if (flags.warn) cfg.warn = String(flags.warn).split(',').map(s => s.trim()).filter(Boolean);
  if ('no-allow-unlicensed' in flags) cfg.allowUnlicensed = false;
  return cfg;
}

function scanNodeModules(root) {
  const seen = new Set();
  const out = [];

  function visit(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = safeReaddir(dir);
    for (const ent of entries) {
      if (ent === '.bin') continue;
      if (ent.startsWith('@')) {
        visit(path.join(dir, ent)); // scope directory
        continue;
      }
      const pkgDir = path.join(dir, ent);
      const pkgJson = path.join(pkgDir, 'package.json');
      if (fs.existsSync(pkgJson)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
          const key = `${pkg.name}@${pkg.version}`;
          if (!seen.has(key)) {
            seen.add(key);
            const license = normalizeLicense(pkg.license, pkg.licenses);
            out.push({ name: pkg.name, version: pkg.version, license, path: pkgDir });
          }
          // recurse into nested node_modules
          const nested = path.join(pkgDir, 'node_modules');
          if (fs.existsSync(nested)) visit(nested);
        } catch {}
      } else {
        // if it's a directory (scope), recurse; pnpm often links to .pnpm cache
        if (isDir(pkgDir)) {
          // If this folder itself contains node_modules, dive in
          const nested = path.join(pkgDir, 'node_modules');
          if (fs.existsSync(nested)) visit(nested);
        }
      }
    }
  }

  visit(root);
  return out.sort((a,b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

function safeReaddir(dir) {
  try { return fs.readdirSync(dir); }
  catch { return []; }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); }
  catch { return false; }
}

function normalizeLicense(license, licenses) {
  // license can be string, object { type }, or undefined
  if (typeof license === 'string') return license.trim();
  if (license && typeof license.type === 'string') return license.type.trim();
  if (Array.isArray(licenses) && licenses.length) {
    const parts = [];
    for (const l of licenses) {
      if (typeof l === 'string') parts.push(l.trim());
      else if (l && typeof l.type === 'string') parts.push(l.type.trim());
    }
    if (parts.length) return parts.join(' OR ');
  }
  return 'UNKNOWN';
}

function evaluate(pkgs, cfg) {
  const disallowSet = new Set(cfg.disallow.map(x => x.toUpperCase()));
  const warnSet = new Set(cfg.warn.map(x => x.toUpperCase()));
  const ignoreSet = new Set((cfg.ignore || []).map(String));

  const rows = [];
  let errors = 0, warnings = 0;
  for (const p of pkgs) {
    const key = `${p.name}@${p.version}`;
    if (ignoreSet.has(key)) continue;
    const lic = (p.license || 'UNKNOWN').toUpperCase();
    let status = 'ok';
    if (lic === 'UNKNOWN' && !cfg.allowUnlicensed) { status = 'error'; errors++; }
    else if (disallowSet.has(lic)) { status = 'error'; errors++; }
    else if (warnSet.has(lic)) { status = 'warn'; warnings++; }
    rows.push({ name: p.name, version: p.version, license: p.license, status });
  }

  return {
    total: rows.length,
    errors, warnings,
    fail: errors > 0,
    rows
  };
}

function printTable(report, cfg) {
  console.log(`License Lens — scanned ${report.total} packages`);
  if (report.errors || report.warnings) {
    console.log(`✖ ${report.errors} error(s), ⚠︎ ${report.warnings} warning(s)`);
  } else {
    console.log('✓ no issues');
  }
  const head = pad('package', 40) + pad('version', 12) + pad('license', 20) + 'status';
  console.log(head);
  console.log('-'.repeat(head.length));
  for (const r of report.rows.slice(0, 200)) {
    const name = pad(r.name, 40);
    const ver = pad(r.version, 12);
    const lic = pad(String(r.license), 20);
    const st = r.status === 'ok' ? '' : r.status;
    console.log(`${name}${ver}${lic}${st}`);
  }
  if (report.rows.length > 200) console.log(`… (${report.rows.length - 200} more)`);

  if (report.errors) {
    const dis = cfg.disallow && cfg.disallow.length ? cfg.disallow.join(', ') : '(none configured)';
    console.log(`\nPolicy: disallow = ${dis}; allowUnlicensed = ${cfg.allowUnlicensed ? 'true' : 'false'}`);
    console.log('Failing because disallowed/unknown licenses were found.');
  }
}

function pad(s, n) {
  const t = String(s);
  return t.length >= n ? t.slice(0, n-1) + '…' : t + ' '.repeat(n - t.length);
}
