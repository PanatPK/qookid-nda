/* แท็บ "ใบงานและการจ่ายเงิน" ในหน้าแอดมิน
   jobs/{id}          งาน: ชื่อ สถานที่ ช่วงวันที่ จำนวนงวด ภาษีตั้งต้น
   assignments/{tok}  ใบงานรายคน: เรท/วัน ช่วงวันที่ของคนนั้น รายการเพิ่ม/หัก ภาษี งวดจ่าย สถานะรับทราบ
                      id เป็นรหัสสุ่ม ใช้เป็นลิงก์ส่วนตัว job.html?t=... */
window.Jobs = (function () {
  let S, staffFn, root, jobs = [], cur = null, crew = [], editing = null;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const q = (sel) => root.querySelector(sel);
  const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const jobLink = (id) => location.href.replace(/admin\.html.*$/, "job.html").split("?")[0] + "?t=" + id;
  // ฟิลด์ที่ถ้าแก้แล้วต้องให้สตาฟกดรับทราบใหม่
  const TERMS = ["role", "rate", "start", "end", "extras", "whtRate", "installments"];

  function init(o) { S = o.store; staffFn = o.staff; root = o.mount; cur = null; }
  async function open() { if (cur) return showJob(cur.id); await loadJobs(); renderList(); }

  async function loadJobs() {
    jobs = (await S.list("jobs")).sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  }

  /* ---------- รายการงาน ---------- */
  function renderList() {
    cur = null;
    root.innerHTML = `
    <section class="card">
      <h2 class="step" style="font-size:16px;margin-bottom:12px">สร้างงานใหม่</h2>
      <div class="grid">
        <div class="field full"><label>ชื่องาน</label><input id="jName" placeholder="เช่น TEAPOT คาราวานคู่ชง เชียงใหม่"></div>
        <div class="field full"><label>สถานที่</label><input id="jLoc"></div>
        <div class="field"><label>วันเริ่มงาน</label><input id="jStart" type="date" value="${today()}"></div>
        <div class="field"><label>วันจบงาน</label><input id="jEnd" type="date" value="${today()}"></div>
        <div class="field"><label>การจ่ายเงิน</label>
          <select id="jInst"><option value="1">โอนครั้งเดียวหลังจบงาน</option><option value="2">แบ่ง 2 งวด ครึ่งต่อครึ่ง</option></select></div>
        <div class="field"><label>หักภาษี ณ ที่จ่าย (%)</label><input id="jWht" type="number" min="0" step="0.5" value="3"></div>
      </div>
      <div style="margin-top:14px"><button class="btn primary" id="jCreate">สร้างงาน</button> <span class="err-box" id="jErr"></span></div>
    </section>
    <section class="card">
      <div class="tablewrap"><table>
        <thead><tr><th>งาน</th><th>วันที่</th><th>สถานที่</th><th>การจ่าย</th><th></th></tr></thead>
        <tbody>${jobs.length ? jobs.map((j) => `<tr>
          <td><b>${esc(j.name)}</b></td><td>${esc(Pay.range(j.start, j.end))}</td><td>${esc(j.location || "-")}</td>
          <td>${j.installments == 2 ? "2 งวด" : "ครั้งเดียว"}</td>
          <td><button class="btn ghost small" data-open="${esc(j.id)}">เปิด</button></td></tr>`).join("")
          : `<tr><td colspan="5" class="empty">ยังไม่มีงาน</td></tr>`}</tbody>
      </table></div>
    </section>`;
    q("#jCreate").onclick = async () => {
      const name = q("#jName").value.trim(), start = q("#jStart").value, end = q("#jEnd").value;
      if (!name) return (q("#jErr").textContent = "ใส่ชื่องาน");
      if (!start || !end || end < start) return (q("#jErr").textContent = "ตรวจวันที่เริ่มและจบงาน");
      const id = "J" + Date.now().toString(36).toUpperCase();
      await S.set("jobs", id, { name, location: q("#jLoc").value.trim(), start, end,
        installments: Number(q("#jInst").value), whtDefault: Number(q("#jWht").value) || 0, createdAt: new Date().toISOString() });
      await showJob(id);
    };
    root.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => showJob(b.dataset.open));
  }

  /* ---------- หน้างาน ---------- */
  async function showJob(id) {
    cur = await S.get("jobs", id);
    if (!cur) { await loadJobs(); return renderList(); }
    crew = (await S.list("assignments", "jobId", id)).sort((a, b) => (a.start || "").localeCompare(b.start || "") || a.name.localeCompare(b.name, "th"));
    editing = null;
    renderJob();
  }

  function staffOptions(sel) {
    const signed = staffFn().slice().sort((a, b) => (a.nickname || a.fullName).localeCompare(b.nickname || b.fullName, "th"));
    return `<option value="">เลือกสตาฟที่เซ็นสัญญาแล้ว</option>` + signed.map((s) =>
      `<option value="${esc(s.docNo)}" ${s.docNo === sel ? "selected" : ""}>${esc(s.nickname)} – ${esc([s.prefix, s.fullName].filter(Boolean).join(" "))} (${esc(s.staffType)})</option>`).join("");
  }

  function renderJob() {
    const tot = crew.reduce((t, a) => { const c = Pay.calc(a); t.days += c.days; t.gross += c.gross; t.wht += c.wht; t.net += c.net;
      c.inst.forEach((v, i) => { t.inst[i] = (t.inst[i] || 0) + v; if (a.paid && a.paid[i]) t.paid[i] = (t.paid[i] || 0) + v; }); return t; },
      { days: 0, gross: 0, wht: 0, net: 0, inst: [], paid: [] });
    const nInst = Number(cur.installments) === 2 ? 2 : 1;
    const ackN = crew.filter((a) => a.ackAt).length;

    root.innerHTML = `
    <section class="card">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <div><button class="link" id="back">← งานทั้งหมด</button>
          <h2 style="margin:6px 0 2px">${esc(cur.name)}</h2>
          <div class="hint" style="margin:0">${esc(Pay.range(cur.start, cur.end))}${cur.location ? " &nbsp; " + esc(cur.location) : ""} &nbsp; ${nInst === 2 ? "แบ่งจ่าย 2 งวด" : "จ่ายครั้งเดียว"}</div></div>
        <button class="btn ghost small" id="delJob">ลบงาน</button>
      </div>
      <div class="sumgrid">
        <div><span>ทีมงาน</span><b>${crew.length} คน</b><small>รับทราบแล้ว ${ackN}</small></div>
        <div><span>รวมวันทำงาน</span><b>${tot.days} วัน</b></div>
        <div><span>ยอดรวมก่อนภาษี</span><b>${Pay.money(tot.gross)}</b><small>ภาษี ${Pay.money(tot.wht)}</small></div>
        <div><span>ยอดโอนสุทธิ</span><b>${Pay.money(tot.net)}</b>${[...Array(nInst)].map((_, i) =>
          `<small>${nInst === 2 ? "งวด " + (i + 1) + " " : ""}โอนแล้ว ${Pay.money(tot.paid[i] || 0)} / ${Pay.money(tot.inst[i] || 0)}</small>`).join("")}</div>
      </div>
    </section>

    <section class="card" id="formCard">
      <h2 class="step" style="font-size:16px;margin-bottom:12px">${editing ? "แก้ไขใบงาน" : "เพิ่มทีมงาน"}</h2>
      <div class="grid">
        <div class="field full"><label>สตาฟ</label><select id="aStaff" ${editing ? "disabled" : ""}>${staffOptions(editing && editing.docNo)}</select></div>
        <div class="field"><label>ตำแหน่งในงานนี้</label><input id="aRole" value="${esc(editing ? editing.role : "")}"></div>
        <div class="field"><label>ค่าตอบแทนต่อวัน (บาท)</label><input id="aRate" type="number" min="0" step="50" value="${esc(editing ? editing.rate : "")}"></div>
        <div class="field"><label>วันแรกที่มาทำงาน</label><input id="aStart" type="date" value="${esc(editing ? editing.start : cur.start)}"></div>
        <div class="field"><label>วันสุดท้าย</label><input id="aEnd" type="date" value="${esc(editing ? editing.end : cur.end)}"></div>
        <div class="field"><label>หักภาษี ณ ที่จ่าย (%)</label><input id="aWht" type="number" min="0" step="0.5" value="${esc(editing ? editing.whtRate : cur.whtDefault)}"></div>
        <div class="field"><label>คำนวณ</label><div id="aPreview" class="hint" style="margin:8px 0 0"></div></div>
        <div class="field full"><label>รายการเพิ่ม/หัก <span class="opt">(เช่น ค่าเดินทาง 500, หักวันที่ไม่มา -1500)</span></label>
          <div id="aExtras"></div><button class="link" id="addExtra" type="button">+ เพิ่มรายการ</button></div>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn primary" id="aSave">${editing ? "บันทึกการแก้ไข" : "เพิ่มเข้างาน"}</button>
        ${editing ? `<button class="btn ghost" id="aCancel">ยกเลิก</button>` : ""}
        <span class="err-box" id="aErr" style="margin:0"></span>
      </div>
      ${editing && editing.ackAt ? `<div class="hint" style="margin:10px 0 0">ถ้าแก้ตำแหน่ง เรท วันที่ หรือรายการเพิ่ม/หัก สตาฟต้องกดรับทราบใหม่</div>` : ""}
    </section>

    <section class="card">
      <div class="toolbar">
        ${[...Array(nInst)].map((_, i) => `<button class="btn ghost small" data-csv="${i}">CSV สำหรับโอน${nInst === 2 ? "งวด " + (i + 1) : ""}</button>`).join("")}
        <button class="btn ghost small" id="copyAll">คัดลอกลิงก์ใบงานทุกคน</button>
      </div>
      <div class="tablewrap"><table class="crew">
        <thead><tr><th>สตาฟ</th><th>ตำแหน่ง</th><th>วันที่</th><th class="num">วัน</th><th class="num">เรท/วัน</th><th class="num">เพิ่ม/หัก</th>
          <th class="num">ภาษี</th><th class="num">สุทธิ</th><th>${nInst === 2 ? "งวด 1 / งวด 2" : "โอนแล้ว"}</th><th>ใบงาน</th><th></th></tr></thead>
        <tbody>${crew.length ? crew.map((a) => { const c = Pay.calc(a); return `<tr>
          <td><b>${esc(a.nickname)}</b><br><span class="hint" style="font-size:12px">${esc(a.name)}</span></td>
          <td>${esc(a.role)}</td><td>${esc(Pay.range(a.start, a.end))}</td><td class="num">${c.days}</td>
          <td class="num">${Pay.money(a.rate)}</td><td class="num">${c.extras ? Pay.money(c.extras) : "-"}</td>
          <td class="num">${Pay.money(c.wht)}</td><td class="num"><b>${Pay.money(c.net)}</b></td>
          <td>${c.inst.map((v, i) => `<label class="paid"><input type="checkbox" data-paid="${esc(a.id)}" data-i="${i}" ${a.paid && a.paid[i] ? "checked" : ""}> ${Pay.money(v)}</label>`).join("")}</td>
          <td>${a.ackAt ? `<span class="tag ok">รับทราบแล้ว</span>` : `<span class="tag wait">รอรับทราบ</span>`}<br>
            <button class="link" data-copy="${esc(a.id)}" style="font-size:13px">คัดลอกลิงก์</button></td>
          <td style="white-space:nowrap"><button class="btn ghost small" data-edit="${esc(a.id)}">แก้ไข</button>
            <button class="btn ghost small" data-del="${esc(a.id)}">ลบ</button></td></tr>`; }).join("")
          : `<tr><td colspan="11" class="empty">ยังไม่มีทีมงานในงานนี้</td></tr>`}</tbody>
      </table></div>
    </section>`;

    // ---- ฟอร์มเพิ่ม/แก้ ----
    let extras = (editing && editing.extras ? editing.extras : []).map((x) => ({ ...x }));
    const drawExtras = () => {
      q("#aExtras").innerHTML = extras.map((x, i) => `<div class="extra-row">
        <input data-xl="${i}" placeholder="รายการ" value="${esc(x.label)}"><input data-xa="${i}" type="number" step="50" placeholder="บาท" value="${esc(x.amount)}">
        <button class="link" data-xd="${i}" type="button">ลบ</button></div>`).join("");
      q("#aExtras").querySelectorAll("[data-xl]").forEach((el) => el.oninput = () => { extras[el.dataset.xl].label = el.value; });
      q("#aExtras").querySelectorAll("[data-xa]").forEach((el) => el.oninput = () => { extras[el.dataset.xa].amount = el.value; preview(); });
      q("#aExtras").querySelectorAll("[data-xd]").forEach((el) => el.onclick = () => { extras.splice(el.dataset.xd, 1); drawExtras(); preview(); });
    };
    const formVal = () => ({ role: q("#aRole").value.trim(), rate: Number(q("#aRate").value) || 0, start: q("#aStart").value, end: q("#aEnd").value,
      whtRate: Number(q("#aWht").value) || 0, installments: nInst,
      extras: extras.filter((x) => x.label || Number(x.amount)).map((x) => ({ label: String(x.label || "").trim(), amount: Number(x.amount) || 0 })) });
    const preview = () => { const c = Pay.calc(formVal());
      q("#aPreview").innerHTML = `${c.days} วัน × ${Pay.money(q("#aRate").value)} ${c.extras ? (c.extras > 0 ? "+ " : "") + Pay.money(c.extras) : ""} = ${Pay.money(c.gross)}<br>หักภาษี ${Pay.money(c.wht)} สุทธิ <b>${Pay.money(c.net)}</b>`; };
    drawExtras(); preview();
    ["#aRate", "#aStart", "#aEnd", "#aWht"].forEach((s) => q(s).oninput = preview);
    q("#addExtra").onclick = () => { extras.push({ label: "", amount: "" }); drawExtras(); };
    q("#aStaff").onchange = () => { const s = staffFn().find((x) => x.docNo === q("#aStaff").value);
      if (s && !q("#aRole").value) q("#aRole").value = s.role || "";
      if (s && s.staffType === "พนักงานประจำ") { q("#aWht").value = 0; preview(); } };
    if (q("#aCancel")) q("#aCancel").onclick = () => { editing = null; renderJob(); };

    q("#aSave").onclick = async () => {
      const v = formVal(), err = (m) => (q("#aErr").textContent = m);
      if (!v.role) return err("ใส่ตำแหน่ง");
      if (!v.rate) return err("ใส่ค่าตอบแทนต่อวัน");
      if (!v.start || !v.end || v.end < v.start) return err("ตรวจวันที่");
      q("#aSave").disabled = true;
      try {
        if (editing) {
          const changed = TERMS.some((k) => JSON.stringify(v[k]) !== JSON.stringify(editing[k]));
          await S.update("assignments", editing.id, Object.assign(v, changed ? { ackAt: null, ackUA: null } : {}, { updatedAt: new Date().toISOString() }));
        } else {
          const s = staffFn().find((x) => x.docNo === q("#aStaff").value);
          if (!s) { q("#aSave").disabled = false; return err("เลือกสตาฟ"); }
          if (crew.some((a) => a.docNo === s.docNo)) { q("#aSave").disabled = false; return err("สตาฟคนนี้อยู่ในงานนี้แล้ว"); }
          await S.set("assignments", Pay.token(24), Object.assign(v, {
            jobId: cur.id, jobName: cur.name, location: cur.location || "", jobStart: cur.start, jobEnd: cur.end,
            docNo: s.docNo, name: [s.prefix, s.fullName].filter(Boolean).join(" "), nickname: s.nickname || "", phone: s.phone || "",
            company: NDA_SETTINGS.companyTh, paid: [null, null], ackAt: null, ackUA: null, createdAt: new Date().toISOString() }));
        }
        await showJob(cur.id);
      } catch (e) { console.error(e); err("บันทึกไม่สำเร็จ"); q("#aSave").disabled = false; }
    };

    // ---- ปุ่มในตาราง ----
    q("#back").onclick = async () => { await loadJobs(); renderList(); };
    q("#delJob").onclick = async () => {
      if (crew.length) return alertBox("ลบทีมงานออกให้หมดก่อน จึงจะลบงานได้");
      if (!confirm("ลบงานนี้?")) return;
      await S.del("jobs", cur.id); await loadJobs(); renderList();
    };
    root.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => {
      editing = crew.find((a) => a.id === b.dataset.edit); renderJob(); q("#formCard").scrollIntoView({ behavior: "smooth" }); });
    root.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      const a = crew.find((x) => x.id === b.dataset.del);
      if (!confirm(`เอา ${a.nickname || a.name} ออกจากงานนี้? ลิงก์ใบงานของคนนี้จะใช้ไม่ได้`)) return;
      await S.del("assignments", a.id); await showJob(cur.id); });
    root.querySelectorAll("[data-paid]").forEach((cb) => cb.onchange = async () => {
      const a = crew.find((x) => x.id === cb.dataset.paid), paid = (a.paid || [null, null]).slice();
      paid[Number(cb.dataset.i)] = cb.checked ? new Date().toISOString() : null;
      await S.update("assignments", a.id, { paid }); a.paid = paid; renderJob(); });
    root.querySelectorAll("[data-copy]").forEach((b) => b.onclick = () => copy(jobLink(b.dataset.copy), b));
    q("#copyAll").onclick = (e) => copy(crew.map((a) => `${a.nickname || a.name}: ${jobLink(a.id)}`).join("\n"), e.target);
    root.querySelectorAll("[data-csv]").forEach((b) => b.onclick = () => csv(Number(b.dataset.csv)));
  }

  function alertBox(m) { const e = q("#aErr"); if (e) e.textContent = m; }
  async function copy(text, btn) {
    const old = btn.textContent;
    try { await navigator.clipboard.writeText(text); btn.textContent = "คัดลอกแล้ว"; }
    catch { prompt("คัดลอกข้อความนี้", text); }
    setTimeout(() => (btn.textContent = old), 1500);
  }

  function csv(i) {
    const staff = staffFn(), qv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["ชื่อบัญชี", "ธนาคาร", "เลขที่บัญชี", "ยอดโอน", "ชื่อเล่น", "ตำแหน่ง", "วันที่", "จำนวนวัน", "เรท/วัน", "เพิ่ม/หัก", "ยอดก่อนภาษี", "ภาษี", "สุทธิทั้งหมด", "เลขที่สัญญา", "สถานะใบงาน"];
    const rows = crew.map((a) => { const c = Pay.calc(a), s = staff.find((x) => x.docNo === a.docNo) || {};
      return [s.bankAccName || a.name, s.bankName || "", "'" + (s.bankAcc || ""), c.inst[i] ?? "", a.nickname, a.role, Pay.range(a.start, a.end), c.days,
        a.rate, c.extras, c.gross, c.wht, c.net, a.docNo, a.ackAt ? "รับทราบแล้ว" : "รอรับทราบ"]; });
    const text = "﻿" + [head, ...rows].map((r) => r.map(qv).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    link.download = `โอนเงิน_${cur.name}${Number(cur.installments) === 2 ? "_งวด" + (i + 1) : ""}.csv`; link.click();
  }

  return { init, open };
})();
