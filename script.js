// Simple fade-in loader effect
window.addEventListener("load", () => {
  const loader = document.getElementById("loader");
  if (loader) {
    loader.style.opacity = "0";
    setTimeout(() => {
      loader.style.display = "none";
      document.querySelectorAll(".hidden").forEach(el => el.classList.add("fade-in"));
    }, 600);
  }
});

// Smooth hover pulse for buttons
document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".nav-btn");
  buttons.forEach(btn => {
    btn.addEventListener("mouseenter", () => btn.style.transform = "scale(1.08)");
    btn.addEventListener("mouseleave", () => btn.style.transform = "scale(1)");
  });
});

// --- Tab Navigation Logic ---
const tabs = document.querySelectorAll(".tab-btn");
const contents = document.querySelectorAll(".tab-content");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    // Remove active state from all
    tabs.forEach((btn) => btn.classList.remove("active"));
    contents.forEach((content) => content.classList.remove("active"));

    // Add to selected
    tab.classList.add("active");
    const target = document.getElementById(tab.dataset.target);
    if (target) target.classList.add("active");

    // Smooth scroll to top of section
    window.scrollTo({ top: 200, behavior: "smooth" });
  });
});

// Demo button (project page) - open simulator page
const demoBtn = document.querySelector(".demo-btn");
if (demoBtn && demoBtn.dataset && demoBtn.dataset.replaceHandled !== "true") {
  // We'll handle demo button behavior later inside the simulator IIFE if needed.
  // But ensure project page's Launch Simulation opens resqnet.html
  document.querySelectorAll(".demo-btn").forEach(db => {
    // Only attach for the project page demo button (it contains text "Launch Simulation")
    if (db.textContent && db.textContent.includes("Launch Simulation")) {
      db.addEventListener("click", (e) => {
        window.open("resqnet.html", "_blank");
      });
    }
  });
  if (demoBtn.dataset) demoBtn.dataset.replaceHandled = "true";
}

/* ---------------- ResQNet Simulator JS (append) ---------------- */

(async () => {
  // Utility helpers
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function bufToBase64(buff) {
    const bytes = new Uint8Array(buff);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToBuf(b64) {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  async function deriveKeyFromPassphrase(passphrase, saltStr = "ResQNetSalt", iterations = 150000) {
    const passKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(passphrase),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    const salt = enc.encode(saltStr);
    const aesKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      passKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    return aesKey;
  }

  async function encryptAESGCM(key, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
    const cipherBuff = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(plaintext)
    );
    return { ciphertext: bufToBase64(cipherBuff), iv: bufToBase64(iv.buffer) };
  }

  async function decryptAESGCM(key, ciphertextB64, ivB64) {
    try {
      const cipherBuff = base64ToBuf(ciphertextB64);
      const iv = base64ToBuf(ivB64);
      const plainBuff = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv) },
        key,
        cipherBuff
      );
      return dec.decode(plainBuff);
    } catch (e) {
      return null;
    }
  }

  /* Helper: get midpoint coordinates of a node DOM element (relative to offsetParent) */
  function getNodeCenter(el) {
    const r = el.getBoundingClientRect();
    const parentR = el.offsetParent ? el.offsetParent.getBoundingClientRect() : document.body.getBoundingClientRect();
    // coordinates relative to offsetParent
    return {
      x: r.left - parentR.left + r.width / 2,
      y: r.top - parentR.top + r.height / 2
    };
  }

  /* Escaping helper for logs */
  function escapedHtml(s) {
    if (!s) return "";
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  /* Animate a packet along a quadratic Bézier curve with label and fade/arrival effects.
     Supports concurrent packets. */
  function animatePacketBezier(fromEl, toEl, message = "", opts = {}) {
    const {
      duration = 900,
      curveOffset = 80,   // how high the curve arches
      labelMax = 12       // max chars for label
    } = opts;

    return new Promise(resolve => {
      const stage = document.getElementById("net-stage") || document.querySelector(".net-stage");
      if (!stage) { resolve(); return; }

      // Create packet element
      const packet = document.createElement("div");
      packet.className = "packet";
      // style reset if needed
      packet.style.position = "absolute";
      packet.style.width = "18px";
      packet.style.height = "18px";
      packet.style.borderRadius = "50%";
      packet.style.pointerEvents = "none";
      packet.style.zIndex = "999";
      packet.style.background = "#0ae3d8";
      packet.style.boxShadow = "0 0 14px rgba(0,255,255,0.7)";

      // Create label
      const label = document.createElement("div");
      label.className = "packet-label";
      label.textContent = message.length > labelMax ? message.slice(0, labelMax) + "…" : message;
      label.style.position = "absolute";
      label.style.pointerEvents = "none";
      label.style.fontSize = "0.75rem";
      label.style.fontWeight = "700";
      label.style.padding = "2px 6px";
      label.style.borderRadius = "6px";
      label.style.whiteSpace = "nowrap";
      label.style.transform = "translate(-50%, -100%)";
      label.style.background = "#e3fffe";
      label.style.color = "#052024";
      label.style.boxSizing = "border-box";
      label.style.zIndex = "1000";

      stage.appendChild(packet);
      stage.appendChild(label);

      const start = getNodeCenter(fromEl);
      const end = getNodeCenter(toEl);

      // Control point (midpoint shifted perpendicular to line) for nicer arc
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      // compute perpendicular direction:
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = -dy / len; // unit perpendicular x
      const uy = dx / len;  // unit perpendicular y
      const cp = {
        x: midX + ux * curveOffset,
        y: midY + uy * curveOffset - 10 // slight upward bias
      };

      const startLeft = start.x - 9; // offset to center packet
      const startTop = start.y - 9;

      const t0 = performance.now();

      // optional slight random jitter in duration to avoid perfect sync
      const total = duration + (Math.random() * 200 - 100);

      function bezierPoint(t, p0, p1, p2) {
        const u = 1 - t;
        return {
          x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
          y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
        };
      }

      function step(now) {
        const elapsed = now - t0;
        let t = Math.min(1, elapsed / total);
        // ease in-out cubic
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        const p = bezierPoint(ease, { x: start.x, y: start.y }, cp, { x: end.x, y: end.y });
        // position packet and label (subtract radius)
        const px = p.x - 9;
        const py = p.y - 9;
        packet.style.transform = `translate(${px}px, ${py}px)`;
        label.style.left = `${p.x}px`;
        label.style.top = `${p.y - 12}px`;

        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          // arrival effects: fade out packet & label, highlight receiver
          packet.style.transition = "opacity 240ms ease, transform 240ms ease";
          label.style.transition = "opacity 240ms ease, transform 240ms ease";
          packet.style.opacity = "0";
          label.style.opacity = "0";

          // highlight receiver briefly
          const prev = toEl.style.boxShadow;
          toEl.style.boxShadow = "0 12px 28px rgba(0,230,230,0.28)";
          // small blink
          toEl.style.transition = "box-shadow 260ms ease, transform 220ms ease";
          toEl.style.transform = "translateY(-6px)";
          setTimeout(() => {
            toEl.style.transform = "";
          }, 220);

          setTimeout(() => {
            packet.remove();
            label.remove();
            toEl.style.boxShadow = prev || "";
            resolve();
          }, 300);
        }
      }

      // initialize positions so first frame doesn't jump
      packet.style.transform = `translate(${startLeft}px, ${startTop}px)`;
      label.style.left = `${start.x}px`;
      label.style.top = `${start.y - 12}px`;
      requestAnimationFrame(step);
    });
  }

  // If simulator DOM not present, skip rest
  const sendBtn = document.getElementById("sendBtn");
  if (!sendBtn) {
    // nothing else to do on non-simulator pages
    return;
  }

  // Now simulator exists — hook UI
  const senderSelect = document.getElementById("senderSelect");
  const receiverSelect = document.getElementById("receiverSelect");
  const passphraseInput = document.getElementById("passphrase");
  const messageInput = document.getElementById("messageInput");
  const encTextEl = document.getElementById("encryptedText");
  const decTextEl = document.getElementById("decryptedText");
  const logTableBody = document.querySelector("#logTable tbody");
  const pathTableBody = document.querySelector("#pathTable tbody");
  const netStage = document.getElementById("net-stage") || document.querySelector(".net-stage");
  const downloadPathBtn = document.getElementById("downloadPath");
  const clearPathBtn = document.getElementById("clearPath");
  const downloadMsgBtn = document.getElementById("downloadMsg");
  const clearMsgBtn = document.getElementById("clearMsg");

  // small helper to map node id -> element
  function nodeEl(id) { return document.getElementById(id); }

  /* ---------------- Network Graph + Routing ---------------- */

  // topology: connect neighbors in a 3x3 grid (A B C / D E F / G H I)
  // edges are bidirectional with weight 1 (you can change weights to simulate link cost)
  const networkEdges = [
    ["nodeA","nodeB",1], ["nodeB","nodeC",1],
    ["nodeD","nodeE",1], ["nodeE","nodeF",1],
    ["nodeG","nodeH",1], ["nodeH","nodeI",1],
    ["nodeA","nodeD",1], ["nodeB","nodeE",1], ["nodeC","nodeF",1],
    ["nodeD","nodeG",1], ["nodeE","nodeH",1], ["nodeF","nodeI",1],
    // add a few diagonal links for richness (optional)
    ["nodeA","nodeE",1], ["nodeC","nodeE",1], ["nodeG","nodeE",1], ["nodeI","nodeE",1]
  ];

  // Build adjacency list
  const graph = {};
  for (const [a,b,w] of networkEdges) {
    if (!graph[a]) graph[a] = [];
    if (!graph[b]) graph[b] = [];
    graph[a].push({ node: b, weight: w });
    graph[b].push({ node: a, weight: w });
  }

  // Dijkstra algorithm (returns array of node ids in path order)
  function shortestPath(start, goal) {
    if (!graph[start] || !graph[goal]) return null;
    const dist = {}, prev = {};
    const visited = new Set();
    // priority set simulated with simple loop since N is small
    const nodes = Object.keys(graph);
    for (const n of nodes) dist[n] = Infinity;
    dist[start] = 0;

    while (visited.size < nodes.length) {
      // pick unvisited node with smallest dist
      let u = null;
      for (const n of nodes) {
        if (visited.has(n)) continue;
        if (u === null || dist[n] < dist[u]) u = n;
      }
      if (u === null || dist[u] === Infinity) break;
      visited.add(u);
      if (u === goal) break;

      for (const { node: v, weight } of graph[u] || []) {
        if (visited.has(v)) continue;
        const alt = dist[u] + weight;
        if (alt < dist[v]) {
          dist[v] = alt;
          prev[v] = u;
        }
      }
    }

    if (dist[goal] === Infinity) return null;
    // reconstruct path
    const path = [];
    let cur = goal;
    while (cur) {
      path.unshift(cur);
      if (cur === start) break;
      cur = prev[cur];
    }
    return path;
  }

  // Logging arrays for CSV download
  const messageLog = []; // each entry: {time, sender, receiver, encrypted, decrypted, status}
  const pathLog = [];    // each entry: {packetId, source, destination, path, timestamp}
  let packetCounter = 1;

  function prependMessageLogRow(timeStr, senderLabel, receiverLabel, encrypted, decrypted, statusHTML) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${timeStr}</td>
      <td>${escapedHtml(senderLabel)}</td>
      <td>${escapedHtml(receiverLabel)}</td>
      <td style="max-width:180px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escapedHtml(encrypted)}</td>
      <td>${decrypted === null ? "—" : escapedHtml(decrypted)}</td>
      <td>${statusHTML}</td>
    `;
    if (logTableBody) logTableBody.prepend(row);
  }

  function prependPathRow(packetId, sourceLabel, destLabel, pathArr) {
    const row = document.createElement("tr");
    const timeStr = new Date().toLocaleTimeString();
    row.innerHTML = `<td>${escapedHtml(packetId)}</td><td>${escapedHtml(sourceLabel)}</td><td>${escapedHtml(destLabel)}</td><td>${escapedHtml(pathArr.join(" → "))}</td><td>${timeStr}</td>`;
    if (pathTableBody) pathTableBody.prepend(row);
  }

  function downloadCSVFromArray(arr, filename) {
    if (!arr || !arr.length) {
      alert("No data to download.");
      return;
    }
    const headers = Object.keys(arr[0]);
    const csvRows = [ headers.join(",") ];
    for (const row of arr) {
      const vals = headers.map(h => {
        let v = row[h];
        if (v === null || v === undefined) v = "";
        // escape quotes
        v = String(v).replace(/"/g, '""');
        // surround if comma present
        return v.includes(",") ? `"${v}"` : v;
      });
      csvRows.push(vals.join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // Handle send: supports BROADCAST or single receiver
  async function handleSend() {
    const senderId = senderSelect.value;
    const receiverId = receiverSelect.value;
    const plaintext = (messageInput.value || "").trim();
    const pass = (passphraseInput.value || "").trim() || "ResQNetKey2025";

    if (!plaintext) { alert("Please type a message to send."); return; }
    if (!senderId) { alert("Please select sender."); return; }

    sendBtn.disabled = true;
    const prevText = sendBtn.textContent;
    sendBtn.textContent = "Sending...";

    let ciphertext, iv;
    try {
      const key = await deriveKeyFromPassphrase(pass);
      const res = await encryptAESGCM(key, plaintext);
      ciphertext = res.ciphertext;
      iv = res.iv;
      if (encTextEl) encTextEl.value = ciphertext;
    } catch (err) {
      console.error("Encryption failed:", err);
      alert("Encryption failed. See console.");
      sendBtn.disabled = false;
      sendBtn.textContent = prevText;
      return;
    }

    // compute targets
    const allNodes = ["nodeA","nodeB","nodeC","nodeD","nodeE","nodeF","nodeG","nodeH","nodeI"];
    let targets;
    if (receiverId === "BROADCAST") {
      targets = allNodes.filter(n => n !== senderId);
    } else if (receiverId) {
      targets = [receiverId];
    } else {
      alert("Please select a receiver (or BROADCAST).");
      sendBtn.disabled = false;
      sendBtn.textContent = prevText;
      return;
    }

    // small visual send pulse at sender
    const senderEl = nodeEl(senderId);
    if (senderEl) {
      senderEl.style.transform = "translateY(-6px)";
      setTimeout(() => { senderEl.style.transform = ""; }, 180);
    }

    // Use same packet id base for this send operation (increment per target)
    // We'll generate one packet ID per target to log them separately
    const keyForDecrypt = await deriveKeyFromPassphrase(pass);

    // For concurrent broadcast we will create tasks
    const tasks = targets.map(async (targetId) => {
      const packetId = `P${packetCounter++}`;
      const path = shortestPath(senderId, targetId);
      if (!path || path.length < 2) {
        // log failure path
        const timeStr = new Date().toLocaleTimeString();
        messageLog.unshift({
          time: timeStr,
          sender: (nodeEl(senderId) && nodeEl(senderId).dataset.label) || senderId,
          receiver: (nodeEl(targetId) && nodeEl(targetId).dataset.label) || targetId,
          encrypted: ciphertext || "",
          decrypted: null,
          status: "Failed"
        });
        prependMessageLogRow(timeStr, (nodeEl(senderId) && nodeEl(senderId).dataset.label) || senderId, (nodeEl(targetId) && nodeEl(targetId).dataset.label) || targetId, ciphertext || "", null, "<span style='color:#ff9a9a'>Failed</span>");
        prependPathRow(packetId, (nodeEl(senderId) && nodeEl(senderId).dataset.label) || senderId, (nodeEl(targetId) && nodeEl(targetId).dataset.label) || targetId, ["No Path"]);
        return;
      }

      // animate hop-by-hop sequentially for this target
      for (let i = 0; i < path.length - 1; i++) {
        const hopFrom = nodeEl(path[i]);
        const hopTo = nodeEl(path[i+1]);
        try {
          await animatePacketBezier(hopFrom || {}, hopTo || {}, plaintext, { duration: 700, curveOffset: 60 });
        } catch (e) {
          console.warn("animate hop error", e);
        }
      }

      // simulate receiver decryption
      let decrypted = null;
      try {
        decrypted = await decryptAESGCM(keyForDecrypt, ciphertext, iv);
      } catch (e) {
        decrypted = null;
      }

      // Build log entries
      const timeStr = new Date().toLocaleTimeString();
      const senderLabel = (nodeEl(senderId) && nodeEl(senderId).dataset.label) || senderId;
      const receiverLabel = (nodeEl(targetId) && nodeEl(targetId).dataset.label) || targetId;

      messageLog.unshift({
        time: timeStr,
        sender: senderLabel,
        receiver: receiverLabel,
        encrypted: ciphertext,
        decrypted: decrypted,
        status: decrypted ? "Delivered" : "Failed"
      });

      prependMessageLogRow(timeStr, senderLabel, receiverLabel, ciphertext, decrypted, decrypted ? "<span style='color:#b9ffd7'>Delivered</span>" : "<span style='color:#ff9a9a'>Failed</span>");

      // path log
      pathLog.unshift({
        packetId,
        source: senderLabel,
        destination: receiverLabel,
        path: path.map(p => (nodeEl(p) && nodeEl(p).dataset.label) || p).join(" → "),
        timestamp: timeStr
      });
      // also add UI row
      prependPathRow(packetId, senderLabel, receiverLabel, path.map(p => (nodeEl(p) && nodeEl(p).dataset.label) || p));
    });

    // Wait for all deliveries (if broadcast) to finish
    await Promise.all(tasks);

    // show decrypted for single receiver in UI; for broadcast show 'Multiple' or last
    if (targets.length === 1) {
      const lastEntry = messageLog[0];
      decTextEl.textContent = lastEntry.decrypted === null ? "[DECRYPTION FAILED]" : lastEntry.decrypted;
    } else {
      decTextEl.textContent = "Multiple";
    }

    // Restore UI
    sendBtn.disabled = false;
    sendBtn.textContent = prevText;
    messageInput.value = "";
  }

  // assign handler
  sendBtn.addEventListener("click", handleSend);
  // convenience: press Enter to send from message input
  if (messageInput) {
    messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    });
  }

  // visual: draw thin connecting lines between nodes using SVG for clarity
  (function drawConnections() {
    const stage = netStage;
    if (!stage) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.position = "absolute";
    svg.style.inset = "0";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.pointerEvents = "none";
    stage.appendChild(svg);

    function refreshLines() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      for (const [a,b] of networkEdges) {
        const elA = nodeEl(a);
        const elB = nodeEl(b);
        if (!elA || !elB) continue;
        const p1 = getNodeCenter(elA);
        const p2 = getNodeCenter(elB);
        const line = document.createElementNS("http://www.w3.org/2000/svg","line");
        line.setAttribute("x1", p1.x);
        line.setAttribute("y1", p1.y);
        line.setAttribute("x2", p2.x);
        line.setAttribute("y2", p2.y);
        line.setAttribute("stroke", "rgba(0,230,230,0.12)");
        line.setAttribute("stroke-width", "2");
        line.setAttribute("stroke-linecap", "round");
        svg.appendChild(line);
      }
    }

    refreshLines();
    window.addEventListener("resize", () => setTimeout(refreshLines, 120));
    setTimeout(refreshLines, 300);
  })();

  // small accessibility: clicking a node selects it as sender (shift-click selects receiver)
  ["nodeA","nodeB","nodeC","nodeD","nodeE","nodeF","nodeG","nodeH","nodeI"].forEach(id => {
    const el = nodeEl(id);
    if (!el) return;
    el.addEventListener("click",(ev) => {
      if (ev.shiftKey && receiverSelect) receiverSelect.value = id;
      else if (senderSelect) senderSelect.value = id;
      // quick pulse
      el.style.transform = "translateY(-8px) scale(1.03)";
      setTimeout(()=> el.style.transform = "", 220);
    });
  });

  // Path & Message CSV download + clear handlers
  downloadPathBtn.addEventListener("click", () => {
    if (!pathLog.length) return alert("No path log entries.");
    // convert pathLog entries to consistent csv objects
    const csvData = pathLog.map(p => ({
      PacketID: p.packetId,
      Source: p.source,
      Destination: p.destination,
      Path: p.path,
      Timestamp: p.timestamp
    }));
    downloadCSVFromArray(csvData, "resqnet_path_log.csv");
  });

  clearPathBtn.addEventListener("click", () => {
    if (!confirm("Clear all entries from Path Followed log?")) return;
    pathLog.length = 0;
    // clear UI rows
    if (pathTableBody) pathTableBody.innerHTML = "";
  });

  downloadMsgBtn.addEventListener("click", () => {
    if (!messageLog.length) return alert("No message log entries.");
    const csvData = messageLog.map(m => ({
      Time: m.time,
      Sender: m.sender,
      Receiver: m.receiver,
      Encrypted: m.encrypted,
      Decrypted: m.decrypted,
      Status: m.status
    }));
    downloadCSVFromArray(csvData, "resqnet_message_log.csv");
  });

  clearMsgBtn.addEventListener("click", () => {
    if (!confirm("Clear all entries from Message Log?")) return;
    messageLog.length = 0;
    if (logTableBody) logTableBody.innerHTML = "";
  });

  // done
})();
