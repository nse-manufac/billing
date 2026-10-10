/**
 * คุยกับ Apps Script ของ `plan` — ชั้นนี้รู้แค่วิธีรับส่ง ไม่มีกฎธุรกิจสักบรรทัด
 *
 * ⚠️ ต้องส่งเป็น `text/plain` ไม่ใช่ `application/json`
 *    `application/json` ทำให้เบราว์เซอร์ยิง preflight (OPTIONS) ก่อน
 *    ซึ่ง **Apps Script Web App ตอบไม่เป็น** คำขอจึงตายตั้งแต่ยังไม่ถึงโค้ดเรา
 *    และข้อความที่ขึ้นคือ CORS error ซึ่งไม่ได้ชี้ไปที่สาเหตุนี้เลย
 *    (ยกวิธีมาจาก `plan` ที่ใช้งานได้จริงอยู่แล้ว ห้ามเปลี่ยนโดยไม่ทดสอบกับของจริง)
 *
 * ⚠️ ต้องมี `redirect: 'follow'` — Apps Script ตอบ 302 ชี้ไป googleusercontent เสมอ
 */

/** เรียกคำสั่งหนึ่งครั้ง — โยน Error พร้อมข้อความภาษาไทยเมื่อผิดพลาด */
export async function call(cfg, action, body) {
  if (!cfg || !cfg.url) throw new Error('ยังไม่ได้ตั้งค่า URL ของ Apps Script');

  let res;
  try {
    res = await fetch(cfg.url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign(
        { action, token: cfg.token || '', device: cfg.device || '' }, body || {}))
    });
  } catch (e) {
    // แยกให้ออกระหว่าง "เน็ตไม่ถึง" กับ "เซิร์ฟเวอร์ตอบว่าไม่ผ่าน"
    throw new Error('ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ตและ URL อีกครั้ง');
  }

  if (!res.ok) throw new Error('เซิร์ฟเวอร์ตอบ HTTP ' + res.status +
    (res.status === 404 ? ' — URL อาจผิด หรือมีอักขระที่มองไม่เห็นติดมาตอนคัดลอก' : ''));

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('เซิร์ฟเวอร์ตอบกลับมาไม่ใช่ JSON — URL อาจชี้ไปที่ deployment ที่ไม่ใช่ /exec');
  }

  if (!data.ok) throw new Error(data.error || 'เซิร์ฟเวอร์ตอบกลับผิดพลาด');
  return data;
}

/** ตรวจว่าตั้งค่าถูกและต่อถึงจริงไหม — ใช้ปุ่ม "ทดสอบการเชื่อมต่อ" */
export const ping = cfg => call(cfg, 'ping', {});

/** ดึงใบส่งของทั้งหมด
 *
 *  ส่ง `since` ว่างเสมอในรุ่นนี้ = ดึงทุกแถวทุกครั้ง
 *  แอปนี้ไม่เก็บสำเนาไว้ในเครื่อง (ออนไลน์เป็นหลัก ดู INVARIANTS B1)
 *  ที่ปริมาณใบจริงยังเร็วพอ ถ้าโตจนช้าค่อยเพิ่มการดึงเฉพาะที่เปลี่ยน
 */
export async function pullDeliveryNotes(cfg) {
  const d = await call(cfg, 'pullRows', { table: 'DeliveryNotes', since: '' });
  return Array.isArray(d.rows) ? d.rows : [];
}
