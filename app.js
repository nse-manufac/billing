/**
 * ต่อสายอย่างเดียว — ห้ามมีกฎธุรกิจในไฟล์นี้ (INVARIANTS C1)
 *
 * กฎอยู่ที่ `core/` · การรับส่งอยู่ที่ `io/` · ไฟล์นี้แค่เอามาต่อกับหน้าจอ
 * ถ้าเผลอเขียนกฎไว้ที่นี่ มันจะกลายเป็นของที่เทสด้วย node ไม่ได้ทันที
 */
import { groupByBill, filterGroups, summarize, unitsOf, qtyOf } from './core/delivery.js';
import * as gs from './io/gs-api.js';
import * as settings from './io/settings.js';

const { createApp, ref, reactive, computed, onMounted } = Vue;

createApp({
  setup() {
    const conn = reactive(settings.load());
    const rows = ref([]);
    const busy = ref(false);
    const err = ref('');
    const note = ref('');
    const loadedAt = ref('');
    const showConn = ref(!settings.isReady(conn));

    const f = reactive({ q: '', unit: '', issued: 'all', from: '', to: '' });
    const picked = ref('');

    const groups = computed(() => groupByBill(rows.value));
    const shown = computed(() => filterGroups(groups.value, f));
    const sum = computed(() => summarize(shown.value));
    const units = computed(() => unitsOf(groups.value));
    const pickedGroup = computed(() => shown.value.find(g => g.key === picked.value) || null);

    const ready = computed(() => settings.isReady(conn));

    function saveConn() {
      settings.save(conn);
      if (ready.value) showConn.value = false;
    }

    async function refresh() {
      if (!ready.value) { showConn.value = true; return; }
      busy.value = true; err.value = ''; note.value = '';
      try {
        rows.value = await gs.pullDeliveryNotes(conn);
        loadedAt.value = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        // ใบที่เลือกไว้อาจหายไปจากรอบนี้ (ถูกยกเลิกที่แม่สอด) — อย่าค้างรายละเอียดของใบที่ไม่มีแล้ว
        if (picked.value && !groups.value.some(g => g.key === picked.value)) picked.value = '';
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

    return { conn, rows, busy, err, note, loadedAt, showConn, f, picked, groups, shown, sum,
             units, pickedGroup, ready, saveConn, refresh, testConn, clearFilter,
             fmtDate, nf, qtyOf };
  }
}).mount('#app');
