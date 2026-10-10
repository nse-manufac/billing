// เทสของด่านตรวจ PR — ด่านที่ไม่มีเทสคือด่านที่ไม่มีใครรู้ว่ายังทำงานอยู่ไหม
//
// ── ทำไมเทสด่าน ──────────────────────────────────────────────────
// ด่านพังแล้ว **เขียว** ไม่ใช่แดง เพราะ "ไม่เจออะไร" กับ "ไม่ได้ตรวจ" หน้าตาเหมือนกันเป๊ะ
// `plan` เคยพลาดรูปแบบนี้สี่รอบติด และเคยมีด่านที่เขียวทั้งที่ grep ตายไปแล้วจาก SIGPIPE
// ของแบบนั้นต้องมีเครื่องจับ ไม่ใช่ต้องระวังให้มากขึ้น

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  checkGuard, parseAddedLines, netLoadUrls,
  ALLOWED_CDN_HOSTS, APP_LINE_LIMIT, REAL_PO_RE, appVersionOf, checkVersionBump, isBrowserFile
} from '../.github/scripts/guard-rules.mjs';

/** PR ที่สะอาด ใช้เป็นฐานแล้วเปลี่ยนทีละอย่าง */
const clean = (over = {}) => ({
  changed: ['core/delivery.js'], deleted: [],
  added: [{ file: 'core/delivery.js', text: 'const x = 1;' }],
  appLines: 10, isAgent: false, gitignore: '/*\n!/index.html\n', ...over
});

const run = over => checkGuard(clean(over));
const joined = r => r.errors.join(' | ');

test('ด่าน — PR ปกติต้องไม่มีทั้ง error และคำเตือน', () => {
  const r = run();
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('ด่าน — แยกบรรทัดที่เพิ่มออกจาก diff ได้ถูกไฟล์', () => {
  const diff = [
    'diff --git a/core/a.js b/core/a.js',
    '--- a/core/a.js',
    '+++ b/core/a.js',
    '@@ -1 +1,2 @@',
    '+เพิ่มในไฟล์แรก',
    '-ของที่ลบออก',
    ' ของที่ไม่เปลี่ยน',
    'diff --git a/docs/b.md b/docs/b.md',
    '--- a/docs/b.md',
    '+++ b/docs/b.md',
    '+เพิ่มในไฟล์ที่สอง'
  ].join('\n');
  assert.deepEqual(parseAddedLines(diff), [
    { file: 'core/a.js', text: 'เพิ่มในไฟล์แรก' },
    { file: 'docs/b.md', text: 'เพิ่มในไฟล์ที่สอง' }
  ]);
});

test('ด่าน — บรรทัดหัว diff (+++) ต้องไม่ถูกนับเป็นเนื้อหาที่เพิ่ม', () => {
  // ถ้านับผิด ชื่อไฟล์จะกลายเป็น "บรรทัดที่เพิ่ม" แล้วด่านจะตรวจชื่อไฟล์แทนเนื้อโค้ด
  const added = parseAddedLines('diff --git a/x.js b/x.js\n--- a/x.js\n+++ b/x.js\n+ของจริง');
  assert.equal(added.length, 1);
  assert.equal(added[0].text, 'ของจริง');
});

test('ด่าน — agent แตะ .github/ ต้องแดง · เจ้าของแตะต้องเตือน ไม่ใช่แดง', () => {
  const asAgent = run({ changed: ['.github/workflows/test.yml'], isAgent: true });
  assert.equal(asAgent.errors.length, 1);
  assert.match(joined(asAgent), /\.github\//);

  const asOwner = run({ changed: ['.github/workflows/test.yml'], isAgent: false });
  assert.deepEqual(asOwner.errors, []);
  assert.equal(asOwner.warnings.length, 1);
  assert.match(asOwner.warnings[0], /ด้วยตา/);
});

test('ด่าน — token ที่หลุดเข้าโค้ดต้องแดง แต่เอกสารอธิบายรูปแบบได้', () => {
  const key = 'sk-ant-' + 'A'.repeat(25);
  const inCode = run({ added: [{ file: 'io/gs-api.js', text: `const k = "${key}";` }] });
  assert.match(joined(inCode), /Anthropic API key/);

  const inDoc = run({ added: [{ file: 'CLAUDE.md', text: `ห้าม commit คีย์แบบ ${key}` }] });
  assert.deepEqual(inDoc.errors, []);
});

test('ด่าน — URL ของ Apps Script ที่หลุดเข้ามาต้องแดง', () => {
  const r = run({ added: [{ file: 'io/settings.js', text: 'url: "https://script.google.com/macros/s/AKfycbx' + 'y'.repeat(25) + '/exec"' }] });
  assert.match(joined(r), /Apps Script/);
});

// ⚠️ รหัสตัวอย่างในไฟล์นี้ต้อง **ประกอบตอนรัน** ห้ามเขียนเป็นสตริงเดียว
//    เพราะด่านตัวที่เทสอยู่นี้สแกน "บรรทัดที่เพิ่มเข้ามา" ของ diff
//    เขียนติดกันเมื่อไหร่ ด่านจะจับไฟล์เทสของตัวเองแล้วบล็อก PR ที่เพิ่มเทสนี้เข้ามา
//    (ไม่ใช่การเลี่ยงด่าน — ด่านตรวจ "รูปแบบในซอร์ส" ส่วนตัวที่ประกอบแล้วยังถูกตรวจเต็ม ๆ)
const PO = (mid, tail) => 'T' + 'M' + mid + tail;

test('ด่าน — รหัส PO จริงต้องแดงทุกที่ รวมในเอกสารและในเทส', () => {
  // รหัสจริงเกือบหลุดเข้าเทสของ repo นี้จริงเมื่อ 10 ต.ค. 2026 — ข้อนี้คือตาข่ายของเรื่องนั้น
  for (const file of ['tests/delivery.test.mjs', 'core/delivery.js', 'README.md']) {
    const r = run({ added: [{ file, text: `poNo: "${PO('5269', 'H688')}"` }] });
    assert.match(joined(r), /รหัส PO/, 'ต้องจับได้ที่ ' + file);
  }
});

test('ด่าน — รหัสเดือน 10 (A) ก็ยังต้องจับได้', () => {
  // ตำแหน่งที่ 6 เป็นตัวอักษรตั้งแต่เดือน 10 — ถ้า regex รับแต่ตัวเลข รหัสครึ่งปีหลังจะหลุดหมด
  assert.match(PO('526A', 'H123'), REAL_PO_RE);
  assert.match(PO('526B', 'U001'), REAL_PO_RE);
  assert.doesNotMatch(PO('526', 'XH12'), REAL_PO_RE, 'เดือนต้องเป็น 0-9 A หรือ B');
});

test('ด่าน — ตัวอย่างที่ขึ้นต้นด้วย ZZ หรือ XX ต้องผ่าน', () => {
  // ต้องมีทางเขียนตัวอย่างให้ถูก ไม่งั้นคนจะหาทางปิดด่านแทนที่จะทำตาม
  for (const code of ['ZZ0001', 'ZZ526AH123', 'XX5269H688'])
    assert.deepEqual(run({ added: [{ file: 'tests/x.test.mjs', text: `poNo: "${code}"` }] }).errors, []);
});

test('ด่าน — ไฟล์ข้อมูลธุรกิจห้าม commit แต่ลบออกได้', () => {
  const addIt = run({ changed: ['ฟอร์มส่งของ.xlsx'] });
  assert.match(joined(addIt), /ข้อมูลธุรกิจ/);

  const removeIt = run({ changed: ['ฟอร์มส่งของ.xlsx'], deleted: ['ฟอร์มส่งของ.xlsx'] });
  assert.deepEqual(removeIt.errors, []);
});

test('ด่าน — ไฟล์ข้อมูลที่ชื่อเป็นภาษาไทยต้องจับได้', () => {
  // ชื่อไฟล์จริงของงานนี้เป็นไทยทั้งหมด และ git ครอบอัญประกาศให้ตอนรายงานชื่อ
  // ถ้าชั้นที่คุยกับ git ไม่ตั้ง core.quotepath=false ชื่อจะลงท้ายด้วย `"` แล้วข้อนี้จะหลุด
  assert.match(joined(run({ changed: ['ฟอร์มส่งของ WK41.xlsx'] })), /ข้อมูลธุรกิจ/);
  assert.match(joined(run({ changed: ['เอกสาร/ใบส่งของ.pdf'] })), /ข้อมูลธุรกิจ/);
});

test('ด่าน — เพดานขนาด PR ใช้กับ agent เท่านั้น', () => {
  const big = APP_LINE_LIMIT + 1;
  assert.match(joined(run({ isAgent: true, appLines: big })), /เพดาน/);
  assert.deepEqual(run({ isAgent: false, appLines: big }).errors, []);
  assert.deepEqual(run({ isAgent: true, appLines: APP_LINE_LIMIT }).errors, []);
});

test('ด่าน — CDN ที่อนุญาตและปักรุ่นแล้วต้องผ่าน', () => {
  const ok = `<script src="https://${ALLOWED_CDN_HOSTS[0]}/ajax/libs/vue/3.4.21/vue.global.prod.min.js"></script>`;
  assert.deepEqual(run({ added: [{ file: 'index.html', text: ok }] }).errors, []);
});

test('ด่าน — CDN โดเมนอื่นต้องแดง', () => {
  const r = run({ added: [{ file: 'index.html', text: '<script src="https://unpkg.com/vue@3.4.21/dist/vue.js"></script>' }] });
  assert.match(joined(r), /unpkg\.com/);
});

test('ด่าน — CDN ที่ไม่ปักเลขรุ่นต้องแดง', () => {
  // `vue@3` เปลี่ยนของใต้เท้าเราได้เองเงียบ ๆ แล้ววันที่จอเพี้ยนจะไม่มี commit ไหนอธิบายได้
  const r = run({ added: [{ file: 'index.html', text: `<script src="https://${ALLOWED_CDN_HOSTS[0]}/ajax/libs/vue/latest/vue.js"></script>` }] });
  assert.match(joined(r), /ปักเลขรุ่น/);
});

test('ด่าน — import จาก URL และอัญประกาศเดี่ยวก็ต้องจับได้', () => {
  assert.deepEqual(netLoadUrls("import x from 'https://evil.example/x.js'"), ['https://evil.example/x.js']);
  assert.deepEqual(netLoadUrls('importScripts("http://a.example/b.js")'), ['http://a.example/b.js']);
  assert.deepEqual(netLoadUrls('<link href=https://a.example/x.css rel=stylesheet>'), ['https://a.example/x.css']);
  assert.deepEqual(netLoadUrls('const u = base + "/exec";'), []);
});

test('ด่าน — ไฟล์ที่เบราว์เซอร์ไม่ได้โหลด ไม่ถูกตรวจเรื่อง CDN', () => {
  // ⚠️ เคสนี้มาจากของจริง — dry-run ครั้งแรกก่อน push ด่านแดงใส่ไฟล์เทสของตัวเอง 7 ข้อ
  //    เพราะไฟล์เทส **ต้อง** มีตัวอย่างโดเมนปลอมไว้พิสูจน์ว่าด่านยังจับได้
  //    ถ้าเหมารวม ด่านจะบล็อก PR ที่เพิ่มเทสของตัวเองเข้ามา = ด่านที่ทดสอบตัวเองไม่ได้
  assert.equal(isBrowserFile('index.html'), true);
  assert.equal(isBrowserFile('core/delivery.js'), true);
  assert.equal(isBrowserFile('tests/guard.test.mjs'), false);
  assert.equal(isBrowserFile('.github/scripts/guard.mjs'), false);
  assert.equal(isBrowserFile('README.md'), false);

  const bad = '<script src="https://unpkg.com/vue@3"></script>';
  for (const file of ['tests/zz.test.mjs', '.github/scripts/x.mjs'])
    assert.deepEqual(run({ added: [{ file, text: bad }] }).errors, [], 'ต้องไม่ตรวจ ' + file);
  assert.notDeepEqual(run({ added: [{ file: 'index.html', text: bad }] }).errors, []);
});

test('ด่าน — ข้อความเดิมซ้ำหลายบรรทัด ต้องขึ้นครั้งเดียว', () => {
  const bad = '<script src="https://unpkg.com/vue@3.4.21/x.js"></script>';
  const r = run({ added: [1, 2, 3].map(() => ({ file: 'index.html', text: bad })) });
  assert.equal(r.errors.length, 1);
});

test('ด่าน — เอกสารยกตัวอย่าง URL ที่ห้ามใช้ได้ ไม่ติดด่าน CDN', () => {
  // ถ้าไม่ยกเว้น .md การเขียนเตือนเรื่องนี้ไว้ใน CLAUDE.md จะทำให้ด่านแดงเอง
  const r = run({ added: [{ file: 'CLAUDE.md', text: 'ห้ามใช้ <script src="https://unpkg.com/vue@3">' }] });
  assert.deepEqual(r.errors, []);
});

test('ด่าน — ลบไฟล์เทสทิ้งต้องแดง', () => {
  const r = run({ changed: ['tests/delivery.test.mjs'], deleted: ['tests/delivery.test.mjs'] });
  assert.match(joined(r), /ลบไฟล์เทส/);
});

test('ด่าน — .gitignore ที่ไม่ปฏิเสธทุกอย่างก่อนต้องแดง', () => {
  assert.match(joined(run({ gitignore: 'node_modules/\n' })), /gitignore/);
  assert.deepEqual(run({ gitignore: '# คอมเมนต์\n/*\n!/index.html\n' }).errors, []);
});

test('ด่าน — ของจริงใน repo ต้องผ่านด่านตัวเอง', () => {
  // ด่านที่แดงกับไฟล์ที่อยู่ใน main อยู่แล้ว ใช้งานไม่ได้เลยสักใบ
  // ข้อนี้ผูกตัวด่านกับตัวแอปไว้ด้วยกัน ใครเปลี่ยนฝั่งไหนก็จะรู้ทันที
  const html = fs.readFileSync('index.html', 'utf8');
  const added = html.split(/\r?\n/).map(text => ({ file: 'index.html', text }));
  const r = checkGuard({ changed: ['index.html'], deleted: [], added, appLines: 1, isAgent: true,
    gitignore: fs.readFileSync('.gitignore', 'utf8') });
  assert.deepEqual(r.errors, []);
});

/* ── ด่านบัมป์เลขรุ่น ───────────────────────────────────────────── */

test('ด่านเลขรุ่น — อ่านเลขรุ่นจาก <head> ได้ และไม่มีก็ต้องรู้ว่าไม่มี', () => {
  assert.equal(appVersionOf('<meta name="app-version" content="2026-10-10.5">'), '2026-10-10.5');
  assert.equal(appVersionOf('<meta name="viewport" content="x">'), '');
  assert.equal(appVersionOf(null), '');
});

test('ด่านเลขรุ่น — ของจริงใน repo ต้องมีเลขรุ่นอ่านได้', () => {
  // ถ้าวันหนึ่งมีคนเปลี่ยนรูปแบบ meta ตัวอ่านจะกลายเป็น "หาไม่เจอ" แล้วด่านแดงทุกใบ
  // ข้อนี้ทำให้รู้ตั้งแต่ใบที่เปลี่ยนรูปแบบ ไม่ใช่ใบถัดไปที่ไม่เกี่ยวอะไรเลย
  assert.match(appVersionOf(fs.readFileSync('index.html', 'utf8')), /\d{4}-\d{2}-\d{2}/);
});

test('ด่านเลขรุ่น — ไม่แตะไฟล์ที่เบราว์เซอร์โหลด = ข้ามไป', () => {
  const r = checkVersionBump({ changedVersioned: [], htmlCount: 1 });
  assert.deepEqual(r.errors, []);
  assert.equal(r.skipped, true);
});

test('ด่านเลขรุ่น — แก้แค่ core/*.js ก็ต้องบัมป์', () => {
  // แยกไฟล์แล้วแคชหมดอายุไม่พร้อมกัน — core/ ใหม่ไปคู่กับ index.html เก่าได้
  const r = checkVersionBump({ changedVersioned: ['core/delivery.js'], htmlCount: 1,
    oldVersion: '2026-10-10.5', newVersion: '2026-10-10.5' });
  assert.match(r.errors.join(' '), /บัมป์ app-version/);
});

test('ด่านเลขรุ่น — บัมป์แล้วต้องผ่าน', () => {
  assert.deepEqual(checkVersionBump({ changedVersioned: ['index.html'], htmlCount: 1,
    oldVersion: '2026-10-10.5', newVersion: '2026-10-11.1' }).errors, []);
});

test('ด่านเลขรุ่น — ไม่มี meta เลยต้องแดง', () => {
  assert.match(checkVersionBump({ changedVersioned: ['index.html'], htmlCount: 1,
    oldVersion: '', newVersion: '' }).errors.join(' '), /ไม่พบ/);
});

test('ด่านเลขรุ่น — มีสองแอปในรากเดียวกันต้องแดง ไม่ใช่เดาว่าอันไหนคือแอปหลัก', () => {
  assert.match(checkVersionBump({ changedVersioned: ['index.html'], htmlCount: 2 }).errors.join(' '),
    /แก้ด่านก่อน/);
});
