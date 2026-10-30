// Throwaway harness: mounts the app's real canvas (FamilyTree) against a
// served, made-up Tree, drives it, and leaves one JSON result in window.__result.
//
//   harness.html?n=5000&view=paper|2d&seed=1&families=8&panMs=3000
//
// Nothing here reaches a network: fetch answers harness.invalid itself and
// refuses everything else.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import { osraTheme } from '../../../src/theme/osraTheme';
import { AuthProvider } from '../../../src/contexts/AuthContext';
import { CanvasModeProvider } from '../../../src/contexts/CanvasModeProvider';
import { WorkingRecordProvider } from '../../../src/contexts/WorkingRecordContext';
import { FamilyTree } from '../../../src/components/FamilyTree';
import { kinshipLinksFromRows, personsFromRows } from '../../../src/lib/treeRecordRows';
import { dropOrphanLinks } from '../../../src/lib/sanitizeFamilyGraph';
import { filterGraphData } from '../../../src/lib/filterGraphData';
import { calculateLayout } from '../../../src/lib/layoutEngine';
import { layoutPaperTree } from '../../../src/lib/paperLayout';
import { generateTree, largestCluster } from './generate';

const q = new URLSearchParams(location.search);
const n = Number(q.get('n') ?? 1000);
const view = (q.get('view') ?? 'paper') as 'paper' | '2d';
const seed = Number(q.get('seed') ?? 1);
const families = Number(q.get('families') ?? 8);
const panMs = Number(q.get('panMs') ?? 3000);

type Mem = { usedMB: number; totalMB: number } | null;
const mem = (): Mem => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
  return m ? { usedMB: +(m.usedJSHeapSize / 1048576).toFixed(1), totalMB: +(m.totalJSHeapSize / 1048576).toFixed(1) } : null;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (test: () => boolean, label: string, limitMs = 900000) => {
  const start = performance.now();
  while (!test()) {
    if (performance.now() - start > limitMs) throw new Error(`timeout: ${label}`);
    await sleep(25);
  }
};

const result: Record<string, unknown> = {
  params: { n, view, seed, families, panMs },
  userAgent: navigator.userAgent,
  devicePixelRatio: window.devicePixelRatio,
  viewport: [innerWidth, innerHeight],
};
(window as unknown as { __result: unknown }).__result = result;

async function main() {
  result.heapAtStart = mem();

  // Made-up Tree, served as PostgREST bodies.
  let t = performance.now();
  const tree = generateTree(n, seed, families);
  result.generateMs = +(performance.now() - t).toFixed(1);
  const nodesBody = JSON.stringify(tree.nodes);
  const linksBody = JSON.stringify(tree.links);
  const cluster = largestCluster(tree.nodes);
  Object.assign(result, {
    persons: tree.nodes.length,
    kinshipLinks: tree.links.length,
    generations: tree.generations,
    nodesBodyKB: +(nodesBody.length / 1024).toFixed(1),
    linksBodyKB: +(linksBody.length / 1024).toFixed(1),
    largestFamily: cluster,
  });
  (window as unknown as { __harnessBoundNodeId: string }).__harnessBoundNodeId = tree.nodes[0].id;

  const marks: Record<string, number> = {};
  let jsonMs = 0;
  const realJson = Response.prototype.json;
  Response.prototype.json = async function (this: Response) {
    const text = await this.text();
    const s = performance.now();
    const out = JSON.parse(text);
    jsonMs += performance.now() - s;
    marks.jsonDone = performance.now();
    return out;
  };
  const requests: string[] = [];
  window.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push(url);
    if (!url.startsWith('http://harness.invalid/')) return new Response('blocked by harness', { status: 403 });
    if (url.includes('/rest/v1/nodes')) { marks.nodesRequest ??= performance.now(); return new Response(nodesBody, { status: 200 }); }
    if (url.includes('/rest/v1/links')) return new Response(linksBody, { status: 200 });
    return new Response('[]', { status: 200 });
  };

  localStorage.setItem('family-tree-view-mode', JSON.stringify({ mode: view === 'paper' ? '3D' : '2D', layout: 'tree' }));
  localStorage.setItem('family-tree-canvas-mode', 'paper');
  sessionStorage.clear();

  const longTasks: number[] = [];
  new PerformanceObserver((list) => list.getEntries().forEach((e) => longTasks.push(e.duration))).observe({ entryTypes: ['longtask'] });

  const root = ReactDOM.createRoot(document.getElementById('root')!);
  t = performance.now();
  marks.mount = t;
  root.render(
    <ThemeProvider theme={osraTheme}>
      <AuthProvider>
        <CanvasModeProvider>
          <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
            <WorkingRecordProvider>
              <FamilyTree />
            </WorkingRecordProvider>
          </div>
        </CanvasModeProvider>
      </AuthProvider>
    </ThemeProvider>
  );

  if (view === 'paper') {
    await until(() => !!document.querySelector('canvas'), 'canvas');
    marks.canvas = performance.now();
    // Ready: the loader (z-index 10001) has come and gone.
    await until(() => !!document.querySelector('[style*="10001"]'), 'loader seen').catch(() => {});
    await until(() => !document.querySelector('[style*="10001"]'), 'loader gone');
    marks.ready = performance.now();
  } else {
    const text = (s: string) => [...document.querySelectorAll<HTMLElement>('button, div, span')].find((e) => e.children.length === 0 && e.textContent?.trim() === s);
    await until(() => !!text('SELECT FAMILY'), 'preset button');
    marks.recordVisible = performance.now();
    (text('SELECT FAMILY')!.closest('button, [role=button]') as HTMLElement ?? text('SELECT FAMILY')!).click();
    await until(() => !!text(cluster.name), 'preset item');
    marks.presetClick = performance.now();
    (text(cluster.name)!.closest('button, [role=button]') as HTMLElement ?? text(cluster.name)!).click();
    let last = -1;
    let stable = 0;
    await until(() => {
      const c = document.querySelectorAll('svg *').length;
      stable = c === last && c > 50 ? stable + 1 : 0;
      last = c;
      return stable >= 8;
    }, '2D drawn');
    marks.ready = performance.now() - 8 * 25;
    result.svgElements = last;
  }
  await sleep(500);
  const base = marks.mount;
  result.timingsMs = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, +(v - base).toFixed(1)]));
  result.parseJsonMs = +jsonMs.toFixed(1);
  result.longTasksMs = { count: longTasks.length, total: +longTasks.reduce((a, b) => a + b, 0).toFixed(0), max: +Math.max(0, ...longTasks).toFixed(0) };
  result.heapAfterReady = mem();
  result.domElements = document.querySelectorAll('*').length;

  // Frame times while a pointer drags (pan in 2D, orbit in Paper), then while the wheel zooms/dollies.
  const target = (view === 'paper' ? document.querySelector('canvas') : document.querySelector('svg')) as Element;
  const rect = target.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const frames = (ms: number, step: (i: number, ts: number) => void) =>
    new Promise<number[]>((resolve) => {
      const ts: number[] = [];
      const begin = performance.now();
      const tick = (now: number) => {
        ts.push(now);
        step(ts.length, now - begin);
        if (now - begin < ms) requestAnimationFrame(tick); else resolve(ts);
      };
      requestAnimationFrame(tick);
    });
  const stats = (ts: number[]) => {
    const dt = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b);
    const total = ts[ts.length - 1] - ts[0];
    const at = (p: number) => +dt[Math.min(dt.length - 1, Math.floor(dt.length * p))].toFixed(1);
    return { frames: ts.length, fps: +((ts.length - 1) / (total / 1000)).toFixed(1), p50Ms: at(0.5), p95Ms: at(0.95), maxMs: +dt[dt.length - 1].toFixed(1), over33Ms: dt.filter((d) => d > 33.4).length };
  };
  const mouse = (type: string, x: number, y: number, buttons: number) => {
    const init = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    (view === 'paper' ? target : target).dispatchEvent(new PointerEvent('pointer' + type, init));
    if (view === '2d') (type === 'down' ? target : window).dispatchEvent(new MouseEvent('mouse' + type, init));
  };
  mouse('down', cx, cy, 1);
  const pan = await frames(panMs, (_i, el) => mouse('move', cx + Math.sin(el / 400) * 200, cy + Math.cos(el / 500) * 120, 1));
  mouse('up', cx, cy, 0);
  result.panFrames = stats(pan);
  result.panFrameTimesMs = pan.slice(1).map((v, i) => +(v - pan[i]).toFixed(1));
  const zoom = await frames(panMs, (_i, el) => target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, deltaY: Math.sin(el / 300) * 40, deltaMode: 0 })));
  result.zoomFrames = stats(zoom);
  result.zoomFrameTimesMs = zoom.slice(1).map((v, i) => +(v - zoom[i]).toFixed(1));
  result.heapAfterPan = mem();
  result.requestedUrls = [...new Set(requests)];

  // Pure functions on the same rows, three runs each, on a quiet page.
  root.unmount();
  Response.prototype.json = realJson;
  await sleep(300);
  const time = <T,>(fn: () => T) => { const s = performance.now(); const out = fn(); return [+(performance.now() - s).toFixed(1), out] as const; };
  const nodesRows = JSON.parse(nodesBody);
  const linksRows = JSON.parse(linksBody);
  const runs: Record<string, number[]> = { decodeRows: [], layout2dTree: [], layoutPaper: [] };
  let graph = { nodes: personsFromRows(nodesRows), links: dropOrphanLinks(personsFromRows(nodesRows), kinshipLinksFromRows(linksRows)) };
  for (let i = 0; i < 3; i++) {
    const [d, g] = time(() => ({ nodes: personsFromRows(nodesRows), links: kinshipLinksFromRows(linksRows) }));
    runs.decodeRows.push(d);
    graph = { nodes: g.nodes, links: dropOrphanLinks(g.nodes, g.links) };
    const scoped = filterGraphData(graph, new Set(), cluster.name);
    runs.layout2dTree.push(time(() => calculateLayout(scoped.nodes, scoped.links, 'tree', cluster.name))[0]);
    runs.layoutPaper.push(time(() => layoutPaperTree(graph))[0]);
    await sleep(50);
  }
  result.isolatedRunsMs = runs;
  result.layout2dScope = { persons: filterGraphData(graph, new Set(), cluster.name).nodes.length };
  result.heapAtEnd = mem();
}

main().then(() => { result.done = true; document.title = 'done'; }, (e) => { result.error = String(e); result.done = true; document.title = 'done'; });
