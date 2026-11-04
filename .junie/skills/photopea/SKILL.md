---
name: photopea
description: >-
   Use Photopea MCP to create or edit layered artwork, automate repetitive visual edits, and verify exported
   results.
---

# Photopea workflow

1. Inspect the document and its layers before editing. Select the intended layer before destructive operations, and
   check actual layer names rather than assuming them.
2. Build in named layers and create them in the intended stacking order when practical. Keep the original source intact.
3. Run dependent edits sequentially. Batch repetitive marks in one script once their target and order are known.
4. Export numbered previews at meaningful milestones and inspect them visually, especially at edges and sparse regions.
   When editability matters, reopen the layered PSD and check its layers.

## Scripted painting

Photoshop scripting examples are useful starting points, but their methods may be absent in Photopea. Probe the specific
method with `typeof` and test a small operation on a disposable layer. If a script times out, inspect the document
before retrying: The script may have changed it before the timeout.

When path stroking is unavailable, a filled polygon can produce a soft tapered mark. For a curved mark, sample a curve
and offset its points on each side by a tapered width. Fill the resulting selection on a separate raster layer and
feather it for softer edges. This approximates a painted mark but does not perform a brush or smudge stroke.

For example, this script fills a short, straight tapered mark on the active layer:

```javascript
var doc = app.activeDocument;
var color = new SolidColor();
color.rgb.hexValue = 'b97a58';
doc.selection.select( [ [ 100, 100 ], [ 106, 135 ], [ 108, 170 ], [ 105, 200 ], [ 102, 170 ], [ 100, 135 ] ] );
doc.selection.feather( 1 );
doc.selection.fill( color, ColorBlendMode.NORMAL, 45 );
doc.selection.deselect();
app.echoToOE( 'painted' );
```

The script replaces the current selection and leaves it deselected. Preserve any important selection first, and use a
new raster layer for the marks. For repeated marks, loop over point data inside one script instead of making one call
per mark.

## Firefox brush and smudge escape hatch

Photopea scripting has not demonstrated path stroking. To use real brush or smudge gestures alongside MCP, connect
Playwright Firefox to the **same bridge session** before the first MCP operation. The bridge accepts one browser
connection; opening another replaces the first and can disrupt pending operations. Do not reconnect a live editing
session without saving and confirming its state.

The bridge listens on loopback. A bridge inside the default Docker container is not reachable through the host's
loopback address, so this workflow requires a separate MCP server running locally, with its client connected to that
server. Configure the MCP client to launch `node dist/index.js` from the project root using the project's Node
toolchain, and obtain its authenticated browser URL from its stderr
(`Open this authenticated browser URL manually if needed`). In this workspace, the provisional local-server diagnostic
writes the URL to `.tmp/photopea-local-diagnostic-20261102.log` with owner-only permissions; this is not a Junie-managed
log. Treat the URL and its fragment as a secret. Open that exact URL in Firefox before issuing the first MCP tool call:

```bash
cd /home/juanito/projects/mcp/photopea-mcp-server
playwright-cli --help
playwright-cli -s=photopea-edit open 'AUTHENTICATED_BRIDGE_URL' --browser=firefox
playwright-cli -s=photopea-edit screenshot
```

Use `playwright-cli install-browser firefox` if its managed Firefox is missing. Never substitute another browser. Wait
for the bridge to show “Connected — Photopea ready”, then use MCP to inspect or create the document and its layers. This
was verified with CLI `0.1.15` and Junie's local MCP connection; it does not attach to an existing Docker-managed
Firefox session.

In the screenshot, identify the active document, layer, tool, zoom, and visible canvas. Coordinates below are **viewport
CSS pixels**, not image coordinates; recalculate them after every zoom, pan, resize, panel change, or document switch.
Never reuse the example coordinates without calibrating against the current screenshot. Select the intended unlocked
raster layer and brush or smudge tool in Photopea, set the desired size and other settings, and draw a short test stroke
before working on an important image. Confirm the layer is selected in the editor: an MCP-created layer did not always
appear selected for a gesture during testing.

```bash
cd /home/juanito/projects/mcp/photopea-mcp-server
playwright-cli -s=photopea-edit run-code 'async page => {
  await page.mouse.move(START_X, START_Y);
  await page.mouse.down();
  try {
    for (const [x, y] of [[POINT_X, POINT_Y], [END_X, END_Y]])
      await page.mouse.move(x, y, { steps: 5 });
  } finally {
    await page.mouse.up();
  }
}'
playwright-cli -s=photopea-edit screenshot
```

Replace every coordinate placeholder with a number. Inspect the screenshot and use MCP to inspect the same document
after the gesture. Smudge must start on existing pixels in the active layer. These mouse gestures do not establish
pressure sensitivity or predictable smoothing; color, brush settings, and smudge strength are whatever Photopea
currently shows. If a gesture times out, inspect the document before retrying. Close only the session you created with
`playwright-cli -s=photopea-edit close` after saving or discarding its work deliberately.

## Review

Inspect previews at the intended viewing size as well as close up. Layer metadata confirms structure, not visual
quality. Describe approximations honestly when the requested technique could not be reproduced.