// Keep old single-note history separate from each distinct melody.
const exerciseSignature = s => s.exercise?.signature || 'single';
export function matchingSessions(sessions, anchor) {
  if (!anchor) return [];
  return sessions.filter(s => s.target === anchor.target && s.bpm === anchor.bpm && exerciseSignature(s) === exerciseSignature(anchor))
    .sort((a,b) => b.id - a.id);
}

export function previousSession(sessions, current) {
  return matchingSessions(sessions, current).find(s => s.id < current.id) ?? null;
}

export function filterSessions(sessions, query = '', target = '', order = 'newest') {
  const search = query.trim().toLowerCase();
  const filtered = sessions.filter(session =>
    (!search || session.name.toLowerCase().includes(search)) &&
    (target === '' || session.target === Number(target)));
  return filtered.sort((a, b) => order === 'score'
    ? b.metrics.overall - a.metrics.overall || b.id - a.id
    : order === 'oldest' ? a.id - b.id : b.id - a.id);
}

export function sessionsCsv(sessions) {
  const cell = value => {
    let text = String(value ?? '');
    // Session names are user input; prevent spreadsheets interpreting formulas.
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows = [['Session', 'Recorded at', 'Target MIDI', 'Tempo BPM', 'Duration seconds',
    'Pitch accuracy', 'Timing score', 'Stability score', 'Overall score', 'Tuning cents', 'Pitch spread cents', 'Timing error ms', 'Exercise', 'Correct notes', 'Expected notes', 'Missed notes', 'Extra notes']];
  sessions.forEach(s => rows.push([s.name, s.created, s.target, s.bpm, s.duration,
    s.metrics.accuracy, s.metrics.timing, s.metrics.stability, s.metrics.overall,
    s.metrics.deviation, s.metrics.spread, s.metrics.timingMs, s.exercise?.name||'Single note',
    s.sequence?.correct, s.sequence?.total, s.sequence?.missed, s.sequence?.extras.length]));
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
