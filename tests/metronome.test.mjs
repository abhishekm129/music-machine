import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceTiming, startMetronome } from '../src/metronome.js';

function audioClock(now=0){
  const starts=[],stops=[];let pump,cleared=false;
  const context={currentTime:now,state:'running',destination:{},
    createGain:()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}),
    createOscillator:()=>({frequency:{},connect(gain){return gain;},start(time){starts.push(time);},stop(time){stops.push(time);},disconnect(){}})};
  return {context,starts,stops,timers:{setInterval(fn){pump=fn;return 1;},clearInterval(){cleared=true;}},
    advance(time){context.currentTime=time;if(!cleared)pump();},get cleared(){return cleared;}};
}

test('reference first note and clicks share one clock, including held notes',()=>{
  const timing=referenceTiming([{beats:1},{beats:2},{beats:.5}],100,2);
  assert.ok(Math.abs(timing.beatStart-(timing.sourceStart+.2))<1e-9);
  assert.ok(Math.abs(timing.endTime-timing.beatStart-2.1)<1e-9);
  const clock=audioClock(2);
  const stop=startMetronome(clock.context,{bpm:100,startTime:timing.beatStart,endTime:timing.endTime},clock.timers);
  for(let t=2;t<4.6;t+=.025)clock.advance(t);
  assert.equal(clock.starts.length,4);
  clock.starts.forEach((t,i)=>assert.ok(Math.abs(t-(timing.beatStart+i*.6))<1e-9));
  stop();assert.ok(clock.cleared);
});
test('enabling midway joins the next exercise beat instead of clicking immediately',()=>{
  const clock=audioClock(1.1);
  const stop=startMetronome(clock.context,{bpm:100,startTime:.25,endTime:3},clock.timers);
  assert.equal(clock.starts.length,0);
  clock.advance(1.36);
  assert.ok(Math.abs(clock.starts[0]-1.45)<1e-9);
  stop();assert.ok(clock.stops.includes(undefined));
});
test('a delayed timer skips expired beats without shifting future beats',()=>{
  const clock=audioClock();
  const stop=startMetronome(clock.context,{bpm:120,startTime:.05},clock.timers);
  clock.advance(2.5);
  assert.deepEqual(clock.starts,[.05,2.55]);
  stop();const count=clock.starts.length;clock.advance(4);
  assert.equal(clock.starts.length,count);
});
