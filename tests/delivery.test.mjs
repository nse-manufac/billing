/**
 * เทสกฎล้วนของใบส่งของ — รันด้วย node ล้วน ไม่ต้องเปิดเบราว์เซอร์
 *   node --test tests/
 *
 * ชื่อเทสอ้างข้อกฎใน INVARIANTS.md ตรง ๆ เทสแดงข้อไหน = ละเมิดกฎข้อนั้น
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  qtyOf, isVoided, activeRows, billKeyOf, groupByBill,
  filterGroups, summarize, unitsOf
} from '../core/delivery.js';

const row = (o = {}) => Object.assign({
  id: 'r' + Math.random().toString(36).slice(2, 7),
  date: '2026-10-01', unit: 'TUE-H', orderId: 'PO1', pn: 'PN1',
  perBox: 10, boxes: 2, remainder: 3, remark: '', billNo: '', voided: false,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z'
}, o);

test('A1 — ยอดส่ง = ต่อกล่อง × กล่อง + เศษ (ต้องตรงกับสูตรใน plan)', () => {
  assert.equal(qtyOf({ perBox: 10, boxes: 2, remainder: 3 }), 23);
  assert.equal(qtyOf({ perBox: 0, boxes: 0, remainder: 7 }), 7, 'ไม่ได้บอกต่อกล่อง = ทุกชิ้นเป็นเศษ');
  assert.equal(qtyOf({}), 0, 'ช่องว่างต้องเป็น 0 ไม่ใช่ NaN');
  assert.equal(qtyOf({ perBox: '10', boxes: '2', remainder: '3' }), 23, 'สตริงจากชีตต้องคิดได้');
});

test('A2 — voided ที่มาจากชีตเป็นสตริงได้ ต้องอ่านออกทุกแบบ', () => {
  for (const v of [true, 'TRUE', 'true', 'True', 1, '1', 'yes'])
    assert.equal(isVoided({ voided: v }), true, 'ต้องถือว่ายกเลิก: ' + JSON.stringify(v));
  for (const v of [false, 'FALSE', 'false', '', null, undefined, 0])
    assert.equal(isVoided({ voided: v }), false, 'ต้องถือว่ายังใช้ได้: ' + JSON.stringify(v));
});

test('A2 — แถวที่ยกเลิกต้องไม่ถูกนับในยอดรวม', () => {
  const g = groupByBill([
    row({ billNo: 'DN-1', perBox: 10, boxes: 1, remainder: 0 }),
    row({ billNo: 'DN-1', perBox: 10, boxes: 5, remainder: 0, voided: 'TRUE' })
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].qty, 10, 'แถวที่ยกเลิกหลุดเข้ามา ยอดจะเกินจริงแบบเงียบ ๆ');
  assert.equal(g[0].lines.length, 1);
});

test('B2 — ใบที่ยังไม่ออกเลข ห้ามถูกยุบรวมเป็นใบเดียวกัน', () => {
  const g = groupByBill([row({ billNo: '', id: 'a' }), row({ billNo: '', id: 'b' })]);
  assert.equal(g.length, 2, 'ยุบรวมแล้วจะเห็นเป็นใบใหญ่ใบเดียวที่ไม่มีอยู่จริง');
  assert.ok(g.every(x => x.issued === false));
  assert.notEqual(billKeyOf(row({ billNo: '', id: 'a' })), billKeyOf(row({ billNo: '', id: 'b' })));
});

test('B2 — billNo ที่มีเว้นวรรคหัวท้าย ต้องเป็นใบเดียวกัน', () => {
  const g = groupByBill([row({ billNo: 'DN-7' }), row({ billNo: ' DN-7 ', pn: 'PN2' })]);
  assert.equal(g.length, 1);
  assert.equal(g[0].billNo, 'DN-7');
  assert.equal(g[0].pns.length, 2);
});

test('B3 — ใบเดียวคีย์คนละวัน ให้ยึดวันที่เก่าที่สุดเป็นวันของใบ', () => {
  const g = groupByBill([
    row({ billNo: 'DN-9', date: '2026-10-05' }),
    row({ billNo: 'DN-9', date: '2026-10-02', pn: 'PN2' })
  ]);
  assert.equal(g[0].date, '2026-10-02', 'วันของใบคือวันที่ของออกจากโรงงาน');
});

test('B4 — รายการเรียงใหม่ก่อนเก่า', () => {
  const g = groupByBill([
    row({ billNo: 'A', date: '2026-09-01' }),
    row({ billNo: 'B', date: '2026-10-09' }),
    row({ billNo: 'C', date: '2026-10-01' })
  ]);
  assert.deepEqual(g.map(x => x.billNo), ['B', 'C', 'A']);
});

test('C2 — ตัวกรองสถานะเลขใบ', () => {
  const g = groupByBill([row({ billNo: 'DN-1' }), row({ billNo: '', id: 'z' })]);
  assert.equal(filterGroups(g, { issued: 'yes' }).length, 1);
  assert.equal(filterGroups(g, { issued: 'no' }).length, 1);
  assert.equal(filterGroups(g, { issued: 'all' }).length, 2);
  assert.equal(filterGroups(g, {}).length, 2, 'ไม่ส่งเงื่อนไข = ไม่กรอง');
});

test('C2 — ค้นหาเจอทั้งเลขใบ เลข PO P/N และหมายเหตุ', () => {
  // ⚠️ เลข PO · P/N · ยอด ในเทสต้องเป็นของสมมติล้วนเสมอ repo นี้เป็น public
  const g = groupByBill([row({ billNo: 'DN-42', orderId: 'ZZ0001', pn: 'XA9', remark: 'ด่วน' })]);
  for (const q of ['dn-42', 'zz00', 'xa9', 'ด่วน'])
    assert.equal(filterGroups(g, { q }).length, 1, 'ต้องค้นเจอด้วย: ' + q);
  assert.equal(filterGroups(g, { q: 'ไม่มีจริง' }).length, 0);
});

test('C2 — ช่วงวันที่รวมวันหัวและวันท้าย', () => {
  const g = groupByBill([
    row({ billNo: 'A', date: '2026-10-01' }),
    row({ billNo: 'B', date: '2026-10-05' }),
    row({ billNo: 'C', date: '2026-10-09' })
  ]);
  const got = filterGroups(g, { from: '2026-10-01', to: '2026-10-05' }).map(x => x.billNo);
  assert.deepEqual(got.sort(), ['A', 'B']);
});

test('C3 — ยอดสรุปนับจากรายการที่เห็นบนจอเท่านั้น', () => {
  const g = groupByBill([
    row({ billNo: 'A', perBox: 10, boxes: 1, remainder: 0 }),
    row({ billNo: '', id: 'z', perBox: 10, boxes: 2, remainder: 0 })
  ]);
  assert.deepEqual(summarize(g), { bills: 2, issued: 1, pending: 1, qty: 30, lines: 2 });
  assert.equal(summarize(filterGroups(g, { issued: 'yes' })).qty, 10);
  assert.deepEqual(summarize([]), { bills: 0, issued: 0, pending: 0, qty: 0, lines: 0 });
});

test('C4 — รายชื่อหน่วยมาจากข้อมูลจริง ไม่ฮาร์ดโค้ด และไม่มีค่าว่างปน', () => {
  const g = groupByBill([row({ unit: 'TUE-U' }), row({ unit: 'TUE-H', id: 'b' }),
                         row({ unit: '', id: 'c' })]);
  assert.deepEqual(unitsOf(g), ['TUE-H', 'TUE-U']);
});

test('D2 — ข้อมูลเปล่าหรือพังต้องไม่ทำให้ล้ม', () => {
  assert.deepEqual(groupByBill([]), []);
  assert.deepEqual(groupByBill(null), []);
  assert.deepEqual(activeRows(undefined), []);
  assert.equal(groupByBill([row(), null, undefined]).length, 1);
});
