/* ที่เก็บข้อมูลแบบเดียวกันทั้ง Firestore และโหมดทดลอง (localStorage) + สูตรคำนวณค่าตอบแทน */

window.makeStore = function (db) {
  if (db) {
    const C = (c) => db.collection(c);
    return {
      demo: false,
      async get(c, id) { const d = await C(c).doc(id).get(); return d.exists ? Object.assign({ id: d.id }, d.data()) : null; },
      async list(c, field, value) {
        const q = field ? C(c).where(field, "==", value) : C(c);
        return (await q.get()).docs.map((d) => Object.assign({ id: d.id }, d.data()));
      },
      set: (c, id, data) => C(c).doc(id).set(data),
      update: (c, id, patch) => C(c).doc(id).update(patch),
      del: (c, id) => C(c).doc(id).delete()
    };
  }
  const key = (c) => "demo_" + c;
  const read = (c) => { try { return JSON.parse(localStorage.getItem(key(c)) || "{}"); } catch { return {}; } };
  const write = (c, m) => localStorage.setItem(key(c), JSON.stringify(m));
  return {
    demo: true,
    async get(c, id) { const m = read(c); return m[id] ? Object.assign({ id }, m[id]) : null; },
    async list(c, field, value) {
      return Object.entries(read(c)).map(([id, v]) => Object.assign({ id }, v)).filter((x) => !field || x[field] === value);
    },
    async set(c, id, data) { const m = read(c); m[id] = data; write(c, m); },
    async update(c, id, patch) { const m = read(c); if (!m[id]) throw new Error("not found"); Object.assign(m[id], patch); write(c, m); },
    async del(c, id) { const m = read(c); delete m[id]; write(c, m); }
  };
};

window.Pay = (function () {
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const toUTC = (s) => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, m - 1, d); };

  function days(start, end) {
    if (!start || !end) return 0;
    const n = Math.round((toUTC(end) - toUTC(start)) / 86400000) + 1;
    return n > 0 ? n : 0;
  }
  function calc(a) {
    const d = days(a.start, a.end);
    const base = r2(d * (Number(a.rate) || 0));
    const extras = r2((a.extras || []).reduce((s, x) => s + (Number(x.amount) || 0), 0));
    const gross = r2(base + extras);
    const wht = r2(gross * (Number(a.whtRate) || 0) / 100);
    const net = r2(gross - wht);
    const inst = Number(a.installments) === 2 ? [r2(net / 2), r2(net - r2(net / 2))] : [net];
    return { days: d, base, extras, gross, wht, net, inst };
  }
  const money = (n) => (Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateTh = (s) => s ? new Date(toUTC(s)).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }) : "";
  const range = (a, b) => a === b ? dateTh(a) : `${dateTh(a)} – ${dateTh(b)}`;
  function token(n) {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", a = new Uint32Array(n || 24);
    crypto.getRandomValues(a); return Array.from(a, (x) => abc[x % abc.length]).join("");
  }
  return { days, calc, money, dateTh, range, token, r2 };
})();
