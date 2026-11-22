const secondsPerAlarmCycle = 2;
const wavSampleRate = 8000;
const bytesPerSample = 2;
const maxScheduledDelayMs = 30 * 60 * 1000;

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

export function scheduledRestAlarm(delayMs: number): Blob | null {
  // Keep the generated media bounded. Longer rests still use the on-screen alarm.
  if (!Number.isFinite(delayMs) || delayMs <= 0 || delayMs > maxScheduledDelayMs) return null;
  const silentSamples = Math.ceil(delayMs * wavSampleRate / 1000);
  const cycle = alarmSamples(wavSampleRate);
  const repetitions = 15;
  const dataBytes = (silentSamples + cycle.length * repetitions) * bytesPerSample;

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

  // Reuse the same chunks to avoid allocating a PCM array for the full wait.
  const silentSecondBytes = wavSampleRate * bytesPerSample;
  const silentSeconds = Math.floor(silentSamples / wavSampleRate);
  const silentSecond = new Blob([new Uint8Array(silentSecondBytes)]);
  const partialSecond = silentSecond.slice(0, (silentSamples % wavSampleRate) * bytesPerSample);
  const alarmCycle = new Blob([tone.buffer]);
  return new Blob([
    header, ...Array<Blob>(silentSeconds).fill(silentSecond), partialSecond,
    ...Array<Blob>(repetitions).fill(alarmCycle),
  ], { type: "audio/wav" });
}
