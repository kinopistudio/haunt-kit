---
inclusion: fileMatch
fileMatchPattern: "apps/*/src/render/**"
---
# Game feel: "ink pact"

## Palette
- Ink black `#0d0b0a`, parchment `#e8d9b5`, candle amber `#f2a541`, ghost teal `#7fd1c7`.
- Blood red `#8c1c13` is used only on failure.
- Scare Cue reuses the same spec book and adds a CCTV layer: phosphor green `#8cf0a8`, scanlines, noise, a timecode and a REC dot.

## Type
IM Fell English for rules and headings. IBM Plex Mono for numbers, line numbers and labels. Both load from Google Fonts.

## Midnight Ward camera (2.5D)
- A dollhouse cutaway: a tall back wall, medium side walls, a low front wall.
- The floor is rendered top-down to a texture (tiles, darkness mask, candle light, range diamonds), then projected in horizontal strips. Characters and items stand upright, with contact shadows.
- The camera only pitches (no yaw). Planning is near top-down for readability; at midnight the camera lowers. When the wisp rewrites itself, the camera pushes in on it. On capture there is a shake and a push-in on the girl. At dawn the camera rises and pulls back.
- Interpolate the camera by elapsed time, not per frame, so recordings keep their speed.
- A 2D top-down view stays available as a toggle.

## Signature moments
- **Ink threads:** each bell, the line that fires lifts off the page as an ink thread to its ghost.
- **Shadowed lines** turn mouldy green.
- **Rewrite:** red ink bleeds through from the back of the page.
- **Capture:** the girl's line is struck through in red.
- **Dawn burn:** lines that never fired burn to ash, and the lines that worked turn gold.
- **The girl feels alive:** breathing, and her spec page's corner curls as danger nears.

## Accessibility
Respect `prefers-reduced-motion`: no shake, instant camera, no ash. Every state shown by colour also has a text mark (✓ ✗ ◐).
