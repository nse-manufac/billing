/**
 * กฎล้วนของใบส่งของ — ไม่แตะ DOM · ไม่แตะเครือข่าย · ไม่แตะที่เก็บข้อมูล
 * เทสด้วย node ล้วนได้ และย้ายไปแพลตฟอร์มอื่นได้โดยไม่ต้องเขียนใหม่ (INVARIANTS C1)
 *
 * ══ โครงข้อมูลของจริง อ่านก่อนแก้ ══════════════════════════════
 *
 * `plan` แยกเก็บใบส่งของเป็น **สองที่** เพราะงานจริงเป็นสองขั้น
 *
 *   ยอดบรรจุ        ตาราง DeliveryNotes · หนึ่งแถวต่อ (วันที่ + หน่วย + P/N)
 *                   **`orderId` ว่างเสมอ** เพราะไม่ได้เป็นของใบสั่งใบใดใบหนึ่ง
 *                   `billNo` อยู่ที่นี่
 *   ตัดเข้าใบสั่ง    ตาราง Records ที่ `process === 'shipping'`
 *                   หนึ่งแถวต่อ (ใบสั่ง + วันที่) · ต้องพึ่ง Orders เพื่อแปลง id → เลข PO
 *
 * เพราะของจริง**บรรจุรวมกันตาม P/N ก่อน แล้วค่อยตัดเข้า PO ทีหลัง**
 * ตรงกับไฟล์ FM-ST-07 ที่ช่องต่อกล่อง/กล่อง/เศษ ถูก merge คร่อมแถวของ P/N เดียวกัน
 * ส่วนช่องฝั่งกรุงเทพไม่ merge เพราะเป็นรายใบสั่ง
 *
 * ⚠️ **หนึ่งใบ = หนึ่งวัน + หนึ่งหน่วย** (เจ้าของยืนยัน 10 ต.ค. 2026)
 *    ห้ามกลับไปจัดกลุ่มตาม `billNo` หรือตาม P/N — เคยทำแล้วได้ "ใบ" ละ P/N
 *    ซึ่งไม่ตรงกับใบจริงที่ออกวันละใบต่อหน่วย
 */

/** ยอดที่ส่ง = ต่อกล่อง × กล่อง + เศษ
 *
 *  ⚠️ ต้องตรงกับ `deliveryQty()` ใน plan เป๊ะ ๆ ห้ามคิดเอง
 *     ในฟอร์ม "กล่อง" คือกล่องที่เต็ม และ "เศษ" คือชิ้นที่เหลือ ไม่ใช่กล่องที่เหลือ
 *     คิดต่างกันเมื่อไหร่ ทะเบียนจะโชว์ยอดไม่ตรงกับใบที่ออกไปจริง โดยไม่มีอะไรฟ้อง
 */
export function qtyOf(row) {
  const n = v => Number(v) || 0;
  return n(row.perBox) * n(row.boxes) + n(row.remainder);
}

/** voided จาก Google Sheets เป็นได้ทั้ง boolean, 'TRUE', 'true', 1 หรือว่าง
 *
 *  ⚠️ เช็ก `=== true` ตรง ๆ ไม่พอ — ชีตคืนสตริงมาได้
 *     แถวที่ยกเลิกแล้วจะหลุดเข้ามาเป็นแถวปกติ แล้วยอดรวมเกินจริงแบบเงียบ ๆ
 */
export function isVoided(row) {
  const v = row && row.voided;
  if (v === true) return true;
  if (v === false || v == null || v === '') return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

const txt = v => String(v == null ? '' : v).trim();
const norm = v => txt(v).toUpperCase();

/** แถวที่ยังใช้ได้ของตารางใด ๆ */
export const activeRows = rows => (rows || []).filter(r => r && !isVoided(r));

/** กุญแจของใบ = วันที่ + หน่วย */
export const dayKeyOf = (date, unit) => 'D:' + txt(date) + '|' + norm(unit);

/**
 * ประกอบใบส่งของจากสามตาราง
 *
 *   notes   — DeliveryNotes (ยอดบรรจุราย P/N · billNo อยู่ที่นี่)
 *   records — Records ทั้งหมด (กรอง process='shipping' ให้เอง)
 *   orders  — Orders (ใช้แปลง orderId → เลข PO และหาหน่วยของใบสั่ง)
 *
 * คืนรายการใบ เรียงวันใหม่ก่อนเก่า
 */
export function buildBills(notes, records, orders) {
  const orderById = new Map();
  for (const o of activeRows(orders)) orderById.set(txt(o.id), o);

  const bills = new Map();
  const ensure = (date, unit) => {
    const key = dayKeyOf(date, unit);
    if (!bills.has(key)) {
      bills.set(key, { key, date: txt(date), unit: txt(unit),
                       billNo: '', billNos: [], packs: [], allocs: [] });
    }
    return bills.get(key);
  };

  // ── ยอดบรรจุ ราย P/N ──
  for (const n of activeRows(notes)) {
    const b = ensure(n.date, n.unit);
    b.packs.push({
      id: n.id, pn: txt(n.pn), remark: txt(n.remark),
      perBox: Number(n.perBox) || 0, boxes: Number(n.boxes) || 0,
      remainder: Number(n.remainder) || 0, qty: qtyOf(n)
    });
    const bn = txt(n.billNo);
    if (bn && b.billNos.indexOf(bn) === -1) b.billNos.push(bn);
  }

  // ── ยอดที่ตัดเข้าแต่ละใบสั่ง ──
  // หน่วยของ record มาจากใบสั่ง (Orders.subName) ไม่ได้อยู่ในตัว record เอง
  for (const r of activeRows(records)) {
    if (txt(r.process) !== 'shipping') continue;
    const o = orderById.get(txt(r.orderId));
    // ไม่รู้จักใบสั่ง = ลงใบไหนไม่ได้ ปล่อยทิ้งดีกว่าเดาหน่วยให้ผิด
    if (!o) continue;
    const b = ensure(r.date, o.subName);
    b.allocs.push({
      orderId: txt(r.orderId), poNo: txt(o.poNo), pn: txt(o.pn),
      orderQty: Number(o.orderQty) || 0, qty: Number(r.qty) || 0
    });
  }

  const out = [];
  for (const b of bills.values()) {
    // ใบเดียวกันไม่ควรมีเลขใบมากกว่าหนึ่ง — ถ้ามี แปลว่ามีคนคีย์ชนกัน ต้องเห็น ไม่ใช่เลือกให้เงียบ ๆ
    b.billNo = b.billNos[0] || '';
    b.billConflict = b.billNos.length > 1;
    b.issued = !!b.billNo;

    b.packs.sort((a, c) => a.pn.localeCompare(c.pn));
    b.allocs.sort((a, c) => a.pn.localeCompare(c.pn) || a.poNo.localeCompare(c.poNo));

    b.qty = b.packs.reduce((s, p) => s + p.qty, 0);
    b.boxes = b.packs.reduce((s, p) => s + p.boxes, 0);
    b.allocQty = b.allocs.reduce((s, a) => s + a.qty, 0);
    // ยอดบรรจุยังตัดเข้าใบสั่งไม่ครบ — ไม่ใช่บั๊ก แต่กรุงเทพควรรู้ก่อนวางบิล
    b.unallocated = Math.round((b.qty - b.allocQty) * 1e5) / 1e5;
    b.pns = [...new Set(b.packs.map(p => p.pn).filter(Boolean))];
    b.poNos = [...new Set(b.allocs.map(a => a.poNo).filter(Boolean))];
    out.push(b);
  }

  return out.sort((a, c) => c.date.localeCompare(a.date) || a.unit.localeCompare(c.unit));
}

/** ค้นหาแบบพิมพ์บางส่วน — เลขใบ · เลข PO · P/N · หมายเหตุ */
export function matchesQuery(bill, q) {
  const s = txt(q).toLowerCase();
  if (!s) return true;
  if (bill.billNo.toLowerCase().includes(s)) return true;
  if (bill.date.includes(s)) return true;
  return bill.packs.some(p => p.pn.toLowerCase().includes(s) ||
                              p.remark.toLowerCase().includes(s))
      || bill.allocs.some(a => a.poNo.toLowerCase().includes(s) ||
                               a.pn.toLowerCase().includes(s));
}

/**
 * กรองตามเงื่อนไขบนหน้าจอ
 * `issued` — 'all' · 'yes' ออกเลขแล้ว · 'no' ยังไม่ออก
 * ช่วงวันที่เทียบเป็นสตริงได้ตรง ๆ เพราะ YYYY-MM-DD เรียงตามตัวอักษรตรงกับเรียงตามเวลา
 */
export function filterBills(bills, f) {
  const o = f || {};
  return (bills || []).filter(b => {
    if (o.unit && b.unit !== o.unit) return false;
    if (o.issued === 'yes' && !b.issued) return false;
    if (o.issued === 'no' && b.issued) return false;
    if (o.from && b.date < o.from) return false;
    if (o.to && b.date > o.to) return false;
    return matchesQuery(b, o.q);
  });
}

/** ยอดสรุปของรายการที่เห็นอยู่บนจอ (INVARIANTS C3) */
export function summarize(bills) {
  const list = bills || [];
  return {
    bills: list.length,
    issued: list.filter(b => b.issued).length,
    pending: list.filter(b => !b.issued).length,
    qty: list.reduce((s, b) => s + b.qty, 0),
    pns: list.reduce((s, b) => s + b.pns.length, 0),
    pos: list.reduce((s, b) => s + b.allocs.length, 0),
    needAttention: list.filter(b => b.unallocated !== 0 || b.billConflict).length
  };
}

/** รายชื่อหน่วยที่มีจริงในข้อมูล — ไม่ฮาร์ดโค้ด (INVARIANTS C4) */
export const unitsOf = bills =>
  [...new Set((bills || []).map(b => b.unit).filter(Boolean))].sort();
