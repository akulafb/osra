# 0015 One Camera Director moves the Paper 3D camera

## Context

ADR 0014 gave Paper its own camera rig, then six modules came to drive CameraControls directly: `PaperCameraRig`, `paperSpreadCamera`, `PaperFocus`, `PaperReveal`, `PaperFlight` and `PaperTree3D`. Correct behaviour depended on how they were ordered, and that order lived in React: a layout effect had to set the zoom limits before a passive effect made the first fit, and fractional frame priorities decided who ran first. Five commits in a row (6cd042f to 7badaa6) patched the Spread's camera limits, and the tests could not reach the ordering that kept breaking.

## Decision

This amends ADR 0014's `PaperFlight` and camera rig passages.

1. `src/components/paper/paperCameraDirector.ts` is the only module that moves the Paper 3D camera. Modules that only read it (fog, depth of field) stay as they are.
2. It takes CameraControls and a reader for the scene's state, and has no React in it, so its tests run on real camera-controls headless.
3. The director owns the order. The first `setView` sets the limits and then frames the tree, so a fit cannot run ahead of its limits. `tick` does the Spread follow, then the limits, then keyed flight, then the idle turn.
4. `PaperCameraRig` is the thin React adapter: it passes the view, calls `tick` once a frame at `PAPER_CAMERA_FRAME_PRIORITY`, and reports input. `PaperFocus`, `PaperSearch` and `PaperReveal` still decide when the camera should move, and ask the director to move it.
5. `PaperTree3D` makes the director when CameraControls attaches, and mounts the scene only once it exists, so the scene's modules take it as a plain value, not a nullable one.

## Consequences

- Keyed flight and the idle turn now run ahead of the controls' update instead of after it, so they show one frame earlier. They read the pointed Person one frame late, because `PaperHover` writes it after them; the idle turn can run one extra frame as the mouse lands on a Person.
- A new way to move the Paper camera goes in the director and is tested through its interface.
- Cosmos keeps its own camera (ADR 0014). ADR 0011's finite durations still hold: every flight and the swing end on their own. The idle turn stays open-ended, as it was, and stops on input.
