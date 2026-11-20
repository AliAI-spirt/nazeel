# Security Policy

## Supported versions
Only the latest release receives security fixes.

## Reporting a vulnerability
Please **do not** open a public issue. Use GitHub's *Security → Report a vulnerability* (private advisory). Include steps to reproduce and impact. We aim to acknowledge within 72 hours.

## Known design notes
- Gemini API key is stored in `chrome.storage.local` (not encrypted). Use a key restricted to the Generative Language API, and rotate it if the computer is shared.
- Since v5.2.0 the content script is registered **only** for the hotel-system origin the user enables (optional host permission, revocable). It additionally checks the page title. No `<all_urls>` match exists; `npm run check` fails the build if one is added.
- CSV exports neutralise spreadsheet formulas (`= + - @`) to prevent formula injection.
- CI runs CodeQL and a secret scan on every change.
- Never commit API keys, guest data, or screenshots of real documents.

## Code protection — honest limits

A Chrome extension only works if Chrome receives runnable JavaScript, so **no
distribution format makes the code literally impossible to copy** — anyone
who installs it can always view it via `chrome://extensions` → *Inspect
views*, or by unzipping the `.crx`/`.zip`. Any claim otherwise would be
false advertising, so we don't make it.

What `npm run protect` actually gives you (`dist/nazeel-vX.Y.Z-protected.zip`):
- **Minification** — strips comments/whitespace, smaller download.
- **Obfuscation** (control-flow flattening, string encoding, renamed local
  identifiers, anti-tamper self-check) — raises the effort needed to read or
  modify the code well past "unzip and read," which is enough to deter
  casual copying by competitors, but is not encryption and is reversible by
  a determined reverse engineer.
- **Trade-off:** this build is ~3x larger and runs with extra overhead
  (control-flow checks) versus the plain build. Use the plain
  `dist/nazeel-vX.Y.Z.zip` for your own production use where performance
  matters most; use the protected build only when giving copies to people
  outside your trust boundary (e.g. other hotels, contractors).

Real protection for a product you don't want copied is **legal and
distribution-based**, not technical: keep the source repository private,
distribute only signed `.crx`/Chrome Web Store builds (private/unlisted
listing restricted to your organization's accounts), and put your license
terms in `LICENSE`.
