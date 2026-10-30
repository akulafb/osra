# canvas-5000 harness

Throwaway harness for `docs/research/canvas-5000.md`. It mounts the app's real
`FamilyTree` against a seeded, made-up Tree and leaves one JSON result in
`window.__result`. The three modules that reach Supabase are swapped for stubs
(`stubs/`), `fetch` answers only `harness.invalid`, and no `.env` file is read.

```sh
npx vite --config docs/research/canvas-5000/vite.harness.config.ts --port 47813 --strictPort
# then open, for n in 1000 2500 5000:
#   http://127.0.0.1:47813/docs/research/canvas-5000/harness.html?n=5000&view=paper&families=8
#   http://127.0.0.1:47813/docs/research/canvas-5000/harness.html?n=5000&view=2d&families=8
#   http://127.0.0.1:47813/docs/research/canvas-5000/harness.html?n=5000&view=2d&families=1
# when document.title is "done", read JSON.stringify(window.__result)
```

`results/` holds each run's raw JSON.
