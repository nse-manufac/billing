/**
 * ตัวเรียกด่านตรวจ — ถาม git ว่า PR นี้เปลี่ยนอะไร แล้วส่งให้ `guard-rules.mjs` ตัดสิน
 *
 * ไฟล์นี้ตั้งใจให้ "โง่" ที่สุด — รวบรวมข้อเท็จจริงกับพิมพ์ผล ไม่มีการตัดสินใจอยู่ในนี้เลย
 * การตัดสินทั้งหมดอยู่ใน `guard-rules.mjs` ซึ่งมีเทสคุมที่ `tests/guard.test.mjs`
 *
 * ── ทำไมเป็น node ไม่ใช่ bash (ต่างจาก `plan`) ────────────────────
 * `plan` เขียนด่านเป็น bash แล้วต้องมีเทส bash แยกอีกชุดที่ CI ต้องจำว่าต้องรัน
 * repo นี้รัน `npm test` ทุก PR อยู่แล้ว เขียนเป็น node จึงได้เทสของด่าน
 * ติดไปกับชุดเทสหลักฟรี ๆ และไม่มีกับดัก `set -euo pipefail` + SIGPIPE
 * ที่ทำให้ด่านของ `plan` เคยเขียวทั้งที่ไม่ได้ตรวจอะไรเลย
 *
 * ตัวแปรที่ต้องส่งเข้ามา: BASE (เช่น origin/main) · HEAD_REF · PR_AUTHOR
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { APP_PATHSPEC, parseAddedLines, checkGuard } from './guard-rules.mjs';

const BASE = process.env.BASE || 'origin/main';
const HEAD_REF = process.env.HEAD_REF || '';
const PR_AUTHOR = process.env.PR_AUTHOR || '';

// ⚠️ **`core.quotepath=false` จำเป็น ห้ามเอาออก**
//    ค่าเริ่มต้นของ git แปลงชื่อไฟล์ที่ไม่ใช่ ASCII เป็นรหัส C แล้วครอบอัญประกาศ —
//    `ยอดจริง.xlsx` กลายเป็น `"à¸¢....xlsx"` ซึ่งลงท้ายด้วยอัญประกาศ
//    ด่านที่เทียบนามสกุลท้ายชื่อไฟล์จึงมองไม่เห็น และ **ไฟล์ Excel ที่มีชื่อเป็นไทย
//    (ซึ่งคือชื่อของไฟล์จริงทุกไฟล์ในงานนี้) จะหลุดเข้า repo public ได้แบบเงียบ ๆ**
//    เจอตอน self-test ก่อน push — เทสระดับกฎจับข้อนี้ไม่ได้เพราะมันเกิดที่ชั้นคุยกับ git
const git = (...args) =>
  execFileSync('git', ['-c', 'core.quotepath=false', ...args],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const lines = s => s.split(/\r?\n/).filter(Boolean);
const range = `${BASE}...HEAD`;

const changed = lines(git('diff', '--name-only', range));
const deleted = lines(git('diff', '--name-status', range))
  .filter(l => /^D\s/.test(l)).map(l => l.replace(/^D\s+/, ''));

// ── บรรทัดที่เพิ่มเข้ามา ──
// `-U0` ตัดบรรทัดบริบททิ้ง เหลือเฉพาะของที่เปลี่ยนจริง — diff เล็กลงมาก
// และกันการจับผิดจากโค้ดเดิมที่บังเอิญอยู่ใกล้จุดที่แก้
const added = parseAddedLines(git('diff', '-U0', range));

const appLines = lines(git('diff', '--numstat', range, '--', ...APP_PATHSPEC))
  .reduce((sum, l) => {
    const [a, d] = l.split(/\s+/);
    // ไฟล์ไบนารีมาเป็น `-` ไม่ใช่ตัวเลข — นับเป็น 0 แทนที่จะได้ NaN แล้วเพดานพังทั้งข้อ
    return sum + (Number(a) || 0) + (Number(d) || 0);
  }, 0);

// ── PR นี้มาจาก agent หรือเปล่า ──
// ⚠️ ตัวแปรนี้บอกได้แค่ "agent ที่ประกาศตัวเอง" เท่านั้น
//    agent ที่รันบนเครื่องเจ้าของใช้บัญชีเจ้าของเปิด PR ฝั่ง GitHub จึงแยกไม่ออกเลย
//    ว่าเป็นคนหรือเครื่อง — และไม่มีทางแยกออก ตราบใดที่ทั้งสองใช้บัญชีเดียวกัน
//    จึงห้ามใช้เป็นด่านสุดท้ายของอะไรที่พังแล้วเสียหายหนัก
//    ด่านจริงของเรื่องนั้นคือ required check ที่ลบทิ้งไม่ได้ + ผู้ตรวจ + สายตาเจ้าของ
const isAgent = PR_AUTHOR === 'github-actions[bot]' || PR_AUTHOR === 'github-actions'
  || /^(claude|fix)\//.test(HEAD_REF);

console.log(`PR โดย: ${PR_AUTHOR || '(ไม่ทราบ)'}   branch: ${HEAD_REF || '(ไม่ทราบ)'}`);
console.log(`ถือเป็น PR ของ agent: ${isAgent ? 'yes' : 'no'}`);
console.log(`ไฟล์ที่เปลี่ยน ${changed.length} ไฟล์ · บรรทัดในไฟล์แอป ${appLines}`);
changed.forEach(p => console.log('  ' + p));
console.log('');

const gitignore = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf8') : null;
const { errors, warnings } = checkGuard({ changed, deleted, added, appLines, isAgent, gitignore });

for (const w of warnings) console.log(`::warning::⚠️ ${w}`);
for (const e of errors) console.log(`::error::${e}`);

if (errors.length) {
  console.log(`\n✖ ไม่ผ่าน — ${errors.length} ข้อ`);
  process.exit(1);
}
console.log(`✓ ผ่าน${warnings.length ? ` (มีคำเตือน ${warnings.length} ข้อ ให้อ่านด้วยตา)` : ''}`);
