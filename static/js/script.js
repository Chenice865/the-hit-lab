"use strict";

const state = {
  charts: {},
  selectedTrack: null,
  compareFirst: null,
  compareSecond: null,
  searchTimers: new Map(),
  comparisonRequestToken: 0,
};

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindExplore();
  bindAnalyzer();
  bindRecommendations();
  bindComparison();
  bindMobileSidebar();

  checkHealth();
  loadFilters();
  loadDashboard();
  loadExplore();
});

async function apiFetch(url, options = {}) {
  const controller = options.signal ? null : new AbortController();
  const timeoutId = window.setTimeout(() => controller?.abort(), 10000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller?.signal,
    });
    const rawBody = await response.text();

    let payload;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      throw new Error("The server returned an unreadable response.");
    }

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || "The request failed.");
    }

    return payload.data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function showAlert(message, type = "danger") {
  const alert = document.getElementById("global-alert");
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
}

function clearAlert() {
  const alert = document.getElementById("global-alert");
  alert.className = "alert d-none";
  alert.textContent = "";
}

function bindNavigation() {
  document.querySelectorAll("[data-section-link]").forEach((control) => {
    control.addEventListener("click", (event) => {
      event.preventDefault();
      showSection(control.dataset.sectionLink);
    });
  });
}

function showSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;

  document.querySelectorAll(".app-section").forEach((item) => {
    item.classList.toggle("active-section", item.id === sectionId);
  });

  document.querySelectorAll(".sidebar-nav .nav-link").forEach((item) => {
    item.classList.toggle("active", item.dataset.sectionLink === sectionId);
  });

  const title = document.querySelector(`[data-section-link="${sectionId}"]`)?.textContent?.trim();
  document.getElementById("page-title").textContent = title || "The Hit Lab";
  document.querySelector(".sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindMobileSidebar() {
  document.getElementById("sidebar-toggle")?.addEventListener("click", () => {
    document.querySelector(".sidebar").classList.toggle("open");
  });
}

async function checkHealth() {
  const dot = document.getElementById("health-indicator");
  const text = document.getElementById("health-text");

  try {
    const data = await apiFetch("/api/health");
    const online = data.dataset_loaded;
    dot.classList.add(online ? "online" : "offline");
    text.textContent = online ? "Dataset connected" : "Dataset missing";

    if (!online && data.startup_error) {
      showAlert(data.startup_error);
    }
  } catch (error) {
    dot.classList.add("offline");
    text.textContent = "Server unavailable";
    showAlert(error.message);
  }
}

async function loadDashboard() {
  try {
    clearAlert();
    const data = await apiFetch("/api/dashboard");
    renderKpis(data.kpis);
    renderTopTracks(data.top_tracks);
    renderDiagnostics(data.diagnostics);
    renderDashboardCharts(data);
  } catch (error) {
    showAlert(error.message);
  }
}

function renderKpis(kpis) {
  const items = [
    ["Tracks", formatNumber(kpis.tracks)],
    ["Artists", formatNumber(kpis.artists)],
    ["Albums", formatNumber(kpis.albums)],
    ["Average popularity", formatNumber(kpis.average_popularity, 1)],
    ["Explicit share", `${formatNumber(kpis.explicit_share, 1)}%`],
  ];

  document.getElementById("kpi-grid").innerHTML = items
    .map(
      ([label, value]) => `
        <div class="col-sm-6 col-xl">
          <article class="kpi-card">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </article>
        </div>
      `,
    )
    .join("");
}

function renderTopTracks(tracks) {
  const body = document.getElementById("top-tracks-body");

  body.innerHTML = tracks
    .map(
      (track) => `
        <tr>
          <td>
            <div class="track-title">${escapeHtml(track.track_name)}</div>
            <div class="track-subtitle">${escapeHtml(track.album_name || "Unknown album")}</div>
          </td>
          <td>${escapeHtml(track.artist_name)}</td>
          <td><span class="popularity-badge">${formatNumber(track.track_popularity)}</span></td>
        </tr>
      `,
    )
    .join("");
}

function renderDiagnostics(items) {
  const list = document.getElementById("diagnostics-list");

  list.innerHTML = items
    .map((item) => {
      const absolute = Math.min(Math.abs(item.correlation) * 100, 100);
      const direction = item.correlation > 0 ? "Positive" : item.correlation < 0 ? "Negative" : "No";
      return `
        <div class="metric-row">
          <div class="metric-row-header">
            <span>${escapeHtml(item.feature)}</span>
            <strong>${direction} ${formatNumber(item.correlation, 3)}</strong>
          </div>
          <div class="metric-bar"><span style="width:${absolute}%"></span></div>
        </div>
      `;
    })
    .join("");
}

function renderDashboardCharts(data) {
  createChart("popularity-chart", {
    type: "bar",
    data: {
      labels: data.popularity_distribution.map((item) => item.range),
      datasets: [
        {
          label: "Tracks",
          data: data.popularity_distribution.map((item) => item.count),
          borderRadius: 8,
        },
      ],
    },
    options: chartOptions("Number of tracks"),
  });

  createChart("album-type-chart", {
    type: "doughnut",
    data: {
      labels: data.album_types.map((item) => item.album_type || "Unknown"),
      datasets: [{ data: data.album_types.map((item) => item.count) }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
    },
  });

  createChart("release-trend-chart", {
    type: "line",
    data: {
      labels: data.release_trend.map((item) => item.release_year),
      datasets: [
        {
          label: "Track count",
          data: data.release_trend.map((item) => item.track_count),
          tension: 0.3,
          yAxisID: "y",
        },
        {
          label: "Average popularity",
          data: data.release_trend.map((item) => item.average_popularity),
          tension: 0.3,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Tracks" } },
        y1: {
          beginAtZero: true,
          max: 100,
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Popularity" },
        },
      },
    },
  });
}

function chartOptions(yTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: yTitle },
      },
    },
  };
}

function createChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;

  state.charts[canvasId]?.destroy();
  state.charts[canvasId] = new Chart(canvas, config);
}

function bindExplore() {
  document.getElementById("explore-form").addEventListener("submit", (event) => {
    event.preventDefault();
    loadExplore();
  });

  document.getElementById("reset-filters").addEventListener("click", () => {
    document.getElementById("explore-form").reset();
    loadExplore();
  });
}

async function loadFilters() {
  try {
    const data = await apiFetch("/api/filters");
    const select = document.getElementById("album-type-filter");

    data.album_types.forEach((albumType) => {
      const option = document.createElement("option");
      option.value = albumType;
      option.textContent = albumType;
      select.appendChild(option);
    });
  } catch (error) {
    showAlert(error.message);
  }
}

async function loadExplore() {
  const body = document.getElementById("explore-body");
  body.innerHTML = `<tr><td colspan="7" class="loading-row">Loading tracks…</td></tr>`;

  const params = new URLSearchParams({
    q: document.getElementById("explore-query").value.trim(),
    explicit: document.getElementById("explicit-filter").value,
    album_type: document.getElementById("album-type-filter").value,
    min_popularity: document.getElementById("popularity-filter").value || "0",
    limit: "50",
  });

  try {
    const data = await apiFetch(`/api/explore?${params.toString()}`);
    document.getElementById("explore-count").textContent = `${formatNumber(data.count)} results`;
    renderExploreRows(data.tracks);
  } catch (error) {
    body.innerHTML = `<tr><td colspan="7" class="error-row">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderExploreRows(tracks) {
  const body = document.getElementById("explore-body");

  if (!tracks.length) {
    body.innerHTML = `<tr><td colspan="7" class="loading-row">No matching tracks found.</td></tr>`;
    return;
  }

  body.innerHTML = tracks
    .map(
      (track) => `
        <tr>
          <td>
            <div class="track-title">${escapeHtml(track.track_name)}</div>
            <div class="track-subtitle">${track.explicit ? "Explicit" : "Clean"}</div>
          </td>
          <td>${escapeHtml(track.artist_name)}</td>
          <td>${escapeHtml(track.album_name || "Unknown")}</td>
          <td>${escapeHtml(track.album_type || "Unknown")}</td>
          <td><span class="popularity-badge">${formatNumber(track.track_popularity)}</span></td>
          <td>${formatNumber(track.track_duration_min, 2)} min</td>
          <td>
            <button
              class="btn btn-sm btn-outline-primary"
              type="button"
              data-analyse-track="${escapeAttribute(track.track_id)}"
            >
              Analyse
            </button>
          </td>
        </tr>
      `,
    )
    .join("");

  body.querySelectorAll("[data-analyse-track]").forEach((button) => {
    button.addEventListener("click", () => loadTrackForAnalyzer(button.dataset.analyseTrack));
  });
}

function bindAnalyzer() {
  setupTrackSearch(
    "analyzer-search",
    "analyzer-results",
    (track) => selectAnalyzerTrack(track),
  );

  document.getElementById("open-explore-from-analyzer")?.addEventListener("click", () => {
    showSection("explore");
  });
}

function setupTrackSearch(inputId, resultsId, onSelect) {
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);

  input.addEventListener("input", () => {
    const query = input.value.trim();
    clearTimeout(state.searchTimers.get(inputId));

    if (query.length < 2) {
      results.innerHTML = "";
      return;
    }

    const timer = setTimeout(async () => {
      results.innerHTML = `<div class="loading-row">Searching…</div>`;

      try {
        const tracks = await apiFetch(`/api/tracks/search?q=${encodeURIComponent(query)}`);
        renderSearchResults(results, tracks, onSelect);
      } catch (error) {
        results.innerHTML = `<div class="error-row">${escapeHtml(error.message)}</div>`;
      }
    }, 250);

    state.searchTimers.set(inputId, timer);
  });
}

function renderSearchResults(container, tracks, onSelect) {
  if (!tracks.length) {
    container.innerHTML = `<div class="loading-row">No tracks found.</div>`;
    return;
  }

  container.innerHTML = tracks
    .map(
      (track, index) => `
        <button class="search-result" type="button" data-result-index="${index}">
          <span>
            <span class="track-title">${escapeHtml(track.track_name)}</span>
            <span class="track-subtitle d-block">${escapeHtml(track.artist_name)}</span>
          </span>
          <span class="popularity-badge">${formatNumber(track.track_popularity)}</span>
        </button>
      `,
    )
    .join("");

  container.querySelectorAll("[data-result-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const track = tracks[Number(button.dataset.resultIndex)];
      container.innerHTML = "";
      onSelect(track);
    });
  });
}

async function loadTrackForAnalyzer(trackId) {
  try {
    const track = await apiFetch(`/api/tracks/${encodeURIComponent(trackId)}`);
    selectAnalyzerTrack(track);
    showSection("analyzer");
  } catch (error) {
    showAlert(error.message);
  }
}

async function selectAnalyzerTrack(track) {
  state.selectedTrack = track;
  document.getElementById("analyzer-search").value = `${track.track_name} — ${track.artist_name}`;
  document.getElementById("analyzer-empty").classList.add("d-none");

  const card = document.getElementById("analyzer-card");
  card.classList.remove("d-none");
  card.innerHTML = `
    <div class="analyzer-shell">
      <div class="analyzer-main-column">
        <section class="analyzer-card analyzer-summary-card">
          <div class="analyzer-card-heading">
            <p class="eyebrow">Selected track overview</p>
            <h3>${escapeHtml(track.track_name)}</h3>
            <p class="track-subtitle">${escapeHtml(track.artist_name)} · ${escapeHtml(track.album_name || "Unknown album")}</p>
            <div class="analyzer-badges">
              <span class="badge-chip">${escapeHtml(track.album_type || "Unknown")}</span>
              <span class="badge-chip">${escapeHtml(getTrackYear(track))}</span>
              <span class="badge-chip">${track.explicit ? "Explicit" : "Clean"}</span>
            </div>
          </div>

          <div class="metric-grid">
            <div class="metric-card metric-card-accent">
              <span class="metric-label">Observed Popularity</span>
              <strong>${formatNumber(track.track_popularity)}</strong>
              <div class="progress analyzer-progress" aria-label="Observed popularity">
                <div class="progress-bar" role="progressbar" style="width: ${Math.min(Number(track.track_popularity || 0), 100)}%"></div>
              </div>
            </div>
            <div class="metric-card">
              <span class="metric-label">Artist Popularity</span>
              <strong>${formatNumber(track.artist_popularity)}</strong>
              <div class="progress analyzer-progress" aria-label="Artist popularity">
                <div class="progress-bar" role="progressbar" style="width: ${Math.min(Number(track.artist_popularity || 0), 100)}%"></div>
              </div>
            </div>
            <div class="metric-card">
              <span class="metric-label">Duration</span>
              <strong>${formatNumber(track.track_duration_min, 2)} min</strong>
            </div>
            <div class="metric-card">
              <span class="metric-label">Release Date</span>
              <strong>${escapeHtml(track.album_release_date || "Unknown")}</strong>
            </div>
          </div>
        </section>

        <section class="analyzer-card artist-snapshot-card">
          <div class="analyzer-card-heading">
            <p class="eyebrow">Artist snapshot</p>
            <h4>${escapeHtml(track.artist_name)}</h4>
          </div>

          <div class="detail-grid">
            <div class="detail-item">
              <span>Artist popularity</span>
              <strong>${formatNumber(track.artist_popularity)}</strong>
            </div>
            <div class="detail-item">
              <span>Followers</span>
              <strong>${formatFollowers(track.artist_followers)}</strong>
            </div>
          </div>

          <div class="genre-stack">
            <span class="genre-label">Genres</span>
            <div class="genre-pills">
              ${renderGenrePills(track.artist_genres)}
            </div>
          </div>

          <button class="btn btn-primary mt-3" id="use-for-recommendations" type="button">
            Use This Track for Recommendations
          </button>
        </section>

        <section class="analyzer-card form-card">
          <div class="analyzer-card-heading">
            <p class="eyebrow">Hypothetical profile</p>
            <h4>Test a Hypothetical Song Profile</h4>
            <p class="section-copy analyzer-copy">
              The selected track’s supported characteristics are loaded below. Adjust them to test how the model estimates popularity for a modified song profile.
            </p>
          </div>

          <form id="prediction-form" novalidate>
            <div id="prediction-form-error" class="form-feedback d-none"></div>
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label" for="predict-genre">Genre</label>
                <select class="form-select" id="predict-genre" required></select>
              </div>
              <div class="col-md-6">
                <label class="form-label" for="predict-artist-popularity">Artist popularity</label>
                <input class="form-control" id="predict-artist-popularity" type="number" min="0" max="100" step="1" required>
              </div>
              <div class="col-md-6">
                <label class="form-label" for="predict-artist-followers">Artist followers</label>
                <input class="form-control" id="predict-artist-followers" type="number" min="0" step="1" required>
              </div>
              <div class="col-md-6">
                <label class="form-label" for="predict-duration">Duration (minutes)</label>
                <input class="form-control" id="predict-duration" type="number" min="0" step="0.1" required>
              </div>
              <div class="col-md-6">
                <label class="form-label" for="predict-release-year">Release year</label>
                <select class="form-select" id="predict-release-year" required></select>
              </div>
              <div class="col-md-6">
                <label class="form-label" for="predict-album-type">Album type</label>
                <select class="form-select" id="predict-album-type" required></select>
              </div>
              <div class="col-md-6">
                <label class="form-label" for="predict-explicit">Explicit</label>
                <select class="form-select" id="predict-explicit" required>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>

            <div class="predict-actions">
              <button class="btn btn-primary" id="estimate-popularity" type="submit">Estimate Popularity</button>
            </div>
          </form>
        </section>
      </div>

      <div class="analyzer-side-column">
        <section id="prediction-output" class="analyzer-card prediction-card d-none"></section>
      </div>
    </div>
  `;

  const form = card.querySelector("#prediction-form");
  form.addEventListener("submit", (event) => submitPrediction(event));

  const options = await loadAnalyzerOptions();
  populatePredictionForm(track, options);

  card.querySelector("#use-for-recommendations").addEventListener("click", () => {
    setRecommendationTrack(track);
    showSection("recommendations");
  });
}

function getTrackYear(track) {
  if (track.album_release_date) {
    const dateParts = String(track.album_release_date).split("-");
    if (dateParts.length >= 1) {
      const year = Number(dateParts[0]);
      if (Number.isFinite(year)) return String(year);
    }
  }
  return "Unknown year";
}

function renderGenrePills(genres) {
  if (!genres) {
    return '<span class="genre-pill genre-pill-empty">No genre information available</span>';
  }

  const items = String(genres)
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean);

  if (!items.length) {
    return '<span class="genre-pill genre-pill-empty">No genre information available</span>';
  }

  return items
    .map((genre) => `<span class="genre-pill">${escapeHtml(genre)}</span>`)
    .join("");
}

function formatFollowers(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 0,
  }).format(number);
}

async function loadAnalyzerOptions() {
  try {
    return await apiFetch("/api/analyzer/options");
  } catch (error) {
    showAlert(error.message);
    return null;
  }
}

function populatePredictionForm(track, options) {
  const form = document.getElementById("prediction-form");
  if (!form) return;

  const genreSelect = form.querySelector("#predict-genre");
  const albumTypeSelect = form.querySelector("#predict-album-type");
  const releaseYearSelect = form.querySelector("#predict-release-year");
  const artistPopInput = form.querySelector("#predict-artist-popularity");
  const artistFollowersInput = form.querySelector("#predict-artist-followers");
  const durationInput = form.querySelector("#predict-duration");
  const explicitSelect = form.querySelector("#predict-explicit");

  const selectedGenres = String(track.artist_genres || "")
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean);
  const selectedGenre = selectedGenres[0] || (options?.genres?.[0] || "");

  genreSelect.innerHTML = (options?.genres || [])
    .map((genre) => `<option value="${escapeAttribute(genre)}" ${genre === selectedGenre ? "selected" : ""}>${escapeHtml(genre)}</option>`)
    .join("");

  albumTypeSelect.innerHTML = (options?.album_types || [])
    .map((albumType) => `<option value="${escapeAttribute(albumType)}" ${albumType === (track.album_type || "") ? "selected" : ""}>${escapeHtml(albumType)}</option>`)
    .join("");

  releaseYearSelect.innerHTML = (options?.release_years || [])
    .map((year) => `<option value="${year}" ${year === Number(getTrackYear(track)) ? "selected" : ""}>${year}</option>`)
    .join("");

  artistPopInput.value = track.artist_popularity ?? "";
  artistFollowersInput.value = track.artist_followers ?? "";
  durationInput.value = track.track_duration_min ?? "";
  explicitSelect.value = track.explicit ? "true" : "false";
}

async function submitPrediction(event) {
  event.preventDefault();
  console.log("submit handler started");

  const form = document.getElementById("prediction-form");
  const button = document.getElementById("estimate-popularity");
  const feedback = document.getElementById("prediction-form-error");
  const output = document.getElementById("prediction-output");

  feedback.classList.add("d-none");
  feedback.textContent = "";

  const payload = {
    genre: form.querySelector("#predict-genre").value,
    artist_popularity: Number(form.querySelector("#predict-artist-popularity").value),
    artist_followers: Number(form.querySelector("#predict-artist-followers").value),
    duration: Number(form.querySelector("#predict-duration").value),
    release_year: Number(form.querySelector("#predict-release-year").value),
    album_type: form.querySelector("#predict-album-type").value,
    explicit: form.querySelector("#predict-explicit").value === "true",
  };
  console.log("payload created", payload);

  if (!payload.genre || !Number.isFinite(payload.artist_popularity) || !Number.isFinite(payload.artist_followers) || !Number.isFinite(payload.duration) || !payload.album_type || !Number.isFinite(payload.release_year)) {
    feedback.textContent = "Please complete all required fields before estimating popularity.";
    feedback.classList.remove("d-none");
    return;
  }

  if (payload.artist_popularity < 0 || payload.artist_popularity > 100) {
    feedback.textContent = "Artist popularity must be between 0 and 100.";
    feedback.classList.remove("d-none");
    return;
  }

  if (payload.artist_followers < 0) {
    feedback.textContent = "Artist followers cannot be negative.";
    feedback.classList.remove("d-none");
    return;
  }

  if (payload.duration <= 0) {
    feedback.textContent = "Duration must be greater than zero.";
    feedback.classList.remove("d-none");
    return;
  }

  button.disabled = true;
  button.textContent = "Estimating…";
  output.classList.add("d-none");

  try {
    console.log("fetch started");
    const data = await apiFetch("/api/analyzer/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    console.log("parsed response", data);

    renderPredictionResult(data);
    output.classList.remove("d-none");
  } catch (error) {
    console.error("caught error", error);
    feedback.textContent = error.message;
    feedback.classList.remove("d-none");
  } finally {
    console.log("finally block reached");
    button.disabled = false;
    button.textContent = "Estimate Popularity";
  }
}

function renderPredictionResult(data) {
  const output = document.getElementById("prediction-output");
  const observed = Number(state.selectedTrack?.track_popularity || 0);
  const estimated = Number(data.predicted_popularity || 0);
  const difference = estimated - observed;

  output.classList.remove("d-none");
  output.innerHTML = `
    <div class="analyzer-card-heading">
      <p class="eyebrow">Estimated popularity</p>
      <h4>Estimated Spotify Popularity</h4>
    </div>

    <div class="prediction-score-panel">
      <div class="prediction-score">${formatNumber(estimated, 1)}</div>
      <div class="prediction-score-label">Estimated Popularity</div>
      <div class="progress analyzer-progress prediction-progress-bar" aria-label="Estimated popularity">
        <div class="progress-bar" role="progressbar" style="width: ${Math.min(estimated, 100)}%"></div>
      </div>
    </div>

    <p class="prediction-explanation">${escapeHtml(data.explanation || "")}</p>

    <div class="prediction-summary-card">
      <h5>Submitted profile</h5>
      <ul>
        <li><span>Genre</span><strong>${escapeHtml(data.submitted_profile?.genre || "—")}</strong></li>
        <li><span>Artist popularity</span><strong>${formatNumber(data.submitted_profile?.artist_popularity, 1)}</strong></li>
        <li><span>Followers</span><strong>${formatFollowers(data.submitted_profile?.artist_followers)}</strong></li>
        <li><span>Duration</span><strong>${formatNumber(data.submitted_profile?.duration, 2)} min</strong></li>
        <li><span>Release year</span><strong>${escapeHtml(String(data.submitted_profile?.release_year || "—"))}</strong></li>
        <li><span>Album type</span><strong>${escapeHtml(String(data.submitted_profile?.album_type || "—"))}</strong></li>
        <li><span>Explicit</span><strong>${data.submitted_profile?.explicit ? "Yes" : "No"}</strong></li>
      </ul>
    </div>

    <div class="comparison-card">
      <div>
        <span>Observed popularity</span>
        <strong>${formatNumber(observed)}</strong>
      </div>
      <div>
        <span>Estimated popularity</span>
        <strong>${formatNumber(estimated, 1)}</strong>
      </div>
      <div>
        <span>Difference</span>
        <strong>${difference >= 0 ? "+" : ""}${formatNumber(difference, 1)}</strong>
      </div>
    </div>

    <div class="model-metrics-card">
      <h5>Model performance</h5>
      <div class="model-metrics-grid">
        <div>
          <span>Mean Absolute Error</span>
          <strong>${formatNumber(data.model_metrics?.mean_absolute_error, 2)}</strong>
        </div>
        <div>
          <span>Root Mean Squared Error</span>
          <strong>${formatNumber(data.model_metrics?.root_mean_squared_error, 2)}</strong>
        </div>
        <div>
          <span>R² Score</span>
          <strong>${formatNumber(data.model_metrics?.r2_score, 3)}</strong>
        </div>
      </div>
      <p class="model-help-text">These metrics describe the model’s overall performance and do not guarantee the accuracy of one prediction.</p>
    </div>

    <p class="prediction-notice">This estimate reflects patterns in the supplied Spotify dataset and is not a guarantee of real-world Spotify performance.</p>
  `;
}

function detailItem(label, value) {
  return `
    <div class="detail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function bindRecommendations() {
  document.getElementById("load-recommendations").addEventListener("click", loadRecommendations);
}

function setRecommendationTrack(track) {
  state.selectedTrack = track;
  const source = document.getElementById("recommendation-source");
  source.classList.remove("d-none");
  source.innerHTML = `
    <div class="recommendation-source-header">
      <p class="eyebrow">Currently selected</p>
      <h3>${escapeHtml(track.track_name)}</h3>
      <p class="track-subtitle">${escapeHtml(track.artist_name)} • ${escapeHtml(track.album_name || "Unknown album")}</p>
    </div>
    <div class="recommendation-source-metrics">
      <div class="recommendation-source-metric metric-highlight">
        <span>Track popularity</span>
        <strong>${formatNumber(track.track_popularity)}</strong>
        <small>Popularity score</small>
      </div>
      <div class="recommendation-source-metric metric-highlight">
        <span>Artist popularity</span>
        <strong>${formatNumber(track.artist_popularity)}</strong>
        <small>Artist reach</small>
      </div>
      <div class="recommendation-source-metric">
        <span>Album</span>
        <strong>${escapeHtml(track.album_name || "Unknown album")}</strong>
      </div>
    </div>
  `;
  document.getElementById("load-recommendations").disabled = false;
  document.getElementById("recommendations-grid").innerHTML = "";
  document.getElementById("recommendation-summary").classList.add("d-none");
}

async function loadRecommendations() {
  if (!state.selectedTrack) return;

  const grid = document.getElementById("recommendations-grid");
  const summary = document.getElementById("recommendation-summary");
  grid.innerHTML = `<div class="col-12 loading-row">Generating recommendations…</div>`;
  summary.classList.add("d-none");

  try {
    const data = await apiFetch(
      `/api/recommendations/${encodeURIComponent(state.selectedTrack.track_id)}?limit=8`,
    );

    const scores = data.recommendations.map((track) => Number(track.similarity_score));
    const minScore = scores.length ? Math.min(...scores) : 0;
    const maxScore = scores.length ? Math.max(...scores) : 0;

    summary.classList.remove("d-none");
    summary.innerHTML = `
      <div class="recommendation-summary-card">
        <strong>${formatNumber(data.recommendations.length)} statistically similar songs found.</strong>
        <span>Similarity scores range from ${formatNumber(minScore, 1)}% to ${formatNumber(maxScore, 1)}%.</span>
      </div>
    `;

    grid.innerHTML = data.recommendations
      .map(
        (track) => `
          <div class="col-md-6 col-xl-3">
            <article class="recommendation-card">
              <div class="recommendation-card-top">
                <span class="recommendation-score-badge">${formatNumber(track.similarity_score, 1)}% Match</span>
              </div>
              <h3>${escapeHtml(track.track_name)}</h3>
              <p class="recommendation-artist">${escapeHtml(track.artist_name)}</p>
              <div class="recommendation-card-meta">
                <span>Popularity</span>
                <strong>${formatNumber(track.track_popularity)}</strong>
                <div class="progress popularity-progress" aria-label="Popularity ${formatNumber(track.track_popularity)} out of 100">
                  <div class="progress-bar" role="progressbar" style="width: ${Math.min(Number(track.track_popularity), 100)}%"></div>
                </div>
              </div>
            </article>
          </div>
        `,
      )
      .join("");
  } catch (error) {
    grid.innerHTML = `<div class="col-12 error-row">${escapeHtml(error.message)}</div>`;
  }
}

function bindComparison() {
  setupTrackSearch("compare-first-search", "compare-first-results", (track) => {
    state.compareFirst = track;
    renderComparisonSelection("compare-first-selected", track);
    updateCompareButton();
  });

  setupTrackSearch("compare-second-search", "compare-second-results", (track) => {
    state.compareSecond = track;
    renderComparisonSelection("compare-second-selected", track);
    updateCompareButton();
  });

  document.getElementById("compare-button").addEventListener("click", compareTracks);
}

function renderComparisonSelection(containerId, track) {
  const container = document.getElementById(containerId);
  container.classList.remove("d-none");
  container.innerHTML = `
    <div class="track-title">${escapeHtml(track.track_name)}</div>
    <div class="track-subtitle">${escapeHtml(track.artist_name)}</div>
  `;
}

function updateCompareButton() {
  document.getElementById("compare-button").disabled = !(
    state.compareFirst && state.compareSecond
  );
}

async function compareTracks() {
  const output = document.getElementById("comparison-output");
  const button = document.getElementById("compare-button");
  const requestToken = ++state.comparisonRequestToken;

  output.innerHTML = `<div class="comparison-loading">Comparing tracks…</div>`;
  button.disabled = true;
  button.textContent = "Comparing…";

  const params = new URLSearchParams({
    first: state.compareFirst.track_id,
    second: state.compareSecond.track_id,
  });

  try {
    const data = await apiFetch(`/api/compare?${params.toString()}`);
    if (requestToken !== state.comparisonRequestToken) {
      return;
    }
    renderComparisonResults(data);
  } catch (error) {
    if (requestToken === state.comparisonRequestToken) {
      output.innerHTML = `<div class="comparison-error">${escapeHtml(error.message)}</div>`;
    }
  } finally {
    if (requestToken === state.comparisonRequestToken) {
      button.disabled = false;
      button.textContent = "Compare tracks";
    }
  }
}

function renderComparisonResults(data) {
  const output = document.getElementById("comparison-output");
  const first = data.first;
  const second = data.second;

  const popularityDiff = Number(first.track_popularity || 0) - Number(second.track_popularity || 0);
  const followerDiff = Number(first.artist_followers || 0) - Number(second.artist_followers || 0);
  const durationDiff = Number(first.track_duration_min || 0) - Number(second.track_duration_min || 0);
  const yearDiff = Number(getYear(first.album_release_date)) - Number(getYear(second.album_release_date));

  const summary = buildComparisonSummary(first, second, popularityDiff, followerDiff, durationDiff, yearDiff);

  output.innerHTML = `
    <div class="comparison-shell">
      <div class="comparison-hero">
        <div class="comparison-card-stack">
          <article class="comparison-track-card">
            <div class="comparison-track-header">
              <div>
                <div class="comparison-track-title">${escapeHtml(first.track_name)}</div>
                <div class="comparison-track-meta">${escapeHtml(first.artist_name)} · ${escapeHtml(first.album_name || "Unknown album")}</div>
              </div>
              <span class="comparison-track-badge">${escapeHtml(first.album_type || "Unknown")}</span>
            </div>
            <div class="comparison-meta-grid">
              <div class="comparison-meta-item"><span>Release year</span><strong>${escapeHtml(getYear(first.album_release_date))}</strong></div>
              <div class="comparison-meta-item"><span>Genre</span><strong>${escapeHtml(first.artist_genres || "Unknown")}</strong></div>
              <div class="comparison-meta-item"><span>Explicit</span><strong>${first.explicit ? "Yes" : "No"}</strong></div>
              <div class="comparison-meta-item"><span>Duration</span><strong>${formatNumber(first.track_duration_min, 2)} min</strong></div>
              <div class="comparison-meta-item"><span>Popularity</span><strong>${formatNumber(first.track_popularity)}</strong></div>
              <div class="comparison-meta-item"><span>Artist followers</span><strong>${formatFollowers(first.artist_followers)}</strong></div>
            </div>
          </article>

          <article class="comparison-track-card">
            <div class="comparison-track-header">
              <div>
                <div class="comparison-track-title">${escapeHtml(second.track_name)}</div>
                <div class="comparison-track-meta">${escapeHtml(second.artist_name)} · ${escapeHtml(second.album_name || "Unknown album")}</div>
              </div>
              <span class="comparison-track-badge">${escapeHtml(second.album_type || "Unknown")}</span>
            </div>
            <div class="comparison-meta-grid">
              <div class="comparison-meta-item"><span>Release year</span><strong>${escapeHtml(getYear(second.album_release_date))}</strong></div>
              <div class="comparison-meta-item"><span>Genre</span><strong>${escapeHtml(second.artist_genres || "Unknown")}</strong></div>
              <div class="comparison-meta-item"><span>Explicit</span><strong>${second.explicit ? "Yes" : "No"}</strong></div>
              <div class="comparison-meta-item"><span>Duration</span><strong>${formatNumber(second.track_duration_min, 2)} min</strong></div>
              <div class="comparison-meta-item"><span>Popularity</span><strong>${formatNumber(second.track_popularity)}</strong></div>
              <div class="comparison-meta-item"><span>Artist followers</span><strong>${formatFollowers(second.artist_followers)}</strong></div>
            </div>
          </article>
        </div>

        <section class="comparison-analysis" aria-label="Comparison analysis">
          <div class="comparison-analysis-header">
            <h3>Key takeaways</h3>
          </div>
          <div class="comparison-analysis-list">
            ${buildInsightRow("Popularity", first.track_popularity, second.track_popularity, "points", popularityDiff)}
            ${buildInsightRow("Artist followers", first.artist_followers, second.artist_followers, "followers", followerDiff)}
            ${buildInsightRow("Duration", first.track_duration_min, second.track_duration_min, "min", durationDiff)}
            ${buildInsightRow("Release year", getYear(first.album_release_date), getYear(second.album_release_date), "year", yearDiff)}
            ${buildMatchInsight("Genre", first.artist_genres, second.artist_genres)}
            ${buildMatchInsight("Album type", first.album_type, second.album_type)}
            ${buildExplicitInsight(first.explicit, second.explicit)}
          </div>
          <div class="comparison-summary">${escapeHtml(summary)}</div>
        </section>
      </div>
    </div>
  `;
}

function buildInsightRow(label, firstValue, secondValue, unit, difference) {
  const isHigher = difference > 0;
  const isLower = difference < 0;
  const indicatorClass = isHigher ? "positive" : isLower ? "negative" : "neutral";
  const indicatorText = isHigher ? `▲ ${formatNumber(Math.abs(difference), 1)} ${unit}` : isLower ? `▼ ${formatNumber(Math.abs(difference), 1)} ${unit}` : `≈ Similar`;

  return `
    <div class="comparison-analysis-item">
      <strong>${escapeHtml(label)}</strong>
      <div class="comparison-indicator ${indicatorClass}">${indicatorText}</div>
    </div>
  `;
}

function buildMatchInsight(label, firstValue, secondValue) {
  const same = String(firstValue || "").trim().toLowerCase() === String(secondValue || "").trim().toLowerCase();
  const indicatorClass = same ? "positive" : "neutral";
  const indicatorText = same ? "✓ Same" : "↺ Different";

  return `
    <div class="comparison-analysis-item">
      <strong>${escapeHtml(label)}</strong>
      <div class="comparison-indicator ${indicatorClass}">${indicatorText}</div>
    </div>
  `;
}

function buildExplicitInsight(firstExplicit, secondExplicit) {
  const same = Boolean(firstExplicit) === Boolean(secondExplicit);
  const indicatorClass = same ? "neutral" : "positive";
  const indicatorText = same ? "≈ Same" : "⚠ Different";

  return `
    <div class="comparison-analysis-item">
      <strong>Explicit content</strong>
      <div class="comparison-indicator ${indicatorClass}">${indicatorText}</div>
    </div>
  `;
}

function buildComparisonSummary(first, second, popularityDiff, followerDiff, durationDiff, yearDiff) {
  const segments = [];

  if (popularityDiff > 0 && followerDiff < 0) {
    segments.push(`${first.track_name} is more popular than ${second.track_name} even though ${second.artist_name} has a larger overall follower base. This suggests the track's individual performance can outpace the artist's broader reach.`);
  } else if (popularityDiff < 0 && followerDiff > 0) {
    segments.push(`${second.track_name} is more popular than ${first.track_name} even though ${first.artist_name} has a larger overall follower base. This suggests the track's individual performance can outpace the artist's broader reach.`);
  } else if (popularityDiff > 0) {
    segments.push(`${first.track_name} has the stronger individual popularity in this comparison.`);
  } else if (popularityDiff < 0) {
    segments.push(`${second.track_name} has the stronger individual popularity in this comparison.`);
  } else {
    segments.push("Both tracks show similar individual popularity.");
  }

  if (durationDiff > 0) {
    segments.push(`${first.track_name} is also longer.`);
  } else if (durationDiff < 0) {
    segments.push(`${second.track_name} is also longer.`);
  }

  if (String(first.album_type || "").toLowerCase() === String(second.album_type || "").toLowerCase()) {
    segments.push("Both tracks share the same album type.");
  } else {
    segments.push("The album types differ.");
  }

  if (Boolean(first.explicit) !== Boolean(second.explicit)) {
    segments.push("The explicit content differs.");
  }

  if (Math.abs(yearDiff) > 0) {
    segments.push(`The release years also differ by ${formatNumber(Math.abs(yearDiff))}.`);
  } else {
    segments.push("The tracks were released in the same year.");
  }

  return segments.join(" ");
}

function getYear(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 4);
  }
  return String(date.getFullYear());
}

function formatMetric(key, value) {
  if (key === "artist_followers") return formatNumber(value);
  if (key === "track_duration_min") return `${formatNumber(value, 2)} min`;
  return formatNumber(value, 1);
}

function formatFollowers(value) {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatNumber(value, maximumFractionDigits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";

  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits,
  }).format(number);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
