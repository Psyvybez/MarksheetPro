# MarksheetPro

[![Quality Checks](https://github.com/Psyvybez/MarksheetPro/actions/workflows/quality-checks.yml/badge.svg)](https://github.com/Psyvybez/MarksheetPro/actions/workflows/quality-checks.yml)

Browser-based marksheet and classroom grading manager.

## Private Library Vault

A hidden owner-only page was added at `Library.html`.

Setup steps:

- Open `Library.html` and set `ALLOWED_OWNER_EMAIL` to your own account email.
- Replace `SECRET_HASH_HEX` with your own SHA-256 passphrase hash.
- Rebuild the tracker app once whenever source changes:
  - `cd "Library tracker" && npm run build`

To generate your own hash on Linux/macOS:

```bash
printf 'your-strong-passphrase' | sha256sum
```

Use the first value from that output as `SECRET_HASH_HEX`.

## Quality Commands

- `npm run lint`
- `npm run format:check`
- `npm run format`
