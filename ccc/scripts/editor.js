(function () {
  // TODO: Add more
  const CUP_ICONS = ["Cup_A", "Cup_B", "Cup_C", "Cup_D"];

  let courses = [];
  let added = [];
  let cups = [];
  let dragFrom = -1;

  const byId = (id) => courses.find((c) => c.id === id);
  const isAdded = (id) => added.includes(id);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
  }

  function showStep(step) {
    document.getElementById("stepCourses").classList.toggle("d-none", step !== 1);
    document.getElementById("stepCups").classList.toggle("d-none", step !== 2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function formatSize(bytes) {
    if(bytes >= (1024 * 1024)) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    return `${Math.round(bytes / 1024)} KB`;
  }

  function makeCard(course) {
    const card = el("article", "mod-card course-card");
    card.dataset.id = course.id;

    const thumbWrap = el("div", "mod-thumb-wrap");
    const img = document.createElement("img");
    img.alt = `${course.name} preview`;
    img.loading = "lazy";
    img.src = course.thumbnail_image;
    thumbWrap.appendChild(img);

    const body = el("div", "mod-body");
    const header = el("div", "mod-header");
    header.append(el("h3", "", course.name));
    if (course.size) {
      header.append(el("span", "course-size", formatSize(course.size)));
    }
    body.append(header);
    body.append(el("p", "mod-author", `by ${course.author || "Unknown"}`));

    const footer = el("div", "mod-footer");
    const btn = el("button", "btn btn-sm rounded-pill");
    btn.type = "button";
    btn.dataset.action = "toggle";
    footer.append(btn);

    card.append(thumbWrap, body, footer);
    updateCard(card, course.id);
    return card;
  }

  function updateCard(card, id) {
    const on = isAdded(id);
    card.classList.toggle("is-added", on);
    const btn = card.querySelector("button[data-action='toggle']");
    btn.textContent = on ? "Remove" : "Add";
    btn.className = on
      ? "btn btn-outline-light btn-sm rounded-pill is-remove"
      : "btn btn-success btn-sm rounded-pill text-dark";
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", `${on ? "Remove" : "Add"} ${byId(id).name}`);
  }

  function renderCourses() {
    const query = document.getElementById("courseSearch").value.trim().toLowerCase();
    const list = courses.filter((c) =>
      !query || `${c.name} ${c.author}`.toLowerCase().includes(query),
    );
    document.getElementById("courseGrid").replaceChildren(...list.map(makeCard));
    document.getElementById("courseNoResults").classList.toggle("d-none", list.length !== 0);
    document.getElementById("courseCount").textContent =
      list.length === courses.length
        ? `${plural(courses.length, "course")} available`
        : `${list.length} of ${courses.length} courses`;
  }

  function updateBubble(animate) {
    const n = added.length;

    document.getElementById("bubbleCount").textContent = String(n);
    document.getElementById("bubbleLabel").textContent = n === 1 ? "course added" : "courses added";
    document.getElementById("nextBtn").disabled = n === 0;

    if (animate) {
      const count = document.getElementById("bubbleCount");
      count.classList.remove("pop");
      void count.offsetWidth; // this flushes the classList batching: https://stackoverflow.com/a/60686560
      count.classList.add("pop");
    }
  }

  function toggleCourse(id) {
    if (isAdded(id)) {
      added = added.filter((x) => x !== id);
    } else {
      added.push(id);
    }

    const card = document.getElementById("courseGrid").querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (card) {
      updateCard(card, id);
    }
    updateBubble(true);
  }

  document.getElementById("courseGrid").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='toggle']");
    const card = btn && btn.closest(".course-card");
    if (card) {
      toggleCourse(card.dataset.id);
    }
  });

  document.getElementById("courseSearch").addEventListener("input", renderCourses);

  document.getElementById("nextBtn").addEventListener("click", () => {
    if (added.length === 0) {
      return;
    }
    buildCups();
    renderCups();
    showStep(2);
  });

  const flatSlots = () => cups.flatMap((cup) => cup.slots);

  function setFlatSlots(flat) {
    cups.forEach((cup, i) => {
      cup.slots = flat.slice(i * 4, (i + 1) * 4);
    });
  }

  function buildCups() {
    const flat = flatSlots().map((slot) => (slot && isAdded(slot.id) ? slot : null));

    for (const id of added) {
      const hasOriginal = flat.some((s) => s && s.id === id && !s.reused);
      if (hasOriginal) {
        continue;
      }
      const free = flat.indexOf(null);
      if (free >= 0) {
        flat[free] = { id, reused: false };
      } else {
        flat.push({ id, reused: false });
      }
    }

    while (flat.length % 4 !== 0) {
      flat.push(null);
    }

    const needed = Math.max(1, Math.ceil(added.length / 4));
    let cupCount = flat.length / 4;

    while (cupCount > needed && flat.slice((cupCount - 1) * 4).every((s) => !s)) {
      flat.length -= 4;
      cupCount -= 1;
    }

    const previousIcons = cups.map((c) => c.icon);
    cups = [];
    for (let i = 0; i < cupCount; i++) {
      cups.push({
        icon: previousIcons[i] || CUP_ICONS[i % CUP_ICONS.length],
        slots: flat.slice(i * 4, (i + 1) * 4),
      });
    }
  }

  function emptySlotCount() {
    return flatSlots().filter((s) => !s).length;
  }

  function updateCupsInfo() {
    const empty = emptySlotCount();
    document.getElementById("cupsInfo").textContent =
      `${plural(added.length, "course")} · ${plural(cups.length, "cup")}` +
      (empty ? ` · ${plural(empty, "empty slot")} left` : "");
    document.getElementById("generateBtn").disabled = empty > 0;
    document.getElementById("generateBtn").title = empty
      ? "Fill every empty slot (re-use a course) to continue"
      : "";
  }

  function makeSideColumn(cup, cupIndex) {
    const side = el("div", "cup-side");
    side.append(el("div", "cup-name", `Cup ${cupIndex + 1}`));

    const big = el("img", "cup-icon-big");
    big.src = `cups/${cup.icon}.png`;
    big.alt = `Selected icon: ${cup.icon.replace("_", " ")}`;
    side.append(big);

    side.append(el("p", "cup-icon-hint", "Choose a cup icon"));

    const choices = el("div", "cup-icon-choices");
    choices.setAttribute("role", "group");
    choices.setAttribute("aria-label", `Cup icon for cup ${cupIndex + 1}`);

    for (const name of CUP_ICONS) {
      const btn = el("button", "cup-icon-choice");
      btn.type = "button";
      btn.dataset.action = "icon";
      btn.dataset.cup = String(cupIndex);
      btn.dataset.icon = name;
      btn.setAttribute("aria-pressed", String(name === cup.icon));
      btn.title = name.replace("_", " ");

      const img = el("img");
      img.src = `cups/${name}.png`;
      img.alt = name.replace("_", " ");
      btn.append(img);

      choices.append(btn);
    }

    side.append(choices);
    return side;
  }

  function makeSlot(slot, flatIndex, cupIndex) {
    const node = el("div", "cup-slot");
    node.dataset.index = String(flatIndex);

    if (!slot) {
      node.classList.add("is-empty");
      node.append(el("p", "slot-empty-label", `Slot ${(flatIndex % 4) + 1} is empty`));

      const select = el("select", "slot-select");
      select.dataset.action = "reuse";
      select.dataset.index = String(flatIndex);
      select.setAttribute("aria-label", `Re-use a course in cup ${cupIndex + 1}, slot ${(flatIndex % 4) + 1}`);
      select.append(new Option("Re-use a course...", ""));
      for (const id of added) {
        select.append(new Option(byId(id).name, id));
      }
      select.value = "";
      node.append(select);
      return node;
    }

    const course = byId(slot.id);
    node.draggable = true;

    node.append(el("span", "cup-slot-num", String((flatIndex % 4) + 1)));

    const thumb = el("div", "cup-slot-thumb");
    const img = document.createElement("img");
    img.alt = `${course.name} preview`;
    img.src = course.thumbnail_image || "img/Logo.png"; // TODO: find better default. Or use no at all. All courses have images
    img.draggable = false;
    thumb.append(img);

    const body = el("div", "cup-slot-body");
    body.append(el("p", "cup-slot-name", course.name));

    const meta = el("div", "cup-slot-meta");
    if (slot.reused) {
      meta.append(el("span", "cup-slot-tag", "re-used"));
    }

    const controls = el("div", "cup-slot-controls");
    const total = cups.length * 4;

    const left = el("button", "slot-btn", "◀");
    left.type = "button";
    left.dataset.action = "move";
    left.dataset.index = String(flatIndex);
    left.dataset.dir = "-1";
    left.disabled = flatIndex === 0;
    left.setAttribute("aria-label", `Move ${course.name} earlier`);

    const right = el("button", "slot-btn", "▶");
    right.type = "button";
    right.dataset.action = "move";
    right.dataset.index = String(flatIndex);
    right.dataset.dir = "1";
    right.disabled = flatIndex === total - 1;
    right.setAttribute("aria-label", `Move ${course.name} later`);

    controls.append(left, right);
    if (slot.reused) {
      const del = el("button", "slot-btn is-remove", "✕");
      del.type = "button";
      del.dataset.action = "clear";
      del.dataset.index = String(flatIndex);
      del.setAttribute("aria-label", `Clear the re-used ${course.name} slot`);
      controls.append(del);
    }
    meta.append(controls);
    body.append(meta);

    node.append(thumb, body);
    return node;
  }

  function renderCups() {
    const rows = cups.map((cup, cupIndex) => {
      const row = el("div", "cup-row");
      row.append(makeSideColumn(cup, cupIndex));

      const slots = el("div", "cup-slots");
      cup.slots.forEach((slot, i) => {
        slots.append(makeSlot(slot, cupIndex * 4 + i, cupIndex));
      });
      row.append(slots);
      return row;
    });
    document.getElementById("cupList").replaceChildren(...rows);
    updateCupsInfo();
  }

  function swapSlots(a, b) {
    if (a === b || a < 0 || b < 0) {
      return;
    }

    const flat = flatSlots();
    if (a >= flat.length || b >= flat.length) {
      return;
    }

    [flat[a], flat[b]] = [flat[b], flat[a]];

    setFlatSlots(flat);
    renderCups();
  }

  document.getElementById("cupList").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) {
      return;
    }

    if (btn.dataset.action === "icon") {
      cups[Number(btn.dataset.cup)].icon = btn.dataset.icon;
      renderCups();
    } else if (btn.dataset.action === "move") {
      const i = Number(btn.dataset.index);
      swapSlots(i, i + Number(btn.dataset.dir));
    } else if (btn.dataset.action === "clear") {
      const flat = flatSlots();
      flat[Number(btn.dataset.index)] = null;
      setFlatSlots(flat);
      renderCups();
    }
  });

  document.getElementById("cupList").addEventListener("change", (e) => {
    const select = e.target.closest("select[data-action='reuse']");
    if (!select || !select.value) {
      return;
    }

    const flat = flatSlots();
    flat[Number(select.dataset.index)] = { id: select.value, reused: true };

    setFlatSlots(flat);
    renderCups();
  });

  document.getElementById("cupList").addEventListener("dragstart", (e) => {
    const slot = e.target.closest(".cup-slot");
    if (!slot || slot.classList.contains("is-empty")) {
      return;
    }
    dragFrom = Number(slot.dataset.index);
    slot.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragFrom));
  });

  document.getElementById("cupList").addEventListener("dragover", (e) => {
    const slot = e.target.closest(".cup-slot");
    if (!slot || dragFrom < 0) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    document.getElementById("cupList")
      .querySelectorAll(".drop-target")
      .forEach((n) => n !== slot && n.classList.remove("drop-target"));
    slot.classList.add("drop-target");
  });

  document.getElementById("cupList").addEventListener("drop", (e) => {
    const slot = e.target.closest(".cup-slot");
    if (!slot || dragFrom < 0) {
      return;
    }
    e.preventDefault();
    const from = dragFrom;
    dragFrom = -1;
    swapSlots(from, Number(slot.dataset.index));
  });

  document.getElementById("cupList").addEventListener("dragend", () => {
    dragFrom = -1;
    document.getElementById("cupList")
      .querySelectorAll(".dragging, .drop-target")
      .forEach((n) => n.classList.remove("dragging", "drop-target"));
  });

  document.getElementById("backBtn").addEventListener("click", () => {
    showStep(1);
  });

  function cupsData() {
    return cups.map((cup) => ({
      icon: cup.icon,
      courses: cup.slots.map((slot) => {
        const course = byId(slot.id);
        return { id: course.id, name: course.name, file: course.file, reused: slot.reused };
      }),
    }));
  }

  function onProgress(text) {
    document.getElementById("generateStatus").textContent = text;
  }

  function download(bytes, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    const a = el("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function generateCups(data) {
    window.cupEditor.pendingCups = data;

    const { generateMod } = await import("./generate-mod.mjs");
    const { nrm, filename } = await generateMod(data, { onProgress });

    download(nrm, filename);
  }

  document.getElementById("generateBtn").addEventListener("click", async () => {
    if (emptySlotCount() > 0) {
      return;
    }
    document.getElementById("generateBtn").disabled = true;
    document.getElementById("backBtn").disabled = true;
    onProgress("Starting...");
    document.getElementById("generateOverlay").classList.remove("d-none");
    try {
      await generateCups(cupsData());
    } catch (err) {
      console.error(err);
      alert(`Generating the mod failed: ${err.message}`);
    } finally {
      document.getElementById("generateOverlay").classList.add("d-none");
      document.getElementById("backBtn").disabled = false;
      updateCupsInfo();
    }
  });

  window.cupEditor = { pendingCups: null };

  async function loadCourses() {
    try {
      const res = await fetch("courses/courses.json", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      courses = (Array.isArray(data) ? data : []).map((c) => ({
        id: String(c.id),
        name: c.name || `Course ${c.id}`,
        author: c.author || "",
        file: c.file || "",
        size: c.size || 0,
        thumbnail_image: c.thumbnail_image || "",
      }));
      renderCourses();
      updateBubble(false);
    } catch (err) {
      console.error(`Couldn't load courses:`, err);
      document.getElementById("courseCount").textContent = "";
      document.getElementById("courseError").classList.remove("d-none");
    }
  }

  updateBubble(false);
  loadCourses();
})();
