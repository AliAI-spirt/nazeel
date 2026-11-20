# Changelog
All notable changes follow [Keep a Changelog](https://keepachangelog.com/) and [SemVer](https://semver.org/).

## [5.2.0] - 2026-11-20
### Security
- **Least privilege, for real:** the content script no longer matches `<all_urls>`.
  It is now registered dynamically (`chrome.scripting.registerContentScripts`)
  only for the hotel-system origin that the user enables from the side panel
  (optional host permission, granted per site, revocable with one click).
  Previously the helper files were injected into every page the user visited,
  contradicting the documented behaviour.
- **CSV formula-injection fix:** exported cells beginning with `= + - @`, Tab or CR
  are neutralised (OWASP guidance). Pure phone numbers such as `+964...` are preserved.
### Added
- Automated tests (`npm test`, built-in `node:test`, zero dependencies): ICAO 9303 MRZ
  parsing and check digits, OCR-confusion repair, document normalisation, room filters,
  CSV safety.
- `scripts/check.js` now also enforces: version consistency (manifest / package / README
  badge / CHANGELOG), no broad host permissions, and no leaked API keys or private keys.
- `npm run bump -- X.Y.Z` updates the version everywhere in one step.
- Build writes `dist/SHA256SUMS.txt` so downloads can be verified.
- GitHub automation: CI matrix (Node 20/22), tag-driven releases with notes taken from
  this changelog, CodeQL, Dependabot, optional Chrome Web Store publishing (manual).
### Fixed
- Version drift: README badge and `package.json` said 5.0.0 while the manifest was 5.1.x.

## [5.1.2] - 2026-11-20
### Fixed
- Confirmed from the real page markup that `#governorate` IS a genuine MUI
  Autocomplete (role="combobox" input inside `.MuiAutocomplete-root`), so
  the v5.1.1 SELECT/role="button" branches never applied here — the real
  bug was in `acOptions()`: it guessed the open listbox's id as
  `"<field id>-listbox"`, but MUI does not guarantee that naming. The
  correct, version-proof id is published on the input's own
  `aria-controls` attribute the instant the popup opens (standard ARIA
  combobox contract). A wrong guess meant the matcher always saw zero
  options and failed silently (no "option not found" message — the field
  was simply never attempted correctly).
- `openAutocomplete()` now polls for the popup actually opening
  (`aria-expanded="true"` or options present, up to 1.2s) after each
  interaction instead of a fixed 400ms sleep, so a slightly slower render
  no longer causes a false "closed" read.
- Kept the v5.1.1 SELECT/role="button" branches in `auto()` as a defensive
  fallback for other deployments where that field renders differently;
  they do not affect this system's actual Autocomplete fields.

## [5.1.1] - 2026-11-20
### Fixed
- `auto()` (step 2: governorate/city/area/neighborhood/street/house) assumed
  every such field is a MUI Autocomplete search box. The "المحافظة" field is
  actually rendered (at least on this hotel's deployment) as a plain
  `<select>` and sometimes as an MUI `role="button"` menu, both of which
  have no `role="option"` elements for the old code to find — it always
  failed. Added SELECT and role="button"/"combobox" branches mirroring the
  nationality field's existing multi-mode handling, with Autocomplete kept
  as the final fallback.

## [5.1.0] - 2026-11-20
### Security
- `host_permissions` narrowed from `<all_urls>` to only the three hosts the
  extension actually calls (Ollama local, Gemini API); page access for
  `scripting.executeScript` now relies on `activeTab` (user-gesture scoped)
  instead of a blanket host grant.
- Added explicit `content_security_policy.extension_pages`
  (`script-src 'self'`) on top of MV3's default remote-code block.
- `scripts/protect.js` added: optional minified + obfuscated build for
  restricted distribution. See SECURITY.md "Code protection — honest limits".
- Audited every `innerHTML` write site; confirmed all dynamic/user- or
  AI-derived text already passes through the shared `esc()` HTML-escaper
  before insertion (no XSS sink found).

## [5.0.0] - 2026-11-20
### Added
- Smart Entry Assistant: ID / passport / visa reading via Ollama or Gemini.
- Auto-rotation of upside-down scans and multi-image merge.
- Model fallback chain for Gemini free-tier limits.
- Printable full report, CSV export, WhatsApp text export.
### Changed
- Shortened name and description to meet Chrome Web Store limits.
- Project restructured: source in `src/`, docs, store listing and CI added.
