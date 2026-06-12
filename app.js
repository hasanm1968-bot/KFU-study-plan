const STORAGE_KEYS = {
  name: "kfuStudyPlan.studentName",
  completed: "kfuStudyPlan.completedCourses",
  theme: "kfuStudyPlan.theme"
};

const state = {
  courses: [],
  groups: [],
  selectedLevel: null,
  completed: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.completed) || "[]")),
  pendingAfterName: null
};

const views = {
  home: document.getElementById("homeView"),
  levels: document.getElementById("levelsView"),
  courses: document.getElementById("coursesView")
};

const els = {
  startButton: document.getElementById("startButton"),
  levelsGrid: document.getElementById("levelsGrid"),
  coursesList: document.getElementById("coursesList"),
  backToLevelsButton: document.getElementById("backToLevelsButton"),
  selectedLevelTitle: document.getElementById("selectedLevelTitle"),
  selectedYearText: document.getElementById("selectedYearText"),
  selectedLevelProgress: document.getElementById("selectedLevelProgress"),
  selectedLevelHours: document.getElementById("selectedLevelHours"),
  selectedLevelRemaining: document.getElementById("selectedLevelRemaining"),
  overallProgressText: document.getElementById("overallProgressText"),
  overallProgressBar: document.getElementById("overallProgressBar"),
  overallCoursesText: document.getElementById("overallCoursesText"),
  overallHoursText: document.getElementById("overallHoursText"),
  overallRemainingText: document.getElementById("overallRemainingText"),
  studentNameLabel: document.getElementById("studentNameLabel"),
  totalCoursesHero: document.getElementById("totalCoursesHero"),
  totalHoursHero: document.getElementById("totalHoursHero"),
  remainingSubjectsHero: document.getElementById("remainingSubjectsHero"),
  nameDialog: document.getElementById("nameDialog"),
  nameForm: document.getElementById("nameForm"),
  studentNameInput: document.getElementById("studentNameInput"),
  cancelNameButton: document.getElementById("cancelNameButton"),
  downloadPdfButton: document.getElementById("downloadPdfButton"),
  resetButton: document.getElementById("resetButton"),
  themeToggle: document.getElementById("themeToggle"),
  toast: document.getElementById("toast")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  applyTheme();
  wireEvents();

  try {
    // Data is parsed from CSV format in curriculum-data.js
    // Primary data from CSV: subject names (اسم المقرر), levels (المستوى), hours (الساعات الدراسية)
    state.courses = Array.isArray(window.CURRICULUM) ? window.CURRICULUM : [];
    if (!state.courses.length) throw new Error("تعذر تحميل بيانات الخطة من ملف CSV");
    state.groups = groupCourses(state.courses);
    els.totalCoursesHero.textContent = state.courses.length;
    els.totalHoursHero.textContent = sumHours(state.courses);
    els.remainingSubjectsHero.textContent = remainingCount(state.courses);
    updateStudentName();
    renderLevels();
    updateOverallProgress();
  } catch (error) {
    showToast("تعذر تحميل بيانات الخطة الدراسية.");
    console.error(error);
  }
}

function wireEvents() {
  els.startButton.addEventListener("click", () => {
    requireStudentName(() => showView("levels"));
  });

  els.backToLevelsButton.addEventListener("click", () => {
    state.selectedLevel = null;
    showView("levels");
  });

  els.nameForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = els.studentNameInput.value.trim();
    if (!name) return;
    localStorage.setItem(STORAGE_KEYS.name, name);
    updateStudentName();
    closeNameDialog();
    const callback = state.pendingAfterName;
    state.pendingAfterName = null;
    if (callback) callback();
  });

  els.cancelNameButton.addEventListener("click", () => {
    closeNameDialog();
    state.pendingAfterName = null;
  });

  els.downloadPdfButton.addEventListener("click", () => {
    requireStudentName(downloadPdfReport);
  });

  els.resetButton.addEventListener("click", () => {
    const ok = confirm("هل تريد حذف اسم الطالب وحالات الإنجاز المحفوظة؟");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEYS.name);
    localStorage.removeItem(STORAGE_KEYS.completed);
    state.completed.clear();
    updateStudentName();
    renderLevels();
    if (state.selectedLevel) renderCourses(state.selectedLevel);
    updateOverallProgress();
    showToast("تمت إعادة تعيين البيانات.");
  });

  els.themeToggle.addEventListener("click", () => {
    const next = document.body.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem(STORAGE_KEYS.theme, next);
    applyTheme();
  });
}

function parseCourses(csv) {
  const rows = parseCsv(csv);
  if (!rows.length) return [];

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row, index) => {
      const item = {};
      headers.forEach((header, columnIndex) => {
        item[header] = (row[columnIndex] || "").trim();
      });

      return {
        id: `course-${index + 1}`,
        year: item["السنة"] || "",
        level: item["المستوى"] || "",
        name: item["اسم المقرر"] || "",
        code: item["رمز المقرر"] || "",
        universityCode: item["الرقم الجامعي"] || "",
        hours: item["الساعات الدراسية"] || "",
        type: item["صفة المقرر"] || "",
        notes: item["ملاحظات"] || ""
      };
    });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header) {
  return header
    .replace(/^\uFEFF/, "")
    .replace(/^\\xEF\\xBB\\xBF/, "")
    .trim();
}

function groupCourses(courses) {
  const map = new Map();
  courses.forEach((course) => {
    if (!map.has(course.level)) map.set(course.level, []);
    map.get(course.level).push(course);
  });

  return [...map.entries()]
    .map(([level, items]) => ({ level, items, year: mostCommon(items.map((course) => course.year)) }))
    .sort((a, b) => sortLevel(a.level, b.level));
}

function sortLevel(a, b) {
  const parse = (value) => {
    const first = Number(String(value).split("-")[0]);
    const isRange = String(value).includes("-");
    return { first: Number.isFinite(first) ? first : 99, isRange };
  };
  const left = parse(a);
  const right = parse(b);
  if (left.isRange !== right.isRange) return left.isRange ? 1 : -1;
  if (left.first !== right.first) return left.first - right.first;
  return String(a).localeCompare(String(b), "ar");
}

function mostCommon(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function renderLevels() {
  els.levelsGrid.replaceChildren();
  state.groups.forEach((group) => {
    const progress = getProgress(group.items);
    const card = document.createElement("section");
    card.className = "plan-level-card";

    const header = document.createElement("div");
    header.className = "plan-level-head";

    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = `${levelTitle(group.level)} — ${group.year || "مجموعة مقررات"}`;
    const sub = document.createElement("p");
    sub.textContent = `${sumHours(group.items)} ساعة | ${remainingCount(group.items)} مقرر متبقي`;
    titleWrap.append(title, sub);

    const openButton = document.createElement("button");
    openButton.className = "level-open-button";
    openButton.type = "button";
    openButton.textContent = "عرض المستوى";
    openButton.addEventListener("click", () => {
      state.selectedLevel = group.level;
      renderCourses(group.level);
      showView("courses");
    });

    const badge = document.createElement("span");
    badge.className = "level-badge";
    badge.textContent = `${progress}%`;
    header.append(titleWrap, badge, openButton);

    const table = createSubjectsTable(group.items);

    const track = document.createElement("div");
    track.className = "progress-track";
    const fill = document.createElement("div");
    fill.className = "progress-fill";
    fill.style.width = `${progress}%`;
    track.append(fill);

    const note = group.items.find((course) => course.notes)?.notes;
    if (note) {
      const noteEl = document.createElement("p");
      noteEl.className = "level-note";
      noteEl.textContent = note;
      card.append(header, table, track, noteEl);
    } else {
      card.append(header, table, track);
    }

    els.levelsGrid.append(card);
  });
}

function createSubjectsTable(courses) {
  const wrap = document.createElement("div");
  wrap.className = "subjects-table-wrap";
  const table = document.createElement("table");
  table.className = "subjects-table";

  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>#</th><th>المقرر</th><th>المستوى</th><th>الرمز</th><th>الساعات</th><th>النوع</th><th>الحالة</th></tr>";
  const tbody = document.createElement("tbody");

  courses.forEach((course, index) => {
    const completed = state.completed.has(course.id);
    const row = document.createElement("tr");
    row.className = completed ? "completed-row" : "";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = completed;
    check.addEventListener("change", () => setCourseCompleted(course.id, check.checked));

    row.append(
      createCell(String(index + 1)),
      createCell(course.name, "subject-name"),
      createCell(levelTitle(course.level)),
      createCell(`${course.code} / ${course.universityCode}`, "code-cell"),
      createCell(course.hours, "hours-cell"),
      createTypeCell(course.type),
      createStatusCell(check, completed)
    );
    tbody.append(row);
  });

  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

function createCell(text, className = "") {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

function createTypeCell(type) {
  const cell = document.createElement("td");
  const pill = document.createElement("span");
  pill.className = `type-pill ${getTypeClass(type)}`;
  pill.textContent = type || "غير مصنف";
  cell.append(pill);
  return cell;
}

function createStatusCell(check, completed) {
  const cell = document.createElement("td");
  const label = document.createElement("label");
  label.className = "table-check";
  const text = document.createElement("span");
  text.textContent = completed ? "مكتمل" : "متبقي";
  label.append(check, text);
  cell.append(label);
  return cell;
}

function getTypeClass(type) {
  if (type.includes("اختياري")) return "optional";
  if (type.includes("جامعة")) return "university";
  if (type.includes("كلية")) return "college";
  return "major";
}

function renderCourses(level) {
  const group = state.groups.find((item) => item.level === level);
  if (!group) return;

  const progress = getProgress(group.items);
  const completedHours = sumHours(group.items.filter((course) => state.completed.has(course.id)));
  const totalHours = sumHours(group.items);
  els.selectedLevelTitle.textContent = levelTitle(group.level);
  els.selectedYearText.textContent = group.year || "مجموعة مقررات";
  els.selectedLevelProgress.textContent = `${progress}%`;
  els.selectedLevelHours.textContent = `${completedHours} / ${totalHours}`;
  els.selectedLevelRemaining.textContent = remainingCount(group.items);
  els.coursesList.replaceChildren();

  group.items.forEach((course) => {
    const completed = state.completed.has(course.id);
    const card = document.createElement("article");
    card.className = `course-card${completed ? " completed" : ""}`;

    const body = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "course-title";
    title.textContent = course.name;

    const details = document.createElement("div");
    details.className = "course-details";
    details.append(createPill(levelTitle(course.level)));
    details.append(createPill(course.code || "بدون رمز"));
    details.append(createPill(`${course.hours || 0} ساعات`));
    details.append(createPill(course.type || "غير مصنف"));
    if (course.notes) details.append(createPill(course.notes));

    body.append(title, details);

    const label = document.createElement("label");
    label.className = "course-check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = completed;
    checkbox.addEventListener("change", () => setCourseCompleted(course.id, checkbox.checked));
    const checkText = document.createElement("span");
    checkText.textContent = completed ? "مكتمل" : "تحديد الإنجاز";
    label.append(checkbox, checkText);

    card.append(body, label);
    els.coursesList.append(card);
  });
}

function toggleCourse(courseId) {
  if (state.completed.has(courseId)) {
    state.completed.delete(courseId);
  } else {
    state.completed.add(courseId);
  }

  localStorage.setItem(STORAGE_KEYS.completed, JSON.stringify([...state.completed]));
  renderLevels();
  renderCourses(state.selectedLevel);
  updateOverallProgress();
}

function setCourseCompleted(courseId, isCompleted) {
  if (isCompleted) {
    state.completed.add(courseId);
  } else {
    state.completed.delete(courseId);
  }

  localStorage.setItem(STORAGE_KEYS.completed, JSON.stringify([...state.completed]));
  renderLevels();
  renderCourses(state.selectedLevel);
  updateOverallProgress();
}

function updateOverallProgress() {
  const progress = getProgress(state.courses);
  const completed = completedCount(state.courses);
  const total = state.courses.length;
  const completedHours = sumHours(state.courses.filter((course) => state.completed.has(course.id)));
  const totalHours = sumHours(state.courses);
  els.overallProgressText.textContent = `${progress}%`;
  els.overallCoursesText.textContent = `${completed} / ${total}`;
  els.overallHoursText.textContent = `${completedHours} / ${totalHours}`;
  els.overallRemainingText.textContent = remainingCount(state.courses);
  els.remainingSubjectsHero.textContent = remainingCount(state.courses);
  els.overallProgressBar.style.width = `${progress}%`;
}

function getProgress(courses) {
  if (!courses.length) return 0;
  return Math.round((completedCount(courses) / courses.length) * 100);
}

function completedCount(courses) {
  return courses.filter((course) => state.completed.has(course.id)).length;
}

function remainingCount(courses) {
  return courses.length - completedCount(courses);
}

function sumHours(courses) {
  return courses.reduce((total, course) => total + Number(course.hours || 0), 0);
}

function levelTitle(level) {
  return String(level).includes("-") ? `المستويات ${level}` : `المستوى ${level}`;
}

function createPill(text) {
  const pill = document.createElement("span");
  pill.className = "pill";
  pill.textContent = text;
  return pill;
}

function showView(name) {
  Object.values(views).forEach((view) => view.classList.remove("active"));
  views[name].classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function requireStudentName(callback) {
  const name = localStorage.getItem(STORAGE_KEYS.name);
  if (name) {
    callback();
    return;
  }
  state.pendingAfterName = callback;
  els.studentNameInput.value = "";
  els.nameDialog.showModal();
  setTimeout(() => els.studentNameInput.focus(), 30);
}

function closeNameDialog() {
  if (els.nameDialog.open) els.nameDialog.close();
}

function updateStudentName() {
  const name = localStorage.getItem(STORAGE_KEYS.name) || "بالطالب";
  els.studentNameLabel.textContent = name;
}

function applyTheme() {
  const theme = localStorage.getItem(STORAGE_KEYS.theme) || "dark";
  document.body.classList.toggle("dark", theme === "dark");
  els.themeToggle.textContent = theme === "dark" ? "الوضع الرسمي الفاتح" : "الوضع الرسمي الداكن";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 2600);
}

async function downloadPdfReport() {
  const name = localStorage.getItem(STORAGE_KEYS.name) || "الطالب";
  const pages = buildReportPages(name);
  const blob = await createPdfFromCanvasPages(pages);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `تقرير-خطة-الدراسة-${safeFileName(name)}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("تم إنشاء تقرير PDF.");
}

function buildReportPages(studentName) {
  const width = 794;
  const height = 1123;
  const padding = 56;
  const lineHeight = 28;
  const pages = [];
  let canvas;
  let ctx;
  let y;

  const newPage = () => {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#0b2f57";
    ctx.font = "700 28px Segoe UI, Arial";
    ctx.fillText("تقرير خطة الدراسة", width - padding, 58);
    ctx.fillStyle = "#66758a";
    ctx.font = "16px Segoe UI, Arial";
    ctx.fillText(`اسم الطالب: ${studentName}`, width - padding, 92);
    ctx.fillText(`تاريخ التقرير: ${new Date().toLocaleDateString("ar-SA")}`, width - padding, 118);
    y = 158;
    pages.push(canvas);
  };

  const ensureSpace = (needed = lineHeight) => {
    if (y + needed > height - padding) newPage();
  };

  const drawText = (text, x, font, color = "#152334", maxWidth = width - padding * 2) => {
    ctx.font = font;
    ctx.fillStyle = color;
    const words = String(text).split(" ");
    let line = "";
    const lines = [];
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    lines.forEach((item) => {
      ensureSpace(lineHeight);
      ctx.fillText(item, x, y);
      y += lineHeight;
    });
  };

  newPage();

  state.groups.forEach((group) => {
    ensureSpace(72);
    ctx.fillStyle = "#eef2f6";
    ctx.fillRect(padding, y - 28, width - padding * 2, 44);
    drawText(`${levelTitle(group.level)} - ${getProgress(group.items)}%`, width - padding - 12, "700 19px Segoe UI, Arial", "#0b2f57", width - padding * 2 - 24);
    group.items.forEach((course) => {
      const status = state.completed.has(course.id) ? "مكتمل" : "غير مكتمل";
      const notes = course.notes ? ` - ${course.notes}` : "";
      drawText(`${status} | ${course.name} | ${course.code} | ${course.hours} ساعات${notes}`, width - padding, "15px Segoe UI, Arial", "#152334");
    });
    y += 12;
  });

  return pages;
}

async function createPdfFromCanvasPages(canvases) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const objects = [];
  const pageObjectIds = [];
  const imageInfos = [];

  for (const canvas of canvases) {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    const binary = atob(dataUrl.split(",")[1]);
    imageInfos.push({ binary, width: canvas.width, height: canvas.height });
  }

  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");

  imageInfos.forEach((image, index) => {
    const imageId = addObject(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.binary.length} >>\nstream\n${image.binary}\nendstream`);
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${index + 1} Do\nQ`;
    const contentId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageObjectIds.push(pageId);
  });

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

function safeFileName(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, "-").trim() || "student";
}
