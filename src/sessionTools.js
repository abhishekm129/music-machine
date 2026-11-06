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
    'Pitch accuracy', 'Timing score', 'Stability score', 'Overall score', 'Tuning cents', 'Pitch spread cents', 'Timing error ms']];
  sessions.forEach(s => rows.push([s.name, s.created, s.target, s.bpm, s.duration,
    s.metrics.accuracy, s.metrics.timing, s.metrics.stability, s.metrics.overall,
    s.metrics.deviation, s.metrics.spread, s.metrics.timingMs]));
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
