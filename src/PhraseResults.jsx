import React from 'react';
import { noteName } from './exercises';

export function PhraseChart({result}) {
  const notes=result.sequence.notes;
  const midis=[...notes.map(n=>n.expected.midi),...result.sequence.detected.map(n=>n.midi)];
  const low=Math.min(...midis)-1, high=Math.max(...midis)+1;
  const x=t=>54+Math.max(0,Math.min(result.duration,t))/result.duration*680;
  const y=m=>180-(m-low)/(high-low)*150;
  const paths=[];let path='';
  for(const p of result.pitch){
    if(!p.hz){if(path)paths.push(path);path='';continue;}
    const midi=69+12*Math.log2(p.hz/440);
    path+=`${path?'L':'M'}${x(p.time+.064).toFixed(1)},${y(Math.max(low,Math.min(high,midi))).toFixed(1)} `;
  }
  if(path)paths.push(path);
  return <svg className="chart phrase-chart" viewBox="0 0 760 220" role="img" aria-label="Expected melody as dashed steps and detected pitch as a solid line">
    {Array.from({length:high-low+1},(_,i)=>low+i).filter((m,i)=>i%2===0).map(m=><g key={m}><line x1="54" x2="734" y1={y(m)} y2={y(m)} stroke="var(--line)"/><text x="44" y={y(m)+4} textAnchor="end">{noteName(m)}</text></g>)}
    {notes.filter(n=>n.expectedStart+n.expected.beats*60/result.bpm>0).map(n=><line key={n.index} x1={x(n.expectedStart)} x2={x(n.expectedStart+n.expected.beats*60/result.bpm)} y1={y(n.expected.midi)} y2={y(n.expected.midi)} stroke="var(--ink)" strokeWidth="2" strokeDasharray="5 4" opacity=".55"/>)}
    {paths.map((d,i)=><path key={i} d={d} fill="none" stroke="var(--accent)" strokeWidth="2"/>)}
    {[0,1,2,3,4].map(i=><text key={i} x={54+i*170} y="211" textAnchor="middle">{(result.duration*i/4).toFixed(1)}s</text>)}
  </svg>;
}

const statusLabel={in_tune:'In tune',out_of_tune:'Adjust tuning',wrong:'Wrong note',missed:'Not detected'};
export function PhraseResults({result}) {
  const sequence=result.sequence;
  return <section className="phrase-results" aria-label="Note-by-note exercise results"><div className="phrase-result-heading"><h3>Follow the phrase.</h3><span>{sequence.correct}/{sequence.total} notes found at the right pitch</span></div><p>Timing is relative to your first matched note. “Not detected” can mean a missed note or an unclear recording.</p>
    <div className="phrase-table"><table><caption className="sr-only">Expected notes compared with detected notes, tuning and timing</caption><thead><tr><th scope="col">NOTE</th><th scope="col">HEARD</th><th scope="col">RESULT</th><th scope="col">TUNING</th><th scope="col">TIMING</th></tr></thead><tbody>{sequence.notes.map(n=><tr key={n.index}><td><small>{String(n.index+1).padStart(2,'0')}</small>{n.expected.name}<small>{n.expected.beats} beat{n.expected.beats===1?'':'s'}</small></td><td>{n.actual?.name||'—'}</td><td><span className={`note-status ${n.status}`}>{statusLabel[n.status]}</span></td><td>{n.actual&&n.actual.midi===n.expected.midi?`${n.actual.cents>0?'+':''}${n.actual.cents}¢`:'—'}</td><td>{n.timingMs!==null?`${n.timingMs>0?'+':''}${Math.round(n.timingMs)} ms`:'—'}</td></tr>)}</tbody></table></div>
    {sequence.extras.length>0&&<p className="extra-notes">Extra detected notes: {sequence.extras.map((n,i)=><span key={i}>{n.name} at {n.start.toFixed(2)}s{i<sequence.extras.length-1?', ':''}</span>)}</p>}
  </section>;
}
