/**
 * ต่อสายอย่างเดียว — ห้ามมีกฎธุรกิจในไฟล์นี้ (INVARIANTS C1)
 *
 * กฎอยู่ที่ `core/` · การรับส่งอยู่ที่ `io/` · ไฟล์นี้แค่เอามาต่อกับหน้าจอ
 * ถ้าเผลอเขียนกฎไว้ที่นี่ มันจะกลายเป็นของที่เทสด้วย node ไม่ได้ทันที
 */
import { buildBills, filterBills, summarize, unitsOf } from './core/delivery.js';
import * as gs from './io/gs-api.js';
import * as settings from './io/settings.js';

const { createApp, ref, reactive, computed, onMounted } = Vue;

createApp({
  setup() {
    const conn = reactive(settings.load());
    const raw = reactive({ notes: [], records: [], orders: [] });
    const busy = ref(false);
    const err = ref('');
    const note = ref('');
    const loadedAt = ref('');
    const showConn = ref(!settings.isReady(conn));

    const f = reactive({ q: '', unit: '', issued: 'all', from: '', to: '' });
    const picked = ref('');

    const bills = computed(() => buildBills(raw.notes, raw.records, raw.orders));
    const shown = computed(() => filterBills(bills.value, f));
    const sum = computed(() => summarize(shown.value));
    const units = computed(() => unitsOf(bills.value));
    const pickedBill = computed(() => shown.value.find(b => b.key === picked.value) || null);
    const ready = computed(() => settings.isReady(conn));

    function saveConn() {
      settings.save(conn);
      if (ready.value) showConn.value = false;
    }

    async function refresh() {
      if (!ready.value) { showConn.value = true; return; }
      busy.value = true; err.value = ''; note.value = '';
      try {
        const d = await gs.pullAll(conn);
        raw.notes = d.notes; raw.records = d.records; raw.orders = d.orders;
        loadedAt.value = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        // ใบที่เลือกไว้อาจหายไปจากรอบนี้ (ถูกยกเลิกที่แม่สอด) — อย่าค้างรายละเอียดของใบที่ไม่มีแล้ว
        if (picked.value && !bills.value.some(b => b.key === picked.value)) picked.value = '';
      } catch (e) {
        err.value = e.message || String(e);
      } finally {
        busy.value = false;
      }
    }

    async function testConn() {
      busy.value = true; err.value = ''; note.value = '';
      try {
        // ต่อถึงแล้วยังไม่พอ — ต้องเป็นสคริปต์ของโปรแกรมแผนงานจริง (ดู core/server.js)
        const r = await gs.ping(conn);
        if (r.ok) note.value = r.text; else err.value = r.text;
      } catch (e) {
        err.value = e.message || String(e);
      } finally {
        busy.value = false;
      }
    }

    const clearFilter = () => { f.q = ''; f.unit = ''; f.issued = 'all'; f.from = ''; f.to = ''; };
    const fmtDate = d => (d ? String(d).split('-').reverse().join('/') : '—');
    const nf = n => (Number(n) || 0).toLocaleString('th-TH');

    onMounted(() => { if (ready.value) refresh(); });

    return { conn, raw, busy, err, note, loadedAt, showConn, f, picked,
             bills, shown, sum, units, pickedBill, ready,
             saveConn, refresh, testConn, clearFilter, fmtDate, nf };
  }
}).mount('#app');
