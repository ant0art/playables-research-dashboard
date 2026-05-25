/* ============================================================
   playables.research — Dashboard Application
   OAuth + Google Sheets API (client-side, no backend)
   ============================================================ */

// --- Config ---
const CONFIG = {
    CLIENT_ID: '595035411222-q99v60hb2626gq70snicoipnam6ap6tr.apps.googleusercontent.com',
    SCOPES: 'openid profile email https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly',
    SHEETS_API: 'https://sheets.googleapis.com/v4/spreadsheets',
    DRIVE_API: 'https://www.googleapis.com/drive/v3/files',
    STORAGE_KEY: 'pr_sheet_id',
    REPOS_HEADERS: ['full_name','url','stars','language','category','relevance_score','summary_ru','application','limitations','integration_effort','worth_tracking','found_date'],
    NOTES_HEADERS: ['full_name','my_rating','status','my_notes','reviewed_at'],
};

// --- State ---
let state = {
    token: null,
    user: null,
    sheetId: null,
    repos: [],
    notes: {},       // keyed by full_name
    sortCol: 'stars',
    sortDir: 'desc',
    filters: JSON.parse(localStorage.getItem('pr_filters') || '{}'),
    searchQuery: '',
    expandedRow: null,
};

// --- DOM refs ---
const $ = (id) => document.getElementById(id);

// --- Theme ---
function initTheme() {
    const stored = localStorage.getItem('pr_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'dark'); // default dark
    applyTheme(theme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.querySelector('#btn-theme .material-symbols-outlined');
    if (icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
    localStorage.setItem('pr_theme', theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadGoogleIdentity();
    bindEvents();
    bindSettingsEvents();
});

// ============================================================
// Google Identity Services
// ============================================================

function loadGoogleIdentity() {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
        // Check for existing token
        const stored = sessionStorage.getItem('pr_token');
        if (stored) {
            state.token = stored;
            fetchUserInfo().then(() => {
                state.sheetId = localStorage.getItem(CONFIG.STORAGE_KEY);
                if (state.sheetId) {
                    showDashboard();
                } else {
                    showSheetPicker();
                }
            }).catch(() => {
                showAuth();
            });
        } else {
            showAuth();
        }
    };
    document.head.appendChild(script);
}

function signIn() {
    const client = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: (response) => {
            if (response.error) {
                console.error('OAuth error:', response.error, response.error_description);
                alert('Sign-in failed: ' + (response.error_description || response.error));
                return;
            }
            if (response.access_token) {
                state.token = response.access_token;
                sessionStorage.setItem('pr_token', response.access_token);
                fetchUserInfo().then(() => {
                    state.sheetId = localStorage.getItem(CONFIG.STORAGE_KEY);
                    if (state.sheetId) {
                        showDashboard();
                    } else {
                        showSheetPicker();
                    }
                }).catch(err => {
                    console.error('User info fetch failed:', err);
                    alert('Failed to fetch user info: ' + err.message);
                });
            }
        },
        error_callback: (err) => {
            console.error('OAuth popup error:', err);
        },
    });
    client.requestAccessToken();
}

function signOut() {
    if (state.token) {
        google.accounts.oauth2.revoke(state.token);
    }
    state.token = null;
    state.user = null;
    sessionStorage.removeItem('pr_token');
    showAuth();
}

async function fetchUserInfo() {
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${state.token}` },
        });
        if (res.ok) {
            state.user = await res.json();
        } else {
            console.warn('userinfo returned', res.status, '— continuing without user details');
            state.user = { name: 'User' };
        }
    } catch (e) {
        console.warn('userinfo fetch failed:', e.message);
        state.user = { name: 'User' };
    }
}

// ============================================================
// Screen Navigation
// ============================================================

function showAuth() {
    $('auth-screen').classList.remove('hidden');
    $('sheet-screen').classList.add('hidden');
    $('dashboard-screen').classList.add('hidden');
}

function showSheetPicker() {
    $('auth-screen').classList.add('hidden');
    $('sheet-screen').classList.remove('hidden');
    $('dashboard-screen').classList.add('hidden');
}

function showDashboard() {
    $('auth-screen').classList.add('hidden');
    $('sheet-screen').classList.add('hidden');
    $('dashboard-screen').classList.remove('hidden');
    if (state.user) {
        $('user-name').textContent = state.user.name || state.user.email || '';
    }
    loadSheetData();
}

// ============================================================
// Google Sheets API
// ============================================================

async function sheetsRequest(path, options = {}) {
    const url = `${CONFIG.SHEETS_API}/${state.sheetId}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${state.token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    if (res.status === 401) {
        signOut();
        throw new Error('Token expired');
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error ${res.status}`);
    }
    return res.json();
}

async function driveRequest(path, options = {}) {
    const url = `${CONFIG.DRIVE_API}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${state.token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    if (!res.ok) throw new Error(`Drive API error ${res.status}`);
    return res.json();
}

// ============================================================
// Sheet Operations
// ============================================================

async function createNewSheet() {
    // Create spreadsheet via Sheets API
    const res = await fetch(CONFIG.SHEETS_API, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${state.token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            properties: { title: 'Playables Research' },
            sheets: [
                {
                    properties: { title: 'Repos' },
                    data: [{
                        startRow: 0, startColumn: 0,
                        rowData: [{ values: CONFIG.REPOS_HEADERS.map(h => ({ userEnteredValue: { stringValue: h } })) }],
                    }],
                },
                {
                    properties: { title: 'MyNotes' },
                    data: [{
                        startRow: 0, startColumn: 0,
                        rowData: [{ values: CONFIG.NOTES_HEADERS.map(h => ({ userEnteredValue: { stringValue: h } })) }],
                    }],
                },
            ],
        }),
    });
    if (!res.ok) throw new Error('Failed to create sheet');
    const sheet = await res.json();
    return sheet.spreadsheetId;
}

async function connectSheet(input) {
    // Parse sheet ID from URL or raw ID
    const id = parseSheetId(input);
    if (!id) {
        alert('Invalid Sheet URL or ID');
        return;
    }
    state.sheetId = id;
    localStorage.setItem(CONFIG.STORAGE_KEY, id);
    showDashboard();
}

function parseSheetId(input) {
    if (!input) return null;
    input = input.trim();
    // Full URL: https://docs.google.com/spreadsheets/d/SHEET_ID/...
    const urlMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
    // Already an ID (alphanumeric, hyphens, underscores)
    if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) return input;
    return null;
}

async function loadDriveSpreadsheets() {
    $('drive-list').classList.remove('hidden');
    $('drive-list-items').innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading...</p></div>';
    try {
        const res = await fetch(
            `${CONFIG.DRIVE_API}?q=mimeType='application/vnd.google-apps.spreadsheet'&orderBy=modifiedTime desc&pageSize=20&fields=files(id,name,modifiedTime)`,
            { headers: { Authorization: `Bearer ${state.token}` } }
        );
        if (!res.ok) throw new Error(`Drive API ${res.status}`);
        const data = await res.json();
        const files = data.files || [];
        if (files.length === 0) {
            $('drive-list-items').innerHTML = '<div class="empty-state"><p>No spreadsheets found</p></div>';
            return;
        }
        $('drive-list-items').innerHTML = files.map(f =>
            `<button class="drive-list-item" data-id="${f.id}">
                <span class="material-symbols-outlined">table_chart</span>
                <span>${f.name}</span>
            </button>`
        ).join('');
        // Bind clicks
        $('drive-list-items').querySelectorAll('.drive-list-item').forEach(btn => {
            btn.addEventListener('click', () => connectSheet(btn.dataset.id));
        });
    } catch (e) {
        console.error('Drive list error:', e);
        $('drive-list-items').innerHTML = `<div class="empty-state"><p>Could not load files. Try pasting the URL instead.</p></div>`;
    }
}

async function loadSheetData() {
    showLoading(true);
    try {
        // Batch get both sheets
        const data = await sheetsRequest('/values:batchGet?ranges=Repos!A1:L1000&ranges=MyNotes!A1:E1000');
        const ranges = data.valueRanges || [];

        // Parse Repos
        const reposRaw = ranges[0]?.values || [];
        if (reposRaw.length > 1) {
            const headers = reposRaw[0];
            state.repos = reposRaw.slice(1).map(row => {
                const obj = {};
                headers.forEach((h, i) => { obj[h] = row[i] || ''; });
                obj.stars = parseInt(obj.stars, 10) || 0;
                obj.relevance_score = parseInt(obj.relevance_score, 10) || 0;
                return obj;
            });
        } else {
            state.repos = [];
        }

        // Parse MyNotes
        const notesRaw = ranges[1]?.values || [];
        state.notes = {};
        if (notesRaw.length > 1) {
            const headers = notesRaw[0];
            notesRaw.slice(1).forEach(row => {
                const obj = {};
                headers.forEach((h, i) => { obj[h] = row[i] || ''; });
                if (obj.full_name) {
                    obj.my_rating = parseInt(obj.my_rating, 10) || 0;
                    state.notes[obj.full_name] = obj;
                }
            });
        }

        populateFilters();
        renderAll();
    } catch (e) {
        console.error('Failed to load sheet data:', e);
        showLoading(false);
        showEmpty(true);
    }
}

function showLoading(show) {
    $('loading-state').classList.toggle('hidden', !show);
    $('repo-table').classList.toggle('hidden', show);
    $('empty-state').classList.add('hidden');
}

function showEmpty(show) {
    $('empty-state').classList.toggle('hidden', !show);
}

// ============================================================
// Save to Sheets
// ============================================================

async function saveNote(fullName, field, value) {
    if (!state.notes[fullName]) {
        state.notes[fullName] = { full_name: fullName, my_rating: 0, status: '', my_notes: '', reviewed_at: '' };
    }
    state.notes[fullName][field] = value;
    state.notes[fullName].reviewed_at = new Date().toISOString().split('T')[0];

    // Rebuild the entire MyNotes sheet (simpler than finding the row)
    const rows = [CONFIG.NOTES_HEADERS];
    Object.values(state.notes).forEach(n => {
        rows.push(CONFIG.NOTES_HEADERS.map(h => String(n[h] ?? '')));
    });

    try {
        await sheetsRequest('/values/MyNotes!A1:E1000?valueInputOption=USER_ENTERED', {
            method: 'PUT',
            body: JSON.stringify({ range: 'MyNotes!A1:E1000', values: rows }),
        });
    } catch (e) {
        console.error('Failed to save note:', e);
    }
}

// ============================================================
// Filtering & Sorting
// ============================================================

function getFilteredRepos() {
    let repos = [...state.repos];

    // Merge notes into repos for display
    repos = repos.map(r => ({
        ...r,
        my_rating: state.notes[r.full_name]?.my_rating || 0,
        status: state.notes[r.full_name]?.status || 'new',
        my_notes: state.notes[r.full_name]?.my_notes || '',
    }));

    // Apply multiselect filters (arrays)
    if (state.filters.category && state.filters.category.length) {
        repos = repos.filter(r => state.filters.category.includes(r.category));
    }
    if (state.filters.language && state.filters.language.length) {
        repos = repos.filter(r => state.filters.language.includes(r.language));
    }
    if (state.filters.status && state.filters.status.length) {
        repos = repos.filter(r => state.filters.status.includes(r.status));
    }
    if (state.filters.effort && state.filters.effort.length) {
        repos = repos.filter(r => state.filters.effort.includes(r.integration_effort));
    }
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        repos = repos.filter(r =>
            r.full_name.toLowerCase().includes(q) ||
            (r.summary_ru || '').toLowerCase().includes(q) ||
            (r.application || '').toLowerCase().includes(q)
        );
    }

    // Sort
    const dir = state.sortDir === 'asc' ? 1 : -1;
    repos.sort((a, b) => {
        let va = a[state.sortCol];
        let vb = b[state.sortCol];
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        if (state.sortCol === 'stars' || state.sortCol === 'relevance_score' || state.sortCol === 'my_rating') {
            return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
        }
        return String(va || '').localeCompare(String(vb || '')) * dir;
    });

    return repos;
}

function populateFilters() {
    // Category — dynamic from data
    const cats = [...new Set(state.repos.map(r => r.category).filter(Boolean))].sort();
    populateMultiselect('filter-category', cats);

    // Language — dynamic from data
    const langs = [...new Set(state.repos.map(r => r.language).filter(Boolean))].sort();
    populateMultiselect('filter-language', langs);

    // Status — fixed values
    populateMultiselect('filter-status', ['new', 'watch', 'skip', 'integrated']);

    // Effort — fixed values
    populateMultiselect('filter-effort', ['low', 'medium', 'high']);

    // Restore UI state from persisted filters
    ['filter-category', 'filter-language', 'filter-status', 'filter-effort'].forEach(updateMultiselectUI);
}

// ============================================================
// Multiselect Component
// ============================================================

function populateMultiselect(id, values) {
    const container = $(id);
    if (!container) return;
    const optionsWrap = container.querySelector('.multiselect-options');
    const filterKey = container.dataset.filter;
    const selected = state.filters[filterKey] || [];

    optionsWrap.innerHTML = values.map(v => {
        const checked = selected.includes(v) ? 'checked' : '';
        return `<label class="multiselect-option">
            <input type="checkbox" value="${v}" ${checked}>
            <span class="multiselect-check"></span>
            <span class="multiselect-option-text">${v}</span>
        </label>`;
    }).join('');

    // Bind checkbox events
    optionsWrap.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            onMultiselectChange(id);
        });
    });
}

function onMultiselectChange(id) {
    const container = $(id);
    const filterKey = container.dataset.filter;
    const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    const values = Array.from(checkboxes).map(cb => cb.value);

    state.filters[filterKey] = values;
    localStorage.setItem('pr_filters', JSON.stringify(state.filters));
    updateMultiselectUI(id);
    renderAll();
}

function updateMultiselectUI(id) {
    const container = $(id);
    const filterKey = container.dataset.filter;
    const selected = state.filters[filterKey] || [];
    const countEl = container.querySelector('.multiselect-count');
    const trigger = container.querySelector('.multiselect-trigger');

    if (selected.length > 0) {
        countEl.textContent = selected.length;
        countEl.classList.remove('hidden');
        trigger.classList.add('active');
    } else {
        countEl.classList.add('hidden');
        trigger.classList.remove('active');
    }
}

function initMultiselects() {
    // Toggle popup on trigger click
    document.querySelectorAll('.multiselect-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const container = trigger.closest('.multiselect');
            const popup = container.querySelector('.multiselect-popup');
            const isOpen = !popup.classList.contains('hidden');

            // Close all others first
            closeAllMultiselects();

            if (!isOpen) {
                popup.style.left = '';
                popup.style.right = '';
                popup.classList.remove('hidden');
                container.classList.add('open');

                // Keep popup within viewport
                requestAnimationFrame(() => {
                    const rect = popup.getBoundingClientRect();
                    if (rect.right > window.innerWidth) {
                        popup.style.left = 'auto';
                        popup.style.right = '0';
                    }
                    if (rect.left < 0) {
                        popup.style.left = '0';
                        popup.style.right = 'auto';
                    }
                });
            }
        });
    });

    // Prevent popup clicks from closing
    document.querySelectorAll('.multiselect-popup').forEach(popup => {
        popup.addEventListener('click', (e) => e.stopPropagation());
    });

    // Close on outside click
    document.addEventListener('click', () => {
        closeAllMultiselects();
    });
}

function closeAllMultiselects() {
    document.querySelectorAll('.multiselect').forEach(ms => {
        ms.querySelector('.multiselect-popup').classList.add('hidden');
        ms.classList.remove('open');
    });
}

// ============================================================
// Rendering
// ============================================================

function renderAll() {
    const repos = getFilteredRepos();
    showLoading(false);
    showEmpty(repos.length === 0);

    renderTable(repos);
    renderMobileCards(repos);
    renderStats(repos);
    renderSortHeaders();
}

function renderStats(repos) {
    const total = state.repos.length;
    const watched = Object.values(state.notes).filter(n => n.status === 'watch').length;
    $('stat-total').textContent = `${total} repos`;
    $('stat-filtered').textContent = `${repos.length} shown`;
    $('stat-watched').textContent = `${watched} watched`;
}

function renderSortHeaders() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === state.sortCol) {
            th.classList.add(state.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

function scoreClass(score) {
    if (score >= 70) return 'cell-score-high';
    if (score >= 40) return 'cell-score-mid';
    return 'cell-score-low';
}

function effortDot(effort) {
    const e = (effort || '').toLowerCase();
    if (e === 'low') return '<span class="effort-dot effort-low"></span>';
    if (e === 'medium') return '<span class="effort-dot effort-medium"></span>';
    if (e === 'high') return '<span class="effort-dot effort-high"></span>';
    return '';
}

function starsHTML(rating, fullName) {
    let html = '<div class="stars-cell">';
    for (let i = 1; i <= 5; i++) {
        const filled = i <= rating ? 'filled' : '';
        html += `<button class="star-btn ${filled}" data-repo="${fullName}" data-rating="${i}">
            <span class="material-symbols-outlined">star</span>
        </button>`;
    }
    html += '</div>';
    return html;
}

function statusBadge(status) {
    const s = (status || 'new').toLowerCase();
    let cls = 'badge';
    if (s === 'watch') cls += ' badge-active';
    if (s === 'skip') cls += ' badge-skip';
    return `<span class="${cls}">${s}</span>`;
}

function formatStars(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
}

// --- Desktop Table ---

function renderTable(repos) {
    const tbody = $('repo-tbody');
    let html = '';

    repos.forEach(repo => {
        const isExpanded = state.expandedRow === repo.full_name;
        const expandClass = isExpanded ? 'open' : '';

        html += `<tr class="repo-row" data-repo="${repo.full_name}">
            <td><span class="material-symbols-outlined expand-icon ${expandClass}">chevron_right</span></td>
            <td class="cell-name"><a href="${repo.url || 'https://github.com/' + repo.full_name}" target="_blank" rel="noopener">${repo.full_name}</a></td>
            <td class="cell-stars">${formatStars(repo.stars)}</td>
            <td><span class="badge">${repo.category || '-'}</span></td>
            <td class="cell-score ${scoreClass(repo.relevance_score)}">${repo.relevance_score}</td>
            <td>${starsHTML(repo.my_rating, repo.full_name)}</td>
            <td>${statusBadge(repo.status)}</td>
            <td class="col-effort"><div class="effort-cell">${effortDot(repo.integration_effort)} ${(repo.integration_effort || '-').toLowerCase()}</div></td>
        </tr>`;

        if (isExpanded) {
            html += renderDetailRow(repo);
        }
    });

    tbody.innerHTML = html;
    bindTableEvents();
}

function renderDetailRow(repo) {
    return `<tr class="detail-row" data-detail="${repo.full_name}">
        <td colspan="8">
            <div class="detail-panel">
                <div>
                    <div class="detail-section-title">Review</div>
                    <p class="detail-text">${repo.summary_ru || 'No review available'}</p>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
                        <div>
                            <div class="detail-section-title">Application</div>
                            <div class="detail-app">${repo.application || '-'}</div>
                        </div>
                        <div>
                            <div class="detail-section-title">Limitations</div>
                            <div class="detail-app" style="color:var(--text-secondary)">${repo.limitations || '-'}</div>
                        </div>
                    </div>
                </div>
                <div class="notes-panel">
                    <div class="notes-header">
                        <span>My Notes</span>
                        <span class="material-symbols-outlined" style="font-size:14px">edit_document</span>
                    </div>
                    <textarea class="notes-textarea" data-repo="${repo.full_name}" placeholder="Add your notes...">${repo.my_notes || ''}</textarea>
                </div>
                <div class="detail-footer">
                    <div class="detail-footer-left">
                        <select class="detail-status-select" data-repo="${repo.full_name}">
                            ${['new','watch','skip','integrated'].map(s =>
                                `<option value="${s}" ${repo.status === s ? 'selected' : ''}>${s.toUpperCase()}</option>`
                            ).join('')}
                        </select>
                        ${starsHTML(repo.my_rating, repo.full_name)}
                    </div>
                    <a class="btn-github" href="${repo.url || 'https://github.com/' + repo.full_name}" target="_blank" rel="noopener">
                        <span class="material-symbols-outlined" style="font-size:14px">open_in_new</span>
                        View on GitHub
                    </a>
                </div>
            </div>
        </td>
    </tr>`;
}

// --- Mobile Cards ---

function renderMobileCards(repos) {
    let container = document.querySelector('.mobile-cards');
    if (!container) {
        container = document.createElement('div');
        container.className = 'mobile-cards';
        $('table-wrap').appendChild(container);
    }

    let html = '';
    repos.forEach(repo => {
        const isExpanded = state.expandedRow === repo.full_name;
        html += `<div class="mobile-card ${isExpanded ? 'expanded' : ''}" data-repo="${repo.full_name}">
            <div class="mobile-card-header">
                <span class="material-symbols-outlined mobile-card-chevron">chevron_right</span>
                <div class="mobile-card-info">
                    <div class="mobile-card-name">${repo.full_name}</div>
                    <div class="mobile-card-meta">
                        <span>${formatStars(repo.stars)}</span>
                        <span class="badge">${repo.category || '-'}</span>
                        ${statusBadge(repo.status)}
                    </div>
                </div>
                <div class="mobile-card-score ${scoreClass(repo.relevance_score)}">${repo.relevance_score}</div>
            </div>
            ${isExpanded ? renderMobileCardBody(repo) : '<div class="mobile-card-body"></div>'}
        </div>`;
    });
    container.innerHTML = html;
    bindMobileCardEvents();
}

function renderMobileCardBody(repo) {
    return `<div class="mobile-card-body" style="display:block">
        <div class="mobile-card-section">
            <div class="mobile-card-section-title">Review</div>
            <p class="detail-text">${repo.summary_ru || 'No review available'}</p>
        </div>
        <div class="mobile-card-section">
            <div class="mobile-card-section-title">Application</div>
            <div class="detail-app">${repo.application || '-'}</div>
        </div>
        <div class="mobile-card-section">
            <div class="mobile-card-section-title">Limitations</div>
            <div class="detail-app" style="color:var(--text-secondary)">${repo.limitations || '-'}</div>
        </div>
        <div class="mobile-card-section">
            <div class="mobile-card-section-title">My Notes</div>
            <textarea class="notes-textarea" data-repo="${repo.full_name}" placeholder="Add your notes..." style="min-height:60px;border:1px solid var(--border);border-radius:4px;background:var(--surface-low)">${repo.my_notes || ''}</textarea>
        </div>
        <div class="mobile-card-actions">
            <select class="detail-status-select" data-repo="${repo.full_name}">
                ${['new','watch','skip','integrated'].map(s =>
                    `<option value="${s}" ${repo.status === s ? 'selected' : ''}>${s.toUpperCase()}</option>`
                ).join('')}
            </select>
            ${starsHTML(repo.my_rating, repo.full_name)}
            <a class="btn-github" href="${repo.url || 'https://github.com/' + repo.full_name}" target="_blank" rel="noopener">
                <span class="material-symbols-outlined" style="font-size:14px">open_in_new</span>
                GitHub
            </a>
        </div>
    </div>`;
}

// ============================================================
// Events
// ============================================================

function bindEvents() {
    // Auth
    $('btn-signin').addEventListener('click', signIn);

    // Sheet picker
    $('btn-connect-sheet').addEventListener('click', () => {
        const val = $('input-sheet-id').value.trim();
        if (val) connectSheet(val);
    });

    $('input-sheet-id').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = $('input-sheet-id').value.trim();
            if (val) connectSheet(val);
        }
    });

    $('btn-pick-sheet').addEventListener('click', loadDriveSpreadsheets);
    $('btn-drive-close').addEventListener('click', () => $('drive-list').classList.add('hidden'));

    $('btn-signout-sheet').addEventListener('click', signOut);

    // Theme
    $('btn-theme').addEventListener('click', toggleTheme);

    // Nav
    $('btn-switch-sheet').addEventListener('click', () => {
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        showSheetPicker();
    });
    $('btn-signout').addEventListener('click', signOut);

    // Mobile nav
    $('btn-menu-toggle').addEventListener('click', () => {
        $('mobile-menu').classList.toggle('hidden');
    });
    $('btn-switch-sheet-mobile').addEventListener('click', () => {
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        showSheetPicker();
    });
    $('btn-signout-mobile').addEventListener('click', signOut);

    // Multiselect init
    initMultiselects();

    // Mobile sort
    $('mobile-sort').addEventListener('change', (e) => {
        const [col, dir] = e.target.value.split(':');
        state.sortCol = col;
        state.sortDir = dir;
        renderAll();
    });

    // Search (debounced)
    let searchTimer;
    $('filter-search').addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.searchQuery = e.target.value;
            renderAll();
        }, 200);
    });

    // Sort
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (state.sortCol === col) {
                state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortCol = col;
                state.sortDir = (col === 'full_name' || col === 'category') ? 'asc' : 'desc';
            }
            renderAll();
        });
    });
}

function bindTableEvents() {
    // Row expand/collapse
    document.querySelectorAll('tr.repo-row').forEach(tr => {
        tr.addEventListener('click', (e) => {
            // Don't toggle if clicking a link or button
            if (e.target.closest('a') || e.target.closest('button')) return;
            const repo = tr.dataset.repo;
            state.expandedRow = state.expandedRow === repo ? null : repo;
            renderAll();
        });
    });

    // Star rating
    document.querySelectorAll('.star-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const repo = btn.dataset.repo;
            const rating = parseInt(btn.dataset.rating, 10);
            saveNote(repo, 'my_rating', rating);
            renderAll();
        });
    });

    // Status select
    document.querySelectorAll('.detail-status-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            e.stopPropagation();
            saveNote(sel.dataset.repo, 'status', e.target.value);
            renderAll();
        });
        sel.addEventListener('click', (e) => e.stopPropagation());
    });

    // Notes textarea
    document.querySelectorAll('.notes-textarea').forEach(ta => {
        ta.addEventListener('blur', () => {
            saveNote(ta.dataset.repo, 'my_notes', ta.value);
        });
        ta.addEventListener('click', (e) => e.stopPropagation());
        ta.addEventListener('keydown', (e) => e.stopPropagation());
    });
}

function bindMobileCardEvents() {
    // Card expand/collapse
    document.querySelectorAll('.mobile-card-header').forEach(header => {
        header.addEventListener('click', () => {
            const card = header.closest('.mobile-card');
            const repo = card.dataset.repo;
            state.expandedRow = state.expandedRow === repo ? null : repo;
            renderAll();
        });
    });

    // Star rating (mobile)
    document.querySelectorAll('.mobile-card .star-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            saveNote(btn.dataset.repo, 'my_rating', parseInt(btn.dataset.rating, 10));
            renderAll();
        });
    });

    // Status select (mobile)
    document.querySelectorAll('.mobile-card .detail-status-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            e.stopPropagation();
            saveNote(sel.dataset.repo, 'status', e.target.value);
        });
    });

    // Notes textarea (mobile)
    document.querySelectorAll('.mobile-card .notes-textarea').forEach(ta => {
        ta.addEventListener('blur', () => {
            saveNote(ta.dataset.repo, 'my_notes', ta.value);
        });
    });
}

// ============================================================
// GitHub API — Pipeline Control
// ============================================================

const GITHUB = {
    OWNER: 'ant0art',
    REPO: 'playables-research',
    API: 'https://api.github.com',
    WORKFLOW: 'daily-research.yml',
    PAT_KEY: 'pr_github_pat',
};

function getGitHubPAT() { return localStorage.getItem(GITHUB.PAT_KEY) || ''; }
function storeGitHubPAT(pat) { localStorage.setItem(GITHUB.PAT_KEY, pat); }

async function ghApi(path, options = {}) {
    const pat = getGitHubPAT();
    if (!pat) throw new Error('GitHub PAT not configured');
    const res = await fetch(`${GITHUB.API}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${pat}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    if (res.status === 204) return null;
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
    }
    return res.json();
}

async function ghGetVariable(name) {
    try {
        const d = await ghApi(`/repos/${GITHUB.OWNER}/${GITHUB.REPO}/actions/variables/${name}`);
        return d.value;
    } catch (e) {
        if (e.message.includes('404') || e.message.includes('Not Found')) return null;
        throw e;
    }
}

async function ghSetVariable(name, value) {
    try {
        await ghApi(`/repos/${GITHUB.OWNER}/${GITHUB.REPO}/actions/variables/${name}`, {
            method: 'PATCH',
            body: JSON.stringify({ value: String(value) }),
        });
    } catch (e) {
        if (e.message.includes('404') || e.message.includes('Not Found')) {
            await ghApi(`/repos/${GITHUB.OWNER}/${GITHUB.REPO}/actions/variables`, {
                method: 'POST',
                body: JSON.stringify({ name, value: String(value) }),
            });
        } else {
            throw e;
        }
    }
}

async function ghTriggerWorkflow() {
    await ghApi(`/repos/${GITHUB.OWNER}/${GITHUB.REPO}/actions/workflows/${GITHUB.WORKFLOW}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref: 'main' }),
    });
}

async function ghGetLatestRun() {
    const d = await ghApi(`/repos/${GITHUB.OWNER}/${GITHUB.REPO}/actions/workflows/${GITHUB.WORKFLOW}/runs?per_page=5&branch=main`);
    // Find the first non-skipped run (gate job may cause skips)
    const runs = d.workflow_runs || [];
    return runs.find(r => r.conclusion !== 'skipped') || runs[0] || null;
}

async function ghVerifyUser() {
    return ghApi('/user');
}

// ============================================================
// Settings Panel
// ============================================================

function initSettingsHourOptions() {
    const sel = $('select-schedule-hour');
    if (sel.children.length > 0) return;
    for (let h = 0; h < 24; h++) {
        const opt = document.createElement('option');
        opt.value = h;
        opt.textContent = String(h).padStart(2, '0');
        sel.appendChild(opt);
    }
}

function utcHourToLocal(utcHour) {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), utcHour, 0, 0));
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function updateLocalTimeLabel(utcHour) {
    const startLocal = utcHourToLocal(utcHour);
    const endLocal = utcHourToLocal((utcHour + 1) % 24);
    $('local-time-display').textContent = `≈ ${startLocal}–${endLocal} local time`;
}

function setScheduleStatusText(enabled) {
    const el = $('schedule-status-text');
    el.textContent = enabled ? 'Active' : 'Paused';
    el.className = `schedule-status ${enabled ? 'active' : 'paused'}`;
}

function setStatusMsg(id, msg, type) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.className = `settings-status ${type || ''}`;
}

function timeAgo(date) {
    const ms = Date.now() - date.getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

async function openSettings() {
    $('settings-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    initSettingsHourOptions();

    const pat = getGitHubPAT();
    $('input-github-pat').value = pat ? '•'.repeat(20) : '';

    if (pat) {
        await loadSettingsData();
    } else {
        setStatusMsg('pat-status', '⚠️ Enter a GitHub PAT with repo scope', 'warning');
    }
}

function closeSettings() {
    $('settings-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

async function loadSettingsData() {
    setStatusMsg('pat-status', 'Connecting…', 'loading');
    setStatusMsg('schedule-status', '', '');
    $('last-run-info').textContent = '';

    try {
        const [user, hourStr, enabledStr, lastRun] = await Promise.all([
            ghVerifyUser(),
            ghGetVariable('RESEARCH_HOUR_UTC').catch(() => null),
            ghGetVariable('RESEARCH_ENABLED').catch(() => null),
            ghGetLatestRun().catch(() => null),
        ]);

        // PAT status
        setStatusMsg('pat-status', `✅ Connected · ${user.login}`, 'success');

        // Schedule hour
        const hour = hourStr !== null ? parseInt(hourStr, 10) : 0;
        $('select-schedule-hour').value = hour;
        updateLocalTimeLabel(hour);

        // Schedule enabled
        const enabled = enabledStr !== 'false';
        $('toggle-schedule-enabled').checked = enabled;
        setScheduleStatusText(enabled);

        // Store loaded values for dirty tracking
        state._scheduleHour = hour;
        state._scheduleEnabled = enabled;
        $('btn-save-schedule').classList.add('hidden');

        // Last run
        if (lastRun) {
            const status = lastRun.conclusion || lastRun.status;
            const icon = status === 'success' ? '✅' : status === 'failure' ? '❌' : status === 'in_progress' ? '⏳' : '⚪';
            const when = timeAgo(new Date(lastRun.created_at));
            $('last-run-info').textContent = `${icon} ${status} · ${when}`;
        }
    } catch (e) {
        setStatusMsg('pat-status', `❌ ${e.message}`, 'error');
    }
}

async function savePATFromInput() {
    const input = $('input-github-pat');
    const val = input.value.trim();
    if (!val || val.includes('•')) return;

    storeGitHubPAT(val);
    input.value = '•'.repeat(20);
    input.type = 'password';

    try {
        setStatusMsg('pat-status', 'Verifying…', 'loading');
        const user = await ghVerifyUser();
        setStatusMsg('pat-status', `✅ Connected · ${user.login}`, 'success');
        await loadSettingsData();
    } catch (e) {
        setStatusMsg('pat-status', `❌ Invalid token: ${e.message}`, 'error');
        localStorage.removeItem(GITHUB.PAT_KEY);
    }
}

function onScheduleChanged() {
    // Update local preview only
    const hour = parseInt($('select-schedule-hour').value, 10);
    updateLocalTimeLabel(hour);
    setScheduleStatusText($('toggle-schedule-enabled').checked);

    // Show save button if anything changed from loaded state
    const hourDirty = hour !== (state._scheduleHour ?? 0);
    const enabledDirty = $('toggle-schedule-enabled').checked !== (state._scheduleEnabled ?? true);
    $('btn-save-schedule').classList.toggle('hidden', !hourDirty && !enabledDirty);
    setStatusMsg('schedule-status', '', '');
}

async function saveScheduleSettings() {
    const hour = parseInt($('select-schedule-hour').value, 10);
    const enabled = $('toggle-schedule-enabled').checked;
    const btn = $('btn-save-schedule');

    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined spinning">progress_activity</span> Saving…';
    setStatusMsg('schedule-status', '', '');

    try {
        await Promise.all([
            ghSetVariable('RESEARCH_HOUR_UTC', String(hour)),
            ghSetVariable('RESEARCH_ENABLED', String(enabled)),
        ]);

        // Update stored state
        state._scheduleHour = hour;
        state._scheduleEnabled = enabled;

        btn.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Saved!';
        setTimeout(() => {
            btn.classList.add('hidden');
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined">save</span> Save Schedule';
        }, 1500);
    } catch (e) {
        setStatusMsg('schedule-status', `❌ ${e.message}`, 'error');
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined">save</span> Save Schedule';
    }
}

async function runResearchNow() {
    const btn = $('btn-run-now');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined spinning">progress_activity</span> Starting…';

    try {
        await ghTriggerWorkflow();
        btn.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Triggered!';
        $('last-run-info').textContent = '⏳ queued · just now';
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span> Run Research Now';
        }, 3000);
    } catch (e) {
        btn.innerHTML = `<span class="material-symbols-outlined">error</span> ${e.message}`;
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span> Run Research Now';
        }, 3000);
    }
}

// ============================================================
// Settings Event Bindings
// ============================================================

function bindSettingsEvents() {
    // Open/close
    $('btn-settings').addEventListener('click', openSettings);
    $('btn-settings-mobile').addEventListener('click', () => {
        $('mobile-menu').classList.add('hidden');
        openSettings();
    });
    $('btn-close-settings').addEventListener('click', closeSettings);
    $('settings-modal').addEventListener('click', (e) => {
        if (e.target === $('settings-modal')) closeSettings();
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !$('settings-modal').classList.contains('hidden')) {
            closeSettings();
        }
    });

    // PAT
    $('btn-save-pat').addEventListener('click', savePATFromInput);
    $('input-github-pat').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') savePATFromInput();
    });
    // Clear placeholder on focus
    $('input-github-pat').addEventListener('focus', () => {
        const input = $('input-github-pat');
        if (input.value.includes('•')) {
            input.value = '';
            input.type = 'text';
        }
    });
    $('input-github-pat').addEventListener('blur', () => {
        const input = $('input-github-pat');
        if (!input.value && getGitHubPAT()) {
            input.value = '•'.repeat(20);
            input.type = 'password';
        }
    });

    // Schedule — preview on change, save on button click
    $('select-schedule-hour').addEventListener('change', onScheduleChanged);
    $('toggle-schedule-enabled').addEventListener('change', onScheduleChanged);
    $('btn-save-schedule').addEventListener('click', saveScheduleSettings);

    // Run now
    $('btn-run-now').addEventListener('click', runResearchNow);
}

