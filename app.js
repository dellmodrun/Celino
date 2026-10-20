(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  $("#year").textContent = new Date().getFullYear();

  const stage = $("#sealStage");
  const traceState = $("#traceState");
  const traceLog = $("#traceLog");
  const runTrace = $("#runTrace");
  let traceTimer = null;

  const traceSteps = [
    ["01", "envelope", "request encrypted + expiry attached"],
    ["02", "broker", "unnecessary context removed"],
    ["03", "guardian", "owner policy compiled"],
    ["04", "vault", "sealed capability executed"],
    ["05", "filter", "raw fields withheld"],
    ["06", "proof", "capsule committed locally"]
  ];

  runTrace.addEventListener("click", () => {
    if (traceTimer) clearInterval(traceTimer);
    stage.classList.add("running");
    traceState.textContent = "EXECUTING";
    runTrace.disabled = true;
    runTrace.textContent = "TRACE IN PROGRESS";
    traceLog.innerHTML = "";
    let cursor = 0;
    const append = () => {
      const [id, phase, message] = traceSteps[cursor];
      const item = document.createElement("li");
      item.innerHTML = `<time>${id}</time><span>${phase}</span><b>${message}</b>`;
      traceLog.append(item);
      cursor += 1;
      if (cursor === traceSteps.length) {
        clearInterval(traceTimer);
        traceTimer = null;
        traceState.textContent = "VERIFIED";
        runTrace.disabled = false;
        runTrace.textContent = "EXECUTE AGAIN";
        window.setTimeout(() => stage.classList.remove("running"), 900);
      }
    };
    append();
    traceTimer = window.setInterval(append, 420);
  });

  const calls = $("#calls");
  const detail = $("#detail");
  const overlap = $("#overlap");
  const matrix = $("#privacyMatrix");
  const matrixCells = [];
  for (let i = 0; i < 120; i += 1) {
    const cell = document.createElement("i");
    cell.setAttribute("aria-hidden", "true");
    matrix.append(cell);
    matrixCells.push(cell);
  }

  function compileBudget() {
    const c = Number(calls.value);
    const d = Number(detail.value);
    const o = Number(overlap.value);
    const exposure = Math.min(100, Math.round((c * 0.34) + (d * 0.38) + (o * 0.44)));
    const remaining = Math.max(0, 100 - exposure);
    let label = "LOW";
    let policy = "FULL OUTPUT";
    let color = "var(--green)";
    if (exposure >= 72) {
      label = "CRITICAL";
      policy = "REJECT REQUEST";
      color = "var(--red)";
    } else if (exposure >= 48) {
      label = "ELEVATED";
      policy = "REDUCE PRECISION";
      color = "var(--yellow)";
    } else if (exposure >= 25) {
      label = "GUARDED";
      policy = "MASK RARE FIELDS";
      color = "var(--coral)";
    }

    $("#callsOut").textContent = String(c);
    $("#detailOut").textContent = `${d}%`;
    $("#overlapOut").textContent = `${o}%`;
    $("#riskValue").textContent = `${label} / ${String(exposure).padStart(3, "0")}`;
    $("#policyValue").textContent = policy;
    $("#budgetValue").textContent = `${remaining.toFixed(1)}%`;
    $("#meterFill").style.width = `${exposure}%`;
    $("#meterFill").style.background = color;

    matrixCells.forEach((cell, index) => {
      cell.className = "";
      if (index < Math.round(exposure * 1.2)) {
        cell.className = exposure >= 72 ? "danger" : exposure >= 48 ? "warn" : "on";
      }
    });
  }

  [calls, detail, overlap].forEach((control) => control.addEventListener("input", compileBudget));
  compileBudget();

  function hex(buffer) {
    return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function digest(value) {
    const bytes = new TextEncoder().encode(value);
    if (window.crypto?.subtle) return hex(await window.crypto.subtle.digest("SHA-256", bytes));
    let fallback = 2166136261;
    bytes.forEach((byte) => { fallback = Math.imul(fallback ^ byte, 16777619); });
    return `fnv1a-${(fallback >>> 0).toString(16).padStart(8, "0")}`;
  }

  $("#proofForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const intent = $("#proofIntent").value.trim();
    const schema = $("#proofSchema").value.trim();
    const expiry = $("#proofExpiry").value.trim();
    if (!intent || !schema || !expiry) return;

    const button = event.submitter;
    button.disabled = true;
    button.textContent = "HASHING LOCALLY...";
    const [intentDigest, policyDigest] = await Promise.all([
      digest(intent),
      digest(JSON.stringify({ schema, expiry, deny: ["source", "credentials", "memory"] }))
    ]);

    $("#intentHash").textContent = intentDigest;
    $("#policyHash").textContent = policyDigest;
    $("#proofTime").textContent = new Date().toISOString();
    $("#proofStatus").textContent = "Capsule sealed in this browser. No request or digest was transmitted.";
    $("#capsule").classList.add("sealed");
    $("#capsule .capsule-top b").textContent = "SEALED";
    button.disabled = false;
    button.textContent = "RESEAL PROOF CAPSULE";
  });

  const sections = $$('section[id]');
  const links = $$('.topbar nav a');
  const byId = new Map(links.map((link) => [link.getAttribute('href').slice(1), link]));
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((link) => link.classList.remove("active"));
    byId.get(visible.target.id)?.classList.add("active");
  }, { rootMargin: "-20% 0px -65% 0px", threshold: [0, .2, .5] });
  sections.forEach((section) => observer.observe(section));
})();
