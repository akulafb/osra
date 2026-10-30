# Can the canvas handle 5,000 Persons?

**Answer: not as built. Loading is fine; drawing is not.** On one laptop in a dev build, fetching and parsing 5,000 made-up Persons and 7,684 Kinship Links took about 120 ms. Panning then ran at about 4 frames per second in Paper 3D, and at 4 fps in 2D when one family holds all 5,000. Interaction is smooth (about 60 fps) only to roughly 1,000 Persons in 2D and is already uneven (24 fps) there in Paper 3D. The limit in ADR 0022 can stay at 5,000 only if rendering changes; otherwise it has to come down to about 1,000. This is an estimate from one machine and a dev build (see "Not established").

Machine: Apple M4, 16 GB, Orca's built-in browser (Chromium 150), devicePixelRatio 2, viewport 902x812, run 2026-10-30. Raw numbers for every run are in `docs/research/canvas-5000/results/dev/*.json`; rerun steps are in `docs/research/canvas-5000/README.md`.

## How it was measured

A throwaway harness (`docs/research/canvas-5000/`) mounts the app's real `FamilyTree` (`src/components/FamilyTree.tsx`) on a Vite dev server, with the real `useWorkingRecord` read path (`src/hooks/useWorkingRecord.ts:136`), the real 2D layout (`src/lib/layoutEngine.ts`) and the real Paper layout and scene (`src/lib/paperLayout.ts`, `src/components/paper/`). Only the three modules that reach Supabase are swapped for stubs, and `fetch` answers a made-up host with generated rows and refuses every other URL; no `.env` file is read, so no request can reach a real project. Rows come from a seeded generator (`generate.ts`, seed 1, invented names and family names): 8 families (or 1), founding couples, 1 to 4 children, marriages across families, 6 to 9 generations. Sizes: 1,000 / 2,500 / 5,000 Persons (about 1,520 / 3,840 / 7,684 links; exact counts in each JSON).

Frame rate is sampled with `requestAnimationFrame` while synthetic pointer events drag for 3 s (pan in 2D, orbit in Paper) and synthetic wheel events zoom for 3 s. The display caps at 60 fps.

## Results

Pan/orbit frame rate (3 s drag), one run each:

| View | Persons drawn | fps | median frame | frames over 33 ms |
|---|---|---|---|---|
| 2D, 8 families, largest family | 222 (of 1,000) | 60.0 | 16.7 ms | 0 |
| 2D, 8 families, largest family | 552 (of 2,500) | 37.5 | 33.3 ms | 11 of 114 |
| 2D, 8 families, largest family | 1,090 (of 5,000) | 20.1 | 50.0 ms | 56 of 62 |
| 2D, 1 family (worst case) | 1,000 | 21.5 | 50.0 ms | 54 of 66 |
| 2D, 1 family (worst case) | 2,500 | 8.7 | 116.7 ms | 26 of 27 |
| 2D, 1 family (worst case) | 5,000 | 4.2 | 233.3 ms | 13 of 14 |
| Paper 3D, all Persons | 1,000 | 23.9 | 49.0 ms | 53 of 73 |
| Paper 3D, all Persons | 2,500 | 8.7 | 116.7 ms | 27 of 28 |
| Paper 3D, all Persons | 5,000 | 3.9 | 250.0 ms | 12 of 13 |

Zoom/dolly frame rate follows the same pattern (Paper 26.4 / 3.9 / 4.1 fps at 1,000 / 2,500 / 5,000; the 2D rows are in the JSON files).

Load, parse and layout, in ms (layout is the real function run alone on a quiet page, three runs each, listed in order):

| Step | 1,000 | 2,500 | 5,000 |
|---|---|---|---|
| Response body, nodes + links | 218 + 390 KB | 546 + 983 KB | 1,092 + 1,969 KB |
| Fetch to JSON parsed (first request to last `json()`) | 44 | 30 to 49 | 56 to 120 |
| `JSON.parse` itself | 0.9 | 2.1 | 5.3 |
| Decode rows into Persons and Links | 0.1 to 0.4 | 0.3 to 1.2 | 0.7 to 1.3 |
| Paper layout `layoutPaperTree` | 217 / 203 / 202 | 597 / 589 / 598 | 1,299 / 1,295 / 1,296 |
| 2D tree layout, one family of all N | 19 / 17 / 17 | 56 / 50 / 44 | 192 / 157 / 149 |
| 2D tree layout, largest of 8 families (222 / 552 / 1,090 Persons) | 2.9 / 2.6 / 2.5 | 7.4 / 6.4 / 5.6 | 12 / 16 / 16 |

No network time is included: the stub answers in-process, so a real connection adds to the first row. The 5,000 bodies are about 3 MB uncompressed (Supabase's own response compression was not measured).

Main-thread blocking and memory, Paper 3D (long tasks are `PerformanceObserver` `longtask` entries from mount to the loader leaving; heap is `performance.memory.usedJSHeapSize`):

| | 1,000 | 2,500 | 5,000 |
|---|---|---|---|
| Long tasks: count / total / longest | 23 / 1.7 s / 227 ms | 34 / 4.6 s / 614 ms | 63 / 15.4 s / 1.3 s |
| Heap after ready | 166 MB | 282 MB | 553 MB |
| Heap after the 6 s of dragging | 98 MB | 403 MB | 729 MB |

2D heap, one family of all N: 58 / 90 MB after ready and 90 / 150 MB after dragging at 1,000 / 2,500 (5,000 in the JSON). The 2D DOM holds about 1,500 SVG elements at 222 drawn Persons.
GPU memory is not visible from the page and was not measured.

## What breaks, and why

- **Load and parse: does not break.** `readTreeRecord` fetches two tables and decodes them in one pass (`src/hooks/useWorkingRecord.ts:136-215`). At 5,000 Persons that is about 3 MB of JSON and a few milliseconds of parse. ADR 0019's "load everything and walk it in the browser" holds at this size.
- **Paper layout: blocks the page for about 1.3 s at 5,000.** `layoutPaperTree` runs 200 fixed steps of springs and neighbour repulsion on the main thread (`src/lib/paperLayout.ts:34, 295-340`); cost grows slightly faster than linear (0.2 s, 0.6 s, 1.3 s). Once per load, not per edit (`src/hooks/usePaperLayout.ts`). Tolerable alone; the long-task totals above show more time is spent drawing than laying out.
- **Paper rendering: the main limit.** Frame rate falls from 24 to 9 to 4 fps. The discs are one instanced mesh (`src/components/paper/PaperDiscs.tsx:17`), but every Person also gets its own troika `Text` label inside a `Billboard`, updated each frame (`src/components/paper/PaperLabels.tsx:40-85`). That per-Person label is the likeliest cost, but it was read from the code, not isolated by profiling. Heap reaching 0.5 to 0.7 GB at 5,000 is a separate risk on phones.
- **2D rendering: one React tree of cards.** Every pan or zoom event calls `setTransform` (`src/components/FamilyTree2D.tsx:259-262`), which re-renders the whole `nodes.map(<NodeCard>)` list (`:718-745`) and all links. Frame time grows linearly with drawn Persons (about 50 ms at 1,000; 233 ms at 5,000). Also in the layout, `createHierarchyData` calls `nodes.find` per Person (`src/lib/layoutEngine.ts:300`); that is quadratic but small next to rendering (150 to 190 ms at 5,000). This too is from reading the code, not profiling.
- **2D shows one family at a time.** The view draws nothing until a family preset is chosen, then only that family's Persons (`src/lib/filterGraphData.ts:8-30`, `FamilyTree2D.tsx:186-190`). So 2D's real load is the largest family. With 8 made-up families the largest held 22% of all Persons, and 2D stayed above 20 fps at 5,000. A Tree that is mostly one family behaves like the one-family rows.

## What would have to change, or the limit comes down

Estimates, not measured:

1. **2D:** keep pan/zoom out of React state (set the group's transform directly), and skip cards outside the viewport. That should remove most of the per-event cost; how much was not tested.
2. **Paper:** draw labels only for the nearest or largest Persons, or render them as one atlas instead of one `Text` each; run `layoutPaperTree` in a worker.
3. **If those are not done, lower the limit to about 1,000 Persons per Tree.** That is where 2D (one family) and Paper 3D were still near 21 to 24 fps in these runs. 2,500 gave 9 fps in both views' worst case.

## Not established

- **Dev build, not production.** React and three.js dev checks slow everything; production frame rates will be higher by an unknown factor. A production build was not run (timebox).
- **One machine, one run per cell, no repeats.** An M4 laptop is faster than many users' phones and older laptops, so the real picture is worse for them. Phones, touch input and low-power devices were not tested.
- **Synthetic input.** Dragging and wheel events were scripted, so real gesture handling and any browser input throttling are not covered.
- **"Time to ready" is not reported.** My loader and "drawn" detectors gave inconsistent values (Paper 57 s at 1,000, 4.5 s at 2,500, 16 s at 5,000; 2D about 6 s at every size), so those numbers are in the JSON but should not be used. Long-task totals above are the usable load-cost figure.
- **Cause of the rendering cost** (labels in Paper, React re-render in 2D) is inferred from code, not isolated; the fixes in the list above are untested.
- **Made-up shape.** Real family data may be deeper, more cross-linked, or have much larger single families than the seeded generator makes.
- **Chat, search, the person drawer and editing at 5,000 Persons were not measured.**
