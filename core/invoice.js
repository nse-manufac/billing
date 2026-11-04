/**
 * กฎล้วนของ invoice — ไม่แตะ DOM · ไม่แตะเครือข่าย · ไม่แตะที่เก็บข้อมูล (INVARIANTS C1)
 *
 * ══ งานจริง อ่านก่อนแก้ ══════════════════════════════════════════
 *
 * ลูกค้าเป็นคนออกเลข invoice และกำหนดราคา ฝั่งเราไม่ได้คิดเอง
 * ไฟล์ที่ส่งออกจากเว็บลูกค้ามีหนึ่งแถวต่อ (GR No + PO + PO Item) พร้อมราคาและยอดมาแล้ว
 * งานของไฟล์นี้จึงมีแค่ รวมแถวเป็นใบ · คิดยอดท้ายใบ · ฟ้องของที่คนต้องตัดสิน
 *
 *   rows — แถวจากไฟล์ลูกค้าในรูป
 *          { invNo, grDate, grNo, poNo, poItem, pn, desc, qty, uom, unitPrice, grAmount, mvt }
 *          `invNo` กรอกแค่แถวแรกของใบได้ แถวถัดไปของ GR เดียวกันเว้นว่าง
 *
 * ⚠️ **หนึ่งใบ = หนึ่ง GR No** ไม่ใช่หนึ่ง PO — ใบเดียวมีได้หลาย PO
 *    ห้ามเดาเติม ห้ามแก้ยอดให้เงียบ ๆ เอกสารนี้ออกไปถึงลูกค้า (INVARIANTS E3–E7)
 */

/** แถวต่อใบที่ฟอร์ม invoice รับได้ (แถว 16–28 ของชีต) */
export const MAX_LINES = 13;

/** อัตรา VAT — ไม่มีช่องให้แก้ในฟอร์ม */
export const VAT_RATE = 0.07;

/** ยอดของลูกค้าต่างจาก จำนวน × ราคา ได้เท่านี้โดยไม่ต้องฟ้อง */
export const AMOUNT_TOLERANCE = 0.01;

/** การเคลื่อนไหวที่เป็นการรับของปกติ */
const MVT_RECEIPT = '101';

const txt = v => String(v == null ? '' : v).trim();
/** ตัวเลขจากไฟล์ — '1,000.00' ต้องอ่านออก · อ่านไม่ออกได้ NaN ให้ผู้เรียกฟ้อง ห้ามกลายเป็น 0 เงียบ ๆ */
const num = v => txt(v) === '' ? 0 : Number(txt(v).replace(/,/g, ''));

/** ปัด 2 ตำแหน่งแบบ ROUND ของ Excel
 *
 *  ⚠️ `Math.round(n * 100)` ตรง ๆ ไม่พอ เลขทศนิยมฐานสองทำให้ 1.005 × 100 ได้ 100.49999...
 *     แล้วปัดลงเป็น 1.00 ทั้งที่ Excel ได้ 1.01 — ใบเดียวกันจะยอดไม่ตรงกับที่แม่คิดในชีต
 *     ค่าลบปัดออกจากศูนย์เหมือน Excel
 */
export function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  const abs = Number((Math.abs(v) * 100).toPrecision(12));
  return Math.sign(v) * Math.round(abs) / 100;
}

/** หน่วยจากรหัส PO = ตัวอักษรตำแหน่งที่ 7 (กติกาเดียวกับ subNameFromPo ของ plan) */
export function unitFromPo(poNo) {
  const c = txt(poNo).toUpperCase().charAt(6);
  return 'HUTA'.includes(c) && c ? 'TUE-' + c : '';
}

/** หน่วยจากเลข invoice เช่น TUE-A0001 → TUE-A */
export function unitFromInvNo(invNo) {
  const m = /^(TUE-[A-Z])/i.exec(txt(invNo));
  return m ? m[1].toUpperCase() : '';
}

/** ยอดของบรรทัด — ยอดของลูกค้าคือต้นทาง คิดเองเฉพาะเมื่อไฟล์ไม่มีให้ */
function lineOf(r) {
  const raw = [num(r.qty), num(r.unitPrice), num(r.grAmount)];
  const [qty, unitPrice, given] = raw.map(v => Number.isFinite(v) ? v : 0);
  const calc = round2(qty * unitPrice);
  const hasGiven = txt(r.grAmount) !== '';
  return {
    poNo: txt(r.poNo), poItem: txt(r.poItem), pn: txt(r.pn), desc: txt(r.desc),
    qty, uom: txt(r.uom), unitPrice, mvt: txt(r.mvt), grDate: txt(r.grDate),
    amount: hasGiven ? round2(given) : calc,
    amountDiff: hasGiven ? round2(round2(given) - calc) : 0,
    badNumber: !raw.every(Number.isFinite)
  };
}

/** ยอดท้ายใบ — ทั้งยอดและ VAT ปัดรายบรรทัดก่อนแล้วค่อยรวม (INVARIANTS E4)
 *
 *  ⚠️ ห้ามคิด VAT จากยอดรวม ลูกค้าคิดรายบรรทัด ใบหลายบรรทัดจึงต่างจากสูตรในฟอร์ม Excel
 *     ได้หนึ่งสตางค์ ในไฟล์จริงต้องพิมพ์ทับสูตรด้วยมือ ซึ่งตรงกับวิธีนี้ทุกใบ
 */
export function totalsOf(lines) {
  const list = lines || [];
  const subtotal = round2(list.reduce((s, l) => s + l.amount, 0));
  const vat = round2(list.reduce((s, l) => s + round2(l.amount * VAT_RATE), 0));
  return { subtotal, vat, total: round2(subtotal + vat) };
}

/** รวมแถวของไฟล์ลูกค้าเป็นใบ
 *
 *  คืน { invoices, dropped, orphans }
 *    dropped — แถวที่ซ้ำเป๊ะกับแถวเดิม (ลากไฟล์ทับกัน) ตัดออกแล้ว แต่ต้องบอกจำนวน
 *    orphans — แถวที่ไม่มี GR No รวมเข้าใบไม่ได้
 */
export function buildInvoices(rows) {
  const byGr = new Map();
  const seen = new Map();
  const orphans = [];
  let dropped = 0;

  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r) continue;
    const grNo = txt(r.grNo);
    if (!grNo) { if (Object.values(r).some(v => txt(v) !== '')) orphans.push(r); continue; }

    if (!byGr.has(grNo)) byGr.set(grNo, { grNo, invNos: [], lines: [], problems: [] });
    const inv = byGr.get(grNo);
    const no = txt(r.invNo).toUpperCase();
    if (no && !inv.invNos.includes(no)) inv.invNos.push(no);

    // กุญแจของบรรทัดคือ GR + PO + PO Item · ซ้ำเป๊ะทุกช่อง = ไฟล์เดียวกันถูกลากเข้ามาสองรอบ
    // ⚠️ ต่างแม้ช่องเดียว (P/N · ราคา · วันที่) ห้ามตัด ไม่งั้นยอดหายครึ่งใบโดยไม่มีอะไรแดง
    const line = lineOf(r);
    const key = grNo + '|' + line.poNo + '|' + line.poItem;
    const prior = seen.get(key);
    if (prior) {
      if (Object.keys(line).every(k => prior[k] === line[k])) { dropped++; continue; }
      inv.problems.push({ code: 'lineConflict', text:
        'บรรทัด ' + line.poNo + ' รายการ ' + line.poItem + ' มีสองยอดไม่เท่ากัน — ตรวจกับเว็บลูกค้า' });
    }
    if (line.badNumber) inv.problems.push({ code: 'badNumber', text:
      'บรรทัด ' + line.poNo + ' รายการ ' + line.poItem + ' มีจำนวน ราคา หรือยอดที่อ่านเป็นตัวเลขไม่ได้' });
    seen.set(key, line);
    inv.lines.push(line);
  }

  const invoices = [...byGr.values()].map(finishInvoice);

  // เลขเดียวกันห้ามอยู่สองใบ — ลูกค้าแจกเลขให้หนึ่ง GR ต่อหนึ่งเลข (INVARIANTS E1)
  const owners = new Map();
  for (const inv of invoices) for (const no of inv.invNos) {
    if (!owners.has(no)) owners.set(no, []);
    owners.get(no).push(inv);
  }
  for (const [no, list] of owners) {
    if (list.length < 2) continue;
    for (const inv of list) {
      inv.problems.push({ code: 'dupInvNo', text:
        'เลข ' + no + ' ซ้ำกับ GR ' + list.filter(x => x !== inv).map(x => x.grNo).join(' · ') });
    }
  }

  return { invoices, dropped, orphans };
}

function finishInvoice(raw) {
  const { grNo, invNos, lines, problems } = raw;
  const add = (code, text) => problems.push({ code, text });

  const invNo = invNos[0] || '';
  if (!invNo) add('noInvNo', 'ยังไม่มีเลข invoice จากลูกค้า');
  if (invNos.length > 1) add('invConflict', 'GR เดียวมีหลายเลข — ' + invNos.join(' · '));

  // หน่วยดูจากรหัส PO เท่านั้น ใบเดียวต้องเป็นหน่วยเดียว ไม่งั้นราคาอาจผิดหน่วย
  const units = [...new Set(lines.map(l => unitFromPo(l.poNo)))];
  const unit = units.length === 1 ? units[0] : '';
  if (units.length > 1) add('mixedUnit', 'ใบเดียวมีหลายหน่วย — ' + units.map(u => u || 'ไม่ทราบ').join(' · '));
  else if (!unit) add('noUnit', 'บอกหน่วยจากรหัส PO ไม่ได้');
  const noUnit = unitFromInvNo(invNo);
  if (unit && noUnit && unit !== noUnit) add('unitMismatch', 'เลข ' + invNo + ' ไม่ตรงกับหน่วย ' + unit + ' ของ PO');

  if (lines.length > MAX_LINES) add('tooManyLines', 'มี ' + lines.length + ' บรรทัด เกินฟอร์มที่รับได้ ' + MAX_LINES);

  for (const l of lines) {
    const at = l.poNo + ' รายการ ' + l.poItem;
    // ต่าง 1 สตางค์เป็นเรื่องปกติ ราคาจริงของลูกค้ามีทศนิยมมากกว่าที่แสดง
    if (Math.abs(l.amountDiff) > AMOUNT_TOLERANCE) add('amountDiff', at + ' จำนวน × ราคา ต่างจากยอดของลูกค้า ' + l.amountDiff.toFixed(2) + ' บาท');
    if (l.mvt && l.mvt !== MVT_RECEIPT) add('notReceipt', at + ' รหัสการเคลื่อนไหว ' + l.mvt + ' ไม่ใช่การรับของปกติ');
    if (l.qty <= 0) add('badQty', at + ' จำนวนไม่เป็นบวก');
    if (!l.unitPrice) add('noPrice', at + ' ไม่มีราคาต่อหน่วย');
  }

  const dates = [...new Set(lines.map(l => l.grDate).filter(Boolean))];
  if (dates.length > 1) add('mixedDate', 'GR เดียวมีหลายวันที่ — ' + dates.join(' · '));

  return { grNo, invNo, invNos, unit, grDate: dates[0] || '', lines, problems, ...totalsOf(lines) };
}
