# V4.4.12 R2 - HQ Adaptive Merge

This patch changes only Headquarters presentation: removes redundant wallet chips and optically aligns the V3 button content. It preserves unrelated JSX/CSS edits, existing currencies in the Portal and all gameplay logic. It does not commit or push.

Apply only after a successful dry-run. The installer checks unique JSX/CSS anchors, parses the output, and saves exact bytes of all changed files in an external backup folder. If an anchor does not match, STOP and provide the actual `CommandHangarV444.jsx` and `.module.css` for source-aware merging. Do not force replace or reset Git.

Validation in `client`: `node --test tests/hqHeaderCtaAdaptiveV4412R2.test.mjs`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run preview -- --host 127.0.0.1 --port 4173 --strictPort`.

For manual rollback, use: `node V4412_ADAPTIVE_APPLY_R2.mjs --repo PROJECT_ROOT --rollback --backup BACKUP_PATH`. Rollback fails safely if any file has been modified since apply.
