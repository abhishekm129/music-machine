import test from 'node:test';
import assert from 'node:assert/strict';
import { createMicrophoneCapture } from '../src/audio.js';
import { startMetronome } from '../src/metronome.js';

test('metronome output is never mixed into the recorded microphone stream',()=>{
  const microphone={id:'physical-microphone'};
  const inputConnections=[],outputConnections=[];
  const analyzer={fftSize:0};
  const context={currentTime:0,state:'running',destination:{id:'headphone-output'},
    createAnalyser:()=>analyzer,
    createMediaStreamSource(stream){assert.equal(stream,microphone);return {connect(node){inputConnections.push(node);}};},
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(node){outputConnections.push(node);},disconnect(){}};},
    createOscillator(){return {frequency:{},connect(node){return node;},start(){},stop(){},disconnect(){}};}
  };
  class Recorder {constructor(stream){this.stream=stream;}}
  const capture=createMicrophoneCapture(microphone,context,Recorder);
  const stop=startMetronome(context,{bpm:100,startTime:.05},{setInterval(){return 1;},clearInterval(){}});
  assert.equal(capture.recorder.stream,microphone);
  assert.deepEqual(inputConnections,[analyzer]);
  assert.deepEqual(outputConnections,[context.destination]);
  assert.equal(analyzer.fftSize,256);
  stop();
});
