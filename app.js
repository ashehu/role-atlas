let allRecords = [];
let filteredRecords = [];
let selectedId = null;
let selectedCompanyKey = null;
let meta = {};
let viewMode = "companies";
let scopeMode = "all";
let locationMode = "all";
let visibleLimit = 60;
let toastTimer = null;
const staticMode = document.documentElement.dataset.staticBuild === "true";
const browserStateKey = "role-atlas-review-state-v1";

const elements = {
  search: document.getElementById("searchInput"),
  aiOnly: document.getElementById("aiOnly"),
  title: document.getElementById("titleFilter"),
  lane: document.getElementById("laneFilter"),
  provider: document.getElementById("providerFilter"),
  freshness: document.getElementById("freshnessFilter"),
  resume: document.getElementById("resumeFilter"),
  status: document.getElementById("statusFilter"),
  activeOnly: document.getElementById("activeOnly"),
  sort: document.getElementById("sortSelect"),
  results: document.getElementById("results"),
  resultCount: document.getElementById("resultCount"),
  detail: document.getElementById("detailPane"),
  detailBackdrop: document.getElementById("detailBackdrop"),
  stats: document.getElementById("stats"),
  activeFilters: document.getElementById("activeFilters"),
  clearFilters: document.getElementById("clearFilters"),
  exportButton: document.getElementById("exportButton"),
  loadMore: document.getElementById("loadMore"),
  filtersPane: document.getElementById("filtersPane"),
  filterToggle: document.getElementById("filterToggle"),
  toast: document.getElementById("toast"),
  allCount: document.getElementById("allCount"),
  savedCount: document.getElementById("savedCount"),
  appliedCount: document.getElementById("appliedCount"),
  datasetDate: document.getElementById("datasetDate"),
};

const laneLabels = {
  ai_solutions: "AI solutions",
  forward_deployed: "Forward deployed",
  presales_solutions: "Pre-sales & solutions",
  data_science: "Data science",
  applied_ai: "Applied AI",
  leadership: "AI & data leadership",
  product_ai: "AI product",
  technical_account_management: "Technical accounts",
  gtm_growth: "GTM & growth",
  contract_part_time: "Contract & part-time",
};

const resumeLabels = {
  "andi_shehu_ai_solutions_engineer.pdf": "AI solutions",
  "andi_shehu_sales_engineer_presales.pdf": "Pre-sales",
  "andi_shehu_forward_deployed_engineer.pdf": "Forward deployed",
  "andi_shehu_applied_ai_engineer.pdf": "Applied AI",
  "andi_shehu_ai_architect.pdf": "AI architect",
  "andi_shehu_ai_architect_resume.pdf": "AI architect",
  "andi_shehu_ic_data_science.pdf": "Data science",
  "andi_shehu_adtech_data_science.pdf": "Adtech data science",
  "andi_shehu_ai_product_manager.pdf": "AI product",
  "andi_shehu_director_resume.pdf": "Director",
  "andi_shehu_vp_applied_ai.pdf": "VP applied AI",
  "andi_shehu_gtm_growth_resume.pdf": "GTM & growth",
  "andi_shehu_technical_account_manager.pdf": "Technical accounts",
};

const statusLabels = {
  new: "Not reviewed",
  saved: "Saved",
  ready: "Ready to apply",
  applying: "Applying",
  applied: "Applied",
  interviewing: "Interviewing",
  skip: "Skipped",
};

const freshnessLabels = {
  fresh: "Verified within 14 days",
  aging: "Recheck soon",
  stale: "Recheck due",
  inactive: "Marked inactive",
  unknown: "Needs verification",
  suspect: "May be closed",
};

const coreAiLanes = new Set(["applied_ai", "data_science", "product_ai"]);
const aiRolePattern = /\b(ai|ml|llm|genai|nlp|rag)\b|artificial intelligence|machine learning|deep learning|generative|agentic|data scien|applied scientist|research scientist|forward[- ]deployed|deployment strategist|data platform|ml platform|computer vision|natural language|retrieval augmented/i;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function display(value, fallback = "Not listed") {
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function companyKey(row) {
  return String(row.company_key || row.company || "unknown").trim().toLowerCase();
}

function roleUrl(row) {
  return row.final_url || row.canonical_url || row.url || "";
}

function boardUrl(row) {
  return row.company_board_url || roleUrl(row);
}

function providerName(row) {
  const raw = String(row.provider_display || row.ats_family || row.provider || "Company site").trim();
  if (!raw) return "Company site";
  return raw
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace("Ashbyhq", "Ashby")
    .replace("Greenhouse/Company", "Greenhouse")
    .replace("Company Careers", "Company site");
}

function resumeName(row) {
  const resume = String(row.recommended_resume || row.resume_used || "").split(";")[0].trim();
  return resumeLabels[resume] || resume.replace(/^andi_shehu_/, "").replace(/\.pdf$/i, "").replaceAll("_", " ") || "Review fit";
}

function laneName(row) {
  return laneLabels[row.lane] || display(row.lane, "General").replaceAll("_", " ");
}

function applicationState(row) {
  const personal = String(row.review_status || "").toLowerCase();
  if (statusLabels[personal]) return personal;
  const historical = `${row.current_status || ""} ${row.stage || ""}`.toLowerCase();
  if (historical.includes("interview")) return "interviewing";
  if (historical.includes("applied") || historical.includes("submitted") || historical.includes("worked_on")) return "applied";
  if (historical.includes("skip") || historical.includes("closed") || historical.includes("inactive")) return "skip";
  return "new";
}

function loadBrowserState() {
  if (!staticMode) return {};
  try {
    return JSON.parse(localStorage.getItem(browserStateKey) || "{}");
  } catch {
    return {};
  }
}

function hydrateBrowserState() {
  const saved = loadBrowserState();
  allRecords.forEach((row) => {
    if (saved[row.record_id]) Object.assign(row, saved[row.record_id]);
  });
}

function isInactive(row) {
  if (row.check_version) return row.active_status === "inactive";
  if (row.link_inactive === true) return true;
  const state = `${row.active_status || ""} ${row.current_status || ""} ${row.inactive_reason || ""}`.toLowerCase();
  return state.includes("inactive") || state.includes("closed") || state.includes("expired") || state.includes("job not found");
}

function isAiFocused(row) {
  return coreAiLanes.has(String(row.lane || "")) || aiRolePattern.test(String(row.role || ""));
}

function selectCollection(collection, render = true) {
  if (!["ai", "gtm", "all"].includes(collection)) return;
  elements.aiOnly.checked = collection === "ai";
  elements.lane.value = collection === "gtm" ? "gtm_growth" : "all";
  if (render) applyFilters();
}

function syncCollections() {
  const current = elements.lane.value === "gtm_growth" && !elements.aiOnly.checked
    ? "gtm" : elements.lane.value === "all" ? (elements.aiOnly.checked ? "ai" : "all") : "";
  document.querySelectorAll("[data-collection]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.collection === current));
  });
}

function csvCell(value) {
  const text = String(value ?? "");
  // Employer text and personal notes must not become spreadsheet formulas.
  const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function parseRecordDate(value) {
  if (!value) return null;
  const date = new Date(String(value).slice(0, 10) + "T12:00:00");
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(date) {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function freshnessState(row) {
  if (isInactive(row)) return "inactive";
  if (row.active_status === "suspect") return "suspect";
  if (row.last_result === "uncertain") return "unknown";
  const evidence = parseRecordDate(row.last_verified);
  if (!evidence) return "unknown";
  const age = daysSince(evidence);
  if (age <= 14) return "fresh";
  if (age <= 45) return "aging";
  return "stale";
}

function freshnessLabel(row) {
  return freshnessLabels[freshnessState(row)];
}

function isRemote(row) {
  return /\bremote\b|anywhere|work from home/i.test(String(row.location || ""));
}

function initials(company) {
  const words = display(company, "RA").replace(/[^a-z0-9 ]/gi, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0].slice(0, 2)).toUpperCase();
}

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function uniqueOptions(rows, getter, labeler) {
  const values = [...new Set(rows.flatMap((row) => getter(row)).filter(Boolean))];
  return values
    .map((value) => ({ value, label: labeler ? labeler(value) : value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function setOptions(select, options, allLabel) {
  select.innerHTML = `<option value="all">${escapeHtml(allLabel)}</option>`;
  options.forEach(({ value, label }) => {
    select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`);
  });
}

function initFilters() {
  setOptions(
    elements.lane,
    uniqueOptions(allRecords, (row) => [row.lane], (value) => laneLabels[value] || value.replaceAll("_", " ")),
    "All role families"
  );
  setOptions(
    elements.provider,
    uniqueOptions(allRecords, (row) => [row.ats_family || row.provider_display || row.provider], (value) => providerName({ provider: value })),
    "All platforms"
  );
  setOptions(
    elements.resume,
    uniqueOptions(allRecords, (row) => [resumeName(row)]),
    "All resume matches"
  );
}

function searchText(row) {
  return [
    row.company, row.role, row.location, row.provider, row.provider_display, row.lane, row.title_family,
    row.notes, row.comment, row.source_batches_display, row.recommended_resume, row.resume_used,
  ].join(" ").toLowerCase();
}

const roleStopWords = new Set(["a", "an", "and", "for", "of", "the", "to", "with", "senior", "sr", "junior", "jr", "lead", "staff", "principal", "i", "ii", "iii"]);

function roleTokens(row) {
  return new Set(
    display(row.role, "")
      .toLowerCase()
      .replace(/[^a-z0-9+#]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1 && !roleStopWords.has(token))
  );
}

function sharedRoleTokens(first, second) {
  const secondTokens = roleTokens(second);
  return [...roleTokens(first)].filter((token) => secondTokens.has(token));
}

function roleSimilarity(target, candidate) {
  let score = sharedRoleTokens(target, candidate).length * 3;
  if (target.lane && target.lane === candidate.lane) score += 6;
  if (target.title_family && target.title_family === candidate.title_family) score += 5;
  if (isInactive(candidate)) score -= 2;
  return score;
}

function similarityReason(target, candidate) {
  if (target.title_family && target.title_family === candidate.title_family) return "Same title family";
  if (target.lane && target.lane === candidate.lane) return `Related ${laneName(candidate).toLowerCase()} role`;
  const shared = sharedRoleTokens(target, candidate).slice(0, 2);
  return shared.length ? `Shared focus: ${shared.join(" + ")}` : "Another company opening";
}

function similarCompanyRoles(target) {
  return allRecords
    .filter((candidate) => candidate.record_id !== target.record_id && companyKey(candidate) === companyKey(target))
    .filter((candidate) => !elements.activeOnly.checked || !isInactive(candidate))
    .map((candidate) => ({ candidate, score: roleSimilarity(target, candidate) }))
    .filter(({ score }) => score > 0)
    .sort((first, second) => second.score - first.score || Number(isInactive(first.candidate)) - Number(isInactive(second.candidate)))
    .slice(0, 5)
    .map(({ candidate }) => candidate);
}

function sortRows(rows) {
  const mode = elements.sort.value;
  return [...rows].sort((a, b) => {
    if (mode === "verified") {
      const ranks = { fresh: 0, aging: 1, stale: 2, unknown: 3, suspect: 4, inactive: 5 };
      const priority = ranks[freshnessState(a)] - ranks[freshnessState(b)];
      if (priority) return priority;
      const checked = String(b.last_verified || "").localeCompare(String(a.last_verified || ""));
      if (checked) return checked;
    }
    if (mode === "company") return display(a.company).localeCompare(display(b.company)) || display(a.role).localeCompare(display(b.role));
    if (mode === "role") return display(a.role).localeCompare(display(b.role)) || display(a.company).localeCompare(display(b.company));
    const aDate = String(a.last_seen || a.last_sourced_at || a.first_seen || "");
    const bDate = String(b.last_seen || b.last_sourced_at || b.first_seen || "");
    return bDate.localeCompare(aDate) || display(a.company).localeCompare(display(b.company));
  });
}

function setViewMode(nextMode, render = true) {
  viewMode = nextMode;
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === viewMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  visibleLimit = 60;
  if (render) renderResults();
}

function applyFilters({ preserveView = false } = {}) {
  const query = elements.search.value.trim().toLowerCase();
  const titleQuery = elements.title.value.trim().toLowerCase();
  const lane = elements.lane.value;
  const provider = elements.provider.value;
  const freshness = elements.freshness.value;
  const resume = elements.resume.value;
  const status = elements.status.value;

  const hasNarrowingFilter = Boolean(
    query || titleQuery || elements.aiOnly.checked || lane !== "all" || provider !== "all" || freshness !== "all" || resume !== "all" || status !== "all" ||
    elements.activeOnly.checked || locationMode !== "all" || scopeMode !== "all"
  );
  if (!preserveView) setViewMode(hasNarrowingFilter ? "roles" : "companies", false);

  filteredRecords = sortRows(allRecords.filter((row) => {
    const state = applicationState(row);
    const rowResume = resumeName(row);
    const rowProvider = row.ats_family || row.provider_display || row.provider;
    if (scopeMode === "saved" && !["saved", "ready", "applying"].includes(state)) return false;
    if (scopeMode === "applied" && !["applied", "interviewing"].includes(state)) return false;
    if (locationMode === "nyc" && row.is_nyc !== "true" && row.is_nyc !== true) return false;
    if (locationMode === "remote" && !isRemote(row)) return false;
    if (elements.aiOnly.checked && !isAiFocused(row)) return false;
    if (lane !== "all" && row.lane !== lane) return false;
    if (provider !== "all" && rowProvider !== provider) return false;
    if (freshness !== "all" && freshnessState(row) !== freshness) return false;
    if (resume !== "all" && rowResume !== resume) return false;
    if (status !== "all" && state !== status) return false;
    if (elements.activeOnly.checked && isInactive(row)) return false;
    if (query && !searchText(row).includes(query)) return false;
    if (titleQuery && !String(row.role || "").toLowerCase().includes(titleQuery)) return false;
    return true;
  }));

  visibleLimit = 60;
  syncCollections();
  renderActiveFilters();
  renderResults();
  updateCounts();
}

function groupCompanies(rows) {
  const companies = new Map();
  rows.forEach((row) => {
    const key = companyKey(row);
    if (!companies.has(key)) companies.set(key, { key, company: display(row.company), roles: [] });
    companies.get(key).roles.push(row);
  });
  if (elements.sort.value === "verified") return [...companies.values()];
  return [...companies.values()].sort((a, b) => {
    if (elements.sort.value === "recent") {
      const aDate = String(a.roles[0]?.last_seen || a.roles[0]?.first_seen || "");
      const bDate = String(b.roles[0]?.last_seen || b.roles[0]?.first_seen || "");
      return bDate.localeCompare(aDate) || a.company.localeCompare(b.company);
    }
    return a.company.localeCompare(b.company);
  });
}

function renderResults() {
  const companies = groupCompanies(filteredRecords);
  const total = viewMode === "companies" ? companies.length : filteredRecords.length;
  elements.resultCount.textContent = viewMode === "companies"
    ? `${companies.length.toLocaleString()} companies · ${filteredRecords.length.toLocaleString()} roles`
    : `${filteredRecords.length.toLocaleString()} roles`;

  const items = (viewMode === "companies" ? companies : filteredRecords).slice(0, visibleLimit);
  if (!items.length) {
    elements.results.innerHTML = `<div class="no-results"><strong>No matches yet</strong><p>Try a broader role family or clear a filter.</p></div>`;
    elements.loadMore.hidden = true;
    return;
  }

  elements.results.innerHTML = items.map((item, index) => viewMode === "companies"
    ? renderCompanyCard(item, index)
    : renderRoleCard(item, index)).join("");
  elements.loadMore.hidden = visibleLimit >= total;
  wireResultCards();
}

function renderCompanyCard(group, index) {
  const primary = group.roles.find((row) => !isInactive(row)) || group.roles[0];
  const providers = [...new Set(group.roles.map(providerName))];
  const isSaved = group.roles.some((row) => ["saved", "ready", "applying"].includes(applicationState(row)));
  const rolePills = group.roles.slice(0, 3).map((row) => `<span class="role-pill">${escapeHtml(display(row.role))}</span>`).join("");
  return `
    <article class="result-card company-card ${selectedCompanyKey === group.key ? "active" : ""}" data-company="${escapeHtml(group.key)}" tabindex="0" aria-label="View ${escapeHtml(group.company)} and ${group.roles.length} sourced roles" style="animation-delay:${Math.min(index * 18, 220)}ms">
      <div class="company-mark">${escapeHtml(initials(group.company))}</div>
      <div class="result-main">
        <div class="result-company"><span class="provider-badge">${escapeHtml(providers.slice(0, 2).join(" + "))}</span>${escapeHtml(display(primary.location, "Multiple locations"))}</div>
        <h3 class="result-title">${escapeHtml(group.company)}</h3>
        <div class="company-role-list">${rolePills}</div>
      </div>
      <div class="card-actions">
        <span class="role-count">${group.roles.length} role${group.roles.length === 1 ? "" : "s"}</span>
        <button class="mini-button save-action ${isSaved ? "saved" : ""}" data-save-id="${escapeHtml(primary.record_id)}" type="button" title="Save company">${isSaved ? "◆" : "◇"}</button>
        <a class="mini-button" href="${escapeHtml(boardUrl(primary))}" target="_blank" rel="noreferrer" title="Browse all company roles">↗</a>
      </div>
    </article>`;
}

function renderRoleCard(row, index) {
  const state = applicationState(row);
  const saved = ["saved", "ready", "applying"].includes(state);
  return `
    <article class="result-card ${selectedId === row.record_id ? "active" : ""}" data-id="${escapeHtml(row.record_id)}" tabindex="0" aria-label="View ${escapeHtml(display(row.role))} at ${escapeHtml(display(row.company))}" style="animation-delay:${Math.min(index * 18, 220)}ms">
      <div class="company-mark">${escapeHtml(initials(row.company))}</div>
      <div class="result-main">
        <div class="result-company">${escapeHtml(display(row.company))}<span class="provider-badge">${escapeHtml(providerName(row))}</span></div>
        <h3 class="result-title">${escapeHtml(display(row.role))}</h3>
        <div class="result-meta">
          <span>${escapeHtml(display(row.location, "Location not listed"))}</span>
          <span><i class="status-dot ${freshnessState(row)}"></i>${escapeHtml(freshnessLabel(row))}</span>
          <span><i class="status-dot ${state === "applied" ? "applied" : ""}"></i>${escapeHtml(statusLabels[state])}</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="mini-button save-action ${saved ? "saved" : ""}" data-save-id="${escapeHtml(row.record_id)}" type="button" title="Save role">${saved ? "◆" : "◇"}</button>
        <a class="mini-button" href="${escapeHtml(roleUrl(row))}" target="_blank" rel="noreferrer" title="Open role">↗</a>
      </div>
    </article>`;
}

function wireResultCards() {
  const activateCardWithKeyboard = (card, callback) => {
    card.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && event.target === card) {
        event.preventDefault();
        callback();
      }
    });
  };
  elements.results.querySelectorAll("[data-company]").forEach((card) => {
    const selectCompany = () => {
      selectedCompanyKey = card.dataset.company;
      selectedId = null;
      renderResults();
      renderCompanyDetail(selectedCompanyKey);
    };
    card.addEventListener("click", selectCompany);
    activateCardWithKeyboard(card, selectCompany);
  });
  elements.results.querySelectorAll("[data-id]").forEach((card) => {
    const selectRole = () => {
      selectedId = card.dataset.id;
      selectedCompanyKey = null;
      renderResults();
      renderRoleDetail(selectedId);
    };
    card.addEventListener("click", selectRole);
    activateCardWithKeyboard(card, selectRole);
  });
  elements.results.querySelectorAll("a, button").forEach((control) => control.addEventListener("click", (event) => event.stopPropagation()));
  elements.results.querySelectorAll("[data-save-id]").forEach((button) => {
    button.addEventListener("click", () => toggleSaved(button.dataset.saveId));
  });
}

function openInspector() {
  elements.detail.classList.add("open");
  elements.detail.scrollTop = 0;
  syncInspectorMode();
  requestAnimationFrame(() => {
    if (!elements.detailBackdrop.hidden) elements.detail.querySelector(".close-inspector")?.focus({ preventScroll: true });
  });
}

function syncInspectorMode() {
  const modal = matchMedia("(max-width: 1480px)").matches && elements.detail.classList.contains("open");
  elements.detailBackdrop.hidden = !modal;
  document.body.classList.toggle("detail-open", modal);
  if (modal) {
    elements.detail.setAttribute("role", "dialog");
    elements.detail.setAttribute("aria-modal", "true");
  } else {
    elements.detail.removeAttribute("role");
    elements.detail.removeAttribute("aria-modal");
  }
}

function closeInspector() {
  elements.detail.classList.remove("open");
  syncInspectorMode();
  elements.results.querySelector(".result-card.active")?.focus({ preventScroll: true });
}

function renderCompanyDetail(key) {
  const roles = allRecords.filter((row) => companyKey(row) === key);
  if (!roles.length) return renderEmptyDetail();
  const primary = roles.find((row) => !isInactive(row)) || roles[0];
  const providers = [...new Set(roles.map(providerName))];
  const active = roles.filter((row) => freshnessState(row) === "fresh").length;
  const list = roles
    .sort((a, b) => display(a.role).localeCompare(display(b.role)))
    .slice(0, 30)
    .map((row) => `<a class="company-role" href="${escapeHtml(roleUrl(row))}" target="_blank" rel="noreferrer"><strong>${escapeHtml(display(row.role))}</strong><br />${escapeHtml(display(row.location, "Location not listed"))}</a>`)
    .join("");

  elements.detail.innerHTML = `
    <div class="inspector-top">
      <button class="close-inspector" type="button" aria-label="Close details">×</button>
      <span class="inspector-label">Company pathway</span>
      <h2>${escapeHtml(display(primary.company))}</h2>
      <p class="inspector-role">${roles.length} sourced role${roles.length === 1 ? "" : "s"} across ${providers.join(", ")}</p>
      <div class="inspector-chips"><span class="detail-chip">${active} verified recently</span><span class="detail-chip">${providers.join(" + ")}</span></div>
    </div>
    <div class="detail-actions">
      <a class="detail-button primary" href="${escapeHtml(boardUrl(primary))}" target="_blank" rel="noreferrer">Browse company jobs ↗</a>
      <button class="detail-button copy-action" data-copy="${escapeHtml(boardUrl(primary))}" type="button">Copy board link</button>
    </div>
    <section class="detail-section"><h3>Why this view matters</h3><p class="tracker-note">The original search found ${roles.length} role${roles.length === 1 ? "" : "s"}, but the company board can reveal newer openings across functions. Start there when a listed role has closed.</p></section>
    <section class="detail-section"><h3>Known roles</h3><div class="company-roles">${list}</div></section>
    ${detailMeta(primary)}
  `;
  wireInspector();
  openInspector();
}

function renderRoleDetail(id) {
  const row = allRecords.find((item) => item.record_id === id);
  if (!row) return renderEmptyDetail();
  const companyRoles = allRecords.filter((item) => companyKey(item) === companyKey(row));
  const state = applicationState(row);
  const relatedRoles = similarCompanyRoles(row);
  const relatedMarkup = relatedRoles.map((item) => `
    <button class="company-role related-role" data-related-id="${escapeHtml(item.record_id)}" type="button">
      <strong>${escapeHtml(display(item.role))}</strong>
      <span>${escapeHtml(display(item.location, "Location not listed"))} · ${escapeHtml(similarityReason(row, item))} · ${escapeHtml(freshnessLabel(item))}</span>
    </button>`).join("");

  elements.detail.innerHTML = `
    <div class="inspector-top">
      <button class="close-inspector" type="button" aria-label="Close details">×</button>
      <span class="inspector-label">${escapeHtml(providerName(row))} · direct opportunity</span>
      <h2>${escapeHtml(display(row.company))}</h2>
      <p class="inspector-role">${escapeHtml(display(row.role))}</p>
      <div class="inspector-chips"><span class="detail-chip">${escapeHtml(laneName(row))}</span><span class="detail-chip">${escapeHtml(statusLabels[state])}</span><span class="detail-chip">${escapeHtml(freshnessLabel(row))}</span></div>
    </div>
    <div class="detail-actions">
      <a class="detail-button primary" href="${escapeHtml(roleUrl(row))}" target="_blank" rel="noreferrer">Open application ↗</a>
      <a class="detail-button" href="${escapeHtml(boardUrl(row))}" target="_blank" rel="noreferrer">All company jobs</a>
      <a class="detail-button" href="https://role-atlas-agent.andi-qshehu.chatgpt.site/portal?${escapeHtml(new URLSearchParams({ collection: row.lane === "gtm_growth" ? "gtm" : "ai", url: roleUrl(row), company: display(row.company), title: display(row.role), location: display(row.location, "") }).toString())}">Track in my account</a>
      <button class="detail-button copy-action" data-copy="${escapeHtml(roleUrl(row))}" type="button">Copy role link</button>
      <button class="detail-button save-action ${["saved", "ready", "applying"].includes(state) ? "saved" : ""}" data-save-id="${escapeHtml(row.record_id)}" type="button">${["saved", "ready", "applying"].includes(state) ? "Saved ◆" : "Save ◇"}</button>
    </div>
    <section class="detail-section"><h3>Application fit</h3><div class="detail-list">
      ${detailRow("Location", display(row.location))}${detailRow("Role family", laneName(row))}
      ${staticMode ? "" : detailRow("Resume", resumeName(row))}${detailRow("First sourced", formatDate(row.first_seen))}
      ${detailRow("Platform", providerName(row))}${detailRow("Freshness", freshnessLabel(row))}${detailRow("Other roles", `${Math.max(companyRoles.length - 1, 0)} at this company`)}
    </div></section>
    <section class="detail-section"><h3>Your application workflow</h3><div class="review-grid">
      <label><span>State</span><select id="reviewStatus">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${state === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label><span>Private notes</span><textarea id="commentBox" placeholder="Contacts, fit, follow-up date, application answers...">${escapeHtml(row.comment || "")}</textarea></label>
      <div class="save-row"><button class="save-button" id="saveReview" type="button">Save update</button><span class="save-meta">${row.updated_at ? `Saved ${escapeHtml(formatDate(row.updated_at))}` : "Stored locally"}</span></div>
      ${staticMode ? '<p class="tracker-note">These notes stay in this browser. Use “Track in my account” above to keep a separate, synced workspace. Signing in is optional.</p>' : ''}
    </div></section>
    ${row.notes ? `<section class="detail-section"><h3>Research notes</h3><p class="tracker-note">${escapeHtml(row.notes)}</p></section>` : ""}
    ${relatedRoles.length
      ? `<section class="detail-section"><h3>Similar at ${escapeHtml(display(row.company))}</h3><div class="company-roles">${relatedMarkup}</div></section>`
      : `<section class="detail-section"><h3>More at ${escapeHtml(display(row.company))}</h3><p class="tracker-note">No closely related role is in the sourced index yet. Use “All company jobs” above to check the full hiring board.</p></section>`}
    ${detailMeta(row)}
  `;
  wireInspector();
  document.getElementById("saveReview")?.addEventListener("click", saveCurrentReview);
  openInspector();
}

function detailRow(label, value) {
  return `<div class="detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(display(value))}</strong></div>`;
}

function detailMeta(row) {
  return `<section class="detail-section"><h3>Source record</h3><div class="detail-list">${detailRow("Last sourced", formatDate(row.last_seen))}${detailRow("Last verified open", formatDate(row.last_verified))}${detailRow("Last check attempted", formatDate(row.last_attempted))}${detailRow("Check method", display(row.check_method, "Not checked").replaceAll("_", " "))}</div>${row.inactive_reason ? `<p class="tracker-note">${escapeHtml(row.inactive_reason)}</p>` : ""}</section>`;
}

function renderEmptyDetail() {
  elements.detail.innerHTML = `<div class="empty-state"><span class="empty-mark">↗</span><h2>Pick an opportunity</h2><p>See the direct application, company board, role details, and private notes.</p></div>`;
  elements.detail.classList.remove("open");
}

function wireInspector() {
  elements.detail.querySelector(".close-inspector")?.addEventListener("click", closeInspector);
  elements.detail.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", () => copyLink(button.dataset.copy)));
  elements.detail.querySelectorAll("[data-save-id]").forEach((button) => button.addEventListener("click", () => toggleSaved(button.dataset.saveId)));
  elements.detail.querySelectorAll("[data-related-id]").forEach((button) => button.addEventListener("click", () => {
    selectedId = button.dataset.relatedId;
    selectedCompanyKey = null;
    renderResults();
    renderRoleDetail(selectedId);
  }));
}

async function persistReview(row, comment, reviewStatus) {
  if (staticMode) {
    const allSaved = loadBrowserState();
    const saved = {
      comment,
      review_status: reviewStatus === "new" ? "" : reviewStatus,
      updated_at: new Date().toISOString(),
    };
    if (!saved.comment && !saved.review_status) delete allSaved[row.record_id];
    else allSaved[row.record_id] = saved;
    localStorage.setItem(browserStateKey, JSON.stringify(allSaved));
    Object.assign(row, saved);
    return saved;
  }
  const response = await fetch("/api/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ record_id: row.record_id, comment, review_status: reviewStatus === "new" ? "" : reviewStatus }),
  });
  if (!response.ok) throw new Error("Could not save the update");
  const saved = await response.json();
  Object.assign(row, { comment: saved.comment, review_status: saved.review_status, updated_at: saved.updated_at });
  return saved;
}

async function saveCurrentReview() {
  const row = allRecords.find((item) => item.record_id === selectedId);
  if (!row) return;
  const button = document.getElementById("saveReview");
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    await persistReview(row, document.getElementById("commentBox").value.trim(), document.getElementById("reviewStatus").value);
    showToast("Application update saved");
    applyFilters({ preserveView: true });
    renderRoleDetail(row.record_id);
  } catch (error) {
    showToast(error.message || "Could not save");
  } finally {
    button.disabled = false;
  }
}

async function toggleSaved(id) {
  const row = allRecords.find((item) => item.record_id === id);
  if (!row) return;
  const next = ["saved", "ready", "applying"].includes(applicationState(row)) ? "new" : "saved";
  try {
    const draft = selectedId === id ? document.getElementById("commentBox")?.value : null;
    await persistReview(row, draft ?? row.comment ?? "", next);
    showToast(next === "saved" ? "Saved to your shortlist" : "Removed from shortlist");
    applyFilters({ preserveView: true });
    if (selectedId === id) renderRoleDetail(id);
    else if (selectedCompanyKey) renderCompanyDetail(selectedCompanyKey);
  } catch (error) {
    showToast(error.message || "Could not save");
  }
}

async function copyLink(value) {
  try {
    await navigator.clipboard.writeText(value);
    showToast("Link copied");
  } catch {
    showToast("Copy is unavailable in this browser");
  }
}

function updateCounts() {
  const aiRecords = allRecords.filter(isAiFocused);
  const companies = new Set(aiRecords.map(companyKey));
  const recent = aiRecords.filter((row) => freshnessState(row) === "fresh").length;
  const applied = allRecords.filter((row) => ["applied", "interviewing"].includes(applicationState(row))).length;
  const directBoards = new Set(aiRecords.filter((row) => row.board_confidence === "exact").map(boardUrl)).size;
  elements.stats.innerHTML = `
    <div class="signal"><strong>${companies.size.toLocaleString()}</strong><span>Companies in AI index</span><i></i></div>
    <div class="signal"><strong>${aiRecords.length.toLocaleString()}</strong><span>AI-focused roles</span><i></i></div>
    <div class="signal"><strong>${recent.toLocaleString()}</strong><span>Verified within 14 days</span><i></i></div>
    <div class="signal"><strong>${directBoards.toLocaleString()}</strong><span>Direct company boards</span><i></i></div>`;
  elements.allCount.textContent = allRecords.length.toLocaleString();
  elements.savedCount.textContent = allRecords.filter((row) => ["saved", "ready", "applying"].includes(applicationState(row))).length.toLocaleString();
  elements.appliedCount.textContent = applied.toLocaleString();
}

function renderActiveFilters() {
  const chips = [];
  if (elements.aiOnly.checked) chips.push("AI-focused roles");
  if (elements.search.value.trim()) chips.push(`Search: ${elements.search.value.trim()}`);
  if (elements.title.value.trim()) chips.push(`Title: ${elements.title.value.trim()}`);
  if (locationMode !== "all") chips.push(locationMode === "nyc" ? "New York City" : "Remote");
  if (elements.lane.value !== "all") chips.push(laneLabels[elements.lane.value] || elements.lane.value);
  if (elements.provider.value !== "all") chips.push(providerName({ provider: elements.provider.value }));
  if (elements.freshness.value !== "all") chips.push(freshnessLabels[elements.freshness.value]);
  if (elements.resume.value !== "all") chips.push(resumeLabels[elements.resume.value] || elements.resume.value);
  if (elements.status.value !== "all") chips.push(statusLabels[elements.status.value]);
  if (elements.activeOnly.checked) chips.push("Known inactive hidden");
  elements.activeFilters.innerHTML = chips.map((chip) => `<span class="filter-chip">${escapeHtml(chip)}</span>`).join("");
}

function clearFilters() {
  elements.search.value = "";
  elements.aiOnly.checked = scopeMode === "all";
  elements.title.value = "";
  elements.lane.value = "all";
  elements.provider.value = "all";
  elements.freshness.value = "all";
  elements.resume.value = "all";
  elements.status.value = "all";
  elements.activeOnly.checked = scopeMode === "all";
  locationMode = "all";
  document.querySelectorAll("[data-location]").forEach((button) => {
    const active = button.dataset.location === "all";
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  setViewMode("roles", false);
  applyFilters({ preserveView: true });
}

function exportView() {
  const columns = ["company", "role", "location", "provider", "lane", "resume", "application_state", "company_board_url", "role_url", "notes", "comment"];
  const lines = [columns.join(","), ...filteredRecords.map((row) => [
    row.company, row.role, row.location, providerName(row), laneName(row), resumeName(row), applicationState(row), boardUrl(row), roleUrl(row), row.notes, row.comment,
  ].map(csvCell).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `role-atlas-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`Exported ${filteredRecords.length.toLocaleString()} roles`);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

function wireEvents() {
  elements.detailBackdrop.addEventListener("click", closeInspector);
  window.addEventListener("resize", syncInspectorMode);
  [elements.search, elements.title].forEach((control) => control.addEventListener("input", applyFilters));
  [elements.provider, elements.resume, elements.status].forEach((control) => control.addEventListener("change", applyFilters));
  elements.lane.addEventListener("change", () => {
    if (elements.lane.value === "gtm_growth") elements.aiOnly.checked = false;
    applyFilters();
  });
  elements.aiOnly.addEventListener("change", () => {
    if (elements.aiOnly.checked && elements.lane.value === "gtm_growth") elements.lane.value = "all";
    applyFilters();
  });
  document.querySelectorAll("[data-collection]").forEach((button) => button.addEventListener("click", () => selectCollection(button.dataset.collection)));
  elements.freshness.addEventListener("change", () => {
    if (elements.freshness.value === "inactive") elements.activeOnly.checked = false;
    applyFilters();
  });
  elements.activeOnly.addEventListener("change", () => {
    if (elements.activeOnly.checked && elements.freshness.value === "inactive") elements.freshness.value = "all";
    applyFilters();
  });
  elements.sort.addEventListener("change", () => applyFilters({ preserveView: true }));
  elements.clearFilters.addEventListener("click", clearFilters);
  elements.exportButton.addEventListener("click", exportView);
  elements.filterToggle.addEventListener("click", () => {
    const isOpen = elements.filtersPane.classList.toggle("open");
    elements.filterToggle.setAttribute("aria-expanded", String(isOpen));
    elements.filterToggle.setAttribute("aria-label", isOpen ? "Hide filters" : "Show filters");
    if (isOpen) elements.filtersPane.scrollIntoView({ block: "start", behavior: "smooth" });
  });
  elements.loadMore.addEventListener("click", () => { visibleLimit += 60; renderResults(); });

  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    setViewMode(button.dataset.view);
  }));
  document.querySelectorAll("[data-location]").forEach((button) => button.addEventListener("click", () => {
    locationMode = button.dataset.location;
    document.querySelectorAll("[data-location]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    applyFilters();
  }));
  document.querySelectorAll("[data-scope]").forEach((button) => button.addEventListener("click", () => {
    scopeMode = button.dataset.scope;
    document.querySelectorAll("[data-scope]").forEach((item) => item.classList.toggle("active", item === button));
    clearFilters();
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && !elements.detailBackdrop.hidden) {
      const controls = [...elements.detail.querySelectorAll("a[href], button, input, select, textarea")].filter((node) => !node.disabled && node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      elements.search.focus();
    }
    if (event.key === "Escape" && elements.detail.classList.contains("open")) closeInspector();
  });
}

async function init() {
  if (window.location.protocol === "file:") {
    elements.resultCount.textContent = "Start the local app";
    elements.results.innerHTML = `
      <div class="no-results launch-notice">
        <strong>Role Atlas needs its local data service</strong>
        <p>Double-click <b>Open Role Atlas.command</b> in the project folder, or use the button below if the service is already running.</p>
        <a class="launch-link" href="http://127.0.0.1:8765/">Open the running app</a>
      </div>`;
    return;
  }
  try {
    if (staticMode) document.body.classList.add("public-mode");
    const response = await fetch(staticMode ? "data/records.json" : "/api/records");
    if (!response.ok) throw new Error("The role index could not be loaded");
    const payload = await response.json();
    allRecords = payload.records || [];
    hydrateBrowserState();
    meta = payload.meta || {};
    elements.datasetDate.textContent = formatDate(meta.dataset_date || meta.generated_at).replace(/, \d{4}$/, "");
    initFilters();
    wireEvents();
    selectCollection(new URLSearchParams(window.location.search).get("collection"), false);
    applyFilters();
  } catch (error) {
    elements.results.innerHTML = `<div class="no-results"><strong>Could not load the role index</strong><p>${escapeHtml(error.message)}</p><button class="ghost-button" id="retryIndex" type="button">Try again</button></div>`;
    document.getElementById("retryIndex").addEventListener("click", () => window.location.reload());
  }
}

init();
