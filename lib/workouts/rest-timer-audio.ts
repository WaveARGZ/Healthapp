type MixingAudioSession = { type: string };

export function allowTimerAudioMixing(browser: Navigator): boolean {
  const session = (browser as Navigator & { audioSession?: MixingAudioSession }).audioSession;
  if (!session) return false;
  try {
    session.type = "ambient";
    return session.type === "ambient";
  } catch {
    return false;
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
