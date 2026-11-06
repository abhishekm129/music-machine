import { REFERENCE_LEAD_IN } from './audio.js';

export function referenceTiming(notes, bpm, now) {
  const sourceStart = now + .05;
  const beatStart = sourceStart + REFERENCE_LEAD_IN;
  return { sourceStart, beatStart, endTime: beatStart + notes.reduce((sum,n)=>sum+n.beats,0)*60/bpm };
}

// Timers only fill a short scheduling window. Web Audio plays the clicks at
// absolute audio-clock timestamps, keeping their phase with the reference.
export function startMetronome(context, {bpm, startTime, endTime=Infinity}, timers=globalThis) {
  const beat = 60 / Math.max(40, Number(bpm)||100);
  const voices = new Set();
  let index = Math.max(0, Math.ceil((context.currentTime+.005-startTime)/beat));
  let stopped = false;
  const queue = () => {
    if(stopped || context.state==='closed')return;
    index = Math.max(index, Math.ceil((context.currentTime+.005-startTime)/beat));
    for(let time=startTime+index*beat;time<context.currentTime+.12&&time<endTime-1e-6;time=startTime+(++index)*beat){
      const oscillator=context.createOscillator(), gain=context.createGain();
      oscillator.frequency.value=index===0?1100:880;
      gain.gain.setValueAtTime(.1,time);
      gain.gain.exponentialRampToValueAtTime(.001,time+.045);
      oscillator.connect(gain).connect(context.destination);
      voices.add(oscillator);
      oscillator.onended=()=>{voices.delete(oscillator);oscillator.disconnect();gain.disconnect();};
      oscillator.start(time);oscillator.stop(time+.05);
    }
  };
  queue();
  const timer=timers.setInterval(queue,25);
  return () => {
    stopped=true;timers.clearInterval(timer);
    for(const voice of voices){try{voice.stop();}catch{/* already ended */}}
    voices.clear();
  };
}
