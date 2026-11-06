import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { decodeFile, demoAudio, signalStats, exerciseAudio } from './audio';
import './style.css';
import Workbench from './Workbench';
import { selectedExercise, practiceKey } from './exercises';
import { PhraseChart } from './PhraseResults';
import { filterSessions, sessionsCsv, matchingSessions, previousSession } from './sessionTools';

function PitchChart({ result }) {
  if(result?.sequence) return <PhraseChart result={result}/>;
  const points = result?.pitch || [], duration = result?.duration || 12;
  const paths = []; let path = '';
  points.forEach(p => {
    if (p.cents === null) { if (path) paths.push(path); path = ''; return; }
    const x = 48 + p.time / duration * 710, y = 109 - Math.max(-100, Math.min(100, p.cents)) * .7;
    path += `${path ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
  }); if (path) paths.push(path);
  return <svg viewBox="0 0 790 225" role="img" aria-label="Pitch deviation over time in cents" className="chart">
    <rect x="48" y="91.5" width="710" height="35" fill="var(--accent-wash)"/>
    {[-100,-50,0,50,100].map(c => <g key={c}><line x1="48" x2="758" y1={109-c*.7} y2={109-c*.7} stroke={c===0?'var(--accent)':'var(--line)'} strokeDasharray={c===0?'4 4':'0'}/><text x="35" y={113-c*.7} textAnchor="end">{c>0?'+':''}{c}</text></g>)}
    {[0,1,2,3,4].map(i=><text key={i} x={48+i*177.5} y="210" textAnchor="middle">{(duration*i/4).toFixed(1)}s</text>)}
    {paths.map((d,i)=><path key={i} d={d} fill="none" stroke="var(--accent)" strokeWidth="2.3"/>)}
    {!result && <text x="403" y="76" textAnchor="middle" className="chart-empty">Your next good note starts here.</text>}
  </svg>;
}

function Spectrum({ result }) {
  const data = result?.spectrum || [];
  const x = hz => 35 + Math.log(hz/60)/Math.log(4000/60)*700;
  const d = data.map((p,i)=>`${i?'L':'M'}${x(p.hz)},${160-Math.max(0,80+p.db)*1.6}`).join(' ');
  return <svg viewBox="0 0 780 195" role="img" aria-label="Harmonic spectrum, frequency in Hertz and relative magnitude" className="chart spectrum">
    {[0,1,2].map(i=><line key={i} x1="35" x2="735" y1={32+i*64} y2={32+i*64} stroke="var(--line)"/>)}
    {data.length>0 && <><path d={`${d} L735,160 L35,160Z`} fill="var(--accent-wash)"/><path d={d} stroke="var(--accent)" strokeWidth="2" fill="none"/></>}
    {[100,220,440,1000,2000,4000].map(hz=><text key={hz} x={x(hz)} y="183" textAnchor="middle">{hz>=1000?hz/1000+'k':hz} Hz</text>)}
    {!result && <text x="390" y="100" textAnchor="middle" className="chart-empty">Analyze a recording to see its harmonic fingerprint.</text>}
  </svg>;
}

export function App() {
  const [view,setView] = useState('studio'), [sessions,setSessions] = useState([]), [result,setResult] = useState(null);
  const [target,setTarget] = useState(60), [bpm,setBpm] = useState(100), [name,setName] = useState(''), [audio,setAudio] = useState(null);
  const [audioUrl,setAudioUrl] = useState(''), [busy,setBusy] = useState(false), [recording,setRecording] = useState(false), [seconds,setSeconds] = useState(0), [error,setError] = useState('');
  const [tab,setTab] = useState('pitch'), [metro,setMetro] = useState(false), [level,setLevel] = useState(0);
  const [activity,setActivity] = useState('Preparing audio');
  const [preparing,setPreparing] = useState(false), [signal,setSignal] = useState('quiet');
  const [exerciseId,setExerciseId] = useState('major_scale'), [customMelody,setCustomMelody] = useState('C4 D4 E4:2 D4 C4:2');
  const [referencePlaying,setReferencePlaying] = useState(false);
  let exercise, exerciseError='';
  try { exercise=selectedExercise(exerciseId,target,customMelody,Number(bpm)||100); } catch(e) { exerciseError=e.message; }
  const requestingMic = useRef(false);
  const capture = useRef(null), fileInput = useRef(null), metroContext = useRef(null), referenceContext = useRef(null);
  useEffect(()=>{if(referenceContext.current){referenceContext.current.close();referenceContext.current=null;}setReferencePlaying(false);},[exerciseId,target,customMelody,bpm]);
  const loadSessions = async () => { const r = await fetch('/api/sessions'); if (!r.ok) throw new Error('Could not load practice history. Make sure Flask is running.'); setSessions(await r.json()); };
  useEffect(()=>{loadSessions().catch(e=>setError(e.message)); return ()=>{ const c=capture.current; if(c){clearInterval(c.timer); c.stream.getTracks().forEach(t=>t.stop()); c.context.close();} metroContext.current?.close(); referenceContext.current?.close(); };},[]);
  useEffect(()=>{ if(!audio) {setAudioUrl('');return;} const url=URL.createObjectURL(audio.blob);setAudioUrl(url);return()=>URL.revokeObjectURL(url); },[audio]);
  useEffect(()=>{
    if(!metro)return;
    const context = new AudioContext(); metroContext.current=context;
    const tick=()=>{const osc=context.createOscillator(), gain=context.createGain();osc.frequency.value=880;gain.gain.setValueAtTime(.1,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.06);osc.connect(gain).connect(context.destination);osc.start();osc.stop(context.currentTime+.07);};
    tick(); const timer=setInterval(tick,60000/Math.max(40, Number(bpm)||100));return()=>{clearInterval(timer); context.close();metroContext.current=null;};
  },[metro,bpm]);
  const stopRecording = () => {
    const c=capture.current; if(!c)return; capture.current=null;clearInterval(c.timer);
    setRecording(false);setActivity('Preparing recording');setBusy(true);
    c.recorder.onstop=async()=>{try{const blob=await decodeFile(new Blob(c.chunks,{type:c.recorder.mimeType}));setAudio({blob,name:'Microphone recording'});}catch(e){setError(e.message);}finally{c.stream.getTracks().forEach(t=>t.stop());c.context.close();setBusy(false);setLevel(0);}};
    c.recorder.stop();
  };
  const startRecording = async()=>{
    if(exerciseError){setError(exerciseError);return;}
    if(requestingMic.current || capture.current)return;
    requestingMic.current=true;setPreparing(true);
    setError('');setMetro(false);
    let stream, context;
    try{
      if(referenceContext.current){await referenceContext.current.close();referenceContext.current=null;}setReferencePlaying(false);
      if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)throw new Error('Microphone recording requires a supported browser on localhost or HTTPS. You can upload a WAV file instead.');
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      const recorder=new MediaRecorder(stream); context=new AudioContext();const analyzer=context.createAnalyser();context.createMediaStreamSource(stream).connect(analyzer);analyzer.fftSize=256;
      await context.resume();
      const c={stream,context,recorder,chunks:[],started:performance.now()};capture.current=c;recorder.ondataavailable=e=>{if(e.data.size)c.chunks.push(e.data);};recorder.start();setRecording(true);setSeconds(0);setAudio(null);setSignal('quiet');
      recorder.onerror=()=>{setError('Recording was interrupted. Please try again.');if(capture.current)stopRecording();};
      stream.getAudioTracks().forEach(track=>{track.onended=()=>{if(capture.current)stopRecording();};});
      c.timer=setInterval(()=>{const elapsed=(performance.now()-c.started)/1000;setSeconds(Math.floor(elapsed));const values=new Uint8Array(analyzer.fftSize);analyzer.getByteTimeDomainData(values);const stats=signalStats(values);setLevel(Math.min(1,stats.rms*4));setSignal(stats.peak>.98?'clipping':stats.rms<.015?'quiet':'good');if(elapsed>=120)stopRecording();},100);
    }catch(e){stream?.getTracks().forEach(t=>t.stop());context?.close();setError(e.name==='NotAllowedError'?'Microphone permission was denied. Enable it in your browser or upload a recording.':e.message);}
    finally{requestingMic.current=false;setPreparing(false);}
  };
  const upload=async file=>{if(!file)return;setError('');setActivity('Reading audio');setBusy(true);try{setAudio({blob:await decodeFile(file),name:file.name});}catch(e){setError(e.message || 'Could not decode this audio. Try a PCM WAV file.');}finally{setBusy(false);fileInput.current.value='';}};
  const runAnalysis=async(demo=false)=>{
    setActivity('Analyzing practice');setBusy(true);setError('');setMetro(false);
    try{
      if(exerciseError)throw new Error(exerciseError);
      if(referenceContext.current){await referenceContext.current.close();referenceContext.current=null;}setReferencePlaying(false);
      const source=demo?{blob:exercise.notes.length?exerciseAudio(exercise.notes,bpm):demoAudio(target,bpm),name:exercise.notes.length?`${exercise.name} demo`:'Demo repeated notes'}:audio;
      if(!source)throw new Error('Record or upload audio first.');if(demo)setAudio(source);
      const form=new FormData();form.append('audio',source.blob,'practice.wav');form.append('target',exerciseId==='custom'?exercise.notes[0].midi:target);form.append('bpm',bpm);form.append('name',name.trim() || (exercise.notes.length?exercise.name:source.name));form.append('exercise',JSON.stringify(exercise.spec));
      const response=await fetch('/api/analyze',{method:'POST',body:form});const data=await response.json();if(!response.ok)throw new Error(data.error || 'Analysis failed.');setResult(data);await loadSessions();
    }catch(e){setError(e.message==='Failed to fetch'?'Cannot reach the analyzer. Start Flask with python app.py.':e.message);}finally{setBusy(false);}
  };
  const playReference=async()=>{
    try {
      if(referenceContext.current){await referenceContext.current.close();referenceContext.current=null;setReferencePlaying(false);return;}
      if(exerciseError)throw new Error(exerciseError);
      const context=new AudioContext();referenceContext.current=context;await context.resume();
      const blob=exerciseAudio(exercise.notes.length?exercise.notes:[{midi:target,beats:2}],Number(bpm)||100);
      const buffer=await context.decodeAudioData(await blob.arrayBuffer());
      if(referenceContext.current!==context)return;
      const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=.6;source.connect(gain).connect(context.destination);
      source.onended=()=>{if(referenceContext.current===context){setReferencePlaying(false);referenceContext.current=null;context.close();}};
      source.start();setReferencePlaying(true);
    }catch(e){setError(e.message);setReferencePlaying(false);if(referenceContext.current){referenceContext.current.close();referenceContext.current=null;}}
  };
  const remove=async id=>{try{const response=await fetch(`/api/sessions/${id}`,{method:'DELETE'});if(!response.ok)throw new Error('Could not delete this session.');if(result?.id===id)setResult(null);await loadSessions();}catch(e){setError(e.message);}};
  const [search,setSearch] = useState(''), [historyTarget,setHistoryTarget] = useState(''), [sortOrder,setSortOrder] = useState('newest');
  const visibleSessions = filterSessions(sessions, search, historyTarget, sortOrder);
  const exportHistory = () => {
    const url = URL.createObjectURL(new Blob([sessionsCsv(visibleSessions)], {type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a');link.href=url;link.download='music-machine-sessions.csv';link.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  };
  const [progressGroup,setProgressGroup] = useState('');
  const practiceGroups = [...new Map(sessions.map(s=>[practiceKey(s),s])).entries()];
  const progressAnchor = practiceGroups.find(([key])=>key===progressGroup)?.[1] || sessions[0];
  const progressSessions = matchingSessions(sessions, progressAnchor);
  const previous = result ? previousSession(sessions,result) : null;
  const recurring=['tuning','stability','timing'].map(kind=>({kind,count:progressSessions.filter(s=>kind==='tuning'?Math.abs(s.metrics.deviation)>10:kind==='stability'?s.metrics.spread>15:s.metrics.timingMs>50).length})).filter(x=>x.count>=2);
  return <Workbench {...{view,setView,sessions,result,target,setTarget,bpm,setBpm,name,setName,audio,audioUrl,busy,recording,seconds,error,setError,
    tab,setTab,metro,setMetro,level,preparing,signal,fileInput,stopRecording,startRecording,upload,runAnalysis,playReference,remove,
    search,setSearch,historyTarget,setHistoryTarget,sortOrder,setSortOrder,visibleSessions,exportHistory,progressAnchor,
    progressGroup,setProgressGroup,practiceGroups,progressSessions,previous,recurring,PitchChart,Spectrum,activity,exerciseId,setExerciseId,customMelody,setCustomMelody,exercise,exerciseError,referencePlaying}}
    openSession={session=>{setResult(session);setView('studio');window.scrollTo({top:0,behavior:'instant'});}}/>;
}
if (typeof document !== 'undefined') createRoot(document.getElementById('root')).render(<App/>);
