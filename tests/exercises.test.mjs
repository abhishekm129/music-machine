import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMelody, selectedExercise, practiceKey } from '../src/exercises.js';
import { matchingSessions, sessionsCsv } from '../src/sessionTools.js';

test('melody entry supports sharps, flats, octaves and beat lengths',()=>{
  assert.deepEqual(parseMelody('C4, F#4 Bb3:2').map(n=>[n.midi,n.beats]),[[60,1],[66,1],[58,2]]);
  for(const text of ['C4','H4 E4','C4:0 E4','C1 D4'])assert.throws(()=>parseMelody(text));
});
test('scale transposes across roots and validates its range and tempo',()=>{
  const scale=selectedExercise('major_scale',60,'',100);
  assert.equal(scale.notes.length,15);assert.equal(scale.notes[7].midi,72);
  assert.throws(()=>selectedExercise('major_scale',84,'',100));
  assert.throws(()=>selectedExercise('custom',60,'C4:0.5 D4:0.5',240));
});
test('history keeps distinct exercises apart while preserving legacy sessions',()=>{
  const old={id:1,target:60,bpm:100,metrics:{overall:90}};
  const scale={...old,id:2,exercise:{name:'Major scale',signature:'60/1:62/1'}};
  assert.notEqual(practiceKey(old),practiceKey(scale));
  assert.deepEqual(matchingSessions([old,scale],scale).map(s=>s.id),[2]);
  assert.ok(sessionsCsv([scale]).includes('Major scale'));
  const updated={...scale,id:3,analysisVersion:'yin-1'};
  assert.notEqual(practiceKey(updated),practiceKey(scale));
  assert.deepEqual(matchingSessions([old,scale,updated],updated).map(s=>s.id),[3]);
});
