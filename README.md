# License Lens

> Zero‑dep CLI + GitHub Action to **scan dependency licenses** and **fail PRs** on disallowed or unknown licenses. Works with npm/pnpm/yarn (Node ≥ 18).

[![CI](https://img.shields.io/github/actions/workflow/status/<your-username>/license-lens/ci.yml?branch=main)](https://github.com/<your-username>/license-lens/actions)
[![Release](https://img.shields.io/github/actions/workflow/status/<your-username>/license-lens/release.yml?label=release)](https://github.com/<your-username>/license-lens/actions)
[![npm](https://img.shields.io/npm/v/license-lens.svg)](https://www.npmjs.com/package/license-lens)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Table of contents
- [Overview](#overview)
- [Quick start](#quick-start)
- [Usage](#usage)
- [Configuration](#configuration)
- [CI (GitHub Actions)](#ci-github-actions)
- [Notes & limitations](#notes--limitations)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)
- [Roadmap](#roadmap)
- [FAQ](#faq)

---

## Overview
**License Lens** recursively scans `node_modules/` (including nested deps) and reports each `name@version → license`. It then enforces your policy: **disallow** (e.g., `GPL-3.0`, `AGPL-3.0`), **warn** (e.g., `LGPL-3.0`), **allowUnlicensed** rules.

- No registry calls; reads `package.json` fields (`license`, `licenses`) from installed modules
- Supports npm, pnpm, yarn classic (workspaces OK)
- Human‑readable table + JSON output
- Simple exit codes for CI

---

## Quick start

### Local scan
```bash
# install deps so node_modules exists
npm ci   # or: pnpm i --frozen-lockfile  |  yarn install --frozen-lockfile

# run a scan
npx license-lens check
```

### Enforce policy (fail build if disallowed/unknown)
```bash
# add a policy file at the repo root
cat > license-lens.config.json <<'JSON'
{
  "disallow": ["GPL-3.0", "AGPL-3.0"],
  "warn": ["LGPL-3.0"],
  "allowUnlicensed": false
}
JSON

# run
npx license-lens check
```

---

## Usage
```bash
# basic
npx license-lens check

# JSON output (machine-readable)
npx license-lens check --format json

# treat UNKNOWN/UNLICENSED as error (default if allowUnlicensed=false)
npx license-lens check --no-allow-unlicensed

# override config file entries via flags
npx license-lens check --disallow GPL-3.0,AGPL-3.0 --warn LGPL-3.0
```

**Exit codes**
- `0` – all good (no disallowed, and unknown allowed by policy)
- `1` – violations found (disallowed or unknown when not allowed)
- `2` – runtime errors (e.g., missing `node_modules/`)

---

## Configuration
Create `license-lens.config.json` at the repo root (all keys optional):

```json
{
  "disallow": ["GPL-3.0", "AGPL-3.0"],
  "warn": ["LGPL-3.0"],
  "allowUnlicensed": false,
  "ignore": ["left-pad@1.3.0"]
}
```

- `disallow` — licenses that fail the check
- `warn` — licenses printed as warnings but do not fail
- `allowUnlicensed` — allow packages missing a license field
- `ignore` — exact `name@version` pairs to skip

---

## CI (GitHub Actions)
Minimal workflow to enforce your policy on PRs:

```yaml
name: license-lens CI
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx license-lens check
```

Make this check **Required** on your protected branches.

---

## Notes & limitations
- This tool reads from **installed packages**. Ensure CI runs `npm ci`/`pnpm i --frozen-lockfile`/`yarn install --frozen-lockfile` first.
- Yarn Plug‑n‑Play (`.pnp.cjs`) is not supported in v0.1.0.
- License heuristics:
  - Uses `package.json.license` if string or `{ type: "..." }`
  - Falls back to `licenses` array if present
  - Otherwise marks as `UNKNOWN`

---

## Security
No telemetry, no network calls. Scans local metadata only.

---

## Contributing
PRs welcome! Please keep runtime **dependency‑free** and document any new license heuristics. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License
MIT © License Lens contributors

---

## Roadmap
- [ ] Yarn PnP support
- [ ] Optional SPDX validation and normalization
- [ ] Output SPDX bill of materials (CycloneDX option)
- [ ] Composite Action wrapper with comments on PRs

---

## FAQ
**Why not parse lockfiles?**  
Lockfiles don’t contain license fields. Reading `node_modules/**/package.json` is faster and avoids registry calls.

**Will it follow pnpm symlinks?**  
Yes—the scanner recurses actual directories in `node_modules`, including scoped packages and nested trees.

**Can I suppress a single package?**  
Use `ignore: ["name@version"]` in `license-lens.config.json`.
