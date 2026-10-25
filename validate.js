#!/usr/bin/env node
/*
  validate.js - checks plan.json before it is published.
  Usage:  node validate.js [path/to/plan.json]
  Exit code 0 = OK. Exit code 1 = problems found (each one is printed).
  No packages needed. Node 18 or newer.
*/
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const file = args.find((a) => !a.startsWith('--')) || 'plan.json';
const errors = [];
const err = (m) => errors.push(m);

let raw, data;
try {
  raw = fs.readFileSync(file, 'utf8');
  data = JSON.parse(raw);
} catch (e) {
  console.error('FAIL: cannot read or parse ' + file + ': ' + e.message);
  process.exit(1);
}

const isStr = (x) => typeof x === 'string' && x.trim().length > 0;
const isNum = (x) => typeof x === 'number' && isFinite(x);
const isArr = (x) => Array.isArray(x);
const strList = (x, where, min) => {
  if (!isArr(x) || x.length < min) { err(where + ': must be a list with at least ' + min + ' item(s)'); return; }
  x.forEach((s, i) => { if (!isStr(s)) err(where + '[' + i + ']: must be a non-empty string'); });
};

/* ---------- PRIVACY: this repo is public, so block place and identity words ----------
   The list of blocked words is NOT stored in this repo (that would publish them).
   It is passed in privately when the update job runs:
       HUNT_BLOCK_TERMS="word one,word two" node validate.js plan.json
   If the list is missing the check FAILS, so a forgotten setup cannot skip it.
   (Use --no-private-terms only for a quick local test.)                          */
const terms = (process.env.HUNT_BLOCK_TERMS || '').split(',').map((t) => t.trim()).filter(Boolean);
if (!terms.length && !flags.includes('--no-private-terms')) {
  err('PRIVACY: HUNT_BLOCK_TERMS is not set, so the private word check could not run. Set it and run again.');
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
terms.forEach((t) => {
  const m = raw.match(new RegExp('\\b' + escapeRe(t) + '\\b', 'i'));
  if (m) err('PRIVACY: found a blocked word: "' + m[0] + '"');
});
/* Generic checks that need no private list. */
const GENERIC = [
  [/\b\d{5}(-\d{4})?\b/, 'a 5-digit number (possible ZIP code)'],
  [/-?\d{1,3}\.\d{4,}\s*[,;]\s*-?\d{1,3}\.\d{4,}/, 'coordinates'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, 'email address'],
  [/https?:\/\//i, 'web link (none belong in the plan)'],
];
GENERIC.forEach(([re, why]) => {
  const m = raw.match(re);
  if (m) err('PRIVACY: found ' + why + ': "' + m[0] + '"');
});

/* ---------- top level ---------- */
if (data.schema !== 1) err('schema must be 1');
const gen = Date.parse(data.generated);
if (isNaN(gen)) err('generated: must be an ISO date-time, e.g. 2026-10-24T18:05:00-04:00');
if (!isArr(data.hunts) || data.hunts.length < 1 || data.hunts.length > 4) err('hunts: need 1 to 4 entries');

const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T12:00:00Z'));

/* Safe arc must stay inside West -> North -> East (270 deg clockwise to 90 deg). */
function arcInsideWNE(from, to) {
  const start = (((from - 270) % 360) + 360) % 360;   // 0..359 measured clockwise from West
  const sweep = (((to - from) % 360) + 360) % 360;
  return sweep > 0 && start <= 180 && start + sweep <= 180;
}

(isArr(data.hunts) ? data.hunts : []).forEach((h, n) => {
  const w = 'hunts[' + n + ']';
  if (!h || typeof h !== 'object') { err(w + ': must be an object'); return; }
  if (!validDate(h.date)) err(w + '.date: must be YYYY-MM-DD');
  if (!isStr(h.label)) err(w + '.label: required');
  if (n > 0 && isArr(data.hunts) && data.hunts[n - 1].date >= h.date) err(w + '.date: hunts must be in date order');

  const c = h.conditions;
  if (!c || typeof c !== 'object') err(w + '.conditions: required');
  else {
    strList(c.items, w + '.conditions.items', 3);
    if (c.hours !== undefined) {
      if (!isArr(c.hours)) err(w + '.conditions.hours: must be a list');
      else c.hours.forEach((r, i) => {
        if (!isStr(r.hour) || !isNum(r.temp) || !isStr(r.wind) || !isNum(r.cloud)) err(w + '.conditions.hours[' + i + ']: needs hour, temp (number), wind, cloud (number)');
      });
    }
  }

  if (!h.wind || !isNum(h.wind.from_deg) || h.wind.from_deg < 0 || h.wind.from_deg >= 360 || !isNum(h.wind.mph) || h.wind.mph < 0) err(w + '.wind: needs from_deg (0-359) and mph');

  const a = h.safe_arc;
  if (!a || !isNum(a.from_deg) || !isNum(a.to_deg)) err(w + '.safe_arc: needs from_deg and to_deg');
  else if (a.from_deg < 0 || a.from_deg >= 360 || a.to_deg < 0 || a.to_deg >= 360) err(w + '.safe_arc: degrees must be 0-359');
  else if (!arcInsideWNE(a.from_deg, a.to_deg)) err(w + '.safe_arc: SAFETY - the arc must stay inside West-North-East (270 -> 90 clockwise). It must never include south.');

  if (!isArr(h.in_season) || h.in_season.length < 1) err(w + '.in_season: need at least 1 entry');
  if (!h.plan || !isArr(h.plan.steps) || h.plan.steps.length < 3) err(w + '.plan.steps: need at least 3 steps');
  else h.plan.steps.forEach((s, i) => { if (!isStr(s.time) || !isStr(s.text)) err(w + '.plan.steps[' + i + ']: needs time and text'); });
  if (h.plan && !isStr(h.plan.why)) err(w + '.plan.why: required');

  if (!h.load) err(w + '.load: required'); else { strList(h.load.items, w + '.load.items', 3); strList(h.load.warnings, w + '.load.warnings', 1); }

  if (!isArr(h.animals) || h.animals.length < 1) err(w + '.animals: need at least 1');
  else h.animals.forEach((an, i) => { if (!isStr(an.name) || !isArr(an.paragraphs) || an.paragraphs.length < 1) err(w + '.animals[' + i + ']: needs name and paragraphs'); });

  if (!h.skill || !isStr(h.skill.title) || !isArr(h.skill.sections) || h.skill.sections.length < 1) err(w + '.skill: needs title and sections');
  if (!h.land || !isArr(h.land.steps) || h.land.steps.length < 1) err(w + '.land.steps: required');

  strList(h.safety, w + '.safety', 2);
  if (isArr(h.safety) && !h.safety.some((s) => /\bsouth\b/i.test(String(s)) && /never/i.test(String(s)))) err(w + '.safety: must include a "NEVER south" line');
  if (!isStr(h.regs)) err(w + '.regs: required');
});

/* ---------- size guard: every string must be sane ---------- */
(function walk(x, p) {
  if (typeof x === 'string') { if (x.length > 1500) err(p + ': text longer than 1500 characters'); }
  else if (isArr(x)) x.forEach((v, i) => walk(v, p + '[' + i + ']'));
  else if (x && typeof x === 'object') Object.keys(x).forEach((k) => walk(x[k], p + '.' + k));
})(data, 'plan');

/* ---------- freshness: the newest hunt must not already be in the past at generation time ---------- */
if (!isNaN(gen) && isArr(data.hunts) && data.hunts.length) {
  const last = data.hunts[data.hunts.length - 1].date;
  const genDay = new Date(gen).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  if (validDate(last) && last < genDay) err('freshness: the last hunt (' + last + ') is before the generated date (' + genDay + ')');
}

if (errors.length) {
  console.error('FAIL: ' + errors.length + ' problem(s) in ' + file + ':');
  errors.forEach((e) => console.error(' - ' + e));
  process.exit(1);
}
console.log('OK: ' + file + ' - ' + data.hunts.length + ' hunt(s): ' + data.hunts.map((h) => h.date).join(', '));
