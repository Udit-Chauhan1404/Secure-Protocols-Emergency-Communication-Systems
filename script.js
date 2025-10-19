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

// Demo button (future simulation)
const demoBtn = document.querySelector(".demo-btn");
// (kept for later — may be repurposed to open simulator page)

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
    // also replace old demo button behavior if present (project page demo button)
    if (demoBtn && demoBtn.dataset && demoBtn.dataset.replaceHandled !== "true") {
      demoBtn.dataset.replaceHandled = "true";
      demoBtn.addEventListener("click", (e) => {
        // open simulator in new tab
        window.open("resqnet.html", "_blank");
      });
    }
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
  const netStage = document.getElementById("net-stage") || document.querySelector(".net-stage");

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

  // Handle send: now with shortest-path hop-by-hop animation
  async function handleSend() {
    const senderId = senderSelect.value;
    const receiverId = receiverSelect.value;
    const plaintext = (messageInput.value || "").trim();
    const pass = (passphraseInput.value || "").trim() || "ResQNetKey2025";

    if (!plaintext) { alert("Please type a message to send."); return; }
    if (!senderId || !receiverId) { alert("Please select sender and receiver."); return; }
    if (senderId === receiverId) { alert("Sender and receiver must be different nodes."); return; }

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

    // compute path
    const path = shortestPath(senderId, receiverId);
    if (!path || path.length < 2) {
      alert("No path found between selected nodes.");
      // restore UI and exit
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

    // animate hop-by-hop sequentially (await each hop)
    for (let i = 0; i < path.length - 1; i++) {
      const hopFrom = nodeEl(path[i]);
      const hopTo = nodeEl(path[i+1]);
      try {
        await animatePacketBezier(hopFrom || { }, hopTo || { }, plaintext, { duration: 800, curveOffset: 60 });
      } catch (e) {
        console.warn("animate hop error", e);
      }
    }

    // simulate receiver decryption
    let decrypted = null;
    try {
      const receiverKey = await deriveKeyFromPassphrase(pass);
      decrypted = await decryptAESGCM(receiverKey, ciphertext, iv);
      if (decTextEl) decTextEl.textContent = decrypted === null ? "[DECRYPTION FAILED]" : decrypted;
    } catch (e) {
      decrypted = null;
      if (decTextEl) decTextEl.textContent = "[DECRYPTION FAILED]";
    }

    // Log entry (after animation)
    const row = document.createElement("tr");
    const timeStr = new Date().toLocaleTimeString();
    row.innerHTML = `
      <td>${timeStr}</td>
      <td>${escapedHtml((nodeEl(senderId) && nodeEl(senderId).dataset.label) || senderId)}</td>
      <td>${escapedHtml((nodeEl(receiverId) && nodeEl(receiverId).dataset.label) || receiverId)}</td>
      <td style="max-width:180px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escapedHtml(ciphertext)}</td>
      <td>${decrypted === null ? "—" : escapedHtml(decrypted)}</td>
      <td>${decrypted === null ? "<span style='color:#ff9a9a'>Failed</span>" : "<span style='color:#b9ffd7'>Delivered</span>"}</td>
    `;
    if (logTableBody) logTableBody.prepend(row);

    // restore send button
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

  // done
})();
