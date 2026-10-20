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

  const API_ORIGIN = "https://celino.167-99-74-236.sslip.io";
  const walletTrigger = $("#walletTrigger");
  const walletDialog = $("#walletDialog");
  const walletList = $("#walletList");
  const walletEmpty = $("#walletEmpty");
  const walletPicker = $("#walletPicker");
  const walletSession = $("#walletSession");
  const walletAddress = $("#walletAddress");
  const walletAuthState = $("#walletAuthState");
  const walletError = $("#walletError");
  const discoveredWallets = new Map();
  let activeWallet = null;
  let activeAccount = null;
  let sessionToken = sessionStorage.getItem("celino.session") || "";

  const shortAddress = (address) => `${address.slice(0, 4)}…${address.slice(-4)}`;
  const api = async (path, options = {}) => {
    const headers = { "content-type": "application/json", ...(options.headers || {}) };
    if (sessionToken) headers.authorization = `Bearer ${sessionToken}`;
    const response = await fetch(`${API_ORIGIN}${path}`, { ...options, headers });
    const result = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  };

  function registerWallets(...wallets) {
    wallets.flat().forEach((wallet) => {
      if (!wallet?.name || !wallet?.features?.["standard:connect"]) return;
      discoveredWallets.set(wallet.name, { kind: "standard", wallet });
    });
    renderWallets();
    return () => wallets.forEach((wallet) => discoveredWallets.delete(wallet.name));
  }

  const walletRegistry = Object.freeze({ register: registerWallets });
  window.addEventListener("wallet-standard:register-wallet", (event) => {
    if (typeof event.detail === "function") event.detail(walletRegistry);
  });
  window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: walletRegistry }));

  function discoverLegacyWallets() {
    const candidates = [
      ["Phantom", window.phantom?.solana],
      ["Solflare", window.solflare],
      ["Backpack", window.backpack]
    ];
    candidates.forEach(([name, provider]) => {
      if (provider?.connect && !discoveredWallets.has(name)) discoveredWallets.set(name, { kind: "legacy", wallet: provider, name });
    });
  }

  function renderWallets() {
    if (!walletList) return;
    discoverLegacyWallets();
    walletList.replaceChildren();
    [...discoveredWallets.values()].sort((a, b) => (a.wallet.name || a.name).localeCompare(b.wallet.name || b.name)).forEach((entry) => {
      const name = entry.wallet.name || entry.name;
      const button = document.createElement("button");
      button.className = "wallet-option";
      button.type = "button";
      const icon = document.createElement("i"), label = document.createElement("span"), standard = document.createElement("small");
      icon.textContent = name.slice(0, 1).toUpperCase();
      label.textContent = name;
      standard.textContent = entry.kind === "standard" ? "WALLET STANDARD" : "COMPATIBLE";
      button.append(icon, label, standard);
      button.addEventListener("click", () => connectWallet(entry));
      walletList.append(button);
    });
    walletEmpty.hidden = discoveredWallets.size > 0;
  }

  function showConnected(address, authenticated = false) {
    walletPicker.hidden = true;
    walletSession.hidden = false;
    walletAddress.textContent = address;
    walletTrigger.textContent = authenticated ? `${shortAddress(address)} / AUTH` : shortAddress(address);
    walletTrigger.classList.toggle("connected", !authenticated);
    walletTrigger.classList.toggle("authenticated", authenticated);
    walletAuthState.textContent = authenticated
      ? "Signed session active. Capability publication and owner actions are authorized."
      : "Wallet connected. Sign the login message to authenticate with Celino Core.";
    $("#walletAuthenticate").hidden = authenticated;
  }

  async function connectWallet(entry) {
    walletError.textContent = "";
    try {
      if (entry.kind === "standard") {
        const feature = entry.wallet.features["standard:connect"];
        const result = await feature.connect();
        activeAccount = result?.accounts?.[0] || entry.wallet.accounts?.[0];
        if (!activeAccount?.address) throw new Error("wallet returned no Solana account");
      } else {
        const result = await entry.wallet.connect();
        const address = result?.publicKey?.toString() || entry.wallet.publicKey?.toString();
        if (!address) throw new Error("wallet returned no Solana account");
        activeAccount = { address };
      }
      activeWallet = entry;
      sessionToken = "";
      sessionStorage.removeItem("celino.session");
      showConnected(activeAccount.address, false);
    } catch (error) { walletError.textContent = error.message || "Wallet connection failed."; }
  }

  const bytesToBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  async function signMessage(message) {
    const bytes = new TextEncoder().encode(message);
    if (!activeWallet) throw new Error("Reconnect the wallet before signing in");
    if (activeWallet.kind === "standard") {
      const feature = activeWallet.wallet.features["solana:signMessage"];
      if (!feature?.signMessage) throw new Error("This wallet does not support message signing");
      const result = await feature.signMessage({ account: activeAccount, message: bytes });
      const output = Array.isArray(result) ? result[0] : result;
      return bytesToBase64(output.signature);
    }
    if (!activeWallet.wallet.signMessage) throw new Error("This wallet does not support message signing");
    const result = await activeWallet.wallet.signMessage(bytes, "utf8");
    return bytesToBase64(result.signature || result);
  }

  async function authenticateWallet() {
    walletError.textContent = "";
    const button = $("#walletAuthenticate");
    try {
      button.disabled = true;
      button.textContent = "REQUESTING CHALLENGE";
      const challenge = await api("/api/auth/challenge", { method: "POST", body: JSON.stringify({ address: activeAccount.address }) });
      button.textContent = "AWAITING SIGNATURE";
      const signature = await signMessage(challenge.message);
      const verified = await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ challengeId: challenge.challengeId, signature }) });
      sessionToken = verified.token;
      sessionStorage.setItem("celino.session", sessionToken);
      showConnected(verified.wallet, true);
    } catch (error) { walletError.textContent = error.message || "Wallet authentication failed."; }
    finally { button.disabled = false; button.textContent = "SIGN IN"; }
  }

  async function disconnectWallet() {
    try {
      if (activeWallet?.kind === "standard") await activeWallet.wallet.features["standard:disconnect"]?.disconnect?.();
      else await activeWallet?.wallet?.disconnect?.();
    } catch {}
    activeWallet = null; activeAccount = null; sessionToken = "";
    sessionStorage.removeItem("celino.session");
    walletPicker.hidden = false; walletSession.hidden = true;
    walletTrigger.textContent = "CONNECT WALLET";
    walletTrigger.classList.remove("connected", "authenticated");
    renderWallets();
  }

  walletTrigger.addEventListener("click", () => { walletError.textContent = ""; renderWallets(); walletDialog.showModal(); });
  $("#walletClose").addEventListener("click", () => walletDialog.close());
  $("#walletRefresh").addEventListener("click", renderWallets);
  $("#walletAuthenticate").addEventListener("click", authenticateWallet);
  $("#walletDisconnect").addEventListener("click", disconnectWallet);
  walletDialog.addEventListener("click", (event) => { if (event.target === walletDialog) walletDialog.close(); });

  async function restoreSession() {
    if (!sessionToken) return;
    try {
      const current = await api("/api/session");
      activeAccount = { address: current.wallet };
      showConnected(current.wallet, true);
    } catch { sessionToken = ""; sessionStorage.removeItem("celino.session"); }
  }

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
  $("#publishManifest").addEventListener("click", async () => {
    const button = $("#publishManifest");
    if (!currentManifest) await compileManifest();
    if (!sessionToken) {
      walletError.textContent = activeAccount ? "Sign in before publishing a capability." : "Connect and sign in before publishing a capability.";
      renderWallets();
      walletDialog.showModal();
      return;
    }
    try {
      button.disabled = true;
      button.textContent = "PUBLISHING";
      await api("/api/capabilities", { method: "POST", body: currentManifest });
      button.textContent = "PUBLISHED";
      await loadRegistry();
    } catch (error) {
      button.textContent = "PUBLISH FAILED";
      manifestError.textContent = error.message;
    } finally {
      button.disabled = false;
      window.setTimeout(() => { button.textContent = "PUBLISH TO CORE"; }, 1600);
    }
  });
  compileManifest();

  function appendRegistryRecord(capability) {
    const row = document.createElement("div");
    row.className = "registry-record";
    const name = document.createElement("b"), digest = document.createElement("code"), owner = document.createElement("span"), time = document.createElement("time");
    name.textContent = `${capability.capability}@${capability.version}`;
    digest.textContent = capability.policyDigest;
    owner.textContent = capability.owner;
    time.textContent = new Date(capability.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
    time.dateTime = capability.createdAt;
    row.append(name, digest, owner, time);
    $("#registryList").append(row);
  }

  async function loadRegistry() {
    const coreState = $("#coreState"), coreDetail = $("#coreDetail");
    try {
      const [health, registry] = await Promise.all([api("/api/health"), api("/api/capabilities")]);
      coreState.textContent = "OPERATIONAL";
      coreState.className = "online";
      coreDetail.textContent = `${health.service} v${health.version} / live authenticated registry`;
      $("#registryCount").textContent = `${registry.capabilities.length} ${registry.capabilities.length === 1 ? "RECORD" : "RECORDS"}`;
      $("#registryList").replaceChildren();
      if (!registry.capabilities.length) {
        const empty = document.createElement("p");
        empty.textContent = "No owner-published capabilities yet. Connect a wallet, compile a manifest and publish the first real record.";
        $("#registryList").append(empty);
      } else registry.capabilities.forEach(appendRegistryRecord);
    } catch (error) {
      coreState.textContent = "UNAVAILABLE";
      coreState.className = "offline";
      coreDetail.textContent = "Celino Core could not be reached; local instruments remain operational";
      $("#registryList").replaceChildren();
      const message = document.createElement("p");
      message.textContent = `Registry unavailable: ${error.message}`;
      $("#registryList").append(message);
    }
  }

  restoreSession();
  loadRegistry();

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
