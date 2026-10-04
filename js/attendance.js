// Staff Attendance: clock in/out, breaks, corrections, live status, report builders.
import * as S from './store.js';
import * as Auth from './auth.js';
import { ui, esc, val, toast, modal, closeModal, head, clockHtml, deny, pill, kpi, table, defineView, defineActions, render, askPin } from './ui.js';
import { icon } from './icons.js';
import { fmtDT, fmtTime, hrs, durFmt, dayKey, dowOf, manilaTs, fmtKey, addDays } from './store.js';
import { logo } from './brand.js';

const can = Auth.can;
const MIN = 60e3;
export const STATUSES = ['Present', 'Late', 'Absent', 'Leave', 'Half Day', 'Undertime', 'Overtime', 'Rest Day', 'Holiday'];
const ST_CLASS = { Present: 'green', Late: 'orange', Absent: 'red', Leave: '', 'Half Day': 'orange', Undertime: 'orange', Overtime: 'green', 'Rest Day': '', Holiday: '', 'Not yet in': '' };

// ---------- computation ----------
export function compute(rec, u, nowTs = S.now()) {
  const sc = u.schedule, req = sc.hours * 60, st = manilaTs(rec.date, sc.start), grace = S.get().settings.att.graceMin;
  if (!rec.timeIn) return { worked: 0, breakMin: 0, otMin: 0, late: false, lateMin: 0, under: false, underMin: 0, half: false, status: rec.status || 'Absent', open: false };
  const open = !rec.timeOut, end = rec.timeOut || nowTs;
  const breakMin = rec.breakOverride != null ? rec.breakOverride : rec.breaks.reduce((a, b) => a + Math.max(0, ((b.end || end) - b.start) / MIN), 0);
  const worked = Math.max(0, Math.round((end - rec.timeIn) / MIN - breakMin));
  const late = rec.timeIn > st + grace * MIN, lateMin = late ? Math.round((rec.timeIn - st) / MIN) : 0;
  const otMin = Math.max(0, worked - req);
  const half = rec.status === 'Half Day' || (!open && worked > 0 && worked < req * 0.6);
  const under = !open && !half && worked < req - 15 && !rec.status;
  const underMin = under ? req - worked : 0;
  let status = rec.status && !['Present', 'Late', 'Undertime', 'Overtime'].includes(rec.status) ? rec.status : half ? 'Half Day' : late ? 'Late' : under ? 'Undertime' : otMin > 0 && !open ? 'Overtime' : 'Present';
  return { worked, breakMin: Math.round(breakMin), otMin: open ? 0 : otMin, late, lateMin, under, underMin, half, status, open };
}
export const holidayOn = date => S.get().holidays.find(h => h.date === date);
export function dayStatus(u, date, nowTs = S.now()) {
  const s = S.get(), today = dayKey(nowTs), rec = s.attendance.find(a => a.userId === u.id && a.date === date);
  const base = { date, user: u, rec: rec || null, in: null, out: null, breakMin: 0, worked: 0, otMin: 0, late: false, lateMin: 0, under: false, underMin: 0 };
  if (rec) { const c = compute(rec, u, nowTs); return { ...base, ...c, in: rec.timeIn, out: rec.timeOut }; }
  if (date > today) return null;
  if (date < dayKey(u.createdAt)) return null;
  if (holidayOn(date)) return { ...base, status: 'Holiday', holiday: holidayOn(date).name };
  if (u.schedule.restDays.includes(dowOf(manilaTs(date, '12:00')))) return { ...base, status: 'Rest Day' };
  if (date < today) return { ...base, status: 'Absent' };
  return nowTs >= manilaTs(date, u.schedule.start) + s.settings.att.absentAfterMin * MIN ? { ...base, status: 'Absent' } : { ...base, status: 'Not yet in' };
}
const todayRec = u => S.get().attendance.find(a => a.userId === u.id && a.date === dayKey(S.now()));
const openRec = u => S.get().attendance.find(a => a.userId === u.id && a.timeIn && !a.timeOut);
export const liveState = u => { const r = openRec(u); if (r) return r.breaks.some(b => !b.end) ? 'On Break' : 'Clocked In'; const t = todayRec(u); return t?.timeOut ? 'Clocked Out' : 'Not In'; };
export const trackedUsers = () => S.get().users.filter(u => u.active && u.role !== 'none');

// ---------- clock operations ----------
export function clockOp(u, op, remarks, actor = S.ctx.actor) {
  const s0 = S.get(), now = S.now(), today = dayKey(now); let err = '';
  S.commit(s => {
    const user = S.userById(u.id), open = s.attendance.find(a => a.userId === user.id && a.timeIn && !a.timeOut), tRec = s.attendance.find(a => a.userId === user.id && a.date === today);
    const note = String(remarks || '').trim(), addNote = r => { if (note) r.remarks = (r.remarks ? r.remarks + ' | ' : '') + `${fmtTime(now)}: ${note}`; };
    if (op === 'in') {
      if (open) return void (err = open.date === today ? `You are already clocked in (since ${fmtTime(open.timeIn)}). Duplicate clock-in blocked.` : `Your record for ${fmtKey(open.date)} has no clock-out. Submit an attendance correction first.`);
      if (tRec?.timeOut) return void (err = `You already completed today's shift (out at ${fmtTime(tRec.timeOut)}). Duplicate clock-in blocked.`);
      if (tRec && !tRec.timeIn) return void (err = `Today is recorded as ${tRec.status}. Contact Management if this is wrong.`);
      const rec = { id: 'at' + (++s.seq), userId: user.id, date: today, timeIn: now, timeInISO: S.manilaISO(now), timeOut: null, breaks: [], remarks: '', status: null, device: actor?.device || 'unknown', sessionId: actor?.sessionId || null, locked: false, history: [] };
      addNote(rec); s.attendance.push(rec); S.log(s, 'clock_in', `${user.name} clocked in at ${fmtTime(now)}${compute(rec, user, now).late ? ' (late)' : ''}`, actor);
    } else if (!open) return void (err = op === 'out' ? 'You are not clocked in. Duplicate or missing clock-out blocked.' : 'Clock in first.');
    else if (op === 'bstart') {
      if (open.breaks.some(b => !b.end)) return void (err = 'You are already on break.'); open.breaks.push({ start: now, end: null }); addNote(open); S.log(s, 'break_start', `${user.name} started break at ${fmtTime(now)}`, actor);
    } else if (op === 'bend') {
      const b = open.breaks.find(x => !x.end); if (!b) return void (err = 'You are not on break.'); b.end = now; addNote(open); S.log(s, 'break_end', `${user.name} ended break at ${fmtTime(now)} (${durFmt((now - b.start) / MIN)})`, actor);
    } else if (op === 'out') {
      if (open.breaks.some(b => !b.end)) return void (err = 'End your break before clocking out.');
      open.timeOut = now; open.timeOutISO = S.manilaISO(now); addNote(open); const c = compute(open, user, now);
      S.log(s, 'clock_out', `${user.name} clocked out at ${fmtTime(now)} — worked ${hrs(c.worked)}${c.otMin ? `, overtime ${hrs(c.otMin)}` : ''} · ${c.status}`, actor);
    }
  });
  return err;
}
const OP_LABEL = { in: 'Clock In', out: 'Clock Out', bstart: 'Start Break', bend: 'End Break' };
const parseHM = (d, hm) => (hm ? manilaTs(d, hm) : null);

// ---------- corrections ----------
export function submitCorrection(u, f) {
  const today = dayKey(S.now()), s = S.get();
  if (!f.date || f.date > today) return 'Choose a past date or today.';
  if (f.date < addDays(today, -60)) return 'Corrections can only be requested for the last 60 days.';
  if (!f.timeIn && !f.timeOut && !f.status) return 'State what should be corrected (time in, time out or status).';
  if (!String(f.reason).trim()) return 'A reason is required.';
  const rec = s.attendance.find(a => a.userId === u.id && a.date === f.date);
  if (rec?.locked) return 'That day has an approved record and is locked. Please ask Management.';
  if (s.corrections.some(c => c.userId === u.id && c.date === f.date && c.status === 'pending')) return 'You already have a pending correction for that date.';
  if (f.timeIn && f.timeOut && f.timeOut <= f.timeIn) return 'Time out must be after time in.';
  S.commit(st => {
    const ts = S.now(), c = { id: 'cr' + (++st.seq), userId: u.id, date: f.date, requested: { ...(f.timeIn ? { timeIn: f.timeIn } : {}), ...(f.timeOut ? { timeOut: f.timeOut } : {}), ...(f.status ? { status: f.status } : {}) }, reason: f.reason.trim(), note: (f.note || '').trim(), status: 'pending', requestedAt: ts, requestedISO: S.manilaISO(ts), decidedBy: null, decidedAt: null, decisionNote: '', before: snapshot(rec, u) };
    st.corrections.push(c); S.log(st, 'correction_requested', `Attendance correction requested for ${fmtKey(f.date)}: ${describeReq(c.requested)} — ${c.reason}`);
  });
  return '';
}
const snapshot = (rec, u) => rec ? { timeIn: rec.timeIn, timeOut: rec.timeOut, status: rec.status, breakMin: compute(rec, u).breakMin } : null;
export const describeReq = r => [r.timeIn && `time in ${r.timeIn}`, r.timeOut && `time out ${r.timeOut}`, r.status && `status ${r.status}`].filter(Boolean).join(', ');
function applyToRecord(s, u, date, f, by, type, reason, corrId) {
  let rec = s.attendance.find(a => a.userId === u.id && a.date === date);
  if (!rec) { rec = { id: 'at' + (++s.seq), userId: u.id, date, timeIn: null, timeOut: null, breaks: [], remarks: '', status: null, device: 'Management correction', locked: false, history: [] }; s.attendance.push(rec); }
  const before = snapshot(rec, u) || { timeIn: null, timeOut: null, status: null, breakMin: 0 };
  if (f.timeIn !== undefined) { rec.timeIn = f.timeIn; rec.timeInISO = f.timeIn ? S.manilaISO(f.timeIn) : null; }
  if (f.timeOut !== undefined) { rec.timeOut = f.timeOut; rec.timeOutISO = f.timeOut ? S.manilaISO(f.timeOut) : null; }
  if (f.status !== undefined) rec.status = f.status || null;
  if (f.breakMin !== undefined && f.breakMin !== null) { rec.breakOverride = f.breakMin; }
  rec.locked = true; rec.corrected = true;
  rec.history.push({ at: S.now(), atISO: S.manilaISO(S.now()), by, type, corrId: corrId || null, reason, before, after: snapshot(rec, u) });
  return rec;
}
export function decideCorrection(id, approve, note) {
  if (!can('attendance.manage')) return 'Only Management can decide corrections.';
  const me = S.ctx.actor, c0 = S.get().corrections.find(c => c.id === id);
  if (!c0 || c0.status !== 'pending') return 'Already decided.';
  if (c0.userId === me.id) return 'You cannot approve or reject your own correction. Another administrator must decide it.';
  if (!approve && !String(note).trim()) return 'Please give a reason for rejecting.';
  let err = '';
  S.commit(s => {
    const c = s.corrections.find(x => x.id === id), u = S.userById(c.userId), ts = S.now();
    if (approve) {
      const f = {}; if (c.requested.timeIn) f.timeIn = parseHM(c.date, c.requested.timeIn); if (c.requested.timeOut) f.timeOut = parseHM(c.date, c.requested.timeOut); if (c.requested.status) f.status = c.requested.status;
      const rec0 = s.attendance.find(a => a.userId === u.id && a.date === c.date), tin = f.timeIn ?? rec0?.timeIn, tout = f.timeOut ?? rec0?.timeOut;
      if (tin && tout && tout <= tin) return void (err = 'The corrected time out would be before the time in.');
      applyToRecord(s, u, c.date, f, me.id, 'correction', c.reason, c.id);
    }
    Object.assign(c, { status: approve ? 'approved' : 'rejected', decidedBy: me.id, decidedByName: me.name, decidedAt: ts, decidedISO: S.manilaISO(ts), decisionNote: String(note || '').trim() });
    S.log(s, approve ? 'correction_approved' : 'correction_rejected', `Attendance correction ${approve ? 'APPROVED' : 'REJECTED'} — ${u.name}, ${fmtKey(c.date)}: ${describeReq(c.requested)}${c.decisionNote ? ' — ' + c.decisionNote : ''}`);
  });
  return err;
}

// ---------- management dashboard data ----------
export function attendanceToday() {
  const s = S.get(), now = S.now(), today = dayKey(now), users = trackedUsers();
  const rows = users.map(u => {
    const d = dayStatus(u, today, now), live = d?.status === 'Rest Day' || d?.status === 'Holiday' || d?.status === 'Leave' ? d.status : liveState(u);
    return { u, d, name: u.name, role: Auth.roleOf(u).label, in: d?.in, live, worked: d?.worked || 0, status: d?.status || '—', ot: d?.otMin || 0 };
  });
  return {
    rows, present: rows.filter(r => r.d?.in).length, late: rows.filter(r => r.d?.late).length, absent: rows.filter(r => r.d?.status === 'Absent').length,
    clockedIn: rows.filter(r => r.live === 'Clocked In').length, onBreak: rows.filter(r => r.live === 'On Break').length,
    hours: rows.reduce((a, r) => a + r.worked, 0), ot: rows.reduce((a, r) => a + r.ot, 0), pending: s.corrections.filter(c => c.status === 'pending').length,
  };
}
export const liveTable = rows => table('attLive', [{ key: 'name', label: 'Staff Name' }, { key: 'role', label: 'Role' }, { key: 'in', label: 'Clock In', type: 'time' }, { key: 'liveH', label: 'Current Status', type: 'html', sortKey: 'live' }, { key: 'worked', label: 'Work Hours', type: 'hrs' }, { key: 'statusH', label: 'Attendance Status', type: 'html', sortKey: 'status' }],
  rows.map(r => ({ ...r, liveH: pill(r.live, r.live === 'Clocked In' ? 'green' : r.live === 'On Break' ? 'orange' : ''), statusH: pill(r.status, ST_CLASS[r.status] ?? '') })), { sort: { key: 'name', dir: 'asc' } });

// ---------- views ----------
const sBtn = (op, ok, cls) => `<button class="btn lg ${cls}" data-a="clockBtn" data-op="${op}" ${ok ? '' : 'disabled'}>${OP_LABEL[op]}</button>`;
function clockPanel(u) {
  const st = liveState(u), r = todayRec(u), c = r && r.timeIn ? compute(r, u) : null, d = dayStatus(u, dayKey(S.now()));
  const state = st === 'Not In' ? { in: true } : st === 'Clocked In' ? { out: true, bstart: true } : st === 'On Break' ? { bend: true } : {};
  return `<div class="card white clockcard"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="eyebrow">${esc(u.position)}</div><h2 style="font-size:24px;margin-bottom:4px">${esc(u.name)}</h2><div class="muted">Schedule ${u.schedule.start}–${u.schedule.end} · ${u.schedule.hours}h · Emp. ${esc(u.employeeNo || '—')}</div></div><div style="text-align:right">${clockHtml()}<div style="margin-top:10px">${pill(st, st === 'Clocked In' ? 'green' : st === 'On Break' ? 'orange' : '')} ${d ? pill(d.status, ST_CLASS[d.status] ?? '') : ''}</div></div></div>
    <div class="grid g4" style="margin:18px 0">${sBtn('in', state.in, '')}${sBtn('bstart', state.bstart, 'purple')}${sBtn('bend', state.bend, 'orange')}${sBtn('out', state.out, 'red')}</div>
    <div class="field"><label for="att_rem">Remarks (optional)</label><input id="att_rem" placeholder="e.g. covering for Liza, delivery in the morning"></div>
    <div class="grid g4"><div class="mini-stat"><span class="l">Time in</span><b>${r?.timeIn ? fmtTime(r.timeIn) : '—'}</b></div><div class="mini-stat"><span class="l">Time out</span><b>${r?.timeOut ? fmtTime(r.timeOut) : '—'}</b></div><div class="mini-stat"><span class="l">Break</span><b>${c ? durFmt(c.breakMin) : '—'}</b></div><div class="mini-stat"><span class="l">Work hours</span><b>${c ? hrs(c.worked) : '—'}</b></div></div>
    <p class="muted" style="font-size:12px;margin:12px 0 0">Each clock action asks for your personal PIN or password. ${r?.device ? 'Device: ' + esc(r.device) : ''}</p></div>`;
}
function historyRows(u, days = 31) {
  const today = dayKey(S.now()), out = [];
  for (let i = 0; i < days; i++) { const date = addDays(today, -i), d = dayStatus(u, date); if (d) out.push(d); }
  return out.map(d => ({ date: d.date, in: d.in, out: d.out, breakMin: d.breakMin, worked: d.worked, ot: d.otMin, statusH: pill(d.status, ST_CLASS[d.status] ?? '') + (d.rec?.corrected ? ' ' + pill('Corrected', 'orange') : ''), status: d.status, device: d.rec?.device || '', remarks: d.rec?.remarks || d.holiday || '' }));
}
const histCols = [{ key: 'date', label: 'Date', type: 'date' }, { key: 'in', label: 'Time in', type: 'time' }, { key: 'out', label: 'Time out', type: 'time' }, { key: 'breakMin', label: 'Break', type: 'dur' }, { key: 'worked', label: 'Work hours', type: 'hrs' }, { key: 'ot', label: 'Overtime', type: 'hrs' }, { key: 'statusH', label: 'Status', type: 'html', sortKey: 'status' }, { key: 'device', label: 'Device' }, { key: 'remarks', label: 'Remarks' }];
const corrStatus = c => c.status === 'pending' ? pill('Pending', 'orange') : c.status === 'approved' ? pill('Approved', 'green') : pill('Rejected', 'red');
const corrRows = list => list.map(c => ({ at: c.requestedAt, date: c.date, staff: S.userName(c.userId), what: describeReq(c.requested), reason: esc(c.reason) + (c.note ? `<div class="muted" style="font-size:12px">${esc(c.note)}</div>` : ''), status: corrStatus(c), by: c.decidedByName || '—', dec: c.decidedAt, note: c.decisionNote || '', act: '' }));

defineView({ route: 'attendance', label: 'Staff Attendance', icon: 'clock', group: 'People', perm: 'attendance.self',
  render() {
    const u = Auth.user(), s = S.get(), adm = can('attendance.manage'), tab = adm ? ui.attTab : 'me';
    const mine = s.corrections.filter(c => c.userId === u.id).sort((a, b) => b.requestedAt - a.requestedAt);
    let body = '';
    if (tab === 'me') body = `<div class="card white" style="margin-top:18px"><div class="row" style="justify-content:space-between"><h2>My attendance history <span class="muted" style="font-weight:500;font-size:13px">last 31 days</span></h2><button class="btn secondary" data-a="corrForm">Request correction</button></div>${table('attHist', histCols, historyRows(u), { sort: { key: 'date', dir: 'desc' } })}</div>
      <div class="card white" style="margin-top:18px"><h2>My correction requests</h2>${table('myCorr', [{ key: 'date', label: 'Date', type: 'date' }, { key: 'what', label: 'Requested' }, { key: 'reason', label: 'Reason', type: 'html', sortKey: 'what' }, { key: 'status', label: 'Status', type: 'html', sortKey: 'what' }, { key: 'by', label: 'Decided by' }, { key: 'note', label: 'Decision note' }], corrRows(mine), { sort: { key: 'date', dir: 'desc' }, empty: 'No correction requests.' })}</div>`;
    if (tab === 'staff') {
      const date = ui.attDate || dayKey(S.now()), rows = trackedUsers().map(x => { const d = dayStatus(x, date); return d && { name: x.name, empNo: x.employeeNo, role: Auth.roleOf(x).label, in: d.in, out: d.out, breakMin: d.breakMin, worked: d.worked, ot: d.otMin, statusH: pill(d.status, ST_CLASS[d.status] ?? '') + (d.rec?.corrected ? ' ' + pill('Corrected', 'orange') : ''), status: d.status, act: `<button class="btn sm secondary" data-a="attEdit" data-u="${x.id}" data-date="${date}">Edit / record</button>` }; }).filter(Boolean);
      body = `<div class="card white" style="margin-top:18px"><div class="row" style="justify-content:space-between"><h2>Staff attendance</h2><input type="date" id="attd" value="${date}" data-change="attDate" style="width:auto" aria-label="Date" max="${dayKey(S.now())}"></div>${table('attStaff', [{ key: 'name', label: 'Staff' }, { key: 'empNo', label: 'Emp. no.' }, { key: 'role', label: 'Role' }, { key: 'in', label: 'Time in', type: 'time' }, { key: 'out', label: 'Time out', type: 'time' }, { key: 'breakMin', label: 'Break', type: 'dur' }, { key: 'worked', label: 'Work hours', type: 'hrs' }, { key: 'ot', label: 'Overtime', type: 'hrs' }, { key: 'statusH', label: 'Status', type: 'html', sortKey: 'status' }, { key: 'act', label: '', type: 'html' }], rows, { sort: { key: 'name', dir: 'asc' } })}<p class="muted" style="font-size:12px;margin-top:8px">Admin edits require a reason, keep the original values in the record history, and are written to the audit log. Approved records are locked against staff changes.</p></div>`;
    }
    if (tab === 'corr') {
      const all = s.corrections.slice().sort((a, b) => b.requestedAt - a.requestedAt), me = u.id;
      const rows = corrRows(all).map((r, i) => ({ ...r, act: all[i].status === 'pending' ? (all[i].userId === me ? '<span class="muted" style="font-size:12px">Own request</span>' : `<div class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn sm" data-a="corrDecide" data-id="${all[i].id}" data-yes="1">Approve</button><button class="btn sm red" data-a="corrDecide" data-id="${all[i].id}" data-yes="0">Reject</button></div>`) : '' }));
      body = `<div class="card white" style="margin-top:18px"><h2>Attendance correction requests</h2>${table('corrAll', [{ key: 'at', label: 'Requested', type: 'dt' }, { key: 'staff', label: 'Staff' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'what', label: 'Requested change' }, { key: 'reason', label: 'Reason', type: 'html', sortKey: 'what' }, { key: 'status', label: 'Status', type: 'html', sortKey: 'what' }, { key: 'by', label: 'Decided by' }, { key: 'dec', label: 'Decided', type: 'dt' }, { key: 'act', label: '', type: 'html' }], rows, { sort: { key: 'at', dir: 'desc' } })}</div>`;
    }
    const pend = s.corrections.filter(c => c.status === 'pending').length;
    return head('Staff Attendance', 'Clock in/out, breaks and attendance records (Asia/Manila time).', '', false) + clockPanel(u) + (adm ? `<div class="tabs-seg" style="margin-top:18px">${[['me', 'My attendance'], ['staff', 'All staff'], ['corr', `Corrections${pend ? ' (' + pend + ')' : ''}`]].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-a="attTab" data-k="${k}">${l}</button>`).join('')}</div>` : '') + body;
  } });

defineActions({
  attDate: ['attendance.manage', (d, e, el) => { ui.attDate = el.value; render(); }],
  attTab: ['attendance.manage', d => { ui.attTab = d.k; render(); }],
  clockBtn: ['attendance.self', d => { const note = val('att_rem'); askPin(OP_LABEL[d.op], () => { const err = clockOp(Auth.user(), d.op, note); err ? toast(err, 'err') : toast(`${OP_LABEL[d.op]} recorded at ${fmtTime(S.now())}`); render(); }); }],
  corrForm: ['attendance.self', () => modal(`<h2>${icon('clock')} Request attendance correction</h2><div class="notice orange">Original records are kept. Management must approve before anything changes.</div><div class="field"><label for="cf_d">Date</label><input type="date" id="cf_d" value="${dayKey(S.now())}" max="${dayKey(S.now())}"></div><div class="grid g2" style="gap:12px"><div class="field"><label for="cf_in">Correct time in</label><input type="time" id="cf_in"></div><div class="field"><label for="cf_out">Correct time out</label><input type="time" id="cf_out"></div></div><div class="field"><label for="cf_st">Or status</label><select id="cf_st"><option value="">— no status change —</option>${['Leave', 'Half Day', 'Absent', 'Present'].map(x => `<option>${x}</option>`).join('')}</select></div><div class="field"><label for="cf_r">Reason (required)</label><textarea id="cf_r" rows="2"></textarea></div><div class="field"><label for="cf_n">Supporting note (optional)</label><input id="cf_n"></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="corrSubmit">Submit request</button></div>`)],
  corrSubmit: ['attendance.self', () => { const err = submitCorrection(Auth.user(), { date: val('cf_d'), timeIn: val('cf_in'), timeOut: val('cf_out'), status: val('cf_st'), reason: val('cf_r'), note: val('cf_n') }); if (err) return toast(err, 'err'); closeModal(); toast('Correction request sent'); }],
  corrDecide: ['attendance.manage', d => { const c = S.get().corrections.find(x => x.id === d.id), yes = d.yes === '1'; modal(`<h2>${yes ? 'Approve' : 'Reject'} correction</h2><p class="muted">${esc(S.userName(c.userId))} · ${fmtKey(c.date)}<br>Requested: <b>${esc(describeReq(c.requested))}</b></p><div class="notice orange"><b>Reason:</b> ${esc(c.reason)}${c.note ? '<br>' + esc(c.note) : ''}</div><div class="field"><label for="cd_n">${yes ? 'Note (optional)' : 'Reason for rejecting (required)'}</label><textarea id="cd_n" rows="2"></textarea></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn ${yes ? '' : 'red'}" data-a="corrDo" data-id="${c.id}" data-yes="${d.yes}">${yes ? 'Approve' : 'Reject'}</button></div>`); }],
  corrDo: ['attendance.manage', d => { const err = decideCorrection(d.id, d.yes === '1', val('cd_n')); if (err) return toast(err, 'err'); closeModal(); toast(d.yes === '1' ? 'Correction approved' : 'Correction rejected'); }],
  attEdit: ['attendance.manage', d => {
    const u = S.userById(d.u), r = S.get().attendance.find(a => a.userId === u.id && a.date === d.date), hm = t => t ? S.manilaISO(t).slice(11, 16) : '';
    modal(`<h2>${esc(u.name)} · ${fmtKey(d.date)}</h2><div class="notice orange">Management correction — a reason is required. The original values stay in the record history.</div><div class="grid g2" style="gap:12px"><div class="field"><label for="ae_in">Time in</label><input type="time" id="ae_in" value="${hm(r?.timeIn)}"></div><div class="field"><label for="ae_out">Time out</label><input type="time" id="ae_out" value="${hm(r?.timeOut)}"></div><div class="field"><label for="ae_b">Break (minutes)</label><input type="number" id="ae_b" min="0" value="${r ? compute(r, u).breakMin : 60}"></div><div class="field"><label for="ae_s">Status</label><select id="ae_s"><option value="">Automatic</option>${['Leave', 'Absent', 'Half Day', 'Rest Day', 'Holiday'].map(x => `<option ${r?.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div><div class="field"><label for="ae_r">Reason (required)</label><textarea id="ae_r" rows="2"></textarea></div><div class="foot"><button class="btn secondary" data-a="close">Cancel</button><button class="btn" data-a="attEditDo" data-u="${u.id}" data-date="${d.date}">Save correction</button></div>`);
  }],
  attEditDo: ['attendance.manage', d => {
    const u = S.userById(d.u), reason = val('ae_r').trim(); if (!reason) return toast('A reason is required', 'err');
    const tin = val('ae_in') ? manilaTs(d.date, val('ae_in')) : null, tout = val('ae_out') ? manilaTs(d.date, val('ae_out')) : null, st = val('ae_s');
    if (tin && tout && tout <= tin) return toast('Time out must be after time in', 'err'); if (!tin && !st) return toast('Enter a time in or choose a status', 'err');
    S.commit(s => { applyToRecord(s, u, d.date, { timeIn: tin, timeOut: tout, status: st || null, breakMin: val('ae_b') === '' ? null : +val('ae_b') }, S.ctx.actor.id, 'admin_edit', reason); S.log(s, 'attendance_admin_edit', `Management edited attendance — ${u.name}, ${fmtKey(d.date)}: in ${tin ? fmtTime(tin) : '—'}, out ${tout ? fmtTime(tout) : '—'}${st ? ', status ' + st : ''} — ${reason}`); });
    closeModal(); toast('Attendance record updated');
  }],
});

// ---------- kiosk (shared-tablet time clock; PIN only; clock actions only) ----------
let kiosk = null;
export function kioskView() {
  if (kiosk && S.now() - kiosk.at > 60e3) kiosk = null;
  const u = kiosk && S.userById(kiosk.uid);
  const inner = !u ? `<form id="kioskForm"><div class="field"><label for="k_u">Username</label><input id="k_u" autocomplete="off" required></div><div class="field"><label for="k_p">Your PIN</label><input id="k_p" type="password" inputmode="numeric" autocomplete="off" required></div><button class="btn block lg" type="submit">Continue</button></form>` : (() => {
    const st = liveState(u), t = todayRec(u), state = st === 'Not In' ? { in: 1 } : st === 'Clocked In' ? { out: 1, bstart: 1 } : st === 'On Break' ? { bend: 1 } : {};
    const b = (op, cls) => `<button class="btn lg ${cls}" data-a="kioskDo" data-op="${op}" ${state[op] ? '' : 'disabled'}>${OP_LABEL[op]}</button>`;
    return `<div class="kiosk-who"><b>${esc(u.name)}</b><div class="muted">${esc(u.position)} · ${st}</div></div>${clockHtml()}<div class="grid g2" style="margin:16px 0;gap:10px">${b('in', '')}${b('bstart', 'purple')}${b('bend', 'orange')}${b('out', 'red')}</div><div class="field"><input id="k_rem" placeholder="Remarks (optional)"></div><div class="muted" style="font-size:13px;margin-bottom:10px">${t?.timeIn ? `In ${fmtTime(t.timeIn)}${t.timeOut ? ' · Out ' + fmtTime(t.timeOut) : ''}` : 'No record yet today'}</div><button class="btn secondary block" data-a="kioskDone">Done — next person</button>`;
  })();
  return `<div class="login"><div class="login-card">${logo('lg')}<div class="club">Cattle Creek Country Club</div><h1>Staff Time Clock</h1><div class="sub">Enter your own username and PIN to clock in or out. You will only see your own record.</div>${inner}<div class="login-foot"><a href="#" data-a="kioskExit">← Back to sign-in</a></div></div></div>`;
}
defineActions({
  kioskCheck: ['public', () => { const r = Auth.kioskAuth(val('k_u'), val('k_p')); if (!r.ok) return toast(r.error, 'err'); kiosk = { uid: r.user.id, at: S.now(), actor: r.actor }; render(); }],
  kioskDo: ['public', d => { if (!kiosk) return render(); const u = S.userById(kiosk.uid), err = clockOp(u, d.op, val('k_rem'), kiosk.actor); if (err) return toast(err, 'err'); toast(`${OP_LABEL[d.op]} recorded at ${fmtTime(S.now())} — ${u.name}`); kiosk.at = S.now(); render(); }],
  kioskDone: ['public', () => { kiosk = null; render(); }],
  kioskExit: ['public', () => { kiosk = null; ui.route = 'dashboard'; ui.kioskMode = false; render(); }],
});
export const kioskForm = id => id === 'kioskForm' && (() => { const r = Auth.kioskAuth(val('k_u'), val('k_p')); if (!r.ok) return toast(r.error, 'err'); kiosk = { uid: r.user.id, at: S.now(), actor: r.actor }; render(); })();

// ---------- report builders (used by mgmt.js) ----------
function daysFor(range, o) {
  const users = S.get().users.filter(u => (o.staff === 'all' || u.id === o.staff) && (o.role === 'all' || u.role === o.role) && (u.active || S.get().attendance.some(a => a.userId === u.id)));
  const out = []; for (const u of users) for (let k = range.toKey; k >= range.fromKey; k = addDays(k, -1)) { const d = dayStatus(u, k); if (d && d.status !== 'Not yet in') out.push(d); }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.user.name.localeCompare(b.user.name));
}
const tally = ds => ({ present: ds.filter(d => d.in).length, late: ds.filter(d => d.late).length, absent: ds.filter(d => d.status === 'Absent').length, leave: ds.filter(d => d.status === 'Leave').length, under: ds.filter(d => d.under).length, worked: ds.reduce((a, d) => a + d.worked, 0), ot: ds.reduce((a, d) => a + d.otMin, 0) });
const dRow = d => ({ date: d.date, staff: d.user.name, empNo: d.user.employeeNo, role: Auth.roleOf(d.user).label, in: d.in, out: d.out, breakMin: d.breakMin, worked: d.worked, ot: d.otMin, status: d.status });
const dCols = [{ key: 'date', label: 'Date', type: 'date' }, { key: 'staff', label: 'Staff' }, { key: 'empNo', label: 'Emp. no.' }, { key: 'role', label: 'Role' }, { key: 'in', label: 'Time in', type: 'time' }, { key: 'out', label: 'Time out', type: 'time' }, { key: 'breakMin', label: 'Break', type: 'dur' }, { key: 'worked', label: 'Work hours', type: 'hrs' }, { key: 'ot', label: 'Overtime', type: 'hrs' }, { key: 'status', label: 'Status' }];
const sumKpis = t => [{ label: 'Days present', value: t.present }, { label: 'Days late', value: t.late }, { label: 'Days absent', value: t.absent }, { label: 'Leave days', value: t.leave }, { label: 'Total work hours', value: hrs(t.worked) }, { label: 'Overtime hours', value: hrs(t.ot) }];
function groupBy(ds, keyFn) { const m = new Map(); ds.forEach(d => { const k = keyFn(d); (m.get(k) || m.set(k, []).get(k)).push(d); }); return m; }
const weekStart = date => { const dw = (dowOf(manilaTs(date, '12:00')) + 6) % 7; return addDays(date, -dw); };
const sumRow = (name, ds, extra = {}) => { const t = tally(ds); return { ...extra, staff: name, present: t.present, late: t.late, absent: t.absent, leave: t.leave, worked: t.worked, ot: t.ot }; };
const sumCols = [{ key: 'present', label: 'Days present', type: 'int' }, { key: 'late', label: 'Days late', type: 'int' }, { key: 'absent', label: 'Days absent', type: 'int' }, { key: 'leave', label: 'Leave days', type: 'int' }, { key: 'worked', label: 'Total work hours', type: 'hrs' }, { key: 'ot', label: 'Total overtime hours', type: 'hrs' }];

export const ATT_REPORTS = [
  { id: 'att-daily', group: 'Attendance', title: 'Daily attendance report', filters: ['range', 'staff', 'role'], build: (r, o) => { const ds = daysFor(r, o); return { summary: sumKpis(tally(ds)), cols: dCols, rows: ds.map(dRow) }; } },
  { id: 'att-weekly', group: 'Attendance', title: 'Weekly attendance summary', filters: ['range', 'staff', 'role'], build: (r, o) => { const ds = daysFor(r, o), rows = []; groupBy(ds, d => d.user.id + '|' + weekStart(d.date)).forEach((v, k) => { const w = k.split('|')[1]; rows.push(sumRow(v[0].user.name, v, { empNo: v[0].user.employeeNo, week: `${fmtKey(w)} – ${fmtKey(addDays(w, 6))}`, weekKey: w })); }); return { summary: sumKpis(tally(ds)), cols: [{ key: 'week', label: 'Week', sortKey: 'weekKey' }, { key: 'staff', label: 'Staff' }, { key: 'empNo', label: 'Emp. no.' }, ...sumCols], rows }; } },
  { id: 'att-monthly', group: 'Attendance', title: 'Monthly attendance summary', filters: ['range', 'staff', 'role'], build: (r, o) => { const ds = daysFor(r, o), rows = []; groupBy(ds, d => d.user.id + '|' + d.date.slice(0, 7)).forEach((v, k) => { const mo = k.split('|')[1]; rows.push(sumRow(v[0].user.name, v, { empNo: v[0].user.employeeNo, month: new Date(mo + '-15T12:00:00+08:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }), monthKey: mo })); }); return { summary: sumKpis(tally(ds)), cols: [{ key: 'month', label: 'Month', sortKey: 'monthKey' }, { key: 'staff', label: 'Staff' }, { key: 'empNo', label: 'Emp. no.' }, ...sumCols], rows }; } },
  { id: 'att-history', group: 'Attendance', title: 'Staff time-in / time-out history', filters: ['range', 'staff', 'role'], build: (r, o) => { const ds = daysFor(r, o).filter(d => d.in); return { summary: [{ label: 'Records', value: ds.length }], cols: [...dCols.slice(0, 9), { key: 'device', label: 'Device' }, { key: 'corrected', label: 'Corrected' }], rows: ds.map(d => ({ ...dRow(d), device: d.rec?.device, corrected: d.rec?.corrected ? 'Yes' : '' })) }; } },
  { id: 'att-late', group: 'Attendance', title: 'Late and undertime report', filters: ['range', 'staff', 'role'], build: (r, o) => { const ds = daysFor(r, o).filter(d => d.late || d.under); return { summary: [{ label: 'Late days', value: ds.filter(d => d.late).length }, { label: 'Undertime days', value: ds.filter(d => d.under).length }, { label: 'Total minutes late', value: ds.reduce((a, d) => a + d.lateMin, 0) }, { label: 'Total minutes under', value: ds.reduce((a, d) => a + d.underMin, 0) }], cols: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'staff', label: 'Staff' }, { key: 'role', label: 'Role' }, { key: 'sched', label: 'Scheduled' }, { key: 'in', label: 'Time in', type: 'time' }, { key: 'lateMin', label: 'Minutes late', type: 'int' }, { key: 'out', label: 'Time out', type: 'time' }, { key: 'underMin', label: 'Minutes under', type: 'int' }, { key: 'status', label: 'Status' }], rows: ds.map(d => ({ date: d.date, staff: d.user.name, role: Auth.roleOf(d.user).label, sched: `${d.user.schedule.start}–${d.user.schedule.end}`, in: d.in, lateMin: d.lateMin, out: d.out, underMin: d.underMin, status: d.status })) }; } },
  { id: 'att-absent', group: 'Attendance', title: 'Absence and leave report', filters: ['range', 'staff', 'role'], build: (r, o) => { const ds = daysFor(r, o).filter(d => d.status === 'Absent' || d.status === 'Leave'); return { summary: [{ label: 'Absent days', value: ds.filter(d => d.status === 'Absent').length }, { label: 'Leave days', value: ds.filter(d => d.status === 'Leave').length }], cols: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'staff', label: 'Staff' }, { key: 'empNo', label: 'Emp. no.' }, { key: 'role', label: 'Role' }, { key: 'status', label: 'Status' }, { key: 'remarks', label: 'Remarks' }], rows: ds.map(d => ({ date: d.date, staff: d.user.name, empNo: d.user.employeeNo, role: Auth.roleOf(d.user).label, status: d.status, remarks: d.rec?.remarks || '' })) }; } },
  { id: 'att-hours', group: 'Attendance', title: 'Total work hours and overtime', filters: ['range', 'staff', 'role'], build: (r, o) => { const ds = daysFor(r, o), rows = []; groupBy(ds, d => d.user.id).forEach(v => { const t = tally(v); rows.push({ staff: v[0].user.name, empNo: v[0].user.employeeNo, role: Auth.roleOf(v[0].user).label, days: t.present, worked: t.worked, avg: t.present ? t.worked / t.present : 0, ot: t.ot }); }); return { summary: [{ label: 'Total work hours', value: hrs(tally(ds).worked) }, { label: 'Total overtime', value: hrs(tally(ds).ot) }], cols: [{ key: 'staff', label: 'Staff' }, { key: 'empNo', label: 'Emp. no.' }, { key: 'role', label: 'Role' }, { key: 'days', label: 'Days worked', type: 'int' }, { key: 'worked', label: 'Total work hours', type: 'hrs' }, { key: 'avg', label: 'Avg hours / day', type: 'hrs' }, { key: 'ot', label: 'Overtime hours', type: 'hrs' }], rows, chartRows: rows.map(x => ({ label: x.staff, value: x.worked / 60 })) }; } },
  { id: 'att-individual', group: 'Attendance', title: 'Individual employee attendance record', filters: ['range', 'staffOnly'], build: (r, o) => { if (o.staff === 'all') return { note: 'Choose one employee in the Staff filter.', cols: dCols, rows: [], summary: [] }; const ds = daysFor(r, o); return { summary: sumKpis(tally(ds)), cols: dCols, rows: ds.map(dRow) }; } },
  { id: 'att-corrections', group: 'Attendance', title: 'Pending and approved corrections', filters: ['range', 'staff'], build: (r, o) => { const list = S.get().corrections.filter(c => c.date >= r.fromKey && c.date <= r.toKey && (o.staff === 'all' || c.userId === o.staff)); return { summary: [{ label: 'Pending', value: list.filter(c => c.status === 'pending').length }, { label: 'Approved', value: list.filter(c => c.status === 'approved').length }, { label: 'Rejected', value: list.filter(c => c.status === 'rejected').length }], cols: [{ key: 'at', label: 'Requested', type: 'dt' }, { key: 'staff', label: 'Staff' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'what', label: 'Requested change' }, { key: 'reason', label: 'Reason' }, { key: 'status', label: 'Status' }, { key: 'by', label: 'Decided by' }, { key: 'dec', label: 'Decided', type: 'dt' }, { key: 'note', label: 'Decision note' }], rows: list.map(c => ({ at: c.requestedAt, staff: S.userName(c.userId), date: c.date, what: describeReq(c.requested), reason: c.reason, status: c.status, by: c.decidedByName || '', dec: c.decidedAt, note: c.decisionNote })) }; } },
  { id: 'att-role', group: 'Attendance', title: 'Attendance by role', filters: ['range', 'role'], build: (r, o) => { const ds = daysFor(r, { ...o, staff: 'all' }), rows = []; groupBy(ds, d => d.user.role).forEach((v, k) => { const t = tally(v); rows.push({ staff: Auth.roleOf(v[0].user).label, headcount: new Set(v.map(d => d.user.id)).size, present: t.present, late: t.late, absent: t.absent, leave: t.leave, worked: t.worked, ot: t.ot }); }); return { summary: sumKpis(tally(ds)), cols: [{ key: 'staff', label: 'Role' }, { key: 'headcount', label: 'Staff', type: 'int' }, ...sumCols], rows }; } },
];
