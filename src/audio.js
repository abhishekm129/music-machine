export function signalStats(values) {
  let squares = 0, peak = 0;
  for (const value of values) {
    const amplitude = Math.abs((value - 128) / 128);
    squares += amplitude * amplitude;
    peak = Math.max(peak, amplitude);
  }
  return { rms: Math.sqrt(squares / Math.max(1, values.length)), peak };
}

export function encodeWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true));
  return new Blob([buffer], { type: 'audio/wav' });
}

export function demoAudio(target, bpm) {
  const rate = 16000, beat = 60 / bpm, duration = beat * 12, samples = new Float32Array(Math.ceil(rate * duration));
  const hz = 440 * 2 ** ((target - 69) / 12);
  let oscillatorPhase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate, phase = t % beat, envelope = Math.min(1, phase / .015) * Math.max(0, Math.min(1, (beat * .76 - phase) / .05));
    const frequency = hz * 2 ** ((8 + 5 * Math.sin(t * 7)) / 1200);
    oscillatorPhase += 2 * Math.PI * frequency / rate;
    samples[i] = envelope * (.32 * Math.sin(oscillatorPhase) + .06 * Math.sin(2 * oscillatorPhase));
  }
  return encodeWav(samples, rate);
}

export function exerciseAudio(notes, bpm) {
  const rate=16000, beat=60/bpm, duration=notes.reduce((t,n)=>t+n.beats*beat,0)+.4;
  const samples=new Float32Array(Math.ceil(duration*rate));
  let start=.2;
  for(const note of notes){
    const length=note.beats*beat, hz=440*2**((note.midi-69)/12);
    for(let i=0;i<Math.floor(length*rate);i++){
      const t=i/rate, envelope=Math.min(1,t/.015)*Math.max(0,Math.min(1,(length-.06-t)/.03));
      samples[Math.floor(start*rate)+i]=envelope*(.32*Math.sin(2*Math.PI*hz*t)+.06*Math.sin(4*Math.PI*hz*t));
    }
    start+=length;
  }
  return encodeWav(samples,rate);
}

export async function decodeFile(file) {
  if (file.size > 48 * 1024 * 1024) throw new Error('Choose an audio file smaller than 48 MB.');
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await file.arrayBuffer());
    if (audio.duration > 120) throw new Error('Choose a recording shorter than two minutes.');
    const mono = new Float32Array(audio.length);
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
      const data = audio.getChannelData(channel);
      for (let i = 0; i < mono.length; i++) mono[i] += data[i] / audio.numberOfChannels;
    }
    return encodeWav(mono, audio.sampleRate);
  } finally { await context.close(); }
}
