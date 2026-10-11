/**
 * ตัวเรียกด่านบัมป์เลขรุ่น — ถาม git ว่า PR นี้แตะไฟล์ที่เบราว์เซอร์โหลดไหม
 * แล้วเทียบเลขรุ่นในไฟล์กับเลขบน base branch
 *
 * การตัดสินอยู่ใน `guard-rules.mjs` (checkVersionBump) ซึ่งมีเทสคุม
 * ที่นี่มีแค่การรวบรวมข้อเท็จจริง — หลักเดียวกับ guard.mjs
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { VERSIONED_PATHSPEC, appVersionOf, checkVersionBump } from './guard-rules.mjs';

const BASE = process.env.BASE || 'origin/main';
// `core.quotepath=false` — เหตุผลเดียวกับใน guard.mjs (ชื่อไฟล์ไทยถูกครอบอัญประกาศ)
const git = (...args) => execFileSync('git', ['-c', 'core.quotepath=false', ...args],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const changedVersioned = git('diff', '--name-only', `${BASE}...HEAD`, '--', ...VERSIONED_PATHSPEC)
  .split(/\r?\n/).filter(Boolean);

if (!changedVersioned.length) {
  console.log('PR นี้ไม่ได้แก้ไฟล์ที่เบราว์เซอร์โหลด — ข้ามการตรวจ');
  process.exit(0);
}
console.log('ไฟล์ที่เบราว์เซอร์โหลดและเปลี่ยนใน PR นี้:');
changedVersioned.forEach(p => console.log('  ' + p));

const htmls = fs.readdirSync('.').filter(f => f.endsWith('.html'));
const app = htmls[0];
const newVersion = app ? appVersionOf(fs.readFileSync(app, 'utf8')) : '';
// `git show` ล้มได้ถ้าไฟล์ยังไม่มีบน base (PR ที่เพิ่งสร้างแอป) — ถือว่าไม่มีเลขรุ่นเก่า
let oldVersion = '';
try { oldVersion = appVersionOf(git('show', `${BASE}:${app}`)); } catch { /* ไม่มีไฟล์บน base */ }

console.log(`\n── ${app || '(ไม่พบไฟล์ .html)'}`);
console.log(`   บน base : ${oldVersion || '(ไม่พบ)'}`);
console.log(`   ใน PR   : ${newVersion || '(ไม่พบ)'}`);

const { errors } = checkVersionBump({ changedVersioned, oldVersion, newVersion, htmlCount: htmls.length });
for (const e of errors) console.log(`::error file=${app || 'index.html'}::${e}`);

if (errors.length) process.exit(1);
console.log(`   ✓ บัมป์แล้ว: ${oldVersion || '(ไม่มี)'} → ${newVersion}`);
