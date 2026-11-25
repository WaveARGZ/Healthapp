const secondsPerAlarmCycle = 2;
const wavSampleRate = 8000;
const bytesPerSample = 2;

type AudioSession = { type: string };

export function prepareRestAlarmSession(browser: Navigator) {
  const session = (browser as Navigator & { audioSession?: AudioSession }).audioSession;
  if (!session) return null;

  const original = session.type;
  let selected = original;
  const select = (type: string) => {
    try {
      session.type = type;
      selected = session.type;
      return selected === type;
    } catch {
      return false;
    }
  };

  if (!select("ambient")) return null;
  return {
    prioritize: () => select("playback"),
    restore: () => {
      if (session.type === selected) select(original);
    },
  };
}

export function alarmSamples(rate: number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(rate * secondsPerAlarmCycle);
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

export function restAlarmTrack(): Blob {
  const cycle = alarmSamples(wavSampleRate);
  const dataBytes = cycle.length * bytesPerSample;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const text = new TextEncoder();
  const bytes = new Uint8Array(header);
  bytes.set(text.encode("RIFF"), 0);
  view.setUint32(4, dataBytes + 36, true);
  bytes.set(text.encode("WAVEfmt "), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, wavSampleRate, true);
  view.setUint32(28, wavSampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  bytes.set(text.encode("data"), 36);
  view.setUint32(40, dataBytes, true);

  const tone = new DataView(new ArrayBuffer(cycle.length * bytesPerSample));
  for (const [index, sample] of cycle.entries()) {
    tone.setInt16(index * bytesPerSample, Math.round(sample * 32767), true);
  }

  return new Blob([header, tone.buffer], { type: "audio/wav" });
}
