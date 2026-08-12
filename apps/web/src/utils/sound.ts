let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }
  if (!audioContext) {
    audioContext = new AudioContextCtor();
  }
  if (audioContext.state === 'suspended') {
    void audioContext.resume();
  }
  return audioContext;
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  peakGain: number,
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

/**
 * 내가 정답을 맞혔을 때 재생하는 "띠리링" 느낌의 효과음(합성음, 외부 음원 파일 없음).
 * 빠르게 올라가는 3음(띠-리-링)에 이어 여운이 남는 마지막 음(~)으로 구성된다.
 */
export function playCorrectAnswerSound(): void {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  const now = ctx.currentTime;
  playTone(ctx, 1046.5, now, 0.12, 0.2); // 띠 (C6)
  playTone(ctx, 1318.51, now + 0.08, 0.12, 0.22); // 리 (E6)
  playTone(ctx, 1568.0, now + 0.16, 0.12, 0.22); // 링 (G6)
  playTone(ctx, 2093.0, now + 0.24, 0.45, 0.26); // ~ (C7, 여운)
}
