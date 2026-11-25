type TimerAudioSession = { type: string };

function audioSessionFor(browser: Navigator) {
  return (browser as Navigator & { audioSession?: TimerAudioSession }).audioSession;
}

export function allowTimerAudioMixing(browser: Navigator): boolean {
  const session = audioSessionFor(browser);
  if (!session) return false;
  try {
    session.type = "ambient";
    return session.type === "ambient";
  } catch {
    return false;
  }
}

export function requestRestAlarmAudioFocus(browser: Navigator): (() => void) | null {
  const session = audioSessionFor(browser);
  if (!session) return null;
  try {
    const previousType = session.type;
    session.type = "playback";
    if (session.type !== "playback") return null;
    return () => {
      try {
        if (session.type === "playback") session.type = previousType;
      } catch { /* The platform may have already released the session. */ }
    };
  } catch {
    return null;
  }
}

export function alarmSamples(rate: number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(rate * 2);
  const toneLength = Math.floor(rate * 0.18);
  const fadeLength = Math.max(1, Math.floor(rate * 0.01));
  for (const [start, frequency] of [[0, 880], [Math.floor(rate * 0.27), 1100]]) {
    for (let sample = 0; sample < toneLength; sample += 1) {
      const envelope = Math.min(sample, toneLength - sample, fadeLength) / fadeLength;
      samples[start + sample] = Math.sin(2 * Math.PI * frequency * sample / rate) * envelope * 0.2;
    }
  }
  return samples;
}

export function scheduleRestChime(context: AudioContext, delayMs: number) {
  const samples = alarmSamples(context.sampleRate);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.copyToChannel(samples, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(context.destination);
  const playAt = context.currentTime + Math.max(0, delayMs) / 1000;
  source.start(playAt);
  return { source, playAt };
}

function restMediaTrack(): Blob {
  const sampleRate = 8000;
  const samples = alarmSamples(sampleRate);
  const repetitions = 4;
  const dataLength = samples.length * repetitions * 2;
  const bytes = new ArrayBuffer(44 + dataLength);
  const view = new DataView(bytes);
  const labels = new TextEncoder();
  new Uint8Array(bytes).set(labels.encode("RIFF"), 0);
  new Uint8Array(bytes).set(labels.encode("WAVEfmt "), 8);
  new Uint8Array(bytes).set(labels.encode("data"), 36);
  view.setUint32(4, bytes.byteLength - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, dataLength, true);
  for (let index = 0; index < samples.length * repetitions; index++) {
    view.setInt16(44 + index * 2, Math.round(samples[index % samples.length] * 32767), true);
  }
  return new Blob([bytes], { type: "audio/wav" });
}

// Browsers without AudioSession can still request normal media audio focus when
// the alarm starts. A rejected play() is handled by the Web Audio fallback.
export function playRestMediaAlarm() {
  const player = new Audio();
  const url = URL.createObjectURL(restMediaTrack());
  player.loop = true;
  player.src = url;
  return {
    player,
    play: () => player.play(),
    stop: () => {
      player.pause();
      player.removeAttribute("src");
      player.load();
      URL.revokeObjectURL(url);
    },
  };
}
