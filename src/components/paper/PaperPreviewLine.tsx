import type { MutableRefObject } from 'react';
import type { PaperLayout } from '../../lib/paperLayout';
import { placeOf, type PaperEmphasisState } from './paperEmphasis';
import { PAPER_LINE_RENDER_ORDER } from './paperScene';
import { PaperSegmentLine } from './PaperSegmentLine';

const PREVIEW_WIDTH_PX = 1.5;

/** The dashed ink line to the existing Person that AddRelativeModal's connect-to-existing would link. */
export function PaperPreviewLine({
  fromId,
  toId,
  layout,
  ink,
  state,
}: {
  fromId: string;
  toId: string;
  layout: PaperLayout;
  ink: string;
  state: MutableRefObject<PaperEmphasisState>;
}) {
  return (
    <PaperSegmentLine
      place={(from, to) => {
        placeOf(layout, state.current, fromId, from);
        placeOf(layout, state.current, toId, to);
        return true;
      }}
      renderOrder={PAPER_LINE_RENDER_ORDER + 1}
      color={ink}
      lineWidth={PREVIEW_WIDTH_PX}
      dashed
    />
  );
}
