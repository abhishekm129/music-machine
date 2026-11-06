import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({configFile:false,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
after(()=>server.close());
const {default:Workbench} = await server.ssrLoadModule('/src/Workbench.jsx');
const {selectedExercise} = await server.ssrLoadModule('/src/exercises.js');
const noop = ()=>{};
const base = {
  view:'studio',sessions:[],target:69,bpm:100,name:'',seconds:0,level:0,
  visibleSessions:[],practiceGroups:[],progressSessions:[],recurring:[],
  search:'',historyTarget:'',sortOrder:'newest',fileInput:{current:null},
  PitchChart:()=>React.createElement('div',null,'Pitch visualization'),
  Spectrum:()=>React.createElement('div',null,'Spectrum visualization'),
  setView:noop,setError:noop,setTarget:noop,setBpm:noop,setName:noop,setMetro:noop,
  stopRecording:noop,startRecording:noop,upload:noop,runAnalysis:noop,playReference:noop,
  remove:noop,setTab:noop,setSearch:noop,setHistoryTarget:noop,setSortOrder:noop,
  exportHistory:noop,setProgressGroup:noop,openSession:noop,tab:'pitch'
};
const render = props=>renderToStaticMarkup(React.createElement(Workbench,{...base,...props}));
const result = {id:1,name:'Long tones',target:69,bpm:100,created:'2026-11-05',duration:3,
  metrics:{accuracy:95,timing:null,stability:90,spread:5,medianHz:440,deviation:0,voicedPercent:90},
  feedback:[{kind:'tuning',title:'Centered tuning',detail:'Keep a steady tone.'}]};

test('empty studio explains the next action and exposes accessible controls',()=>{
  const html=render();
  assert.ok(html.includes('Nothing to measure')||html.includes('NOTHING TO MEASURE'));
  assert.ok(html.includes('Record an exercise'));
  assert.ok(html.includes('aria-label="Decrease tempo"'));
  assert.ok(html.includes('aria-label="Sound study view"'));
  assert.ok(html.includes('aria-pressed="true"'));
});
test('recording state offers stop control and measured input level',()=>{
  const html=render({recording:true,seconds:12,level:.5,signal:'clipping'});
  assert.ok(html.includes('Stop recording'));
  assert.ok(html.includes('aria-valuenow="50"'));
  assert.ok(html.includes('signal is clipping'));
});
test('analysis results render feedback without inventing a timing score',()=>{
  const html=render({result});
  assert.ok(html.includes('Pitch visualization'));
  assert.ok(html.includes('Centered tuning'));
  assert.ok(html.includes('Separate your notes'));
  assert.ok(html.includes('440 Hz'));
});
test('loading state announces work and disables record and analysis actions',()=>{
  const html=render({busy:true,activity:'Analyzing practice'});
  assert.ok(html.includes('Analyzing practice. Your measurements will appear when ready.'));
  assert.match(html, /class="record-button [^"]*" disabled/);
  assert.match(html, /class="button primary analyze-button" disabled/);
  assert.ok(html.includes('aria-busy="true"'));
});
test('journal has intentional empty and filtered states',()=>{
  assert.ok(render({view:'history'}).includes('Your first page is still unwritten'));
  const html=render({view:'history',sessions:[result],progressAnchor:result,practiceGroups:[['69:100',result]],progressSessions:[result]});
  assert.ok(html.includes('No sessions under this name or note'));
  assert.ok(html.includes('Clear filters'));
});
test('scale controls show expected notes and the reference playback action',()=>{
  const exercise=selectedExercise('major_scale',60,'',100);
  const html=render({exerciseId:'major_scale',exercise});
  assert.ok(html.includes('Hear exercise'));
  assert.ok(html.includes('Expected exercise notes'));
  assert.ok(html.includes('C5'));
  assert.ok(html.includes('Root note'));
});
test('reference playback identifies the synchronized metronome state',()=>{
  const html=render({referencePlaying:true,metro:true});
  assert.ok(html.includes('Stop reference'));
  assert.ok(html.includes('Metronome synced'));
});
test('recording keeps the metronome usable while reference and tempo stay locked',()=>{
  const html=render({recording:true,metro:true});
  const metronome=html.match(/<button[^>]*aria-describedby="metronome-routing"[^>]*>/)?.[0];
  assert.ok(metronome);
  assert.ok(!metronome.includes('disabled'));
  assert.ok(metronome.includes('aria-pressed="true"'));
  assert.match(html, /<input aria-label="Tempo in beats per minute"[^>]*disabled/);
  assert.ok(html.includes('Use headphones while recording'));
});
test('melody results explain missed and extra notes without crashing',()=>{
  const phrase={...result,exercise:{name:'Custom melody'},sequence:{correct:0,total:1,
    notes:[{index:0,expected:{name:'C4',midi:60,beats:1},expectedStart:0,actual:null,status:'missed',timingMs:null}],extras:[{name:'D4',start:.5}],detected:[]}};
  const html=render({result:phrase,exerciseId:'custom',customMelody:'C4 D4'});
  assert.ok(html.includes('Note-by-note exercise results'));
  assert.ok(html.includes('Not detected'));
  assert.ok(html.includes('Extra detected notes'));
  assert.ok(!html.includes('null cents'));
});
test('octave hints explain a register difference without hiding the measured score',()=>{
  const phrase={...result,analysisVersion:'yin-1',metrics:{...result.metrics,accuracy:0},sequence:{correct:0,total:0,notes:[],extras:[],detected:[],registerHint:{message:'The detected phrase follows the exercise one octave lower.'}}};
  const html=render({result:phrase,target:55,audioUrl:'blob:test-take'});
  assert.ok(html.includes('Check the octave.'));
  assert.ok(html.includes('one octave lower'));
  assert.ok(html.includes('196.00'));
  assert.ok(html.includes('download="music-machine-take.wav"'));
  assert.ok(html.includes('class="score-value">0'));
});
