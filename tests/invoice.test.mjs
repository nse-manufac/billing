/**
 * เทสกฎล้วนของ invoice — รันด้วย node ล้วน ชื่อเทสอ้างรหัสข้อใน INVARIANTS.md ตรง ๆ
 *
 * ⚠️ เลข PO · GR · P/N · ยอด ในเทสต้องเป็นของสมมติล้วนเสมอ repo นี้เป็น public
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { round2, unitFromPo, totalsOf, buildInvoices } from '../core/invoice.js';

/** แถวจากไฟล์ Delta — ตำแหน่งที่ 7 ของรหัส PO คือหน่วย */
const row = (o = {}) => Object.assign({
  invNo: 'TUE-H001', grDate: '2026-10-30', grNo: 'GR1', poNo: 'ZZ0000H001', poItem: '10',
  pn: 'PN1', desc: 'ของสมมติ', qty: 100, uom: 'PCE', unitPrice: 10, grAmount: 1000, mvt: '101'
}, o);

const one = rows => buildInvoices(rows).invoices[0];
const codes = inv => inv.problems.map(p => p.code);

test('E4 — round2 ปัดแบบ Excel ไม่ใช่แบบเลขฐานสอง', () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(2.344), 2.34);
  assert.equal(round2(2.346), 2.35);
  assert.equal(round2(-1.005), -1.01, 'ค่าลบปัดออกจากศูนย์');
  assert.equal(round2('abc'), 0);
  assert.equal(round2(null), 0);
});

test('E4 — ยอดปัดรายบรรทัดก่อนแล้วค่อยรวม ไม่ใช่รวมแล้วปัด', () => {
  // รวมก่อนปัด = 0.016 + 0.016 → 0.03 · ปัดก่อนรวม = 0.02 + 0.02 → 0.04
  const lines = [{ amount: round2(0.016) }, { amount: round2(0.016) }];
  assert.equal(totalsOf(lines).subtotal, 0.04);
});

test('E4 — ยอดสองบรรทัดที่รวมก่อนปัดแล้วเพี้ยน 1 สตางค์ ต้องได้ผลแบบปัดรายบรรทัด', () => {
  const inv = one([
    row({ poNo: 'ZZ0000H001', qty: 1, unitPrice: 0.016, grAmount: '' }),
    row({ poNo: 'ZZ0000H002', qty: 1, unitPrice: 0.016, grAmount: '' })
  ]);
  assert.equal(inv.lines[0].amount, 0.02);
  assert.equal(inv.subtotal, 0.04);
});

test('E4 — VAT คิดรายบรรทัดแล้วรวม ไม่ใช่คิดจากยอดรวม', () => {
  // จากยอดรวม = 200.10 × 7% → 14.01 · รายบรรทัด = 7.00 + 7.00 → 14.00
  assert.deepEqual(totalsOf([{ amount: 100.05 }, { amount: 100.05 }]),
                   { subtotal: 200.1, vat: 14, total: 214.1 });
  assert.deepEqual(totalsOf([{ amount: 1234.5 }]),
                   { subtotal: 1234.5, vat: 86.42, total: 1320.92 });
  assert.deepEqual(totalsOf([]), { subtotal: 0, vat: 0, total: 0 });
});

test('E3 — หนึ่งใบ = หนึ่ง GR No · หลาย PO อยู่ใบเดียวได้ · แถวถัดไปเว้นเลขได้', () => {
  const { invoices } = buildInvoices([
    row({ invNo: 'TUE-H001', grNo: 'GR1', poNo: 'ZZ0000H001' }),
    row({ invNo: '', grNo: 'GR1', poNo: 'ZZ0000H002' }),
    row({ invNo: 'TUE-H002', grNo: 'GR2', poNo: 'ZZ0000H003' })
  ]);
  assert.equal(invoices.length, 2);
  assert.equal(invoices[0].lines.length, 2);
  assert.equal(invoices[0].invNo, 'TUE-H001');
  assert.equal(invoices[0].subtotal, 2000);
  assert.deepEqual(invoices[0].problems, []);
});

test('E3 — แถวที่ไม่มี GR No รวมเข้าใบไม่ได้ ต้องส่งคืนให้เห็น · แถวเปล่าไม่นับ', () => {
  const r = buildInvoices([row({ grNo: '' }), { grNo: '' }, null]);
  assert.equal(r.invoices.length, 0);
  assert.equal(r.orphans.length, 1);
});

test('E5 — ยอดของ Delta คือต้นทาง คิดเองเฉพาะเมื่อไฟล์ไม่มียอด', () => {
  const inv = one([row({ qty: 30, unitPrice: 5.1234, grAmount: 153.75 })]);
  assert.equal(inv.lines[0].amount, 153.75, 'ห้ามเอายอดที่คิดเองไปทับของ Delta');
  assert.equal(inv.lines[0].amountDiff, 0.05);

  const satang = one([row({ qty: 30, unitPrice: 5.1234, grAmount: 153.71 })]);
  assert.equal(satang.lines[0].amount, 153.71);

  const calc = one([row({ qty: 30, unitPrice: 5.1234, grAmount: '' })]);
  assert.equal(calc.lines[0].amount, 153.7);
  assert.equal(calc.lines[0].amountDiff, 0);
});

test('E1 — เลขมาจาก Delta เท่านั้น ใบที่ยังไม่มีเลขต้องว่าง ห้ามคิดให้', () => {
  const inv = one([row({ invNo: '' })]);
  assert.equal(inv.invNo, '');
  assert.ok(codes(inv).includes('noInvNo'));
});

test('E1 — เลขเดียวกันห้ามอยู่สอง GR · GR เดียวห้ามมีสองเลข', () => {
  const dup = buildInvoices([row({ grNo: 'GR1' }), row({ grNo: 'GR2' })]).invoices;
  assert.ok(dup.every(i => codes(i).includes('dupInvNo')));

  const two = one([row({ invNo: 'TUE-H001' }), row({ invNo: 'TUE-H002', poItem: '20' })]);
  assert.ok(codes(two).includes('invConflict'));
});

test('E6 — ลากไฟล์ทับกันแล้วแถวซ้ำเป๊ะ ต้องไม่นับสองรอบ และบอกจำนวนที่ตัดออก', () => {
  const r = buildInvoices([row(), row(), row({ poItem: '20' })]);
  assert.equal(r.dropped, 1);
  assert.equal(r.invoices[0].lines.length, 2);
  assert.equal(r.invoices[0].subtotal, 2000, 'แถวซ้ำหลุดเข้ามา ยอดจะเกินจริงแบบเงียบ ๆ');
});

test('E6 — กุญแจเดียวกันแต่ยอดต่างกัน เลือกให้เองไม่ได้ ต้องฟ้อง', () => {
  const inv = one([row({ qty: 100 }), row({ qty: 200, grAmount: 2000 })]);
  assert.ok(codes(inv).includes('lineConflict'));
  assert.equal(inv.lines.length, 2, 'เก็บไว้ทั้งสองแถวให้คนตัดสิน');
});

test('หน่วยดูจากรหัส PO', () => {
  assert.equal(unitFromPo('ZZ0000A001'), 'TUE-A');
  assert.equal(unitFromPo('ZZ0000X001'), '');
  assert.equal(unitFromPo(''), '');
  assert.equal(one([row()]).unit, 'TUE-H');
});

test('D2 — ไม่มีข้อมูลหรือช่องหายต้องไม่ล้ม', () => {
  assert.deepEqual(buildInvoices(null), { invoices: [], dropped: 0, orphans: [] });
  assert.equal(buildInvoices([{ grNo: 'GR1' }]).invoices.length, 1);
});
