import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSessions, sessionsCsv, matchingSessions, previousSession } from '../src/sessionTools.js';
import { signalStats } from '../src/audio.js';

const session = (id, name, target, score) => ({ id, name, target, bpm:100, created:'2026-11-05', duration:3,
  metrics:{overall:score,accuracy:score,timing:null,stability:score,deviation:8,spread:4,timingMs:null} });
const sessions = [session(1, 'Morning tones',69,90), session(2, 'Evening scale',60,80), session(3,'Evening tones',69,95)];

test('search and target filters combine without changing original history', () => {
  assert.deepEqual(filterSessions(sessions, ' EVENING ', '69').map(s=>s.id), [3]);
  assert.deepEqual(sessions.map(s=>s.id), [1,2,3]);
  assert.deepEqual(filterSessions(sessions, 'absent'), []);
});
test('history sorts by date or score', () => {
  assert.deepEqual(filterSessions(sessions, '', '', 'oldest').map(s=>s.id), [1,2,3]);
  assert.deepEqual(filterSessions(sessions, '', '', 'score').map(s=>s.id), [3,1,2]);
});
test('CSV escapes names and formulas and leaves missing scores empty', () => {
  const csv = sessionsCsv([session(1, '=SUM(1,2) "test"\nnext',69,90)]);
  assert.ok(csv.includes('"\'=SUM(1,2) ""test""\nnext"'));
  assert.ok(csv.includes('"90","","90"'));
});
test('recording level separates silence and clipping', () => {
  assert.equal(signalStats(new Uint8Array([128,128])).rms,0);
  assert.equal(signalStats(new Uint8Array([0,255])).peak,1);
  assert.ok(signalStats(new Uint8Array([100,156])).rms>.2);
});
test('progress compares the same note and tempo and never a future session', () => {
  const history = [...sessions, {...session(4,'Faster notes',69,99),bpm:120}];
  assert.deepEqual(matchingSessions(history,sessions[2]).map(s=>s.id),[3,1]);
  assert.equal(previousSession(history,sessions[2]).id,1);
  assert.equal(previousSession(history,sessions[0]),null);
  assert.deepEqual(matchingSessions(history,null),[]);
});
