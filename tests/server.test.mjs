/**
 * เทสการตีความคำตอบจากเซิร์ฟเวอร์
 *
 * เหตุที่มีไฟล์นี้: 10 ต.ค. 2026 เจ้าของใส่ URL ของ `store` มาแทนของ `plan`
 * ปุ่มทดสอบการเชื่อมต่อขึ้นว่า "ผ่าน" เพราะสคริปต์ทั้งสองตัวรับ `ping` ได้เหมือนกัน
 * แล้วไปพังตอนดึงข้อมูลจริงด้วยข้อความ "ไม่รู้จักคำสั่ง: pullRows"
 * ซึ่งไม่ได้บอกเลยว่าต้องไปแก้อะไร
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyScript, describePing, explainError } from '../core/server.js';

// รูปร่างคำตอบจริงของ doPing ทั้งสองตัว (ไม่ใส่ค่าจริงของธุรกิจ)
const PLAN_PING  = { ok: true, serverTime: 'x', orderCount: 0, recordCount: 0, spreadsheet: 'สมุดแผนงาน' };
const STORE_PING = { ok: true, serverTime: 'x', counts: { entries: 0, materials: 0 }, spreadsheet: 'สมุดสต็อก' };

test('D3 — แยกออกว่า ping มาจากสคริปต์ตัวไหน', () => {
  assert.equal(identifyScript(PLAN_PING), 'plan');
  assert.equal(identifyScript(STORE_PING), 'store');
  assert.equal(identifyScript({ ok: true }), 'unknown');
  assert.equal(identifyScript(null), 'unknown');
  assert.equal(identifyScript('ok'), 'unknown');
});

test('D3 — ชีตเปล่าก็ยังแยกออก (ดูว่ามีช่องอะไร ไม่ใช่ค่าเป็นเท่าไหร่)', () => {
  assert.equal(identifyScript({ ok: true, orderCount: 0, recordCount: 0 }), 'plan');
  assert.equal(identifyScript({ ok: true, counts: {} }), 'store');
});

test('D3 — ต่อถูกสคริปต์ = ผ่าน และบอกชื่อไฟล์ให้ยืนยันด้วยตา', () => {
  const r = describePing(PLAN_PING);
  assert.equal(r.ok, true);
  assert.match(r.text, /แผนงาน/);
  assert.match(r.text, /สมุดแผนงาน/, 'ต้องบอกชื่อไฟล์ จะได้รู้ว่าต่อถูกสมุดไหม');
});

test('D3 — ต่อผิดสคริปต์ต้องถือว่า "ไม่ผ่าน" ไม่ใช่ผ่านแบบมีข้อควรระวัง', () => {
  const r = describePing(STORE_PING);
  assert.equal(r.ok, false, 'ถ้าบอกว่าผ่าน คนจะกดใช้ต่อแล้วไปเจอ error ที่อ่านไม่รู้เรื่องอยู่ดี');
  assert.match(r.text, /สต็อกวัตถุดิบ/);
  assert.match(r.text, /แผนงาน/, 'ต้องบอกด้วยว่าที่ถูกต้องไปเอามาจากไหน');
});

test('D3 — ไม่รู้จักสคริปต์ ก็ต้องไม่ผ่าน และบอกทางต่อ', () => {
  const r = describePing({ ok: true, spreadsheet: 'อะไรสักอย่าง' });
  assert.equal(r.ok, false);
  assert.match(r.text, /แผนงาน/);
});

test('D3 — "ไม่รู้จักคำสั่ง" ต้องถูกแปลให้บอกว่าไปแก้ตรงไหน', () => {
  const out = explainError('ไม่รู้จักคำสั่ง: pullRows');
  assert.match(out, /ไม่รู้จักคำสั่ง: pullRows/, 'ต้องคงข้อความเดิมไว้ด้วย ไม่ใช่กลบทิ้ง');
  assert.match(out, /store/);
  assert.match(out, /ตั้งค่าการเชื่อมต่อ/, 'ต้องบอกว่ากดปุ่มไหน');
});

test('D3 — "ไม่รู้จักตาราง" แปลว่าสคริปต์เป็นรุ่นเก่า คนละสาเหตุกัน', () => {
  const out = explainError('ไม่รู้จักตาราง: DeliveryNotes');
  assert.match(out, /รุ่นเก่า/);
  assert.match(out, /New version/, 'ต้องบอกขั้นตอน redeploy');
  assert.doesNotMatch(out, /store/, 'คนละสาเหตุกับการต่อผิดสคริปต์ ห้ามชี้ผิดทาง');
});

test('D3 — ข้อความอื่นปล่อยผ่านตามเดิม ไม่เดาสาเหตุให้', () => {
  assert.equal(explainError('อะไรสักอย่างที่ไม่รู้จัก'), 'อะไรสักอย่างที่ไม่รู้จัก');
  assert.equal(explainError(''), '');
  assert.equal(explainError(null), '');
});
