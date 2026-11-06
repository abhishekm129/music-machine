import catalog from '../exercises.json' with {type:'json'};
export { catalog };
const offsets = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
export const noteName = midi => ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][midi%12]+(Math.floor(midi/12)-1);

export function parseMelody(text) {
  const tokens = text.trim().split(/[\s,]+/).filter(Boolean);
  if (tokens.length<2 || tokens.length>32) throw new Error('Enter 2–32 notes, for example C4 D4 E4:2.');
  return tokens.map(token=>{
    const match = /^([A-Ga-g])([#♯b♭]?)([2-6])(?::(0\.5|1\.5|1|2|3|4))?$/.exec(token);
    if (!match) throw new Error(`Cannot read “${token}”. Use a note like C4, F#4 or Bb3:2.`);
    const midi=(Number(match[3])+1)*12+offsets[match[1].toUpperCase()]+(['#','♯'].includes(match[2])?1:['b','♭'].includes(match[2])?-1:0);
    if(midi<36||midi>84) throw new Error('Keep all melody notes between C2 and C6.');
    return {midi,beats:Number(match[4]||1),name:noteName(midi)};
  });
}

export function selectedExercise(id, root, custom, bpm) {
  if (id==='single') return {spec:{id},notes:[],name:'Single note'};
  const preset=catalog.find(p=>p.id===id);
  if(!preset && id!=='custom') throw new Error('Select a valid exercise.');
  const notes=id==='custom'?parseMelody(custom):preset.intervals.map((step,i)=>({midi:root+step,beats:preset.beats[i],name:noteName(root+step)}));
  if(notes.some(n=>n.midi>84||n.midi<36)) throw new Error('Choose a lower root so all exercise notes fit C2–C6.');
  const beats=notes.reduce((total,n)=>total+n.beats,0);
  if(beats>64 || beats*60/bpm>115) throw new Error('Keep the exercise within 64 beats and 115 seconds.');
  if(Math.min(...notes.map(n=>n.beats))*60/bpm<.18) throw new Error('Choose a slower tempo for short notes. Each note needs at least 0.18 seconds.');
  return {spec:id==='custom'?{id,notes:notes.map(({midi,beats})=>({midi,beats}))}:{id},notes,name:preset?.name||'Custom melody'};
}

export const practiceKey = session => `${session.target}:${session.bpm}:${session.exercise?.signature||'single'}`;
export const practiceLabel = session => session.exercise?.name || 'Single note';
