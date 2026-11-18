# Space Fighter V4.4.9 - Portal Glass Balance

Scope: Portal visual CSS only; 1 modified CSS, 1 new test, 1 new handoff document.
Requires: V4.4.8 committed on main. Never use on V4.4.7 or older without a baseline compatibility review.

## Design lock
- The original space-gate photo is preserved.
- Five top utilities remain 3-left / 2-right. Four management destinations remain exactly 4.
- Native WebP icons V4.4.8 remain on device; no new assets.
- Utility tiles: near-transparent angular glass (.20-.31) and text shadow to preserve readability.
- Bottom dock: tinted translucent underlay (.26-.42), no CSS border, no V3 button duplicate frame.
- Main buttons keep their existing V3 WebP background frames and click handlers.
- Narrower side cards, larger image icons, slightly reduced CTA/dock heights, safe-area retention.
- Notification dots are never clipped. Avoid blur() for repeating cards on mobile GPU.
- Landscape and compact portrait maintain separate sizes.

## Safety
Preflight fails closed when current V4.4.8 CSS tail differs from approved baseline or a scoped file is staged.
Backup and rollback preserve bytes of all scope files on failure. No git commit/push from --full.
Full mode runs focused V449 test, npm test, and npm run build:mobile on the actual checkout.
Finalizer permits only actual changed files from the 3-path scope.

## APK QA
Check Redmi Turbo 4 Pro: utility labels remain readable on bright nebula; no opaque navy blocks; 4 dock items; badges visible; launch row separate from dock; safe area; gesture tap; offline assets; screenshot in landscape and compact portrait.

Not a Cloud Run or GLB/CDN change.
