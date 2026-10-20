(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  $("#year").textContent = new Date().getFullYear();

  const contractStrip = $("#contract");
  const contractValue = $("#contractValue");
  const copyContract = $("#copyContract");
  copyContract.addEventListener("click", async () => {
    const value = contractStrip.dataset.contract.trim();
    if (!value || value.toUpperCase() === "TBA") {
      copyContract.textContent = "CA NOT PUBLISHED";
      window.setTimeout(() => { copyContract.textContent = "COPY CA"; }, 1400);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      copyContract.textContent = "COPIED";
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(contractValue);
      selection.removeAllRanges();
      selection.addRange(range);
      copyContract.textContent = "SELECTED";
    }
    window.setTimeout(() => { copyContract.textContent = "COPY CA"; }, 1400);
  });

  const stage = $("#sealStage");
  const traceState = $("#traceState");
  const traceLog = $("#traceLog");
  const runTrace = $("#runTrace");
  const policyRows = $$(".policy-pane li");
  const registerValues = $$("#registers b");
  let traceTimer = null;

  const traceSteps = [
    ["01", "load", "intent envelope mapped @ 0x0010"],
    ["02", "cmp", "scope intersects owner.allow"],
    ["03", "mount", "private source opened read-only"],
    ["04", "exec", "capability returned bounded result"],
    ["05", "mask", "raw fields withheld / disclosure=0"],
    ["06", "hash", "output digest committed"],
    ["07", "zero", "volatile workspace erased"],
    ["08", "ret", "attestation complete / exit=0"]
  ];

  runTrace.addEventListener("click", () => {
    if (traceTimer) clearInterval(traceTimer);
    stage.classList.add("running");
    traceState.textContent = "EXECUTING";
    runTrace.disabled = true;
    runTrace.textContent = "TRACE IN PROGRESS";
    traceLog.innerHTML = "";
    policyRows.forEach((row) => row.classList.remove("active"));
    registerValues[0].textContent = "0x0000";
    registerValues[5].textContent = "—";
    let cursor = 0;
    const append = () => {
      const [id, phase, message] = traceSteps[cursor];
      const item = document.createElement("li");
      item.innerHTML = `<time>${id}</time><span>${phase}</span><b>${message}</b>`;
      traceLog.append(item);
      policyRows.forEach((row) => row.classList.remove("active"));
      policyRows[Math.min(cursor, policyRows.length - 1)]?.classList.add("active");
      registerValues[0].textContent = `0x${String((cursor + 1) * 16).padStart(4, "0")}`;
      cursor += 1;
      if (cursor === traceSteps.length) {
        clearInterval(traceTimer);
        traceTimer = null;
        traceState.textContent = "VERIFIED";
        runTrace.disabled = false;
        runTrace.textContent = "EXECUTE AGAIN [F9]";
        registerValues[5].textContent = "0";
        window.setTimeout(() => stage.classList.remove("running"), 900);
      }
    };
    append();
    traceTimer = window.setInterval(append, 420);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "F9") {
      event.preventDefault();
      if (!runTrace.disabled) runTrace.click();
    }
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

  async function copyText(value, button, idleLabel) {
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = "COPIED";
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      button.textContent = "COPIED";
    }
    window.setTimeout(() => { button.textContent = idleLabel; }, 1400);
  }

  function downloadJson(filename, value) {
    const blob = new Blob([value], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  let currentProof = null;

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

    const generatedAt = new Date().toISOString();
    const nonce = crypto.getRandomValues(new Uint32Array(4));
    currentProof = {
      protocol: "celino/proof-capsule",
      version: "1.0.0",
      intentDigest: `sha256:${intentDigest}`,
      policyDigest: `sha256:${policyDigest}`,
      outputSchema: schema.split(",").map((item) => item.trim()).filter(Boolean),
      expiry,
      nonce: [...nonce].map((item) => item.toString(16).padStart(8, "0")).join(""),
      rawDataIncluded: false,
      generatedAt
    };

    $("#intentHash").textContent = intentDigest;
    $("#policyHash").textContent = policyDigest;
    $("#proofTime").textContent = generatedAt;
    $("#proofStatus").textContent = "Capsule sealed in this browser. No request or digest was transmitted.";
    $("#capsule").classList.add("sealed");
    $("#capsule .capsule-top b").textContent = "SEALED";
    $("#copyProof").disabled = false;
    $("#downloadProof").disabled = false;
    button.disabled = false;
    button.textContent = "RESEAL PROOF CAPSULE";
  });

  $("#copyProof").addEventListener("click", () => {
    if (!currentProof) return;
    copyText(JSON.stringify(currentProof, null, 2), $("#copyProof"), "COPY JSON");
  });

  $("#downloadProof").addEventListener("click", () => {
    if (!currentProof) return;
    downloadJson(`celino-proof-${currentProof.nonce.slice(0, 8)}.json`, JSON.stringify(currentProof, null, 2));
  });

  const manifestForm = $("#manifestForm");
  const manifestJson = $("#manifestJson");
  const manifestState = $("#manifestState");
  const manifestError = $("#manifestError");
  let currentManifest = "";

  const listValue = (selector) => $(selector).value.split(",").map((item) => item.trim()).filter(Boolean);

  async function compileManifest(event) {
    event?.preventDefault();
    manifestError.textContent = "";
    if (!manifestForm.reportValidity()) {
      manifestState.textContent = "INVALID";
      manifestError.textContent = "Correct the highlighted field before compilation.";
      return;
    }

    const specification = {
      protocol: "celino/capability-manifest",
      version: $("#manifestVersion").value.trim(),
      capability: $("#manifestName").value.trim(),
      accepts: listValue("#manifestAccepts"),
      returns: listValue("#manifestReturns"),
      disclosure: { deny: listValue("#manifestDeny") },
      execution: {
        source: "owner-sealed",
        networkAccess: false,
        persistentMemory: false,
        ttlSeconds: Number($("#manifestTtl").value)
      },
      privacy: { window: "24h", compositeLimit: Number($("#manifestLimit").value) },
      settlement: { condition: "valid_output && valid_proof", status: "pending-contract" }
    };

    if (!specification.accepts.length || !specification.returns.length || !specification.disclosure.deny.length) {
      manifestState.textContent = "INVALID";
      manifestError.textContent = "Accepts, returns and denied fields each require at least one value.";
      return;
    }

    const canonical = JSON.stringify(specification);
    const policyDigest = await digest(canonical);
    const compiled = { ...specification, policyDigest: `sha256:${policyDigest}` };
    currentManifest = JSON.stringify(compiled, null, 2);
    manifestJson.textContent = currentManifest;
    manifestState.textContent = "VALID / SHA-256";
  }

  manifestForm.addEventListener("submit", compileManifest);
  $("#copyManifest").addEventListener("click", () => copyText(currentManifest, $("#copyManifest"), "COPY JSON"));
  $("#downloadManifest").addEventListener("click", () => {
    if (!currentManifest) return;
    downloadJson(`${$("#manifestName").value.trim() || "celino-capability"}.json`, currentManifest);
  });
  compileManifest();

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
