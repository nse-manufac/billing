/**
 * การตั้งค่าเชื่อมต่อของเครื่องนี้ — เก็บใน localStorage ของเครื่องเท่านั้น
 *
 * ⚠️ URL กับ token **ไม่เคยอยู่ในโค้ด** และต้องไม่อยู่ใน repo (INVARIANTS D1)
 *    repo นี้เป็น public เหมือน `plan` และ `store` ใครก็เปิดอ่านไฟล์ได้
 *
 * ที่นี่เก็บแค่การตั้งค่า **ไม่เก็บข้อมูลใบส่งของ** — แอปนี้ออนไลน์เป็นหลัก
 * ดึงสดจากเซิร์ฟเวอร์ทุกครั้งที่เปิด เพื่อให้กรุงเทพเห็นของที่แม่สอดเพิ่งคีย์
 * โดยไม่ต้องมีใครกดซิงค์ (INVARIANTS B1)
 */

const KEY = 'billing.conn.v1';

const EMPTY = { url: '', token: '', device: '' };

/** อ่านการตั้งค่า — คืนค่าว่างเสมอถ้าอ่านไม่ได้ ไม่โยน error ให้หน้าจอพัง */
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return Object.assign({}, EMPTY);
    const o = JSON.parse(raw);
    return {
      // ตัดเว้นวรรคหัวท้ายเสมอ — อักขระที่มองไม่เห็นติดมาตอนคัดลอก URL
      // เป็นสาเหตุอันดับหนึ่งของอาการ "Google ตอบ 404 ทั้งที่ URL ดูถูก"
      url: String(o.url || '').trim(),
      token: String(o.token || '').trim(),
      device: String(o.device || '').trim()
    };
  } catch (e) {
    return Object.assign({}, EMPTY);
  }
}

/** บันทึกการตั้งค่า — คืน true ถ้าเขียนลงเครื่องได้จริง */
export function save(cfg) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      url: String((cfg && cfg.url) || '').trim(),
      token: String((cfg && cfg.token) || '').trim(),
      device: String((cfg && cfg.device) || '').trim()
    }));
    return true;
  } catch (e) {
    return false;
  }
}

/** ตั้งค่าครบพอที่จะยิงได้หรือยัง */
export const isReady = cfg => !!(cfg && cfg.url && cfg.token);
