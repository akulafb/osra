/**
 * The Paper intro plays once a page session, and only when the page opens on
 * Paper 3D: the loading screen starts the title, and the first Paper scene to
 * mount takes it over. Any later mount, after a mode switch, cross-fades.
 */
let titleStartedAt: number | null = null;
let played = false;

/** When the title began rising, starting it now if nothing has. */
export function paperTitleStartedAt(now: number): number {
  titleStartedAt ??= now;
  return titleStartedAt;
}

/** Whether a Paper scene mounting now carries the page's opening intro. */
export function paperIntroPending(): boolean {
  return titleStartedAt !== null && !played;
}

export function markPaperIntroPlayed(): void {
  played = true;
}
