import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { decodeFile, demoAudio } from './audio';
import './style.css';

const notes = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = midi => notes[midi % 12] + (Math.floor(midi / 12) - 1);
const date = value => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const Icon = ({ name, size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{({wave:<path d="M3 10v4m4-8v12m5-16v20m5-16v12m4-8v4"/>,grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,history:<><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/><path d="M12 7v5l3 2"/></>,mic:<><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>,upload:<><path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/></>,arrow:<path d="m5 12 14 0m-5-5 5 5-5 5"/>,play:<path d="m9 5 11 7-11 7z"/>,check:<path d="m5 12 4 4L19 6"/>,music:<><path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/></>,trash:<><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></>})[name]}</svg>;

function PitchChart({ result }) {
  const points = result?.pitch || [], duration = result?.duration || 12;
  const paths = []; let path = '';
  points.forEach(p => {
    if (p.cents === null) { if (path) paths.push(path); path = ''; return; }
    const x = 48 + p.time / duration * 710, y = 109 - Math.max(-100, Math.min(100, p.cents)) * .7;
    path += `${path ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
  }); if (path) paths.push(path);
  return <svg viewBox="0 0 790 225" role="img" aria-label="Pitch deviation over time in cents" className="chart">
    <rect x="48" y="91.5" width="710" height="35" fill="#e8f0d9"/>
    {[-100,-50,0,50,100].map(c => <g key={c}><line x1="48" x2="758" y1={109-c*.7} y2={109-c*.7} stroke={c===0?'#8eaa5c':'#e3e5df'} strokeDasharray={c===0?'4 4':'0'}/><text x="35" y={113-c*.7} textAnchor="end">{c>0?'+':''}{c}</text></g>)}
    {[0,1,2,3,4].map(i=><text key={i} x={48+i*177.5} y="210" textAnchor="middle">{(duration*i/4).toFixed(1)}s</text>)}
    {paths.map((d,i)=><path key={i} d={d} fill="none" stroke="#46662b" strokeWidth="2.3"/>)}
    {!result && <text x="403" y="76" textAnchor="middle" className="chart-empty">Your next good note starts here.</text>}
  </svg>;
}

function Spectrum({ result }) {
  const data = result?.spectrum || [];
  const x = hz => 35 + Math.log(hz/60)/Math.log(4000/60)*700;
  const d = data.map((p,i)=>`${i?'L':'M'}${x(p.hz)},${160-Math.max(0,80+p.db)*1.6}`).join(' ');
  return <svg viewBox="0 0 780 195" role="img" aria-label="Harmonic spectrum, frequency in Hertz and relative magnitude" className="chart spectrum">
    {[0,1,2].map(i=><line key={i} x1="35" x2="735" y1={32+i*64} y2={32+i*64} stroke="#e3e5df"/>)}
    {data.length>0 && <><path d={`${d} L735,160 L35,160Z`} fill="#e8f0d9"/><path d={d} stroke="#668b40" strokeWidth="2" fill="none"/></>}
    {[100,220,440,1000,2000,4000].map(hz=><text key={hz} x={x(hz)} y="183" textAnchor="middle">{hz>=1000?hz/1000+'k':hz} Hz</text>)}
    {!result && <text x="390" y="100" textAnchor="middle" className="chart-empty">Analyze a recording to see its harmonic fingerprint.</text>}
  </svg>;
}

function App() {
  const [view,setView] = useState('studio'), [sessions,setSessions] = useState([]), [result,setResult] = useState(null);
  const [target,setTarget] = useState(69), [bpm,setBpm] = useState(100), [name,setName] = useState(''), [audio,setAudio] = useState(null);
  const [audioUrl,setAudioUrl] = useState(''), [busy,setBusy] = useState(false), [recording,setRecording] = useState(false), [seconds,setSeconds] = useState(0), [error,setError] = useState('');
  const [tab,setTab] = useState('pitch'), [metro,setMetro] = useState(false), [level,setLevel] = useState(0);
  const capture = useRef(null), fileInput = useRef(null), metroContext = useRef(null), referenceContext = useRef(null);
  const loadSessions = async () => { const r = await fetch('/api/sessions'); if (!r.ok) throw new Error('Could not load practice history. Make sure Flask is running.'); setSessions(await r.json()); };
  useEffect(()=>{loadSessions().catch(e=>setError(e.message)); return ()=>{ const c=capture.current; if(c){clearInterval(c.timer); c.stream.getTracks().forEach(t=>t.stop()); c.context.close();} metroContext.current?.close(); referenceContext.current?.close(); };},[]);
  useEffect(()=>{ if(!audio) {setAudioUrl('');return;} const url=URL.createObjectURL(audio.blob);setAudioUrl(url);return()=>URL.revokeObjectURL(url); },[audio]);
  useEffect(()=>{
    if(!metro)return;
    const context = new AudioContext(); metroContext.current=context;
    const tick=()=>{const osc=context.createOscillator(), gain=context.createGain();osc.frequency.value=880;gain.gain.setValueAtTime(.1,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.06);osc.connect(gain).connect(context.destination);osc.start();osc.stop(context.currentTime+.07);};
    tick(); const timer=setInterval(tick,60000/bpm);return()=>{clearInterval(timer); context.close();metroContext.current=null;};
  },[metro,bpm]);
  const stopRecording = () => {
    const c=capture.current; if(!c)return; capture.current=null;clearInterval(c.timer);
    c.recorder.onstop=async()=>{try{const blob=await decodeFile(new Blob(c.chunks,{type:c.recorder.mimeType}));setAudio({blob,name:'Microphone recording'});}catch(e){setError(e.message);}finally{c.stream.getTracks().forEach(t=>t.stop());c.context.close();setRecording(false);setLevel(0);}};
    c.recorder.stop();
  };
  const startRecording = async()=>{
    setError('');setMetro(false);
    let stream, context;
    try{
      if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)throw new Error('Microphone recording requires a supported browser on localhost or HTTPS. You can upload a WAV file instead.');
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      const recorder=new MediaRecorder(stream); context=new AudioContext();const analyzer=context.createAnalyser();context.createMediaStreamSource(stream).connect(analyzer);analyzer.fftSize=256;
      const c={stream,context,recorder,chunks:[],elapsed:0};capture.current=c;recorder.ondataavailable=e=>{if(e.data.size)c.chunks.push(e.data);};recorder.start();setRecording(true);setSeconds(0);setAudio(null);
      c.timer=setInterval(()=>{c.elapsed+=.1;setSeconds(Math.floor(c.elapsed));const values=new Uint8Array(analyzer.frequencyBinCount);analyzer.getByteFrequencyData(values);setLevel(values.reduce((a,b)=>a+b,0)/values.length/128);if(c.elapsed>=120)stopRecording();},100);
    }catch(e){stream?.getTracks().forEach(t=>t.stop());context?.close();setError(e.name==='NotAllowedError'?'Microphone permission was denied. Enable it in your browser or upload a recording.':e.message);}
  };
  const upload=async file=>{if(!file)return;setError('');setBusy(true);try{setAudio({blob:await decodeFile(file),name:file.name});}catch(e){setError(e.message || 'Could not decode this audio. Try a PCM WAV file.');}finally{setBusy(false);fileInput.current.value='';}};
  const runAnalysis=async(demo=false)=>{
    setBusy(true);setError('');setMetro(false);
    try{
      const source=demo?{blob:demoAudio(target,bpm),name:'Demo · repeated notes'}:audio;
      if(!source)throw new Error('Record or upload audio first.');if(demo)setAudio(source);
      const form=new FormData();form.append('audio',source.blob,'practice.wav');form.append('target',target);form.append('bpm',bpm);form.append('name',name.trim() || source.name);
      const response=await fetch('/api/analyze',{method:'POST',body:form});const data=await response.json();if(!response.ok)throw new Error(data.error || 'Analysis failed.');setResult(data);await loadSessions();
    }catch(e){setError(e.message==='Failed to fetch'?'Cannot reach the analyzer. Start Flask with python app.py.':e.message);}finally{setBusy(false);}
  };
  const playReference=async()=>{try{referenceContext.current?.close();const context=new AudioContext();referenceContext.current=context;await context.resume();const osc=context.createOscillator(), gain=context.createGain();osc.frequency.value=440*2**((target-69)/12);gain.gain.setValueAtTime(.001,context.currentTime);gain.gain.exponentialRampToValueAtTime(.15,context.currentTime+.03);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+1.5);osc.connect(gain).connect(context.destination);osc.start();osc.stop(context.currentTime+1.6);}catch(e){setError('Could not play the reference tone: '+e.message);}};
  const remove=async id=>{try{const response=await fetch(`/api/sessions/${id}`,{method:'DELETE'});if(!response.ok)throw new Error('Could not delete this session.');if(result?.id===id)setResult(null);await loadSessions();}catch(e){setError(e.message);}};
  const metrics=result?.metrics;
  const recurring=['tuning','stability','timing'].map(kind=>({kind,count:sessions.filter(s=>kind==='tuning'?Math.abs(s.metrics.deviation)>10:kind==='stability'?s.metrics.spread>15:s.metrics.timingMs>50).length})).filter(x=>x.count>=2);
  return <div className="app-shell">
    <aside><a className="brand" href="#" onClick={e=>{e.preventDefault();setView('studio');}}><span className="brand-mark"><Icon name="wave" size={25}/></span><span>Music <span className="brand-light">Machine</span><small>YOUR PRACTICE, IN TUNE.</small></span></a>
      <div className="nav-caption">WORKSPACE</div><nav><button className={view==='studio'?'active':''} onClick={()=>setView('studio')}><Icon name="grid"/>Practice studio<span>01</span></button><button className={view==='history'?'active':''} onClick={()=>setView('history')}><Icon name="history"/>Session history<span>{String(sessions.length).padStart(2,'0')}</span></button></nav>
      <div className="sidebar-note"><span className="tiny-star">✳</span><h3>A little better.<br/>Every session.</h3><p>Small, focused practice makes a lasting difference.</p><div className="mini-keys">{Array.from({length:12},(_,i)=><i key={i} className={[1,2,4,5,6,8,9,11].includes(i)?'black-key':''}/>)}</div></div><div className="local-status"><i/> Local workspace<small>Your audio stays on this machine.</small></div>
    </aside>
    <div className="workspace"><header><span>Workspace <span className="slash">/</span> <strong>{view==='studio'?'Practice studio':'Session history'}</strong></span><span className="header-tag"><i/> BUILT FOR BETTER PRACTICE</span></header>
      <main><div className="page-heading"><div><div className="eyebrow">LISTEN. UNDERSTAND. IMPROVE.</div><h1>{view==='studio'?'Find your rhythm.':'Hear your progress.'}</h1><p>{view==='studio'?'Turn every note into a step forward. Your practice, made clearer.':'Every session is a small part of a bigger improvement.'}</p></div><span className="edition">MUSIC MACHINE <span>EST. 2026</span></span></div>
      {error&&<div className="error" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}>×</button></div>}
      {view==='studio'?<>
        <section className="record-panel"><div className="record-top"><div><div className="section-kicker">01 / MAKE SOME MUSIC</div><h2>Your next practice starts here.</h2><p>Record a single-note exercise or bring your own audio.</p></div><span className="pill"><i className={recording?'red':''}/>{recording?'RECORDING':'READY WHEN YOU ARE'}</span></div>
          <div className="record-body"><div className="capture-area"><div className={'waveform '+(recording?'is-recording':'')}>{Array.from({length:53},(_,i)=><i key={i} style={{height:`${(recording?15+level*70:10)+Math.abs(Math.sin(i*1.7))* (recording?50:25)}px`,opacity:recording?1:.3}}/>)}</div><span className="record-clock">{recording?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:audio?audio.name:'A quiet moment before your next great note.'}</span><div className="capture-buttons"><button className={'button '+(recording?'stop':'primary')} disabled={busy} onClick={recording?stopRecording:startRecording}><Icon name="mic" size={18}/>{recording?'Stop recording':'Start recording'}</button><button className="button secondary" disabled={busy||recording} onClick={()=>fileInput.current.click()}><Icon name="upload" size={17}/>Upload audio</button><input ref={fileInput} type="file" accept="audio/*,.wav" hidden onChange={e=>upload(e.target.files[0])}/></div><small>Up to 2 minutes · Single-note audio · WAV recommended</small>{audioUrl&&<audio controls src={audioUrl} className="audio-player"/>}</div>
          <div className="settings"><label>Session name <input value={name} onChange={e=>setName(e.target.value)} maxLength={100} placeholder="e.g. Evening long tones" disabled={busy||recording}/></label><div className="setting-row"><label>Target note<select value={target} disabled={busy||recording} onChange={e=>setTarget(Number(e.target.value))}>{Array.from({length:49},(_,i)=>i+36).map(n=><option key={n} value={n}>{noteName(n)}</option>)}</select></label><label>Tempo <span className="input-unit"><input type="number" min="40" max="240" value={bpm} disabled={busy||recording} onChange={e=>setBpm(e.target.value===''?'':Math.max(0,Math.min(240,Number(e.target.value))))} onBlur={()=>setBpm(Math.max(40,Number(bpm)||100))}/><span>BPM</span></span></label></div><div className="sound-tools"><button disabled={recording} onClick={playReference}><Icon name="play" size={13}/>Reference tone</button><button disabled={recording} className={metro?'metro-on':''} onClick={()=>setMetro(!metro)}><span>◷</span>{metro?'Stop click':'Metronome'}</button></div><button className="button analyze" disabled={!audio||busy||recording} onClick={()=>runAnalysis()}>{busy?'Listening closely…':'Analyze practice'}<Icon name="arrow" size={18}/></button></div></div>
          <div className="demo-line"><span><Icon name="music" size={16}/>Just exploring? Hear what your practice can tell you.</span><button disabled={busy||recording} onClick={()=>runAnalysis(true)}>Try a demo session <span>↗</span></button></div>
        </section>
        <div className="results-heading"><h2>Your practice, at a glance <span>{result?'LATEST ANALYSIS':'AWAITING YOUR FIRST NOTE'}</span></h2>{result&&<span>{result.name} · {noteName(result.target)} · {result.bpm} BPM</span>}</div>
        <section className="metrics">{[{label:'Pitch accuracy',value:metrics?.accuracy,detail:'Voiced frames within ±25 cents',symbol:'◎'},{label:'Rhythmic timing',value:metrics?.timing,detail:metrics?.timingMs!=null?`${metrics.timingMs} ms average beat deviation`:'Play repeated notes to measure',symbol:'◴'},{label:'Note stability',value:metrics?.stability,detail:metrics?`${metrics.spread} cents pitch spread`:'Consistency through each sustain',symbol:'∿'}].map((m,i)=><div className="metric" key={m.label}><div className="metric-title">{m.label}<span>{m.symbol}</span></div><div className="metric-value">{m.value??'—'}{m.value!=null&&<small>/100</small>}</div><div className="metric-bottom"><span>{m.detail}</span><div className="metric-track"><i style={{width:`${m.value||0}%`,background:['#79934e','#a68b55','#618786'][i]}}/></div></div></div>)}</section>
        <div className="analysis-grid"><section className="chart-panel"><div className="panel-heading"><div><div className="section-kicker">02 / SEE THE SOUND</div><h2>A closer listen</h2></div><div className="tabs"><button className={tab==='pitch'?'selected':''} onClick={()=>setTab('pitch')}>Pitch trace</button><button className={tab==='spectrum'?'selected':''} onClick={()=>setTab('spectrum')}>Spectrum</button></div></div><div className="chart-caption"><span>{tab==='pitch'?'PITCH DEVIATION · CENTS':'RELATIVE MAGNITUDE · dB'}</span>{tab==='pitch'&&<span><i/> Target range ±25 cents</span>}</div>{tab==='pitch'?<PitchChart result={result}/>:<Spectrum result={result}/>}<div className="chart-footer">{result?<><span>Fundamental <strong>{metrics.medianHz} Hz</strong></span><span>Tuning <strong>{metrics.deviation>0?'+':''}{metrics.deviation} cents</strong></span><span>Voiced <strong>{metrics.voicedPercent}%</strong></span></>:<span>Your pitch trace and harmonic spectrum will appear after analysis.</span>}</div></section>
          <section className="feedback-panel"><div className="section-kicker">03 / MAKE IT COUNT</div><h2>A note for next time.</h2>{result?result.feedback.map((f,i)=><div className="feedback" key={f.kind}><span className="feedback-num">0{i+1}</span><div><h3>{f.title}</h3><p>{f.detail}</p></div></div>):<div className="feedback-empty"><span>✧</span><h3>Good practice starts<br/>with good listening.</h3><p>Record a session to get focused feedback on tuning, timing, and tone.</p></div>}</section></div>
      </>:<><section className="history-summary"><div><span className="eyebrow">PRACTICE ADDS UP</span><h2>{sessions.length} sessions. A little further along.</h2><p>{sessions.length?`${Math.round(sessions.reduce((a,s)=>a+s.duration,0)/60)} minutes of focused practice recorded.`:'Your first session is the beginning of your progress.'}</p></div><button className="button primary" onClick={()=>setView('studio')}>New practice <Icon name="arrow" size={18}/></button></section>
        {sessions.length>1&&<section className="progress-panel"><div className="panel-heading"><h2>Session scores</h2><span>Last {Math.min(12,sessions.length)} sessions · oldest to newest</span></div><div className="progress-bars">{sessions.slice(0,12).reverse().map(s=><button key={s.id} title={`${s.name}: ${s.metrics.overall}/100`} onClick={()=>{setResult(s);setView('studio');}}><span>{s.metrics.overall}</span><i style={{height:Math.max(3,s.metrics.overall)+'%'}}/><small>{date(s.created)}</small></button>)}</div></section>}
        {recurring.length>0&&<div className="recurring"><strong>Patterns to practice</strong>{recurring.map(r=><span key={r.kind}>{r.kind==='tuning'?'Off-center tuning':r.kind==='stability'?'Pitch movement':'Uneven attacks'} · {r.count} sessions</span>)}</div>}
        <section className="session-list"><div className="panel-heading"><h2>Practice journal</h2><span>{sessions.length} saved sessions</span></div>{sessions.length?<div className="table-scroll"><table><thead><tr><th>SESSION</th><th>TARGET</th><th>PITCH</th><th>TIMING</th><th>STABILITY</th><th></th></tr></thead><tbody>{sessions.map(s=><tr key={s.id}><td><button className="session-name" onClick={()=>{setResult(s);setView('studio');}}>{s.name}<small>{date(s.created)} · {s.duration.toFixed(1)}s · {s.bpm} BPM</small></button></td><td>{noteName(s.target)}</td><td>{s.metrics.accuracy}%</td><td>{s.metrics.timing??'—'}</td><td>{s.metrics.stability}</td><td><button className="delete" aria-label={`Delete ${s.name}`} onClick={()=>remove(s.id)}><Icon name="trash" size={17}/></button></td></tr>)}</tbody></table></div>:<div className="history-empty"><Icon name="history" size={38}/><h3>A fresh page.</h3><p>Your analyzed sessions will be saved here automatically.</p><button className="text-button" onClick={()=>setView('studio')}>Start your first practice →</button></div>}</section></>}
      <footer><span><Icon name="wave" size={16}/> A little more in tune, every day.</span><span>MONOPHONIC ANALYSIS <i/> LOCAL & PRIVATE</span></footer></main>
    </div></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
