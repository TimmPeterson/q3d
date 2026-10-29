# q3d

A minimal editor for three-dimensional commutative diagrams, built with Three.js and TypeScript. It runs in the browser, stores diagrams locally, and builds into a static website.

## Getting started

On Windows, if the project dependencies are already installed, double-click `start.cmd`. Open http://127.0.0.1:5173/ and keep the terminal window open. Press Ctrl+C in that window to stop the server.

The launcher uses Node.js from your PATH or the Node.js runtime bundled with Codex. Launching this way does not require the `pnpm` command.

### Fresh installation

Requires Node.js 24 and pnpm 11.25.0.

```sh
npm install --global pnpm@11.25.0
pnpm install
pnpm dev
```

Open the URL printed by Vite. To preview a production build, run `pnpm build`, then `pnpm preview`.

## Controls

| Action | Control |
| --- | --- |
| Select | Cursor tool, `1` / `V` |
| Select multiple items | Shift+click toggles an item in the selection; Shift+click on empty space keeps the selection |
| Move a node | Select it and drag the colored X, Y, or Z axis handle |
| Add a node | `+` button or `2` / `N`: adds a sphere of size 0.2 at the center of the view on the selected plane, automatically avoiding occupied positions |
| Create an arrow | `3` / `A`, then click the source and target; dragging from source to target also works |
| Create a loop | In arrow mode, select the same node twice |
| Orbit the camera | Left-drag on empty space |
| Pan the camera | Right-drag or Ctrl+left-drag on empty space |
| Zoom | Mouse wheel |
| Set an exact position | X, Y, Z fields in the node properties |
| Set the placement plane | XY / XZ / YZ and the depth field at the bottom left |
| Snap in 0.5-unit steps | Magnet button or hold Shift while dragging an axis handle |
| Edit a label | Label field in the properties; double-click a node or arrow / Enter |
| Delete selected items | Delete / Backspace |
| Reset the tool and selection | Esc |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z; Ctrl+Y also redoes |
| Fit the diagram in view | `F` or the frame button |
| View along an axis | Click X, Y, or Z at the bottom right |
| Use orthographic projection | Orthographic projection button next to the view controls |
| Save / open a file | Ctrl+S / Ctrl+O |
| Open an example | `Ex` button at the top right, then choose a diagram |

On macOS, use Command instead of Ctrl for the corresponding keyboard shortcuts. On a touchscreen, drag with one finger to orbit; use two fingers to pan and zoom.

The default plane is the horizontal XZ floor, with Y pointing up. The grid has stronger lines every five cells. Orbiting keeps the camera upright, and panning follows the floor. Clicking or double-clicking empty space does not add nodes.

Node properties include shape (sphere, cube, or diamond-shaped octahedron), size, color, and label. Arrow properties include type (ordinary, mono with a hooked tail, epi with a double head, or inclusion `>->` with a forward cone at each end), thickness, curvature, and reversal. Parallel arrows automatically receive different curvatures. The two handles in the Length control independently set the start and end of an arrow along its path. Reversing an arrow preserves its path and the trimming at both ends.

Orthographic projection removes the perspective effect that makes distant objects appear smaller. Switching projections preserves the viewing angle and scale at the center of the view. Orbiting, moving nodes along axes, drawing arrows, and zooming work in both modes.

Selected nodes share a movement gizmo at the average of their positions. Moving or snapping translates the entire group by the same amount, preserving the distances between its members. The group's X/Y/Z fields set its center and also move the group as a whole. Arrows follow their endpoints; selecting an arrow does not automatically select its endpoints.

Property edits apply to all selected items. Mixed values appear as “—”; checkboxes with mixed states show an indeterminate mark. Only the property you explicitly edit changes. A selection containing both nodes and arrows shows only their shared properties: label, billboard mode, and color. Trimming multiple arrows is constrained so that each retains a valid length. Group edits, movement, arrow reversal, and deletion can each be undone in one step. Deleting nodes also deletes their connected arrows.

Billboard mode makes a label face the camera. When disabled, the label remains fixed in the world XY plane. Labels use plain Unicode text without LaTeX processing. The editor does not check commutativity.

The diagram is saved automatically in your browser. The save button downloads a `.q3d.json` file; the open button imports one. Creating a new diagram or importing a file can be undone with Ctrl+Z. The `Ex` menu at the top right opens the bundled Commutative cube and Kernels and cokernels examples. Choosing an example replaces the current diagram, fits it in view, and can be undone with Ctrl+Z. The same JSON files are available in the `examples` directory. Both examples are included in the static build for GitHub Pages.

`examples/kernel-cokernel-cube.q3d.json` is a symmetric diagram of kernels, cokernels, and comparison maps for a commutative cube, containing 262 objects and 546 arrows. Its construction and visual conventions are described in the [accompanying notes](examples/kernel-cokernel-cube.md) (in Russian).

Files from the previous version open with full-length arrows. The removed combined “mono + epi” type is converted to “mono” on import.

## GitHub Pages

1. Push the project to a GitHub repository with a `main` branch.
2. Under **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` tests, builds, and deploys `dist` on every push to `main`. You can also run it manually from the Actions tab.

The build uses relative paths, so it works at both `<user>.github.io` and `<user>.github.io/<repository>/`. You can also host the contents of `dist` on any other static host. No application server or external CDN is required; Three.js is bundled with the app. To preview `dist` locally, use an HTTP server such as `pnpm preview`.

## Project structure

```text
src/
  model/    types, document, history, file validation, persistence
  scene/    Three.js rendering, arrow geometry, text labels
  editor/   pointer interactions and node placement
  ui/       toolbar and property panels
  main.ts   connects the model, scene, and interface
```

`pnpm test` checks edit history, deletion of connected arrows, document serialization and validation, arrow geometry and reversal, and the kernel/cokernel cube example. `pnpm build` checks types and creates the production build.
