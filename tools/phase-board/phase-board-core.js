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
/* A criterion note is plain text; a note that is just one http(s) link becomes a clickable link. */
function noteHTML(text) {
  const t = String(text || '').trim();
  return /^https?:\/\/\S+$/i.test(t) ? '<a href="' + esc(t) + '" target="_blank" rel="noopener noreferrer">' + esc(t) + '</a>' : esc(t);
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
    gates: ['Problem statement agreed', 'Users and stakeholders identified', 'Success metrics defined', 'Constraints and risks recorded'] },
  research: { id: 'research', name: 'Tool / Solution Research', short: 'Research',
    goal: 'Compare realistic options and record why one was chosen.',
    gates: ['Long list of at least three options', 'Evaluation criteria weighted', 'Shortlist compared on real samples', 'Recommendation recorded as a decision'] },
  build: { id: 'build', name: 'Prototype / Build', short: 'Build',
    goal: 'Get the chosen approach working end to end, then harden it.',
    gates: ['Core flow runs end to end', 'Configuration loads from the manifest', 'Logging writes to logs/', 'README matches the project layout'] },
  test: { id: 'test', name: 'Test', short: 'Test',
    goal: 'Prove it works on real inputs and fails safely on bad ones.',
    gates: ['Unit tests pass', 'Empty and malformed inputs handled', 'Dry run on real data', 'Reviewer sign-off'] },
  deploy: { id: 'deploy', name: 'Deploy', short: 'Deploy',
    goal: 'Ship it, watch the first run, and hand it over.',
    gates: ['Release tagged', 'Environment variables set', 'Rollback plan written', 'Logs checked after first run', 'Handover notes shared'] }
};
/* Exit criteria carry stable ids so a flow can be edited without shifting anyone's ticks. */
function G(texts) { return texts.map((t, i) => ({ id: 'g' + (i + 1), text: t })); }
Object.keys(PH).forEach(k => { PH[k].gates = G(PH[k].gates); });
const LEGACY_TEMPLATES = {
  standard: { key: 'standard', name: 'Standard flow', phases: [PH.discovery, PH.research, PH.build, PH.test, PH.deploy] },
  lite: { key: 'lite', name: 'Lite flow', phases: [PH.discovery, PH.build, PH.test, PH.deploy] }
};
/* The built-in flows are skeletons: phases and goals, no exit criteria. The user adds their own, or saves a flow
   with criteria as a template. */
const TEMPLATES = {};
Object.keys(LEGACY_TEMPLATES).forEach(k => {
  TEMPLATES[k] = { key: k, name: LEGACY_TEMPLATES[k].name, phases: LEGACY_TEMPLATES[k].phases.map(p => Object.assign({}, p, { gates: [] })) };
});
/* A project carries its own copy of its flow. Projects saved before that fall back to the original built-in flow,
   criteria included, so their ticks keep their meaning. */
function tplOf(proj) {
  if (proj.flow && Array.isArray(proj.flow.phases) && proj.flow.phases.length) return proj.flow;
  return LEGACY_TEMPLATES[proj.template] || LEGACY_TEMPLATES.standard;
}
/* Ticks are stored as {criterionId: true}. Older projects stored a boolean array by position, so accept both. */
function gatesMap(def, raw) {
  const m = {};
  def.gates.forEach((g, i) => { m[g.id] = Array.isArray(raw) ? !!raw[i] : !!(raw && raw[g.id]); });
  return m;
}

/* ---- per-project state ---- */
function blankPhase(def) {
  return { status: 'not_started', gates: gatesMap(def, null), reopened: 0, decisions: [], notes: '', log: [], actions: [], evidence: {}, completedAt: '', diagrams: [] };
}
function openActions(tpl, proj) {
  return tpl.phases.reduce((n, d) => n + (phaseState(proj, d).actions || []).filter(a => !a.done).length, 0);
}
function blankProject(name, flow, owner, lead) {
  const copy = clone({ name: flow.name, phases: flow.phases });
  const phases = {};
  copy.phases.forEach(d => { phases[d.id] = blankPhase(d); });
  return { name: name, template: flow.key || 'custom', flow: copy, owner: owner || '', lead: lead || '', started: today(), phases: phases, updatedAt: Date.now() };
}
function phaseState(proj, def) {
  const st = (proj.phases && proj.phases[def.id]) || blankPhase(def);
  const out = Object.assign(blankPhase(def), st);
  out.gates = gatesMap(def, st.gates);
  return out;
}
function gateCount(def, st) { return def.gates.filter(g => st.gates && st.gates[g.id]).length; }
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
  const gates = gatesMap(def, st.gates);
  gates[def.gates[i].id] = checked;
  st.gates = gates;
  const vals = def.gates.map(g => gates[g.id]);
  const all = vals.every(Boolean), any = vals.some(Boolean);
  if (st.status === 'done' && !all) { st.status = 'reopened'; st.completedAt = ''; st.reopened = (st.reopened || 0) + 1; return 'Reopened: a criterion was unchecked'; }
  if (all && st.status !== 'done') { st.status = 'done'; st.completedAt = today(); return 'All exit criteria met'; }
  if (st.status === 'not_started' && any) { st.status = 'in_progress'; return 'Started'; }
  return null;
}

/* ---- renderers ---- */
function railHTML(tpl, proj, o) {
  o = o || {};
  const items = tpl.phases.map((d, i) => {
    const st = phaseState(proj, d), prev = i ? phaseState(proj, tpl.phases[i - 1]) : null;
    const meta = STATUS[st.status] || STATUS.not_started;
    const sub = d.gates.length ? gateCount(d, st) + ' of ' + d.gates.length + ' criteria' : 'No criteria yet';
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
    const segs = d.gates.length ? d.gates.map((_, i) => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('') : '<i></i>';
    return '<div class="bar-g ' + meta.cls + '" style="flex:' + Math.max(1, d.gates.length) + '" title="' + esc(d.name + ': ' + (d.gates.length ? n + ' of ' + d.gates.length : 'no criteria yet')) + '">' + segs + '</div>';
  });
  return '<div class="bar" role="img" aria-label="Exit criteria met per phase">' + groups.join('') + '</div>';
}
function phaseHTML(def, st, idx, o) {
  o = o || {};
  const meta = STATUS[st.status] || STATUS.not_started, n = gateCount(def, st), edit = o.mode === 'edit';
  const idp = o.idp || '';
  const gates = def.gates.map((g, i) => {
    const id = idp + 'g-' + def.id + '-' + i, key = def.id + ':' + g.id;
    const note = (st.evidence && st.evidence[g.id]) || '';
    const noteEditing = edit && o.editingNote === key;
    if (edit && o.editingGate === key) {
      return '<li><form class="crit-form" data-crit-form="' + esc(g.id) + '" data-phase="' + def.id + '"><input class="field" id="crit-' + def.id + '-' + esc(g.id) + '" data-crit-input="1" value="' + esc(g.text) + '" autocomplete="off" aria-label="Edit exit criterion">' +
        '<button class="btn small primary" type="submit">Save</button><button class="btn small" type="button" data-crit-cancel="1">Cancel</button></form></li>';
    }
    const tools = !edit ? '' : '<span class="crit-btns"><button type="button" class="link-btn" data-crit-edit="' + esc(g.id) + '" data-phase="' + def.id + '" aria-label="Edit criterion: ' + esc(g.text) + '">Edit</button>' +
      '<button type="button" class="link-btn" data-note-edit="' + esc(g.id) + '" data-phase="' + def.id + '" aria-label="' + (note ? 'Edit' : 'Add') + ' note for: ' + esc(g.text) + '">' + (note ? 'Edit note' : 'Add note') + '</button>' +
      (def.gates.length < 2 ? '' : (o.confirmCrit === key
        ? '<button type="button" class="btn small danger" data-crit-del="' + esc(g.id) + '" data-phase="' + def.id + '">Remove criterion</button>'
        : '<button type="button" class="x" data-crit-del="' + esc(g.id) + '" data-phase="' + def.id + '" aria-label="Remove criterion: ' + esc(g.text) + '">&times;</button>')) + '</span>';
    const noteBlock = noteEditing
      ? '<form class="note-form" data-note-form="' + esc(g.id) + '" data-phase="' + def.id + '"><textarea class="field" id="note-' + def.id + '-' + esc(g.id) + '" data-note-input="1" maxlength="1000" placeholder="What was agreed or produced? Paste text or a link." aria-label="Note for ' + esc(g.text) + '">' + esc(note) + '</textarea><div class="note-btns"><button class="btn small primary" type="submit">Save note</button><button class="btn small" type="button" data-note-cancel="1">Cancel</button></div></form>'
      : (note ? '<p class="crit-note">' + noteHTML(note) + '</p>' : '');
    return '<li class="crit-row"><div class="crit-main"><label class="gate" for="' + id + '"><input type="checkbox" id="' + id + '" data-phase="' + def.id + '" data-gate="' + i + '"' + (st.gates && st.gates[g.id] ? ' checked' : '') + (edit ? '' : ' disabled') + '><span>' + esc(g.text) + '</span></label>' + noteBlock + '</div>' + tools + '</li>';
  }).join('');
  const critAdd = edit ? '<form class="dec-add" data-crit-add="' + def.id + '" style="margin-top:8px"><input class="field" id="newcrit-' + def.id + '" autocomplete="off" placeholder="Add an exit criterion" aria-label="New exit criterion for ' + esc(def.name) + '"><button class="btn" type="submit">Add</button></form>' : '';
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
      '<div class="act-meta">' + who + due + (a.done && a.doneAt ? '<span class="due mono">Done ' + esc(a.doneAt) + '</span>' : '') + (late && edit ? '<span class="late">Overdue</span>' : '') + '</div></div>' +
      (edit ? '<button type="button" class="x" data-del-action="' + esc(a.id) + '" data-phase="' + def.id + '" aria-label="Remove action: ' + esc(a.text) + '">&times;</button>' : '') + '</li>';
  }).join('');
  const actBlock = '<div><p class="sub">Action items' + (acts.length ? ' <span class="cnt">' + openN + ' open</span>' : '') + '</p>' +
    (actList ? '<ul class="gates">' + actList + '</ul>' : '<p class="note">No action items.</p>') +
    (edit ? '<form class="act-add" data-addaction="' + def.id + '"><input class="field" id="' + idp + 'newact-' + def.id + '" autocomplete="off" placeholder="Add an action item" aria-label="New action item for ' + esc(def.name) + '"><select class="field" id="' + idp + 'newwho-' + def.id + '" aria-label="Assignee"><option value="">Unassigned</option>' + people.map(x => '<option>' + esc(x) + '</option>').join('') + '</select><input class="field" type="date" id="' + idp + 'newdue-' + def.id + '" aria-label="Due date"><button class="btn" type="submit">Add</button></form>' : '') + '</div>';
  const loop = st.reopened > 0 ? '<p class="loop">' + icon('reopened', 16) + 'Reopened ' + st.reopened + (st.reopened === 1 ? ' time' : ' times') + '</p>' : '';
  return '<article class="phase ' + meta.cls + '" id="' + idp + 'ph-' + def.id + '">' +
    '<div class="ph-head"><span class="ph-idx">' + String(idx + 1).padStart(2, '0') + '</span><h3>' + esc(def.name) + '</h3>' + pill(st.status) + (st.status === 'done' && st.completedAt ? '<span class="ph-date">Completed ' + esc(st.completedAt) + '</span>' : '') +
    '<span class="ph-count">' + (def.gates.length ? n + '/' + def.gates.length + ' criteria' : 'No criteria') + '</span></div>' +
    '<p class="ph-goal">' + esc(def.goal) + '</p>' + loop +
    '<div class="ph-cols"><div class="stack"><div><p class="sub">Exit criteria</p>' + (def.gates.length ? '<ul class="gates">' + gates + '</ul>' : '<p class="note">' + (edit ? 'No exit criteria yet. Add at least one below to track this phase. It cannot be completed until it has criteria.' : 'No exit criteria set.') + '</p>') + critAdd + '</div>' + actBlock + '</div>' +
    '<div class="stack"><div><p class="sub">Decisions</p>' + (decs ? '<ul class="decs">' + decs + '</ul>' : '<p class="note">None recorded.</p>') + '</div>' + diagramsHTML(def, st, o) +
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
  if (isComplete(p)) return doneCardHTML(id, p, when);
  const tpl = tplOf(p), s = summarize(tpl, p), open = openActions(tpl, p);
  const cur = s.current, curSt = cur ? phaseState(p, cur) : null;
  const icons = tpl.phases.map((d, i) => {
    const st = phaseState(p, d), prev = i ? phaseState(p, tpl.phases[i - 1]) : null;
    return (i ? '<i class="' + (prev.status === 'done' ? 'd' : '') + '"></i>' : '') + '<span class="' + STATUS[st.status].cls + '" title="' + esc(d.name + ': ' + STATUS[st.status].label) + '">' + icon(st.status, 18) + '</span>';
  }).join('');
  return '<button class="card" type="button" data-open="' + esc(id) + '">' +
    '<div><h2>' + esc(p.name) + '</h2>' + ([p.owner, isArchived(p) ? 'archived' : ''].filter(Boolean).length ? '<p class="meta">' + esc([p.owner, isArchived(p) ? 'archived' : ''].filter(Boolean).join(' / ')) + '</p>' : '') + (p.summary ? '<p class="summary">' + esc(p.summary) + '</p>' : '') + '</div>' +
    '<div class="now">' + (cur ? '<span class="phase-badge">' + esc(cur.short) + '</span>' + pill(curSt.status) : pill('done') + '<span>All phases complete</span>') + '</div>' +
    '<div class="mini" aria-hidden="true">' + icons + '</div>' + barHTML(tpl, p) +
    '<div class="foot"><span>' + (s.gt ? s.g + ' of ' + s.gt + ' criteria' : 'No exit criteria yet') + (open ? ' / ' + open + ' open action' + (open === 1 ? '' : 's') : '') + '</span><span>' + esc(projectCompletedOn(p) ? 'Completed ' + projectCompletedOn(p) : (when || '')) + '</span></div></button>';
}

/* ---- project overview: owner, stakeholders, SMEs, target date ---- */
function listOf(v) { return Array.isArray(v) ? v : []; }
function parseList(text) { return String(text || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean); }
function overviewHTML(p, edit) {
  const s = summarize(tplOf(p), p), late = p.target && s.current && p.target < today();
  const chips = a => a.length ? '<ul class="chips">' + a.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<span class="none">Not set</span>';
  if (edit) {
    return '<section class="overview" aria-label="Project overview"><div class="ov-grid">' + summaryHTML(p, true) +
      '<div class="ov"><label class="sub" for="ov-owner">Owner</label><input class="field" id="ov-owner" data-ov="owner" autocomplete="off" placeholder="One name" value="' + esc(p.owner || '') + '"><p class="msg">Accountable for the outcome</p></div>' +
      '<div class="ov"><label class="sub" for="ov-lead">Lead</label><input class="field" id="ov-lead" data-ov="lead" autocomplete="off" placeholder="One name" value="' + esc(p.lead || '') + '"><p class="msg">Runs the work day to day</p></div>' +
      '<div class="ov"><label class="sub" for="ov-stakeholders">Stakeholders</label><input class="field" id="ov-stakeholders" data-ov="stakeholders" autocomplete="off" placeholder="Names, separated by commas" value="' + esc(listOf(p.stakeholders).join(', ')) + '"></div>' +
      '<div class="ov"><label class="sub" for="ov-smes">SMEs</label><input class="field" id="ov-smes" data-ov="smes" autocomplete="off" placeholder="Names, separated by commas" value="' + esc(listOf(p.smes).join(', ')) + '"></div>' +
      '<div class="ov"><label class="sub" for="ov-target">Target date</label><input class="field" type="date" id="ov-target" data-ov="target" value="' + esc(p.target || '') + '">' + (late ? '<p class="late">Past the target date</p>' : '') + '</div>' +
      (needsCompletedOn(p) ? '<div class="ov"><label class="sub" for="ov-completedOn">Completed on</label><input class="field" type="date" id="ov-completedOn" data-ov="completedOn" value="' + esc(p.completedOn || '') + '"><p class="msg">Not recorded for this project. Set it so it appears in your year in review.</p></div>' : '') + '</div></section>';
  }
  return '<section class="overview" aria-label="Project overview">' + summaryHTML(p, false) + '<div class="ov-grid">' +
    '<div class="ov"><p class="sub">Owner</p><p>' + (p.owner ? esc(p.owner) : '<span class="none">Not set</span>') + '</p><p class="msg">Accountable for the outcome</p></div>' +
    '<div class="ov"><p class="sub">Lead</p><p>' + (p.lead ? esc(p.lead) : '<span class="none">Not set</span>') + '</p><p class="msg">Runs the work day to day</p></div>' +
    '<div class="ov"><p class="sub">Stakeholders</p>' + chips(listOf(p.stakeholders)) + '</div>' +
    '<div class="ov"><p class="sub">SMEs</p>' + chips(listOf(p.smes)) + '</div>' +
    '<div class="ov"><p class="sub">Target date</p><p>' + (p.target ? '<span class="mono">' + esc(p.target) + '</span>' : '<span class="none">Not set</span>') + '</p>' + (late ? '<p class="late">Past the target date</p>' : '') + '</div></div></section>';
}

/* ---- summary, risks and constraints, outcomes ---- */
function summaryHTML(p, edit) {
  if (edit) return '<div class="ov wide"><label class="sub" for="ov-summary">Goal in one line</label><input class="field" id="ov-summary" data-ov="summary" maxlength="160" autocomplete="off" placeholder="What does this project deliver, and for whom?" value="' + esc(p.summary || '') + '"></div>';
  return p.summary ? '<p class="lead">' + esc(p.summary) + '</p>' : '';
}
/* A risk moves through four states. Entries saved before statuses existed read as open, or mitigated when ticked. */
const RISK_STATUS = { open: 'Open', monitoring: 'Monitoring', mitigated: 'Mitigated', occurred: 'Occurred' };
function riskStatus(r) { return RISK_STATUS[r.status] ? r.status : (r.resolved ? 'mitigated' : 'open'); }
function risksHTML(p, edit) {
  const rs = Array.isArray(p.risks) ? p.risks : [];
  const n = { open: 0, monitoring: 0, occurred: 0, constraints: 0 };
  rs.forEach(r => {
    if (r.kind === 'constraint') { if (!r.resolved) n.constraints++; return; }
    const s = riskStatus(r);
    if (n[s] !== undefined) n[s]++;
  });
  const parts = [n.open + ' open'];
  if (n.monitoring) parts.push(n.monitoring + ' monitoring');
  if (n.occurred) parts.push(n.occurred + ' occurred');
  if (n.constraints) parts.push(n.constraints + (n.constraints === 1 ? ' constraint' : ' constraints'));
  const rows = rs.map(r => {
    const del = edit ? '<button type="button" class="x" data-del-risk="' + esc(r.id) + '" aria-label="Remove: ' + esc(r.text) + '">&times;</button>' : '';
    if (r.kind === 'constraint') {
      // A constraint is a standing limit, not a task, so it has no status; it can be lifted if it stops applying.
      const lifted = !!r.resolved;
      return '<li class="risk' + (lifted ? ' is-lifted' : '') + '"><span class="kind k-constraint">Constraint</span><span class="rtext">' + esc(r.text) + '</span>' +
        (lifted ? '<span class="lifted-tag">Lifted</span>' : '') +
        (edit ? '<button type="button" class="btn small" data-lift-risk="' + esc(r.id) + '" aria-label="' + (lifted ? 'Restore' : 'Lift') + ' constraint: ' + esc(r.text) + '">' + (lifted ? 'Restore' : 'Lift') + '</button>' : '') + del + '</li>';
    }
    const s = riskStatus(r);
    const control = edit
      ? '<select class="field mini-sel rs-sel rs-' + s + '" data-risk-status="' + esc(r.id) + '" aria-label="Status of risk: ' + esc(r.text) + '">' + Object.keys(RISK_STATUS).map(k => '<option value="' + k + '"' + (k === s ? ' selected' : '') + '>' + RISK_STATUS[k] + '</option>').join('') + '</select>'
      : '<span class="rstatus rs-' + s + '">' + RISK_STATUS[s] + '</span>';
    return '<li class="risk' + (s === 'mitigated' ? ' is-lifted' : '') + '"><span class="kind k-risk">Risk</span><span class="rtext">' + esc(r.text) + '</span>' + control + del + '</li>';
  }).join('');
  return '<section class="panel-block" aria-label="Risks and constraints"><p class="sub">Risks and constraints' + (rs.length ? ' <span class="cnt">' + parts.join(' / ') + '</span>' : '') + '</p>' +
    (rows ? '<ul class="gates">' + rows + '</ul>' : '<p class="note">None recorded.</p>') +
    (edit ? '<p class="msg">Set a risk\'s status as things change. Monitoring is for a risk you cannot solve or cannot predict. Lift a constraint if it no longer applies.</p><form class="dec-add" data-addrisk="1"><select class="field sel" id="risk-kind" aria-label="Type"><option value="risk">Risk</option><option value="constraint">Constraint</option></select><input class="field" id="risk-text" autocomplete="off" placeholder="Describe it" aria-label="Risk or constraint"><button class="btn" type="submit">Add</button></form>' : '') + '</section>';
}

/* people who can own an action item: owner, lead, stakeholders, SMEs */
function peopleOf(p) {
  const all = [p.owner, p.lead].concat(listOf(p.stakeholders), listOf(p.smes)).filter(Boolean);
  return all.filter((x, i) => all.indexOf(x) === i);
}
function overdueActions(tpl, proj) {
  return tpl.phases.reduce((n, d) => n + (phaseState(proj, d).actions || []).filter(a => !a.done && a.due && a.due < today()).length, 0);
}

/* ---- flow editing: pure helpers shared by the app and its checks ---- */
function blankDraftPhase(idGen) {
  return { id: 'p' + idGen(), name: '', short: '', goal: '', gates: [{ id: 'g' + idGen(), text: '' }] };
}
function phaseHasProgress(proj, phaseId) {
  const st = proj.phases && proj.phases[phaseId];
  if (!st) return false;
  const g = Array.isArray(st.gates) ? st.gates : Object.keys(st.gates || {}).map(k => st.gates[k]);
  return g.some(Boolean) || (st.decisions || []).length > 0 || (st.actions || []).length > 0 || !!st.notes || (st.diagrams || []).length > 0;
}
/* Trims a draft and returns {errors, flow}. Empty criteria are dropped; short labels fall back to the name. */
function cleanFlow(d) {
  const errors = [], name = String(d.name || '').trim();
  if (!name) errors.push('Give the flow a name.');
  const phases = (d.phases || []).map((p, pi) => {
    const pn = String(p.name || '').trim(), label = pn || 'Phase ' + (pi + 1);
    if (!pn) errors.push('Phase ' + (pi + 1) + ' needs a name.');
    const gates = (p.gates || []).map(g => ({ id: g.id, text: String(g.text || '').trim() })).filter(g => g.text);
    return { id: p.id, name: pn, short: String(p.short || '').trim().slice(0, 16) || pn.slice(0, 16), goal: String(p.goal || '').trim(), gates: gates };
  });
  if (!phases.length) errors.push('Add at least one phase.');
  return { errors: errors, flow: { name: name, phases: phases } };
}
/* Rebuilds a project's per-phase state for an edited flow. Ticks follow their criterion id; a done phase
   that gained a criterion is reopened. Legacy index-based ticks are converted using the old flow. */
function reconcileProject(proj, flow) {
  const oldTpl = tplOf(proj), phases = {};
  flow.phases.forEach(def => {
    const raw = (proj.phases && proj.phases[def.id]) || null;
    const st = Object.assign(blankPhase(def), raw || {});
    const oldDef = oldTpl.phases.find(d => d.id === def.id);
    let carried = {};
    if (raw && Array.isArray(raw.gates) && oldDef) oldDef.gates.forEach((g, i) => { carried[g.id] = !!raw.gates[i]; });
    else if (raw && raw.gates && !Array.isArray(raw.gates)) carried = raw.gates;
    st.gates = gatesMap(def, carried);
    // Keep notes only for criteria that still exist.
    st.evidence = Object.fromEntries(def.gates.filter(g => st.evidence && st.evidence[g.id]).map(g => [g.id, st.evidence[g.id]]));
    if (st.status === 'done' && !def.gates.every(g => st.gates[g.id])) {
      st.status = 'reopened';
      st.completedAt = '';
      st.reopened = (st.reopened || 0) + 1;
      st.log = (st.log || []).concat([{ at: today(), text: 'Reopened: exit criteria changed' }]).slice(-12);
    } else if (st.status !== 'done' && def.gates.length && def.gates.every(g => st.gates[g.id])) {
      st.status = 'done';
      st.completedAt = today();
      st.log = (st.log || []).concat([{ at: today(), text: 'All exit criteria met' }]).slice(-12);
    }
    phases[def.id] = st;
  });
  return phases;
}
function editorRowButtons(kind, pi, i, n, label) {
  return '<span class="fe-btns">' +
    '<button type="button" class="x" data-fe-act="' + kind + '-up" data-p="' + pi + '" data-i="' + i + '" aria-label="Move ' + label + ' up"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button>' +
    '<button type="button" class="x" data-fe-act="' + kind + '-down" data-p="' + pi + '" data-i="' + i + '" aria-label="Move ' + label + ' down"' + (i === n - 1 ? ' disabled' : '') + '>&darr;</button>' +
    '<button type="button" class="x" data-fe-act="' + kind + '-del" data-p="' + pi + '" data-i="' + i + '" aria-label="Remove ' + label + '">&times;</button></span>';
}
/* ed: {title, intro, draft, errors, confirmDel, projectMode} */
function flowEditorHTML(ed) {
  const d = ed.draft, last = d.phases.length - 1;
  const errs = ed.errors && ed.errors.length ? '<ul class="fe-errors" role="alert">' + ed.errors.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>' : '';
  const phases = d.phases.map((p, pi) => {
    const gates = p.gates.map((g, gi) => '<li class="fe-row"><input class="field" id="fe-gate-' + pi + '-' + gi + '" data-fe="gate" data-p="' + pi + '" data-i="' + gi + '" value="' + esc(g.text) + '" placeholder="What must be true to finish this phase?" aria-label="Exit criterion ' + (gi + 1) + ' of ' + esc(p.name || 'phase ' + (pi + 1)) + '">' + editorRowButtons('gate', pi, gi, p.gates.length, 'criterion') + '</li>').join('');
    const confirm = ed.confirmDel === 'p' + pi;
    return '<section class="fe-phase" aria-label="Phase ' + (pi + 1) + '"><div class="ph-head"><span class="ph-idx">' + String(pi + 1).padStart(2, '0') + '</span><h3>' + esc(p.name || 'New phase') + '</h3><span class="fe-btns" style="margin-left:auto">' +
      '<button type="button" class="x" data-fe-act="p-up" data-p="' + pi + '" aria-label="Move phase up"' + (pi === 0 ? ' disabled' : '') + '>&uarr;</button>' +
      '<button type="button" class="x" data-fe-act="p-down" data-p="' + pi + '" aria-label="Move phase down"' + (pi === last ? ' disabled' : '') + '>&darr;</button>' +
      '<button type="button" class="btn' + (confirm ? ' danger' : '') + '" data-fe-act="p-del" data-p="' + pi + '">' + (confirm ? 'Remove phase and its progress' : 'Remove phase') + '</button></span></div>' +
      '<div class="fe-grid"><label for="fe-pname-' + pi + '">Name<input class="field" id="fe-pname-' + pi + '" data-fe="pname" data-p="' + pi + '" value="' + esc(p.name) + '" autocomplete="off"></label>' +
      '<label for="fe-pshort-' + pi + '">Short label<input class="field" id="fe-pshort-' + pi + '" data-fe="pshort" data-p="' + pi + '" maxlength="16" value="' + esc(p.short) + '" placeholder="Shown on the progress rail" autocomplete="off"></label></div>' +
      '<label for="fe-pgoal-' + pi + '">Goal<textarea class="field" id="fe-pgoal-' + pi + '" data-fe="pgoal" data-p="' + pi + '" placeholder="One sentence on what this phase achieves">' + esc(p.goal) + '</textarea></label>' +
      '<div><p class="sub">Exit criteria</p>' + (p.gates.length ? '' : '<p class="note">None in this flow. A project using it must add its own before the phase can be completed.</p>') + '<ul class="fe-list">' + gates + '</ul><button type="button" class="btn" data-fe-act="gate-add" data-p="' + pi + '">Add criterion</button></div>' +
      '</section>';
  }).join('');
  return '<div><p class="eyebrow">' + esc(ed.title) + '</p><h1>' + esc(d.name || 'Untitled flow') + '</h1></div>' +
    (ed.intro ? '<p class="msg">' + esc(ed.intro) + '</p>' : '') + errs +
    '<div class="fe-top"><label for="fe-name">Flow name<input class="field" id="fe-name" data-fe="name" value="' + esc(d.name) + '" autocomplete="off"></label></div>' +
    phases +
    '<div class="ph-row"><button type="button" class="btn" data-fe-act="p-add">Add phase</button><span style="margin-left:auto;display:flex;gap:8px"><button type="button" class="btn" data-fe-act="cancel">Cancel</button><button type="button" class="btn primary" data-fe-act="save">' + (ed.projectMode ? 'Save phases' : 'Save flow') + '</button></span></div>';
}

/* ---- completion dates, archive, year in review ---- */
function isComplete(p) { return !summarize(tplOf(p), p).current; }
function isArchived(p) { return !!p.archived; }
/* A project finished when its last phase did. Phases stamp their own date; older projects have none, so
   fall back to a date the user entered by hand. */
function projectCompletedOn(p) {
  if (!isComplete(p)) return '';
  const dates = tplOf(p).phases.map(d => phaseState(p, d).completedAt || '');
  return dates.every(Boolean) ? dates.slice().sort().pop() : (p.completedOn || '');
}
function needsCompletedOn(p) {
  return isComplete(p) && tplOf(p).phases.some(d => !phaseState(p, d).completedAt);
}
/* list: [{id, p}]. Archived projects only appear under the 'archived' filter. */
function filterProjects(list, filter) {
  return list.filter(i => {
    if (filter === 'archived') return isArchived(i.p);
    if (isArchived(i.p)) return false;
    const s = summarize(tplOf(i.p), i.p);
    return filter === 'all' || (filter === 'attention' && s.attention) || (filter === 'done' && !s.current);
  });
}
function filterCounts(list) {
  return { all: filterProjects(list, 'all').length, attention: filterProjects(list, 'attention').length, done: filterProjects(list, 'done').length, archived: filterProjects(list, 'archived').length };
}
function filterChipsHTML(list, filter) {
  const c = filterCounts(list);
  const chips = [['all', 'All', c.all], ['attention', 'Needs attention', c.attention], ['done', 'Complete', c.done]];
  if (c.archived || filter === 'archived') chips.push(['archived', 'Archived', c.archived]);
  return chips.map(x => '<button class="chip" type="button" data-filter="' + x[0] + '" aria-pressed="' + (filter === x[0]) + '">' + x[1] + ' ' + x[2] + '</button>').join('');
}

/* Everything a year in review needs, from {id: project}. */
function reviewData(projects, year) {
  const y = String(year), inYear = d => !!d && String(d).slice(0, 4) === y;
  const out = { year: y, completed: [], undated: [], wins: [], actions: [], decisions: [] };
  Object.keys(projects).forEach(id => {
    const p = projects[id], tpl = tplOf(p), complete = isComplete(p), on = projectCompletedOn(p);
    const doneThisYear = complete && inYear(on);
    if (doneThisYear) out.completed.push({ id: id, p: p, on: on });
    else if (complete && !on) out.undated.push({ id: id, p: p });
    tpl.phases.forEach(d => {
      const st = phaseState(p, d);
      if (st.status === 'done' && inYear(st.completedAt) && !doneThisYear) out.wins.push({ project: p.name, phase: d.name, on: st.completedAt });
      (st.actions || []).forEach(a => { if (a.done && inYear(a.doneAt)) out.actions.push({ project: p.name, phase: d.short || d.name, text: a.text, who: a.assignee || '', on: a.doneAt }); });
      (st.decisions || []).forEach(x => { if (inYear(x.at)) out.decisions.push({ project: p.name, phase: d.short || d.name, at: x.at, text: x.text }); });
    });
  });
  const newest = (a, b) => (a < b ? 1 : a > b ? -1 : 0);
  out.completed.sort((a, b) => newest(a.on, b.on));
  out.wins.sort((a, b) => newest(a.on, b.on));
  out.actions.sort((a, b) => newest(a.on, b.on));
  out.decisions.sort((a, b) => newest(a.at, b.at));
  return out;
}
/* Years with something to look back on, newest first; the current year is always offered. */
function reviewYears(projects) {
  const set = {};
  const add = d => { if (d && /^\d{4}/.test(String(d))) set[String(d).slice(0, 4)] = true; };
  set[String(new Date().getFullYear())] = true;
  Object.keys(projects).forEach(id => {
    const p = projects[id];
    add(p.started); add(projectCompletedOn(p));
    tplOf(p).phases.forEach(d => {
      const st = phaseState(p, d);
      add(st.completedAt);
      (st.actions || []).forEach(a => add(a.doneAt));
      (st.decisions || []).forEach(x => add(x.at));
    });
  });
  return Object.keys(set).sort().reverse();
}
function reviewHTML(d) {
  const metricRows = p => metricRowsHTML(p, false);
  const metricsN = d.completed.reduce((n, c) => n + ((c.p.outcomes || {}).metrics || []).length, 0);
  const stat = (n, label) => '<div class="rv-stat"><b>' + n + '</b><span>' + label + '</span></div>';
  const mine = (list, name) => list.filter(x => x.project === name);
  const proj = c => {
    const p = c.p, o = p.outcomes || {}, rows = metricRows(p);
    const decs = d.decisions.filter(x => x.project === p.name), acts = mine(d.actions, p.name);
    return '<article class="rv-proj"><div><h2>' + esc(p.name) + '</h2><p class="meta">' + esc([p.owner ? 'owner ' + p.owner : '', p.lead ? 'lead ' + p.lead : '', (p.started || '?') + ' to ' + c.on].filter(Boolean).join(' / ')) + '</p></div>' +
      (p.summary ? '<p class="lead" style="margin:0">' + esc(p.summary) + '</p>' : '') +
      '<div><p class="sub">Value added</p>' + (o.value ? '<div class="rt">' + bulletsHTML(o.value) + '</div>' : '<p class="note">Not recorded.</p>') + '</div>' +
      (o.lessons ? '<div><p class="sub">Lessons learned</p><div class="rt">' + bulletsHTML(o.lessons) + '</div></div>' : '') +
      (rows ? '<div><p class="sub">Metrics</p><ul class="metric-tiles">' + rows + '</ul></div>' : '') +
      (decs.length ? '<details><summary>' + decs.length + (decs.length === 1 ? ' decision' : ' decisions') + '</summary><ul class="decs">' + decs.map(x => '<li><time>' + esc(x.at) + '</time><span><b>' + esc(x.phase) + ':</b> ' + esc(x.text) + '</span></li>').join('') + '</ul></details>' : '') +
      (acts.length ? '<details><summary>' + acts.length + (acts.length === 1 ? ' action item completed' : ' action items completed') + '</summary><ul class="decs">' + acts.map(x => '<li><time>' + esc(x.on) + '</time><span>' + esc(x.text) + (x.who ? ' <span class="who">(' + esc(x.who) + ')</span>' : '') + '</span></li>').join('') + '</ul></details>' : '') + '</article>';
  };
  const wins = d.wins.length ? '<section class="panel-block"><p class="sub">Other progress this year</p><ul class="decs">' + d.wins.map(w => '<li><time>' + esc(w.on) + '</time><span>' + esc(w.project) + ': ' + esc(w.phase) + ' completed</span></li>').join('') + '</ul></section>' : '';
  const undated = d.undated.length ? '<section class="panel-block"><p class="sub">Completed, date not recorded</p><p class="msg">Open each project and set its Completed on date so it appears in the right year.</p><ul class="chips">' + d.undated.map(u => '<li>' + esc(u.p.name) + '</li>').join('') + '</ul></section>' : '';
  const allActs = d.actions.length ? '<details class="panel-block"><summary>All ' + d.actions.length + ' action items completed this year</summary><ul class="decs">' + d.actions.map(x => '<li><time>' + esc(x.on) + '</time><span>' + esc(x.project) + ' / ' + esc(x.phase) + ': ' + esc(x.text) + (x.who ? ' <span class="who">(' + esc(x.who) + ')</span>' : '') + '</span></li>').join('') + '</ul></details>' : '';
  return '<div><p class="eyebrow">Year in review</p><h1>' + esc(d.year) + '</h1></div>' +
    '<div class="rv-stats">' + stat(d.completed.length, d.completed.length === 1 ? 'project completed' : 'projects completed') + stat(d.actions.length, 'action items completed') + stat(d.decisions.length, 'decisions recorded') + stat(metricsN, 'metrics from completed projects') + valueStatsHTML(valueTotals(d.completed)) + '</div>' +
    (d.completed.length ? '<div class="rv-list">' + d.completed.map(proj).join('') + '</div>' : '<div class="empty"><h2>No projects completed in ' + esc(d.year) + ' yet</h2><p>A project is completed when its last phase is done. Its completion date comes from that moment.</p></div>') +
    wins + undated + allActs;
}

/* The line above a project's title: who owns it and when it started and finished. */
function projectMeta(p) {
  const done = projectCompletedOn(p);
  return esc([p.owner, p.started ? 'started ' + p.started : '', done ? 'completed ' + done : ''].filter(Boolean).join(' / '));
}

/* ---- value metrics: before/after changes and amounts saved or gained ---- */
const METRIC_UNITS = { hours: 'Hours', cost: 'Cost ($)', count: 'Count', percent: 'Percent (%)' };
const METRIC_PERIODS = { once: 'One-time', week: 'Per week', month: 'Per month', year: 'Per year' };
const PERIOD_SUFFIX = { once: '', week: '/week', month: '/month', year: '/year' };
/* How many times a recurring amount repeats in a year, for the estimated annual totals. */
const PERIOD_PER_YEAR = { week: 52, month: 12, year: 1 };
function isAmount(m) { return m && m.kind === 'amount'; }
function fmtNum(n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
function parseAmount(text) {
  const t = String(text == null ? '' : text).replace(/[,$\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}
/* "6 hrs", "$12,000", "15%", "1,200", with "/week" style suffix when asked for. */
function amountText(m, withPeriod) {
  const n = Number(m.amount) || 0;
  let base;
  if (m.unit === 'cost') base = (n < 0 ? '-$' : '$') + fmtNum(Math.abs(n));
  else if (m.unit === 'hours') base = fmtNum(n) + (n === 1 ? ' hr' : ' hrs');
  else if (m.unit === 'percent') base = fmtNum(n) + '%';
  else base = fmtNum(n);
  return base + (withPeriod ? (PERIOD_SUFFIX[m.period] || '') : '');
}
function metricTileText(m) { return isAmount(m) ? amountText(m, true) : (m.before || '-') + ' to ' + (m.after || '-'); }
/* The metrics shown on a finished project's card: amounts first (they are the headline), then before/after. */
function headlineMetrics(p, max) {
  const ms = Array.isArray((p.outcomes || {}).metrics) ? p.outcomes.metrics : [];
  return ms.filter(isAmount).concat(ms.filter(m => !isAmount(m))).slice(0, max);
}
function projectCounts(p) {
  let decisions = 0, actions = 0;
  tplOf(p).phases.forEach(d => { const st = phaseState(p, d); decisions += (st.decisions || []).length; actions += (st.actions || []).filter(a => a.done).length; });
  return { decisions: decisions, actions: actions };
}
/* One tile per metric: the number large, its name under it, and a small note (how often, or the starting value). */
function metricRowsHTML(p, edit) {
  const ms = Array.isArray((p.outcomes || {}).metrics) ? p.outcomes.metrics : [];
  return ms.map(m => {
    const del = edit ? '<button type="button" class="x mt-del" data-del-metric="' + esc(m.id) + '" aria-label="Remove metric ' + esc(m.name) + '">&times;</button>' : '';
    return isAmount(m)
      ? '<li class="mtile"><b class="mt-val">' + esc(amountText(m, false)) + '</b><span class="mt-name">' + esc(m.name) + '</span><span class="mt-note">' + esc(METRIC_PERIODS[m.period] || 'One-time') + '</span>' + del + '</li>'
      : '<li class="mtile"><b class="mt-val">' + esc(m.after || '-') + '</b><span class="mt-name">' + esc(m.name) + '</span><span class="mt-note">Before: ' + esc(m.before || '-') + '</span>' + del + '</li>';
  }).join('');
}
function outcomesHTML(p, edit) {
  const o = p.outcomes || {};
  const done = !summarize(tplOf(p), p).current;
  const rows = metricRowsHTML(p, edit);
  const rich = text => '<div class="rt">' + bulletsHTML(text) + '</div>';
  const value = edit
    ? '<label class="sub" for="out-value">Value added</label><textarea class="field" id="out-value" data-outvalue="1" placeholder="What changed for the business or users because of this project?">' + esc(o.value || '') + '</textarea><p class="msg">Start a line with * or - to make it a bullet.</p>'
    : '<p class="sub">Value added</p>' + (o.value ? rich(o.value) : '<p class="note">Not recorded yet.</p>');
  // Lessons are written when the work is finished, so the box appears once every phase is done.
  const lessons = !done
    ? (edit ? '<p class="msg">Lessons learned can be added once every phase is done.</p>' : '')
    : (edit
      ? '<label class="sub" for="out-lessons">Lessons learned</label><textarea class="field" id="out-lessons" data-outlessons="1" placeholder="What went well, what to change next time, what you would tell the next team">' + esc(o.lessons || '') + '</textarea><p class="msg">Start a line with * or - to make it a bullet.</p>'
      : '<p class="sub">Lessons learned</p>' + (o.lessons ? rich(o.lessons) : '<p class="note">Not recorded yet.</p>'));
  const opts = (map, sel) => Object.keys(map).map(k => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(map[k]) + '</option>').join('');
  const forms = !edit ? '' : '<div class="metric-forms"><p class="sub">Add an amount saved or gained</p>' +
    '<form class="amount-add" data-addamount="1" aria-label="Add an amount saved or gained"><input class="field" id="am-name" autocomplete="off" placeholder="e.g. Hours saved" aria-label="Metric name"><input class="field" id="am-amount" inputmode="decimal" autocomplete="off" placeholder="Amount" aria-label="Amount"><select class="field" id="am-unit" aria-label="Unit">' + opts(METRIC_UNITS, 'hours') + '</select><select class="field" id="am-period" aria-label="How often">' + opts(METRIC_PERIODS, 'year') + '</select><button class="btn" type="submit">Add amount</button></form>' +
    '<p class="sub" style="margin-top:12px">Add a before and after metric</p>' +
    '<form class="metric-add" data-addmetric="1" aria-label="Add a before and after metric"><input class="field" id="m-name" autocomplete="off" placeholder="e.g. Invoices matched per hour" aria-label="Metric name"><input class="field" id="m-before" autocomplete="off" placeholder="Before" aria-label="Value before"><input class="field" id="m-after" autocomplete="off" placeholder="After" aria-label="Value after"><button class="btn" type="submit">Add metric</button></form></div>';
  return '<section class="panel-block outcomes" aria-label="Outcomes"><div class="ph-row"><div><p class="eyebrow">Outcomes</p><h2 class="out-h">Metrics collected and value added</h2></div>' +
    (done ? '' : '<span class="msg" style="margin-left:auto">Fill this in as results come in; it is complete at project end.</span>') + '</div>' +
    '<div><p class="sub">Metrics</p>' + (rows ? '<ul class="metric-tiles">' + rows + '</ul>' : '<p class="note">No metrics recorded yet.</p>') + forms + '</div>' +
    '<div>' + value + '</div>' + (lessons ? '<div>' + lessons + '</div>' : '') + '</section>';
}

/* A finished project's card leads with the value it delivered instead of progress it no longer needs to show. */
function doneCardHTML(id, p, when) {
  const on = projectCompletedOn(p), n = projectCounts(p), tiles = headlineMetrics(p, 3), o = p.outcomes || {};
  const meta = [p.owner, isArchived(p) ? 'archived' : ''].filter(Boolean).join(' / ');
  const wins = tiles.length
    ? '<div class="wins">' + tiles.map(m => '<div class="win"><b>' + esc(metricTileText(m)) + '</b><span>' + esc(m.name) + '</span></div>').join('') + '</div>'
    : (richItems(o.value).length ? '' : '<p class="msg">No value added recorded yet.</p>');
  const text = (label, t) => richItems(t).length ? '<div class="card-text"><p class="sub">' + label + '</p><div class="rt">' + bulletsHTML(t, 4) + '</div></div>' : '';
  return '<button class="card is-done" type="button" data-open="' + esc(id) + '"><div><h2>' + esc(p.name) + '</h2>' +
    (meta ? '<p class="meta">' + esc(meta) + '</p>' : '') + (p.summary ? '<p class="summary">' + esc(p.summary) + '</p>' : '') + '</div>' +
    '<div class="now">' + pill('done') + (on ? '<span>Completed ' + esc(on) + '</span>' : '') + '</div>' + wins +
    text('Value added', o.value) + text('Lessons learned', o.lessons) +
    '<div class="foot"><span>' + n.decisions + (n.decisions === 1 ? ' decision' : ' decisions') + ' / ' + n.actions + (n.actions === 1 ? ' action' : ' actions') + ' completed</span><span>' + esc(on ? '' : (when || '')) + '</span></div></button>';
}

/* Totals of amounts saved across completed projects. Recurring amounts become an estimated annual figure. */
function valueTotals(completed) {
  const t = { hours: { once: 0, annual: 0 }, cost: { once: 0, annual: 0 } };
  completed.forEach(c => ((c.p.outcomes || {}).metrics || []).filter(isAmount).forEach(m => {
    const bucket = t[m.unit], n = Number(m.amount) || 0;
    if (!bucket) return;
    if (m.period === 'once' || !PERIOD_PER_YEAR[m.period]) bucket.once += n; else bucket.annual += n * PERIOD_PER_YEAR[m.period];
  }));
  return t;
}
function valueStatsHTML(t) {
  const stat = (n, label) => '<div class="rv-stat"><b>' + esc(n) + '</b><span>' + esc(label) + '</span></div>';
  let out = '';
  if (t.hours.annual) out += stat(fmtNum(t.hours.annual) + ' hrs', 'estimated annual hours saved (recurring)');
  if (t.hours.once) out += stat(fmtNum(t.hours.once) + ' hrs', 'one-time hours saved');
  if (t.cost.annual) out += stat('$' + fmtNum(t.cost.annual), 'estimated annual cost savings (recurring)');
  if (t.cost.once) out += stat('$' + fmtNum(t.cost.once), 'one-time cost savings');
  return out;
}

/* A back-to-top button for long pages. The document and window are passed in so the same code runs in the app
   and inside an exported file. It appears once the reader is about three quarters of a screen down. */
function attachBackToTop(doc, win) {
  if (doc.getElementById('pbToTop')) return;
  const b = doc.createElement('button');
  b.id = 'pbToTop';
  b.type = 'button';
  b.className = 'pb-to-top';
  b.hidden = true;
  b.setAttribute('aria-label', 'Back to top');
  b.setAttribute('title', 'Back to top');
  b.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  b.addEventListener('click', () => {
    const reduce = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    win.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    b.blur();
  });
  doc.body.appendChild(b);
  const update = () => {
    const show = (win.scrollY || 0) > win.innerHeight * 0.75;
    b.hidden = !show;
    b.classList.toggle('is-visible', show);
  };
  win.addEventListener('scroll', update, { passive: true });
  update();
}

/* ---- diagrams: snapshots of charts saved from the Flow tool, attached to a phase ---- */
const DIAGRAM_MAX_CHARS = 250000;   // one chart's JSON, images included
const DIAGRAM_MAX_PER_PHASE = 3;
const PROJECT_MAX_CHARS = 800000;   // a project is one Firestore document (1 MiB limit)

/* Cards (not groups) and connectors in a JSON Canvas string; null when it is not a chart. */
function chartCounts(content) {
  let doc;
  try { doc = JSON.parse(content); } catch (e) { return null; }
  if (!doc || typeof doc !== 'object' || (doc.nodes && !Array.isArray(doc.nodes)) || (doc.edges && !Array.isArray(doc.edges))) return null;
  const nodes = doc.nodes || [], edges = doc.edges || [];
  return { cards: nodes.filter(n => n && n.type !== 'group').length, links: edges.length };
}
/* A saved chart (a Snippets record with extension "canvas") as a picker row, or null if unusable. */
function chartItem(s) {
  if (!s || s.extension !== 'canvas' || typeof s.content !== 'string') return null;
  const c = chartCounts(s.content);
  return c ? { snippetId: String(s.id), title: String(s.name || 'Untitled chart'), content: s.content, updatedAt: s.updatedAt || '', cards: c.cards, links: c.links } : null;
}
/* Merge charts from the cloud and this browser: one per snippet id, newest wins, newest first. */
function mergeCharts(lists) {
  const byId = {};
  lists.forEach(list => (list || []).forEach(s => {
    const it = chartItem(s);
    if (it && (!byId[it.snippetId] || Date.parse(it.updatedAt) > Date.parse(byId[it.snippetId].updatedAt || 0))) byId[it.snippetId] = it;
  }));
  return Object.keys(byId).map(k => byId[k]).sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
}
/* The stored snapshot, or {error} when it cannot be attached. */
function makeDiagram(item, id, project, phaseState_) {
  if (item.content.length > DIAGRAM_MAX_CHARS) return { error: 'That chart is too large to attach (' + Math.round(item.content.length / 1000) + ' KB; the limit is ' + Math.round(DIAGRAM_MAX_CHARS / 1000) + ' KB). Pictures inside the chart are the usual cause.' };
  if ((phaseState_.diagrams || []).length >= DIAGRAM_MAX_PER_PHASE) return { error: 'A phase can hold up to ' + DIAGRAM_MAX_PER_PHASE + ' diagrams.' };
  if (JSON.stringify(project).length + item.content.length > PROJECT_MAX_CHARS) return { error: 'This project is full. Remove a diagram first.' };
  return { diagram: { id: id, snippetId: item.snippetId, title: item.title, canvas: item.content, cards: item.cards, links: item.links, savedAt: today() } };
}
/* Markup from the Flow renderer is inserted as HTML, so refuse anything that carries script. */
function safeSvg(svg) {
  const s = String(svg || '');
  return /<script|\son[a-z]+\s*=|javascript:/i.test(s) ? '' : s;
}
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/* o: {mode, svgs, openDiagrams, picker, confirmDiagram}. Collapsed by default, so a phase with diagrams costs one line each. */
function diagramsHTML(def, st, o) {
  const list = Array.isArray(st.diagrams) ? st.diagrams : [], edit = o.mode === 'edit';
  if (!list.length && !edit) return '';
  const svgs = o.svgs || {}, open = o.openDiagrams || [], pid = def.id;
  const items = list.map(d => {
    const svg = svgs[d.id];
    const body = svg ? '<div class="dg-canvas">' + svg + '</div>' : (svg === '' ? '<p class="note">The preview could not be drawn.</p>' : '<p class="note">Drawing the diagram</p>');
    const confirm = o.confirmDiagram === pid + ':' + d.id;
    const tools = !edit ? '' : '<div class="dg-tools"><a class="link-btn" href="../flow/index.html?snippet=' + encodeURIComponent(d.snippetId) + '" target="_blank" rel="noopener noreferrer">Open in Flow</a>' +
      '<button type="button" class="link-btn" data-dg-refresh="' + esc(d.id) + '" data-phase="' + pid + '">Update from Snippets</button>' +
      (confirm ? '<button type="button" class="btn small danger" data-dg-del="' + esc(d.id) + '" data-phase="' + pid + '">Remove diagram</button>' : '<button type="button" class="link-btn" data-dg-del="' + esc(d.id) + '" data-phase="' + pid + '">Remove</button>') + '</div>';
    return '<details class="dg" data-dg="' + esc(d.id) + '"' + (open.indexOf(d.id) >= 0 ? ' open' : '') + '><summary><span class="dg-title">' + esc(d.title) + '</span><span class="dg-meta">' +
      plural(d.cards || 0, 'card', 'cards') + ', ' + plural(d.links || 0, 'connector', 'connectors') + ' / saved ' + esc(d.savedAt || '') + '</span></summary>' + body + tools + '</details>';
  }).join('');
  let attach = '';
  if (edit) {
    const pk = o.picker && o.picker.pid === pid ? o.picker : null;
    if (!pk) {
      attach = list.length >= DIAGRAM_MAX_PER_PHASE ? '<p class="msg">A phase can hold up to ' + DIAGRAM_MAX_PER_PHASE + ' diagrams.</p>'
        : '<button type="button" class="btn small" data-dg-attach="' + pid + '">Attach a diagram</button>';
    } else if (pk.loading) {
      attach = '<p class="msg">Looking for your saved Flow charts</p>';
    } else if (pk.error) {
      attach = '<p class="msg err">' + esc(pk.error) + '</p><button type="button" class="btn small" data-dg-cancel="1">Close</button>';
    } else if (!pk.items.length) {
      attach = '<p class="note">No saved Flow charts found. Draw one in <a href="../flow/index.html" target="_blank" rel="noopener noreferrer">Flow</a> and save it to Snippets (Ctrl+S), then try again.</p><button type="button" class="btn small" data-dg-cancel="1">Close</button>';
    } else {
      attach = '<ul class="dg-pick">' + pk.items.map(i => '<li><button type="button" data-dg-pick="' + esc(i.snippetId) + '" data-phase="' + pid + '"><b>' + esc(i.title) + '</b><span>' + plural(i.cards, 'card', 'cards') + ', ' + plural(i.links, 'connector', 'connectors') + '</span></button></li>').join('') + '</ul><button type="button" class="btn small" data-dg-cancel="1">Cancel</button>';
    }
  }
  return '<div><p class="sub">Diagrams</p>' + (items ? '<div class="dgs">' + items + '</div>' : '<p class="note">None attached.</p>') + attach + '</div>';
}

/* Plain text with light structure: a line starting with *, - or a bullet dot becomes a list item; other lines
   keep their line breaks; a blank line ends a paragraph or list. Everything is escaped. */
function richItems(text) {
  const lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
  const items = [];
  let para = [];
  const flush = () => { if (para.length) { items.push({ t: 'p', x: para.slice() }); para = []; } };
  lines.forEach(line => {
    const m = line.match(/^\s*[*\-\u2022]\s+(.*\S.*)$/);
    if (m) { flush(); items.push({ t: 'li', x: m[1].trim() }); }
    else if (!line.trim() || /^\s*[*\-\u2022]\s*$/.test(line)) flush();
    else para.push(line.trim());
  });
  flush();
  return items;
}
/* max (optional) shows only the first few items, then how many more there are. */
function bulletsHTML(text, max) {
  const all = richItems(text), items = max ? all.slice(0, max) : all;
  let html = '', inList = false;
  items.forEach(it => {
    if (it.t === 'li') { if (!inList) { html += '<ul class="rt-list">'; inList = true; } html += '<li>' + esc(it.x) + '</li>'; }
    else { if (inList) { html += '</ul>'; inList = false; } html += '<p class="rt-p">' + it.x.map(esc).join('<br>') + '</p>'; }
  });
  if (inList) html += '</ul>';
  if (max && all.length > max) html += '<p class="rt-more">+' + (all.length - max) + ' more</p>';
  return html;
}
