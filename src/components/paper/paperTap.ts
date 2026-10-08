/** The audio nodes a tap needs, so a tap can be played on any context. */
export type TapAudio = Pick<BaseAudioContext, 'currentTime' | 'destination' | 'createOscillator' | 'createGain'>;

const TAP_PEAK_GAIN = 0.05;
const TAP_ATTACK_SECONDS = 0.004;
const TAP_SECONDS = 0.11;
const TAP_PITCH_HZ = 880;
const TAP_PITCH_DROP_HZ = 420;
const SILENT = 0.0001;

/** One short, soft tap: a quick triangle blip that drops in pitch and dies away. */
export function playTapOn(audio: TapAudio): void {
  const start = audio.currentTime;
  const tone = audio.createOscillator();
  const level = audio.createGain();
  tone.type = 'triangle';
  tone.frequency.setValueAtTime(TAP_PITCH_HZ, start);
  tone.frequency.exponentialRampToValueAtTime(TAP_PITCH_DROP_HZ, start + TAP_SECONDS);
  level.gain.setValueAtTime(SILENT, start);
  level.gain.exponentialRampToValueAtTime(TAP_PEAK_GAIN, start + TAP_ATTACK_SECONDS);
  level.gain.exponentialRampToValueAtTime(SILENT, start + TAP_SECONDS);
  tone.connect(level).connect(audio.destination);
  tone.onended = () => level.disconnect();
  tone.start(start);
  tone.stop(start + TAP_SECONDS);
}

let context: AudioContext | null = null;

/**
 * Makes the tap's audio context on first use and wakes it. Called inside a
 * click, it is what lets later taps play on browsers that only start audio
 * from a gesture.
 */
export function wakePaperTap(): AudioContext | null {
  try {
    if (!context && typeof AudioContext !== 'undefined') context = new AudioContext();
    if (context?.state === 'suspended') void context.resume();
  } catch {
    context = null;
  }
  return context;
}

/** The tap that plays on each focus in Paper 3D. */
export function playPaperTap(): void {
  const audio = wakePaperTap();
  if (audio) playTapOn(audio);
}
