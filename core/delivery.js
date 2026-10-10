/**
 * กฎล้วนของใบส่งของ — ไม่แตะ DOM · ไม่แตะเครือข่าย · ไม่แตะที่เก็บข้อมูล
 *
 * ไฟล์นี้เทสด้วย node ล้วนได้ และย้ายไปแพลตฟอร์มอื่นได้โดยไม่ต้องเขียนใหม่
 * ตรรกะธุรกิจทุกบรรทัดต้องอยู่ที่นี่ ไม่ใช่ใน app.js (ดู INVARIANTS C1)
 *
 * ── ข้อมูลมาจากไหน ──────────────────────────────────────────────
 * ตาราง DeliveryNotes ของ repo `plan` ผ่าน Apps Script เดียวกัน
 * หนึ่งแถว = ของหนึ่ง P/N ในใบสั่งหนึ่งใบ ที่ส่งไปในวันหนึ่ง
 * หลายแถวรวมเป็นใบส่งของหนึ่งใบผ่านช่อง billNo
 *
 *   id · date · unit · orderId · pn · perBox · boxes · remainder
 *   remark · billNo · deviceName · createdAt · updatedAt · voided
 */

/** ยอดที่ส่ง = ต่อกล่อง × กล่อง + เศษ
 *
 *  ⚠️ สูตรนี้ต้องตรงกับ `deliveryQty()` ใน plan เป๊ะ ๆ ห้ามคิดเอง
 *     ในฟอร์ม "กล่อง" คือกล่องที่เต็ม และ "เศษ" คือชิ้นที่เหลือ ไม่ใช่กล่องที่เหลือ
 *     ถ้าคิดต่างกัน ทะเบียนจะโชว์ยอดไม่ตรงกับใบที่ออกไปจริง โดยไม่มีอะไรฟ้อง
 */
export function qtyOf(row) {
  const n = v => Number(v) || 0;
  return n(row.perBox) * n(row.boxes) + n(row.remainder);
}

/** voided ที่มาจาก Google Sheets เป็นได้ทั้ง boolean, 'TRUE', 'true', 1 หรือว่าง
 *
 *  ⚠️ เช็ก `row.voided === true` ตรง ๆ ไม่พอ — ชีตคืนสตริงมาได้
 *     แถวที่ยกเลิกแล้วจะหลุดเข้ามาเป็นแถวปกติ แล้วยอดรวมจะเกินจริงแบบเงียบ ๆ
 */
export function isVoided(row) {
  const v = row && row.voided;
  if (v === true) return true;
  if (v === false || v == null || v === '') return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

/** แถวที่ยังใช้ได้ — ตัดที่ยกเลิกออก แล้วเรียงใหม่ก่อนเก่า */
export function activeRows(rows) {
  return (rows || [])
    .filter(r => r && !isVoided(r))
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/** เลขใบที่ใช้จัดกลุ่ม — ใบที่ยังไม่ได้ออกเลขรวมกันเป็นกลุ่มเดียวไม่ได้
 *
 *  แถวที่ billNo ว่าง แปลว่า "คีย์ยอดไว้แล้วแต่ยังไม่ได้ออกใบ" ซึ่งเป็นคนละเรื่อง
 *  กับ "ออกใบแล้ว" — ถ้าเอามารวมเป็นกลุ่มเดียวกันหมด กรุงเทพจะเห็นเป็นใบใหญ่ใบเดียว
 *  ที่ไม่มีอยู่จริง จึงแยกเป็นกลุ่มของใครของมันด้วย id ของแถว
 */
export function billKeyOf(row) {
  const b = String(row.billNo == null ? '' : row.billNo).trim();
  return b ? 'B:' + b : 'R:' + row.id;
}

/** จัดกลุ่มแถวเป็น "ใบ" — หนึ่งใบมีได้หลาย P/N หลายใบสั่ง
 *
 *  คืนค่าเรียงตามวันที่ใหม่ก่อน · ภายในใบเรียงตาม P/N แล้ว PO
 */
export function groupByBill(rows) {
  const map = new Map();
  for (const r of activeRows(rows)) {
    const key = billKeyOf(r);
    if (!map.has(key)) {
      map.set(key, {
        key,
        billNo: String(r.billNo == null ? '' : r.billNo).trim(),
        issued: !!String(r.billNo == null ? '' : r.billNo).trim(),
        date: r.date || '',
        unit: r.unit || '',
        lines: []
      });
    }
    const g = map.get(key);
    g.lines.push(r);
    // ใบเดียวกันคีย์คนละวันได้ — ยึดวันที่เก่าที่สุดเป็นวันของใบ เพราะเป็นวันที่ของจริงออกจากโรงงาน
    if (r.date && (!g.date || String(r.date) < String(g.date))) g.date = r.date;
    if (!g.unit && r.unit) g.unit = r.unit;
  }

  const out = [...map.values()];
  for (const g of out) {
    g.lines.sort((a, b) =>
      String(a.pn || '').localeCompare(String(b.pn || '')) ||
      String(a.orderId || '').localeCompare(String(b.orderId || '')));
    g.qty = g.lines.reduce((s, l) => s + qtyOf(l), 0);
    g.boxes = g.lines.reduce((s, l) => s + (Number(l.boxes) || 0), 0);
    g.pns = [...new Set(g.lines.map(l => l.pn).filter(Boolean))];
    g.orders = [...new Set(g.lines.map(l => l.orderId).filter(Boolean))];
    g.updatedAt = g.lines.reduce(
      (m, l) => (String(l.updatedAt || '') > m ? String(l.updatedAt || '') : m), '');
  }
  return out.sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')) ||
    String(b.billNo || '').localeCompare(String(a.billNo || '')));
}

/** ค้นหาแบบพิมพ์บางส่วน — เลขใบ · เลขใบสั่ง · P/N · หมายเหตุ */
export function matchesQuery(group, q) {
  const s = String(q == null ? '' : q).trim().toLowerCase();
  if (!s) return true;
  if (String(group.billNo).toLowerCase().includes(s)) return true;
  return group.lines.some(l =>
    String(l.orderId || '').toLowerCase().includes(s) ||
    String(l.pn || '').toLowerCase().includes(s) ||
    String(l.remark || '').toLowerCase().includes(s));
}

/**
 * กรองรายการใบตามเงื่อนไขบนหน้าจอ
 *
 * `issued` — 'all' ทั้งหมด · 'yes' เฉพาะที่ออกเลขใบแล้ว · 'no' เฉพาะที่ยังไม่ออก
 * ช่วงวันที่เทียบแบบสตริง YYYY-MM-DD ได้ตรง ๆ เพราะรูปแบบนี้เรียงตามตัวอักษรแล้วตรงกับเรียงตามเวลา
 */
export function filterGroups(groups, f) {
  const o = f || {};
  return (groups || []).filter(g => {
    if (o.unit && g.unit !== o.unit) return false;
    if (o.issued === 'yes' && !g.issued) return false;
    if (o.issued === 'no' && g.issued) return false;
    if (o.from && String(g.date || '') < o.from) return false;
    if (o.to && String(g.date || '') > o.to) return false;
    return matchesQuery(g, o.q);
  });
}

/** ยอดสรุปของรายการที่เห็นอยู่บนจอ */
export function summarize(groups) {
  const list = groups || [];
  return {
    bills: list.length,
    issued: list.filter(g => g.issued).length,
    pending: list.filter(g => !g.issued).length,
    qty: list.reduce((s, g) => s + g.qty, 0),
    lines: list.reduce((s, g) => s + g.lines.length, 0)
  };
}

/** รายชื่อหน่วยที่มีจริงในข้อมูล — เอาไปทำตัวเลือกในตัวกรอง ไม่ฮาร์ดโค้ด */
export function unitsOf(groups) {
  return [...new Set((groups || []).map(g => g.unit).filter(Boolean))].sort();
}
