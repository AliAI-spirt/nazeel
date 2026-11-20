# Contributing

1. Fork, then `npm ci`.
2. Make your change in `src/`.
3. Add or update a test in `test/` when you touch parsing, filters or exports.
4. Run `npm run verify` (manifest, versions, secret scan, tests) — CI runs the same.
5. Open a PR using the template. Never include real guest data or screenshots of real documents.

Releases: `npm run bump -- X.Y.Z` → fill the CHANGELOG section → commit → `git tag vX.Y.Z && git push --tags`.
The Release workflow builds the zip, writes SHA256SUMS and publishes notes from CHANGELOG.
