/* Phase Board core: templates are data and one renderer handles every phase.
   Pure functions only (no DOM, no Firebase), so the live app and the exported snapshot share them. */
const STATUS = {
  not_started: { label: 'Not started', cls: 'st-idle' },
  in_progress: { label: 'In progress', cls: 'st-prog' },
  blocked: { label: 'Blocked', cls: 'st-crit' },
  reopened: { label: 'Reopened', cls: 'st-warn' },
  done: { label: 'Done', cls: 'st-good' }
};
const ICONS = {
  done: '<circle cx="9" cy="9" r="8" fill="currentColor"/><path d="M5.2 9.2l2.6 2.6 5-5.4" fill="none" style="stroke:var(--surface)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  in_progress: '<circle cx="9" cy="9" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 1.8a7.2 7.2 0 0 1 0 14.4z" fill="currentColor"/>',
  blocked: '<rect x="1.5" y="1.5" width="15" height="15" rx="3.5" fill="currentColor"/><path d="M6 6l6 6M12 6l-6 6" style="stroke:var(--surface)" stroke-width="1.8" stroke-linecap="round"/>',
  reopened: '<circle cx="9" cy="9" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12.3 7.4A3.8 3.8 0 1 0 12.7 10.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12.7 4.9v2.7H10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  not_started: '<circle cx="9" cy="9" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.4 2.4"/>'
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function today() {
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function icon(status, size) {
  const s = size || 18;
  return '<svg class="ico" width="' + s + '" height="' + s + '" viewBox="0 0 18 18" aria-hidden="true">' + (ICONS[status] || ICONS.not_started) + '</svg>';
}
function pill(status) {
  const m = STATUS[status] || STATUS.not_started;
  return '<span class="pill ' + m.cls + '">' + icon(status, 14) + m.label + '</span>';
}

/* ---- templates: the reusable part ---- */
const PH = {
  discovery: { id: 'discovery', name: 'Discovery', short: 'Discovery',
    goal: 'Agree what problem is being solved, for whom, and how success will be judged.',
    gates: ['Problem statement agreed', 'Users and stakeholders identified', 'Success metrics defined', 'Constraints and risks recorded'],
    artifacts: ['Problem brief'] },
  research: { id: 'research', name: 'Tool / Solution Research', short: 'Research',
    goal: 'Compare realistic options and record why one was chosen.',
    gates: ['Long list of at least three options', 'Evaluation criteria weighted', 'Shortlist compared on real samples', 'Recommendation recorded as a decision'],
    artifacts: ['Options matrix', 'Decision record'] },
  build: { id: 'build', name: 'Prototype / Build', short: 'Build',
    goal: 'Get the chosen approach working end to end, then harden it.',
    gates: ['Core flow runs end to end', 'Configuration loads from the manifest', 'Logging writes to logs/', 'README matches the project layout'],
    artifacts: ['Working prototype'] },
  test: { id: 'test', name: 'Test', short: 'Test',
    goal: 'Prove it works on real inputs and fails safely on bad ones.',
    gates: ['Unit tests pass', 'Empty and malformed inputs handled', 'Dry run on real data', 'Reviewer sign-off'],
    artifacts: ['Test report'] },
  deploy: { id: 'deploy', name: 'Deploy', short: 'Deploy',
    goal: 'Ship it, watch the first run, and hand it over.',
    gates: ['Release tagged', 'Environment variables set', 'Rollback plan written', 'Logs checked after first run', 'Handover notes shared'],
    artifacts: ['Release notes', 'Runbook'] }
};
const TEMPLATES = {
  standard: { key: 'standard', name: 'Standard flow', phases: [PH.discovery, PH.research, PH.build, PH.test, PH.deploy] },
  lite: { key: 'lite', name: 'Lite flow', phases: [PH.discovery, PH.build, PH.test, PH.deploy] }
};
function tplOf(proj) { return TEMPLATES[proj.template] || TEMPLATES.standard; }

/* ---- per-project state ---- */
function blankPhase(def) {
  return { status: 'not_started', gates: def.gates.map(() => false), reopened: 0, artifacts: {}, decisions: [], notes: '', log: [], actions: [] };
}
function openActions(tpl, proj) {
  return tpl.phases.reduce((n, d) => n + (phaseState(proj, d).actions || []).filter(a => !a.done).length, 0);
}
function blankProject(name, tplKey, owner) {
  const tpl = TEMPLATES[tplKey] || TEMPLATES.standard;
  const phases = {};
  tpl.phases.forEach(d => { phases[d.id] = blankPhase(d); });
  return { name: name, template: tpl.key, owner: owner || '', started: today(), phases: phases, updatedAt: Date.now() };
}
function phaseState(proj, def) {
  const st = (proj.phases && proj.phases[def.id]) || blankPhase(def);
  return Object.assign(blankPhase(def), st);
}
function gateCount(def, st) { return def.gates.filter((_, i) => st.gates && st.gates[i]).length; }
function summarize(tpl, proj) {
  let doneP = 0, g = 0, gt = 0, current = null, attention = false;
  tpl.phases.forEach(d => {
    const st = phaseState(proj, d);
    if (st.status === 'done') doneP++; else if (!current) current = d;
    if (st.status === 'blocked' || st.status === 'reopened') attention = true;
    g += gateCount(d, st); gt += d.gates.length;
  });
  return { doneP: doneP, total: tpl.phases.length, g: g, gt: gt, current: current, attention: attention };
}

/* Gate toggle rules. Mutates st, returns a log message or null. */
function applyGate(def, st, i, checked) {
  const gates = def.gates.map((_, k) => !!(st.gates && st.gates[k]));
  gates[i] = checked;
  st.gates = gates;
  const all = gates.every(Boolean), any = gates.some(Boolean);
  if (st.status === 'done' && !all) { st.status = 'reopened'; st.reopened = (st.reopened || 0) + 1; return 'Reopened: a criterion was unchecked'; }
  if (all && st.status !== 'done') { st.status = 'done'; return 'All exit criteria met'; }
  if (st.status === 'not_started' && any) { st.status = 'in_progress'; return 'Started'; }
  return null;
}

/* ---- renderers ---- */
function railHTML(tpl, proj, o) {
  o = o || {};
  const items = tpl.phases.map((d, i) => {
    const st = phaseState(proj, d), prev = i ? phaseState(proj, tpl.phases[i - 1]) : null;
    const meta = STATUS[st.status] || STATUS.not_started;
    const sub = gateCount(d, st) + ' of ' + d.gates.length + ' criteria';
    const inner = '<span class="rn-icon">' + icon(st.status, 22) + '</span><span class="rn-name">' + esc(d.short) + '</span><span class="rn-sub">' + sub + '</span>';
    const cls = 'rn ' + meta.cls + (prev && prev.status === 'done' ? ' prev-done' : '');
    const label = ' aria-label="' + esc(d.name + ': ' + meta.label + ', ' + sub) + '"';
    if (o.button) {
      return '<li class="' + cls + ' has-btn"' + (o.sel === d.id ? ' aria-current="step"' : '') + '><button type="button" class="rn-btn" data-sel="' + d.id + '" aria-label="' + esc(d.name + ': ' + meta.label + ', ' + sub) + '">' + inner + '</button></li>';
    }
    return o.link
      ? '<li class="' + cls + '"' + label + '><a href="#ph-' + d.id + '" style="display:contents;color:inherit;text-decoration:none">' + inner + '</a></li>'
      : '<li class="' + cls + '"' + label + '>' + inner + '</li>';
  });
  return '<ol class="rail" style="--n:' + tpl.phases.length + '">' + items.join('') + '</ol>';
}
function barHTML(tpl, proj) {
  const groups = tpl.phases.map(d => {
    const st = phaseState(proj, d), meta = STATUS[st.status] || STATUS.not_started, n = gateCount(d, st);
    const segs = d.gates.map((_, i) => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('');
    return '<div class="bar-g ' + meta.cls + '" style="flex:' + d.gates.length + '" title="' + esc(d.name + ': ' + n + ' of ' + d.gates.length) + '">' + segs + '</div>';
  });
  return '<div class="bar" role="img" aria-label="Exit criteria met per phase">' + groups.join('') + '</div>';
}
function phaseHTML(def, st, idx, o) {
  o = o || {};
  const meta = STATUS[st.status] || STATUS.not_started, n = gateCount(def, st), edit = o.mode === 'edit';
  const idp = o.idp || '';
  const gates = def.gates.map((g, i) => {
    const id = idp + 'g-' + def.id + '-' + i;
    return '<li><label class="gate" for="' + id + '"><input type="checkbox" id="' + id + '" data-phase="' + def.id + '" data-gate="' + i + '"' + (st.gates && st.gates[i] ? ' checked' : '') + (edit ? '' : ' disabled') + '><span>' + esc(g) + '</span></label></li>';
  }).join('');
  const arts = def.artifacts.map(a => {
    const ref = st.artifacts && st.artifacts[a];
    return ref ? '<li class="art"><span>' + esc(a) + '</span><code>' + esc(ref) + '</code></li>'
               : '<li class="art missing"><span>' + esc(a) + '</span><em>not attached</em></li>';
  }).join('');
  const decs = (st.decisions || []).map(d => '<li><time>' + esc(d.at) + '</time><span>' + esc(d.text) + '</span></li>').join('');
  const acts = st.actions || [], openN = acts.filter(a => !a.done).length;
  const people = o.people || [];
  const actList = acts.map(a => {
    const id = idp + 'a-' + def.id + '-' + a.id;
    const late = a.due && !a.done && a.due < today();
    const opts = (a.assignee && people.indexOf(a.assignee) < 0 ? people.concat([a.assignee]) : people);
    const who = edit
      ? '<select class="field mini-sel" data-act-assignee="' + esc(a.id) + '" data-phase="' + def.id + '" aria-label="Assignee for ' + esc(a.text) + '"><option value="">Unassigned</option>' + opts.map(x => '<option' + (x === a.assignee ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>'
      : '<span class="who' + (a.assignee ? '' : ' none') + '">' + (a.assignee ? esc(a.assignee) : 'Unassigned') + '</span>';
    const due = edit
      ? '<input class="field mini-date" type="date" data-act-due="' + esc(a.id) + '" data-phase="' + def.id + '" value="' + esc(a.due || '') + '" aria-label="Due date for ' + esc(a.text) + '">'
      : (a.due ? '<span class="due mono' + (late ? ' late' : '') + '">Due ' + esc(a.due) + '</span>' : '');
    return '<li class="act' + (a.done ? ' is-done' : '') + '"><div class="act-main"><label class="gate" for="' + id + '"><input type="checkbox" id="' + id + '" data-action="' + esc(a.id) + '" data-phase="' + def.id + '"' + (a.done ? ' checked' : '') + (edit ? '' : ' disabled') + '><span>' + esc(a.text) + '</span></label>' +
      '<div class="act-meta">' + who + due + (late && edit ? '<span class="late">Overdue</span>' : '') + '</div></div>' +
      (edit ? '<button type="button" class="x" data-del-action="' + esc(a.id) + '" data-phase="' + def.id + '" aria-label="Remove action: ' + esc(a.text) + '">&times;</button>' : '') + '</li>';
  }).join('');
  const actBlock = '<div><p class="sub">Action items' + (acts.length ? ' <span class="cnt">' + openN + ' open</span>' : '') + '</p>' +
    (actList ? '<ul class="gates">' + actList + '</ul>' : '<p class="note">No action items.</p>') +
    (edit ? '<form class="act-add" data-addaction="' + def.id + '"><input class="field" id="' + idp + 'newact-' + def.id + '" autocomplete="off" placeholder="Add an action item" aria-label="New action item for ' + esc(def.name) + '"><select class="field" id="' + idp + 'newwho-' + def.id + '" aria-label="Assignee"><option value="">Unassigned</option>' + people.map(x => '<option>' + esc(x) + '</option>').join('') + '</select><input class="field" type="date" id="' + idp + 'newdue-' + def.id + '" aria-label="Due date"><button class="btn" type="submit">Add</button></form>' : '') + '</div>';
  const loop = st.reopened > 0 ? '<p class="loop">' + icon('reopened', 16) + 'Reopened ' + st.reopened + (st.reopened === 1 ? ' time' : ' times') + '</p>' : '';
  return '<article class="phase ' + meta.cls + '" id="' + idp + 'ph-' + def.id + '">' +
    '<div class="ph-head"><span class="ph-idx">' + String(idx + 1).padStart(2, '0') + '</span><h3>' + esc(def.name) + '</h3>' + pill(st.status) +
    '<span class="ph-count">' + n + '/' + def.gates.length + ' criteria</span></div>' +
    '<p class="ph-goal">' + esc(def.goal) + '</p>' + loop +
    '<div class="ph-cols"><div class="stack"><div><p class="sub">Exit criteria</p><ul class="gates">' + gates + '</ul></div>' + actBlock + '</div>' +
    '<div class="stack"><div><p class="sub">Artifacts</p><ul class="arts">' + arts + '</ul></div>' +
    '<div><p class="sub">Decisions</p>' + (decs ? '<ul class="decs">' + decs + '</ul>' : '<p class="note">None recorded.</p>') + '</div>' +
    (st.notes && !o.hideNotes ? '<div><p class="sub">Notes</p><p class="note">' + esc(st.notes) + '</p></div>' : '') + '</div></div>' +
    (o.extra || '') + '</article>';
}

/* ---- portfolio card, shared by the live board and the exported snapshot ---- */
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' d ago';
}
function cardHTML(id, p, when) {
  const tpl = tplOf(p), s = summarize(tpl, p), open = openActions(tpl, p);
  const cur = s.current, curSt = cur ? phaseState(p, cur) : null;
  const icons = tpl.phases.map((d, i) => {
    const st = phaseState(p, d), prev = i ? phaseState(p, tpl.phases[i - 1]) : null;
    return (i ? '<i class="' + (prev.status === 'done' ? 'd' : '') + '"></i>' : '') + '<span class="' + STATUS[st.status].cls + '" title="' + esc(d.name + ': ' + STATUS[st.status].label) + '">' + icon(st.status, 18) + '</span>';
  }).join('');
  return '<button class="card" type="button" data-open="' + esc(id) + '">' +
    '<div><h2>' + esc(p.name) + '</h2><p class="meta">' + esc(tpl.name) + (p.owner ? ' / ' + esc(p.owner) : '') + '</p>' + (p.summary ? '<p class="summary">' + esc(p.summary) + '</p>' : '') + '</div>' +
    '<div class="now">' + (cur ? 'Now in <b>' + esc(cur.short) + '</b> ' + pill(curSt.status) : pill('done') + ' All phases complete') + '</div>' +
    '<div class="mini" aria-hidden="true">' + icons + '</div>' + barHTML(tpl, p) +
    '<div class="foot"><span>' + s.g + ' of ' + s.gt + ' criteria' + (open ? ' / ' + open + ' open action' + (open === 1 ? '' : 's') : '') + '</span><span>' + esc(when || '') + '</span></div></button>';
}

/* ---- project overview: owner, stakeholders, SMEs, target date ---- */
function listOf(v) { return Array.isArray(v) ? v : []; }
function parseList(text) { return String(text || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean); }
function overviewHTML(p, edit) {
  const s = summarize(tplOf(p), p), late = p.target && s.current && p.target < today();
  const chips = a => a.length ? '<ul class="chips">' + a.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<span class="none">Not set</span>';
  if (edit) {
    return '<section class="overview" aria-label="Project overview"><div class="ov-grid">' + summaryHTML(p, true) +
      '<div class="ov"><p class="sub">Owner</p><p>' + (p.owner ? esc(p.owner) : '<span class="none">Not set</span>') + '</p></div>' +
      '<div class="ov"><label class="sub" for="ov-stakeholders">Stakeholders</label><input class="field" id="ov-stakeholders" data-ov="stakeholders" autocomplete="off" placeholder="Names, separated by commas" value="' + esc(listOf(p.stakeholders).join(', ')) + '"></div>' +
      '<div class="ov"><label class="sub" for="ov-smes">SMEs</label><input class="field" id="ov-smes" data-ov="smes" autocomplete="off" placeholder="Names, separated by commas" value="' + esc(listOf(p.smes).join(', ')) + '"></div>' +
      '<div class="ov"><label class="sub" for="ov-target">Target date</label><input class="field" type="date" id="ov-target" data-ov="target" value="' + esc(p.target || '') + '">' + (late ? '<p class="late">Past the target date</p>' : '') + '</div></div></section>';
  }
  return '<section class="overview" aria-label="Project overview">' + summaryHTML(p, false) + '<div class="ov-grid">' +
    '<div class="ov"><p class="sub">Owner</p><p>' + (p.owner ? esc(p.owner) : '<span class="none">Not set</span>') + '</p></div>' +
    '<div class="ov"><p class="sub">Stakeholders</p>' + chips(listOf(p.stakeholders)) + '</div>' +
    '<div class="ov"><p class="sub">SMEs</p>' + chips(listOf(p.smes)) + '</div>' +
    '<div class="ov"><p class="sub">Target date</p><p>' + (p.target ? '<span class="mono">' + esc(p.target) + '</span>' : '<span class="none">Not set</span>') + '</p>' + (late ? '<p class="late">Past the target date</p>' : '') + '</div></div></section>';
}

/* ---- summary, risks and constraints, outcomes ---- */
function summaryHTML(p, edit) {
  if (edit) return '<div class="ov wide"><label class="sub" for="ov-summary">Goal in one line</label><input class="field" id="ov-summary" data-ov="summary" maxlength="160" autocomplete="off" placeholder="What does this project deliver, and for whom?" value="' + esc(p.summary || '') + '"></div>';
  return p.summary ? '<p class="lead">' + esc(p.summary) + '</p>' : '';
}
function risksHTML(p, edit) {
  const rs = Array.isArray(p.risks) ? p.risks : [];
  const open = rs.filter(r => !r.resolved).length;
  const rows = rs.map(r => {
    const id = 'rk-' + r.id;
    return '<li class="risk' + (r.resolved ? ' is-done' : '') + '"><span class="kind k-' + esc(r.kind) + '">' + (r.kind === 'constraint' ? 'Constraint' : 'Risk') + '</span>' +
      '<label class="gate" for="' + id + '"><input type="checkbox" id="' + id + '" data-risk="' + esc(r.id) + '"' + (r.resolved ? ' checked' : '') + (edit ? '' : ' disabled') + '><span>' + esc(r.text) + '</span></label>' +
      (edit ? '<button type="button" class="x" data-del-risk="' + esc(r.id) + '" aria-label="Remove: ' + esc(r.text) + '">&times;</button>' : '') + '</li>';
  }).join('');
  return '<section class="panel-block" aria-label="Risks and constraints"><p class="sub">Risks and constraints' + (rs.length ? ' <span class="cnt">' + open + ' open</span>' : '') + '</p>' +
    (rows ? '<ul class="gates">' + rows + '</ul>' : '<p class="note">None recorded.</p>') +
    (edit ? '<p class="msg">Tick a risk once it is mitigated, or a constraint once it no longer applies.</p><form class="dec-add" data-addrisk="1"><select class="field sel" id="risk-kind" aria-label="Type"><option value="risk">Risk</option><option value="constraint">Constraint</option></select><input class="field" id="risk-text" autocomplete="off" placeholder="Describe it" aria-label="Risk or constraint"><button class="btn" type="submit">Add</button></form>' : '') + '</section>';
}
function outcomesHTML(p, edit) {
  const o = p.outcomes || {}, ms = Array.isArray(o.metrics) ? o.metrics : [];
  const done = !summarize(tplOf(p), p).current;
  const rows = ms.map(m => '<li class="metric"><span class="m-name">' + esc(m.name) + '</span><span class="m-val"><small>Before</small>' + esc(m.before || '-') + '</span><span class="m-val strong"><small>After</small>' + esc(m.after || '-') + '</span>' +
    (edit ? '<button type="button" class="x" data-del-metric="' + esc(m.id) + '" aria-label="Remove metric ' + esc(m.name) + '">&times;</button>' : '') + '</li>').join('');
  const value = edit
    ? '<label class="sub" for="out-value">Value added</label><textarea class="field" id="out-value" data-outvalue="1" placeholder="What changed for the business or users because of this project?">' + esc(o.value || '') + '</textarea>'
    : '<p class="sub">Value added</p>' + (o.value ? '<p class="note">' + esc(o.value) + '</p>' : '<p class="note">Not recorded yet.</p>');
  return '<section class="panel-block outcomes" aria-label="Outcomes"><div class="ph-row"><div><p class="eyebrow">Outcomes</p><h2 class="out-h">Metrics collected and value added</h2></div>' +
    (done ? '' : '<span class="msg" style="margin-left:auto">Fill this in as results come in; it is complete at project end.</span>') + '</div>' +
    '<div><p class="sub">Metrics</p>' + (rows ? '<ul class="metrics">' + rows + '</ul>' : '<p class="note">No metrics recorded yet.</p>') +
    (edit ? '<form class="metric-add" data-addmetric="1"><input class="field" id="m-name" autocomplete="off" placeholder="Metric, e.g. Invoices matched per hour" aria-label="Metric name"><input class="field" id="m-before" autocomplete="off" placeholder="Before" aria-label="Value before"><input class="field" id="m-after" autocomplete="off" placeholder="After" aria-label="Value after"><button class="btn" type="submit">Add metric</button></form>' : '') + '</div>' +
    '<div>' + value + '</div></section>';
}

/* people who can own an action item: owner, stakeholders, SMEs */
function peopleOf(p) {
  const all = [p.owner].concat(listOf(p.stakeholders), listOf(p.smes)).filter(Boolean);
  return all.filter((x, i) => all.indexOf(x) === i);
}
function overdueActions(tpl, proj) {
  return tpl.phases.reduce((n, d) => n + (phaseState(proj, d).actions || []).filter(a => !a.done && a.due && a.due < today()).length, 0);
}
