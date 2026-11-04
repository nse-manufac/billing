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

test('B8 — วันที่มียอดส่งแต่ยังไม่ได้คีย์ยอดบรรจุ ต้องแยกออกจาก "ตัดไม่ครบ"', () => {
  // เจอเยอะในข้อมูลจริง (10 ต.ค. 2026) เพราะ plan ยังเปิดทางคีย์ยอดส่ง
  // ที่แท็บคีย์ยอดรายวันไว้เป็นทางสำรอง วันพวกนั้นยังไม่เคยออกใบส่งของเลย
  const b = buildBills([], [ship({ qty: 8186 })], [order()]);
  assert.equal(b.length, 1);
  assert.equal(b[0].hasPacking, false);
  assert.equal(b[0].qty, 0);
  assert.equal(b[0].allocQty, 8186);
  assert.equal(b[0].unallocated, 0,
    'ถ้าเหมารวมกับ "ตัดไม่ครบ" จะได้ข้อความว่าเหลือ -8,186 ซึ่งไม่มีความหมาย');
  const s = summarize(b);
  assert.equal(s.noPacking, 1);
  assert.equal(s.needAttention, 0, 'คนละเรื่องกัน ต้องนับแยก');
});

test('B9 — นับ P/N จากทั้งยอดบรรจุและใบสั่ง ไม่ใช่จากยอดบรรจุอย่างเดียว', () => {
  // วันที่ยังไม่มียอดบรรจุ ก็ยังรู้ P/N ได้จากใบสั่ง — ไม่งั้นช่อง P/N ขึ้น 0 ทั้งที่มีของส่งจริง
  const b = buildBills([], [ship({ orderId: 'oA' }), ship({ orderId: 'oB' })],
    [order({ id: 'oA', pn: 'PN1', poNo: 'ZZ0001' }),
     order({ id: 'oB', pn: 'PN2', poNo: 'ZZ0002' })]);
  assert.deepEqual(b[0].pns, ['PN1', 'PN2']);
  assert.deepEqual(b[0].poNos, ['ZZ0001', 'ZZ0002']);
});

test('B9 — P/N ที่ซ้ำกันระหว่างสองฝั่ง ต้องนับครั้งเดียว', () => {
  const b = buildBills([pack({ pn: 'PN1' })], [ship({ qty: 5 })], [order({ pn: 'PN1' })]);
  assert.deepEqual(b[0].pns, ['PN1']);
});

/** แถวการกดออกใบ (DeliveryLog) — qty คือยอดตัดราย PO รวมของใบ */
const issue = (o = {}) => Object.assign({
  id: uid('l'), no: 'TUEH-261001', date: '2026-10-01', unit: 'TUE-H', week: '', groups: 1,
  lines: 1, qty: 23, deviceName: 'เครื่องทดสอบ', createdAt: '2026-10-01T08:00:00.000Z',
  voided: false
}, o);

test('B8 — ออกใบแล้วหรือยัง ดูจาก DeliveryLog ไม่ใช่จาก billNo หรือยอดบรรจุ', () => {
  const [noLog] = buildBills([pack({ billNo: 'B-1' })], [ship()], [order()], []);
  assert.equal(noLog.dispatched, false, 'มี billNo ไม่ได้แปลว่ากดออกใบ');
  assert.equal(noLog.issued, true);
  assert.equal(noLog.noteNo, '');

  const [logged] = buildBills([pack()], [ship()], [order()], [issue()]);
  assert.equal(logged.dispatched, true);
  assert.equal(logged.noteNo, 'TUEH-261001');
  assert.equal(logged.billNo, '', 'เลขที่ใบส่งของห้ามไหลเข้าช่อง billNo');
  assert.equal(logged.issued, false);
});

test('B8 — ออกซ้ำหน่วย+วันเดิมยังเป็นใบเดียว และเรียงครั้งล่าสุดขึ้นก่อน (B2)', () => {
  const bills = buildBills([pack()], [ship()], [order()], [
    issue({ createdAt: '2026-10-01T08:00:00.000Z', deviceName: 'เก่า' }),
    issue({ createdAt: '2026-10-01T09:00:00.000Z', deviceName: 'ใหม่' })
  ]);
  assert.equal(bills.length, 1);
  assert.equal(bills[0].logs.length, 2);
  assert.equal(bills[0].logs[0].deviceName, 'ใหม่');
});

test('B8 — ใบที่ออกไปแล้วต้องขึ้น แม้ยอดของวันนั้นถูกยกเลิกทีหลัง', () => {
  const [b] = buildBills([pack({ voided: 'TRUE' })], [], [], [issue()]);
  assert.equal(b.dispatched, true);
  assert.equal(b.hasPacking, false);
});

test('B8 — log ที่ยกเลิกแล้วไม่นับ · เทียบหน่วยแบบไม่สนตัวพิมพ์เหมือนใบ', () => {
  const [gone] = buildBills([pack()], [ship()], [order()], [issue({ voided: 'TRUE' })]);
  assert.equal(gone.dispatched, false);
  const bills = buildBills([pack()], [ship()], [order()], [issue({ unit: ' tue-h ' })]);
  assert.equal(bills.length, 1, 'หน่วยที่เขียนต่างกันต้องไม่แตกเป็นอีกใบ');
});

test('B9 — ยอดตัดเข้าใบสั่งเปลี่ยนหลังออกใบต้องขึ้น เทียบกับครั้งล่าสุดเท่านั้น', () => {
  const stale = logs => buildBills([pack()], [ship({ qty: 23 })], [order()], logs)[0].stale;
  assert.equal(stale([issue({ qty: 23 })]), false);
  assert.equal(stale([issue({ qty: 20 })]), true);
  assert.equal(stale([
    issue({ qty: 20, createdAt: '2026-10-01T08:00:00.000Z' }),
    issue({ qty: 23, createdAt: '2026-10-01T09:00:00.000Z' })
  ]), false, 'ออกซ้ำด้วยยอดใหม่แล้ว ใบเก่าไม่ใช่ตัวตัดสิน');
});

test('B9 — เทียบกับยอดตัดเข้าใบสั่ง ไม่ใช่ยอดบรรจุ', () => {
  const [b] = buildBills([pack({ perBox: 100, boxes: 1, remainder: 0 })],
                         [ship({ qty: 23 })], [order()], [issue({ qty: 23 })]);
  assert.equal(b.unallocated, 77);
  assert.equal(b.stale, false, 'ตัดไม่ครบเป็นคนละเรื่องกับยอดเปลี่ยนหลังออกใบ');
});

test('B9 — qty ว่างไม่มีอะไรให้เทียบ ต้องไม่ขึ้นป้าย · ยอด 0 จริงยังเทียบได้', () => {
  for (const qty of [null, undefined, ''])
    assert.equal(buildBills([pack()], [ship()], [order()], [issue({ qty })])[0].stale, false);
  assert.equal(buildBills([pack()], [ship()], [order()], [issue({ qty: 0 })])[0].stale, true);
  assert.equal(buildBills([pack()], [ship({ qty: 23 })], [order()], [issue({ qty: '23' })])[0].stale,
               false, 'สตริงจากชีตต้องเทียบได้');
});

test('C2 — ตัวกรองการออกใบไม่กรองอะไรเลยเมื่อไม่ได้ตั้งค่า · ค้นด้วยเลขที่ใบส่งของได้', () => {
  const bills = buildBills(
    [pack(), pack({ date: '2026-10-02' })],
    [], [], [issue()]);
  assert.equal(filterBills(bills, {}).length, 2);
  assert.equal(filterBills(bills, { sent: 'all' }).length, 2);
  assert.equal(filterBills(bills, { sent: 'yes' }).length, 1);
  assert.equal(filterBills(bills, { sent: 'no' }).length, 1);
  assert.equal(filterBills(bills, { q: 'tueh-2610' }).length, 1);
});

test('C3 — ยอดสรุปการออกใบนับจากรายการที่ส่งเข้ามาเท่านั้น', () => {
  const bills = buildBills([pack(), pack({ date: '2026-10-02' })],
                           [ship({ qty: 23 })], [order()], [issue({ qty: 20 })]);
  const s = summarize(bills);
  assert.deepEqual([s.dispatched, s.notDispatched, s.stale], [1, 1, 1]);
  assert.equal(summarize(filterBills(bills, { sent: 'no' })).stale, 0);
});

test('D2 — แถว log ที่พังต้องไม่ทำให้ล้ม · ไม่ส่ง logs มาเลยก็ยังประกอบใบได้', () => {
  assert.equal(buildBills([pack()], [], [])[0].dispatched, false);
  const [b] = buildBills([], [], [], [null, { date: '2026-10-01', unit: 'TUE-H' }]);
  assert.equal(b.dispatched, true);
  assert.equal(b.noteNo, '');
  assert.equal(b.stale, false);
});
