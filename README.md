# MarksheetPro

[![Quality Checks](https://github.com/Psyvybez/MarksheetPro/actions/workflows/quality-checks.yml/badge.svg)](https://github.com/Psyvybez/MarksheetPro/actions/workflows/quality-checks.yml)

Browser-based marksheet and classroom grading manager.

## Private Library Vault

A hidden owner-only page is available at `Library-vault.html`.
The regular app page is now `Library.html`.

Setup steps:

- Open `Library-vault.html` and update `ALLOWED_LIBRARY_EMAILS` to your own account email(s).
- Replace `SECRET_HASH_HEX` with your own SHA-256 passphrase hash.
- Rebuild and publish manually whenever source changes:
  - `cd "Library tracker" && npm run build`
  - `cd .. && rm -rf library-app && mkdir -p library-app && cp -R "Library tracker/dist/." library-app/`

To generate your own hash on Linux/macOS:

```bash
printf 'your-strong-passphrase' | sha256sum
```

Use the first value from that output as `SECRET_HASH_HEX`.

## Quality Commands

- `npm run lint`
- `npm run format:check`
- `npm run format`
