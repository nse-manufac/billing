/**
 * เทสกฎล้วนของใบส่งของ — รันด้วย node ล้วน ไม่ต้องเปิดเบราว์เซอร์
 * ชื่อเทสอ้างรหัสข้อใน INVARIANTS.md ตรง ๆ
 *
 * ⚠️ เลข PO · P/N · ยอด ในเทสต้องเป็นของสมมติล้วนเสมอ repo นี้เป็น public
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  qtyOf, isVoided, activeRows, dayKeyOf,
  buildBills, filterBills, summarize, unitsOf
} from '../core/delivery.js';

let seq = 0;
const uid = p => p + (++seq);

/** แถวยอดบรรจุ (DeliveryNotes) — orderId ว่างเสมอตามของจริง */
const pack = (o = {}) => Object.assign({
  id: uid('n'), date: '2026-10-01', unit: 'TUE-H', orderId: '', pn: 'PN1',
  perBox: 10, boxes: 2, remainder: 3, remark: '', billNo: '', voided: false
}, o);

/** แถวตัดเข้าใบสั่ง (Records, process=shipping) */
const ship = (o = {}) => Object.assign({
  id: uid('r'), date: '2026-10-01', orderId: 'o1', process: 'shipping',
  qty: 23, voided: false
}, o);

/** ใบสั่ง (Orders) */
const order = (o = {}) => Object.assign({
  id: 'o1', poNo: 'ZZ0001', pn: 'PN1', subName: 'TUE-H', orderQty: 100, voided: false
}, o);

test('A1 — ยอดส่ง = ต่อกล่อง × กล่อง + เศษ (ต้องตรงกับสูตรใน plan)', () => {
  assert.equal(qtyOf({ perBox: 10, boxes: 2, remainder: 3 }), 23);
  assert.equal(qtyOf({ perBox: 0, boxes: 0, remainder: 7 }), 7, 'ไม่บอกต่อกล่อง = ทุกชิ้นเป็นเศษ');
  assert.equal(qtyOf({}), 0, 'ช่องว่างต้องเป็น 0 ไม่ใช่ NaN');
  assert.equal(qtyOf({ perBox: '10', boxes: '2', remainder: '3' }), 23, 'สตริงจากชีตต้องคิดได้');
});

test('A2 — voided ที่มาจากชีตเป็นสตริงได้ ต้องอ่านออกทุกแบบ', () => {
  for (const v of [true, 'TRUE', 'true', 'True', 1, '1', 'yes'])
    assert.equal(isVoided({ voided: v }), true, 'ต้องถือว่ายกเลิก: ' + JSON.stringify(v));
  for (const v of [false, 'FALSE', 'false', '', null, undefined, 0])
    assert.equal(isVoided({ voided: v }), false, 'ต้องถือว่ายังใช้ได้: ' + JSON.stringify(v));
});

test('A2 — แถวที่ยกเลิกต้องไม่ถูกนับ ทั้งฝั่งยอดบรรจุและฝั่งตัดเข้าใบสั่ง', () => {
  const b = buildBills(
    [pack({ perBox: 10, boxes: 1, remainder: 0 }),
     pack({ pn: 'PN9', perBox: 10, boxes: 5, remainder: 0, voided: 'TRUE' })],
    [ship({ qty: 10 }), ship({ orderId: 'o1', qty: 999, voided: 'TRUE' })],
    [order()]
  );
  assert.equal(b.length, 1);
  assert.equal(b[0].qty, 10, 'ยอดบรรจุที่ยกเลิกหลุดเข้ามา ยอดจะเกินจริงแบบเงียบ ๆ');
  assert.equal(b[0].allocQty, 10);
  assert.equal(b[0].allocs.length, 1);
});

test('B2 — หนึ่งใบ = หนึ่งวัน + หนึ่งหน่วย ไม่ใช่ใบละ P/N', () => {
  const b = buildBills(
    [pack({ pn: 'PN1' }), pack({ pn: 'PN2' }), pack({ pn: 'PN3' })], [], []);
  assert.equal(b.length, 1, 'สาม P/N ในวันเดียวหน่วยเดียว = ใบเดียว');
  assert.equal(b[0].packs.length, 3);
  assert.deepEqual(b[0].pns, ['PN1', 'PN2', 'PN3']);
});

test('B2 — คนละวันหรือคนละหน่วย = คนละใบ', () => {
  const b = buildBills([
    pack({ date: '2026-10-01', unit: 'TUE-H' }),
    pack({ date: '2026-10-02', unit: 'TUE-H' }),
    pack({ date: '2026-10-01', unit: 'TUE-U' })
  ], [], []);
  assert.equal(b.length, 3);
  assert.equal(dayKeyOf('2026-10-01', 'TUE-H'), dayKeyOf('2026-10-01', ' tue-h '),
    'หน่วยที่พิมพ์ต่างตัวพิมพ์หรือมีเว้นวรรค ต้องเป็นใบเดียวกัน');
});

test('B2 — ใบที่ยังไม่ออกเลข ยังเป็นใบของมันตามวัน ไม่ใช่แตกเป็นใบละแถว', () => {
  const b = buildBills([pack({ pn: 'PN1' }), pack({ pn: 'PN2' })], [], []);
  assert.equal(b.length, 1);
  assert.equal(b[0].issued, false);
  assert.equal(b[0].billNo, '');
});

test('B5 — เลขใบขัดกันในใบเดียว ต้องเห็น ไม่ใช่เลือกให้เงียบ ๆ', () => {
  const ok = buildBills([pack({ billNo: 'DN-1' }), pack({ pn: 'PN2', billNo: ' DN-1 ' })], [], []);
  assert.equal(ok[0].billConflict, false, 'เว้นวรรคหัวท้ายไม่นับว่าขัดกัน');

  const bad = buildBills([pack({ billNo: 'DN-1' }), pack({ pn: 'PN2', billNo: 'DN-2' })], [], []);
  assert.equal(bad[0].billConflict, true);
  assert.deepEqual(bad[0].billNos, ['DN-1', 'DN-2']);
});

test('B6 — หน่วยของยอดที่ตัดเข้าใบสั่ง มาจาก Orders.subName ไม่ใช่จากตัว record', () => {
  const b = buildBills(
    [pack({ unit: 'TUE-H' }), pack({ unit: 'TUE-U', pn: 'PN2' })],
    [ship({ orderId: 'oH', qty: 5 }), ship({ orderId: 'oU', qty: 7 })],
    [order({ id: 'oH', poNo: 'ZZ0001', subName: 'TUE-H' }),
     order({ id: 'oU', poNo: 'ZZ0002', subName: 'TUE-U', pn: 'PN2' })]
  );
  const h = b.find(x => x.unit === 'TUE-H'), u = b.find(x => x.unit === 'TUE-U');
  assert.deepEqual(h.poNos, ['ZZ0001']);
  assert.deepEqual(u.poNos, ['ZZ0002']);
});

test('B6 — record ที่หาใบสั่งไม่เจอ ต้องทิ้ง ไม่ใช่เดาหน่วยให้', () => {
  const b = buildBills([pack()], [ship({ orderId: 'ไม่มีจริง', qty: 99 })], [order()]);
  assert.equal(b[0].allocs.length, 0, 'เดาหน่วยผิดแล้วยอดจะไปโผล่ในใบของอีกโรงงาน');
  assert.equal(b[0].allocQty, 0);
});

test('B6 — record ที่ไม่ใช่ shipping ต้องไม่ถูกนับ', () => {
  const b = buildBills([pack()], [ship({ process: 'winding', qty: 500 })], [order()]);
  assert.equal(b[0].allocQty ?? b[0].allocQty, 0);
  assert.equal(b[0].allocs.length, 0);
});

test('B7 — ยอดบรรจุที่ยังตัดเข้าใบสั่งไม่ครบ ต้องบอกได้ว่าเหลือเท่าไหร่', () => {
  const b = buildBills([pack({ perBox: 10, boxes: 10, remainder: 0 })],
                       [ship({ qty: 60 })], [order()]);
  assert.equal(b[0].qty, 100);
  assert.equal(b[0].allocQty, 60);
  assert.equal(b[0].unallocated, 40, 'กรุงเทพต้องรู้ก่อนวางบิลว่ายังตัดไม่ครบ');
});

test('B4 — รายการเรียงวันใหม่ก่อนเก่า', () => {
  const b = buildBills([
    pack({ date: '2026-09-01' }), pack({ date: '2026-10-09' }), pack({ date: '2026-10-01' })
  ], [], []);
  assert.deepEqual(b.map(x => x.date), ['2026-10-09', '2026-10-01', '2026-09-01']);
});

test('C2 — ตัวกรองสถานะเลขใบ และไม่ตั้งเงื่อนไข = ไม่กรอง', () => {
  const b = buildBills([pack({ billNo: 'DN-1' }), pack({ date: '2026-10-02' })], [], []);
  assert.equal(filterBills(b, { issued: 'yes' }).length, 1);
  assert.equal(filterBills(b, { issued: 'no' }).length, 1);
  assert.equal(filterBills(b, {}).length, 2);
  assert.equal(filterBills(b, { issued: 'all' }).length, 2);
});

test('C2 — ค้นหาเจอทั้งเลขใบ เลข PO P/N หมายเหตุ และวันที่', () => {
  const b = buildBills([pack({ billNo: 'DN-42', pn: 'XA9', remark: 'ด่วน' })],
                       [ship({ qty: 1 })], [order({ poNo: 'ZZ0001' })]);
  for (const q of ['dn-42', 'xa9', 'ด่วน', 'zz00', '2026-10'])
    assert.equal(filterBills(b, { q }).length, 1, 'ต้องค้นเจอด้วย: ' + q);
  assert.equal(filterBills(b, { q: 'ไม่มีจริง' }).length, 0);
});

test('C2 — ช่วงวันที่รวมวันหัวและวันท้าย', () => {
  const b = buildBills([pack({ date: '2026-10-01' }), pack({ date: '2026-10-05' }),
                        pack({ date: '2026-10-09' })], [], []);
  assert.deepEqual(filterBills(b, { from: '2026-10-01', to: '2026-10-05' })
    .map(x => x.date).sort(), ['2026-10-01', '2026-10-05']);
});

test('C3 — ยอดสรุปนับจากรายการที่เห็นบนจอเท่านั้น', () => {
  const b = buildBills([pack({ billNo: 'DN-1', perBox: 10, boxes: 1, remainder: 0 }),
                        pack({ date: '2026-10-02', perBox: 10, boxes: 2, remainder: 0 })],
                       [], []);
  const s = summarize(b);
  assert.equal(s.bills, 2); assert.equal(s.issued, 1); assert.equal(s.pending, 1);
  assert.equal(s.qty, 30);
  assert.equal(summarize(filterBills(b, { issued: 'yes' })).qty, 10);
  assert.equal(summarize([]).bills, 0);
});

test('C3 — ยอดสรุปชี้ใบที่ต้องดูก่อน (ตัดไม่ครบ หรือเลขใบขัดกัน)', () => {
  const b = buildBills([pack({ perBox: 10, boxes: 10, remainder: 0 })], [ship({ qty: 60 })], [order()]);
  assert.equal(summarize(b).needAttention, 1);
  const ok = buildBills([pack({ perBox: 10, boxes: 10, remainder: 0 })], [ship({ qty: 100 })], [order()]);
  assert.equal(summarize(ok).needAttention, 0);
});

test('C4 — รายชื่อหน่วยมาจากข้อมูลจริง ไม่ฮาร์ดโค้ด และไม่มีค่าว่างปน', () => {
  const b = buildBills([pack({ unit: 'TUE-U' }), pack({ unit: 'TUE-H', date: '2026-10-02' }),
                        pack({ unit: '', date: '2026-10-03' })], [], []);
  assert.deepEqual(unitsOf(b), ['TUE-H', 'TUE-U']);
});

test('D2 — ข้อมูลเปล่าหรือพังต้องไม่ทำให้ล้ม', () => {
  assert.deepEqual(buildBills([], [], []), []);
  assert.deepEqual(buildBills(null, null, null), []);
  assert.deepEqual(activeRows(undefined), []);
  assert.equal(buildBills([pack(), null, undefined], [null], [undefined]).length, 1);
});
