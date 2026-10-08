/**
 * The Paper intro plays once a page session, and only when the page opens on
 * Paper 3D: the loading screen starts the title, and the first Paper scene to
 * mount takes it over. Any later mount, after a mode switch, cross-fades.
 */
let titleStartedAt: number | null = null;
let played = false;
let loaderShare = 0;

export function paperTitleStartedAt(now: number): number {
  titleStartedAt ??= now;
  return titleStartedAt;
}

export function paperIntroPending(): boolean {
  return titleStartedAt !== null && !played;
}

export function markPaperIntroPlayed(): void {
  played = true;
}

/** Swaps in the loader bar's new share and returns the one it showed, so a remounted loader carries on. */
export function swapPaperLoaderShare(share: number): number {
  const shown = loaderShare;
  loaderShare = share;
  return shown;
}
