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
    REPOS_HEADERS: ['full_name','url','stars','language','category','relevance_score','summary_ru','application','limitations','integration_effort','worth_tracking','found_date','recommendation','bundle_impact','code_quality_score','architecture_summary'],
    NOTES_HEADERS: ['full_name','my_rating','status','my_notes','reviewed_at','flags'],
    // Deep analysis tab — written by the import control, schema: playables-deep-eval/schema/deep-row.schema.json
    DEEP_HEADERS: ['full_name','url','target','gate_stack_fit','gate_health','license','ax_dev_speed','ax_quality','ax_dx','ax_bundle','value','effort_days','verdict','one_liner','what_it_gives','integration_notes','evidence','commit_sha','rubric_version','model_version','analyzed_at'],
};

// Available flags (multi-value per repo, stored CSV in MyNotes.flags)
const FLAG_VALUES = ['deep', 'reeval', 'brainstorm', 'draft', 'quick-win'];

// Sortable columns definition: col key -> { i18nKey, defaultDir }
const SORTABLE_COLS = {
    full_name:         { i18nKey: 'th_name',     defaultDir: 'asc'  },
    stars:             { i18nKey: 'th_stars',    defaultDir: 'desc' },
    category:          { i18nKey: 'th_category', defaultDir: 'asc'  },
    relevance_score:   { i18nKey: 'th_score',    defaultDir: 'desc' },
    verdict:           { i18nKey: 'th_verdict',  defaultDir: 'asc'  },
    my_rating:         { i18nKey: 'th_rating',   defaultDir: 'desc' },
    status:            { i18nKey: 'th_status',   defaultDir: 'asc'  },
    integration_effort:{ i18nKey: 'th_effort',   defaultDir: 'asc'  },
};

// --- State ---
let state = {
    token: null,
    user: null,
    sheetId: null,
    repos: [],
    notes: {},       // keyed by full_name
    deep: {},        // deep-eval rows keyed by full_name
    sortRules: JSON.parse(localStorage.getItem('pr_sort') || '[{"col":"stars","dir":"desc"}]'),
    filters: JSON.parse(localStorage.getItem('pr_filters') || '{}'),
    searchQuery: '',
    expandedRow: null,
};

// --- Drafts & autosave ---
const _saveTimers = {};  // debounce timers keyed by repoName
const DRAFT_PREFIX = 'pr_draft_';
const SAVE_DEBOUNCE_MS = 2000;

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

// --- i18n ---
const I18N = {
    en: {
        // Auth
        auth_description: 'GitHub repository research dashboard for playable ads development',
        auth_signin: 'Sign in with Google',
        // Sheet picker
        sheet_connect: 'Connect a Sheet',
        sheet_choose: 'Choose from Drive',
        sheet_choose_desc: 'Select an existing spreadsheet',
        sheet_paste: 'Paste Sheet URL or ID',
        sheet_btn_connect: 'Connect',
        sheet_your: 'Your Spreadsheets',
        sheet_loading: 'Loading...',
        sheet_signout: 'Sign out',
        // Nav
        nav_switch: 'Switch Sheet',
        nav_signout: 'Sign out',
        // Mobile menu
        menu_settings: 'Pipeline Settings',
        menu_switch: 'Switch Sheet',
        menu_signout: 'Sign out',
        // Settings
        settings_title: 'Pipeline Settings',
        settings_github: 'GitHub Connection',
        settings_pat: 'Personal Access Token',
        settings_schedule: 'Schedule',
        settings_active: 'Active',
        settings_paused: 'Paused',
        settings_daily: 'Daily at',
        settings_save_schedule: 'Save Schedule',
        settings_manual: 'Manual Run',
        settings_run: 'Run Research Now',
        // Filters
        filters_label: 'FILTERS',
        filter_category: 'Category',
        filter_language: 'Language',
        filter_status: 'Status',
        filter_effort: 'Effort',
        filter_search: 'Search repos...',
        // Mobile sort
        sort_stars: '★ Stars ↓',
        sort_score: 'Score ↓',
        sort_rating: 'Rating ↓',
        sort_name: 'Name A-Z',
        sort_status: 'Status',
        // Sort configurator
        sort_label: 'SORT',
        sort_add: '+ Add sort level',
        sort_clear: 'Clear all',
        sort_shift_hint: 'Shift+Click to add sort levels',
        // Table headers
        th_name: 'Name',
        th_stars: 'Stars',
        th_category: 'Category',
        th_score: 'Score',
        th_verdict: 'Verdict',
        th_rating: 'My Rating',
        th_status: 'Status',
        th_effort: 'Effort',
        // Stats
        stat_repos: 'repos',
        stat_shown: 'shown',
        stat_watched: 'watched',
        // Detail panel
        detail_review: 'Review',
        detail_no_review: 'No review available',
        detail_application: 'Application',
        detail_limitations: 'Limitations',
        detail_notes: 'My Notes',
        detail_notes_placeholder: 'Add your notes...',
        detail_github: 'View on GitHub',
        // Code analysis
        ca_title: 'Deep Code Analysis',
        ca_recommendation: 'Recommendation',
        ca_bundle: 'Bundle Impact',
        ca_quality: 'Code Quality',
        ca_architecture: 'Architecture',
        // Deep eval
        de_title: 'Deep Evaluation',
        de_verdict: 'Verdict',
        de_value: 'Value',
        de_effort: 'Effort',
        de_days: 'd',
        de_ax_speed: 'Dev speed',
        de_ax_quality: 'Quality',
        de_ax_dx: 'DX',
        de_ax_bundle: 'Bundle',
        de_what: 'What it gives',
        de_plan: 'Integration plan',
        filter_flags: 'Flags',
        filter_verdict: 'Verdict',
        sort_verdict: 'Verdict',
        // Verdict display names
        verdict_do_now: 'Do now',
        verdict_pilot: 'Pilot — needs proof-of-concept spike before full integration',
        verdict_quick_win: 'Quick win',
        verdict_backlog: 'Backlog',
        verdict_reject: 'Reject',
        verdict_queued: 'In queue',
        verdict_none: 'No eval',
        verdict_override: 'manually set',
        // Tooltips
        tip_effort: 'Estimated integration complexity: low (drop-in), medium (some adaptation), high (major rework)',
        tip_verdict: 'Deep evaluation verdict based on value × effort matrix. DO_NOW = high value, low effort. PILOT = high value, high effort (needs spike). BACKLOG = moderate priority. REJECT = not worth pursuing.',
        tip_score: 'Automated relevance score (0-100) from the research pipeline. Higher = more relevant to our playable ads stack.',
        stab_pipeline: 'Pipeline',
        stab_github: 'GitHub',
        stab_deep: 'Deep Eval',
        deep_export: 'Deep Queue Export',
        deep_export_btn: 'Export eval queue (.json)',
        deep_export_clipboard: 'Copy to clipboard',
        deep_export_stats: (total, done, queue) => `${total} deep-flagged · ${done} evaluated · ${queue} in queue`,
        deep_import: 'Deep Analysis Import',
        deep_import_file_btn: 'Select .json file',
        deep_import_or: 'or paste JSON below',
        deep_import_hint: 'Paste deep-eval JSON (one object or an array)',
        deep_import_btn: 'Import to Deep tab',
        // Flag Export
        stab_export: 'Export',
        flag_export_title: 'Export by Flag',
        flag_export_select: 'Select flag',
        flag_export_btn: 'Download .json',
        flag_export_clipboard: 'Copy to clipboard',
        flag_export_md: 'Download .md',
        flag_export_stats: (count, flag) => `${count} repos with flag "${flag}"`,
        flag_export_empty: 'No repos with this flag',
        flag_export_all: 'Export current view',
        flag_export_all_desc: 'Export all currently filtered repos',
        // Empty / Loading
        empty_text: 'No repositories found',
        loading_text: 'Loading data from Google Sheets...',
        // Mobile
        mobile_github: 'GitHub',
    },
    ru: {
        auth_description: 'Панель исследования GitHub-репозиториев для разработки playable ads',
        auth_signin: 'Войти через Google',
        sheet_connect: 'Подключить таблицу',
        sheet_choose: 'Выбрать из Drive',
        sheet_choose_desc: 'Выберите существующую таблицу',
        sheet_paste: 'Вставьте URL или ID таблицы',
        sheet_btn_connect: 'Подключить',
        sheet_your: 'Ваши таблицы',
        sheet_loading: 'Загрузка...',
        sheet_signout: 'Выйти',
        nav_switch: 'Сменить таблицу',
        nav_signout: 'Выйти',
        menu_settings: 'Настройки пайплайна',
        menu_switch: 'Сменить таблицу',
        menu_signout: 'Выйти',
        settings_title: 'Настройки пайплайна',
        settings_github: 'GitHub подключение',
        settings_pat: 'Personal Access Token',
        settings_schedule: 'Расписание',
        settings_active: 'Активно',
        settings_paused: 'На паузе',
        settings_daily: 'Ежедневно в',
        settings_save_schedule: 'Сохранить расписание',
        settings_manual: 'Ручной запуск',
        settings_run: 'Запустить исследование',
        filters_label: 'ФИЛЬТРЫ',
        filter_category: 'Категория',
        filter_language: 'Язык',
        filter_status: 'Статус',
        filter_effort: 'Сложность',
        filter_search: 'Поиск репо...',
        sort_stars: '★ Звёзды ↓',
        sort_score: 'Оценка ↓',
        sort_rating: 'Рейтинг ↓',
        sort_name: 'Имя A-Z',
        sort_status: 'Статус',
        sort_label: 'СОРТ.',
        sort_add: '+ Добавить уровень',
        sort_clear: 'Сбросить',
        sort_shift_hint: 'Shift+Click для добавления уровней',
        th_name: 'Название',
        th_stars: 'Звёзды',
        th_category: 'Категория',
        th_score: 'Оценка',
        th_verdict: 'Вердикт',
        th_rating: 'Мой рейтинг',
        th_status: 'Статус',
        th_effort: 'Сложность',
        stat_repos: 'репо',
        stat_shown: 'показано',
        stat_watched: 'отслеж.',
        detail_review: 'Обзор',
        detail_no_review: 'Обзор отсутствует',
        detail_application: 'Применение',
        detail_limitations: 'Ограничения',
        detail_notes: 'Мои заметки',
        detail_notes_placeholder: 'Добавьте заметки...',
        detail_github: 'На GitHub',
        ca_title: 'Глубокий анализ кода',
        ca_recommendation: 'Рекомендация',
        ca_bundle: 'Влияние на бандл',
        ca_quality: 'Качество кода',
        ca_architecture: 'Архитектура',
        de_title: 'Глубокая оценка',
        de_verdict: 'Вердикт',
        de_value: 'Ценность',
        de_effort: 'Усилие',
        de_days: 'д',
        de_ax_speed: 'Скорость',
        de_ax_quality: 'Качество',
        de_ax_dx: 'DX',
        de_ax_bundle: 'Бандл',
        de_what: 'Что даёт',
        de_plan: 'План интеграции',
        filter_flags: 'Флаги',
        filter_verdict: 'Вердикт',
        sort_verdict: 'Вердикт',
        // Verdict display names
        verdict_do_now: 'Делать сейчас',
        verdict_pilot: 'Пилот — нужен proof-of-concept перед полной интеграцией',
        verdict_quick_win: 'Быстрая победа',
        verdict_backlog: 'Бэклог',
        verdict_reject: 'Отклонить',
        verdict_queued: 'В очереди',
        verdict_none: 'Без оценки',
        verdict_override: 'задано вручную',
        // Tooltips
        tip_effort: 'Оценка сложности интеграции: low (готово из коробки), medium (нужна адаптация), high (серьёзная переработка)',
        tip_verdict: 'Вердикт глубокой оценки по матрице ценность × усилие. DO_NOW = высокая ценность, малое усилие. PILOT = высокая ценность, большое усилие (нужен спайк). BACKLOG = умеренный приоритет. REJECT = не стоит внедрять.',
        tip_score: 'Автоматическая оценка релевантности (0-100) от пайплайна. Чем выше — тем больше подходит для нашего стека playable ads.',
        stab_pipeline: 'Пайплайн',
        stab_github: 'GitHub',
        stab_deep: 'Глубокая оценка',
        deep_export: 'Экспорт очереди Deep',
        deep_export_btn: 'Скачать очередь (.json)',
        deep_export_clipboard: 'Скопировать в буфер',
        deep_export_stats: (total, done, queue) => `${total} с флагом deep · ${done} оценено · ${queue} в очереди`,
        deep_import: 'Импорт глубокой оценки',
        deep_import_file_btn: 'Выбрать файл .json',
        deep_import_or: 'или вставь JSON вручную',
        deep_import_hint: 'Вставь JSON оценки (объект или массив)',
        deep_import_btn: 'Импорт в таб Deep',
        // Flag Export
        stab_export: 'Экспорт',
        flag_export_title: 'Экспорт по флагу',
        flag_export_select: 'Выберите флаг',
        flag_export_btn: 'Скачать .json',
        flag_export_clipboard: 'Скопировать в буфер',
        flag_export_md: 'Скачать .md',
        flag_export_stats: (count, flag) => `${count} репо с флагом "${flag}"`,
        flag_export_empty: 'Нет репо с этим флагом',
        flag_export_all: 'Экспорт текущего вида',
        flag_export_all_desc: 'Экспорт всех отфильтрованных репо',
        empty_text: 'Репозитории не найдены',
        loading_text: 'Загрузка данных из Google Sheets...',
        mobile_github: 'GitHub',
    }
};

let currentLang = localStorage.getItem('pr_lang') || 'en';

function t(key) {
    return (I18N[currentLang] || I18N.en)[key] || I18N.en[key] || key;
}

function initLang() {
    applyLang(currentLang);
}

function applyLang(lang) {
    currentLang = lang;
    localStorage.setItem('pr_lang', lang);

    // Update html lang attribute
    document.documentElement.lang = lang;

    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });

    // Update lang toggle button
    const langBtn = $('btn-lang');
    if (langBtn) {
        langBtn.textContent = lang === 'ru' ? 'EN' : 'RU';
        langBtn.title = lang === 'ru' ? 'Switch to English' : 'Переключить на русский';
    }

    // Re-render dynamic content if dashboard is visible
    if (!$('dashboard-screen').classList.contains('hidden')) {
        renderAll();
    }
}

function toggleLang() {
    applyLang(currentLang === 'en' ? 'ru' : 'en');
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initLang();
    loadGoogleIdentity();
    bindEvents();
    bindSettingsEvents();
    initTooltips();
    applyTooltipAttributes();
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
        const stored = localStorage.getItem('pr_token');
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
                localStorage.setItem('pr_token', response.access_token);
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
    localStorage.removeItem('pr_token');
    showAuth();
}

// Silent re-auth: try to get a new token without user interaction
let _silentAuthPromise = null;
function silentReAuth() {
    if (_silentAuthPromise) return _silentAuthPromise;
    _silentAuthPromise = new Promise((resolve, reject) => {
        try {
            const client = google.accounts.oauth2.initTokenClient({
                client_id: CONFIG.CLIENT_ID,
                scope: CONFIG.SCOPES,
                prompt: '',
                callback: (response) => {
                    _silentAuthPromise = null;
                    if (response.error || !response.access_token) {
                        reject(new Error(response.error_description || response.error || 'Silent auth failed'));
                        return;
                    }
                    state.token = response.access_token;
                    localStorage.setItem('pr_token', response.access_token);
                    resolve(response.access_token);
                },
                error_callback: (err) => {
                    _silentAuthPromise = null;
                    reject(err);
                },
            });
            client.requestAccessToken();
        } catch (e) {
            _silentAuthPromise = null;
            reject(e);
        }
    });
    return _silentAuthPromise;
}

// Handle expired token: save drafts, try silent re-auth, show banner on failure
async function handleTokenExpired() {
    // Save all open textarea drafts immediately
    document.querySelectorAll('.notes-textarea').forEach(ta => {
        if (ta.value) {
            localStorage.setItem(DRAFT_PREFIX + ta.dataset.repo, ta.value);
        }
    });

    try {
        await silentReAuth();
        hideSessionBanner();
        return true;
    } catch {
        showSessionBanner();
        return false;
    }
}

function showSessionBanner() {
    let banner = document.getElementById('session-banner');
    if (banner) return;
    banner = document.createElement('div');
    banner.id = 'session-banner';
    banner.innerHTML = `
        <span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle">warning</span>
        <span data-i18n="session_expired">${currentLang === 'ru' ? 'Сессия истекла.' : 'Session expired.'}</span>
        <button id="btn-reauth" style="margin-left:8px;padding:4px 12px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-size:13px">
            ${currentLang === 'ru' ? 'Войти снова' : 'Sign in again'}
        </button>
        <button id="btn-banner-close" style="margin-left:auto;background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:18px">&times;</button>
    `;
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10000;display:flex;align-items:center;gap:8px;padding:10px 16px;background:var(--surface);border-bottom:2px solid var(--accent);font-size:14px;color:var(--text-primary);box-shadow:0 2px 8px rgba(0,0,0,.15)';
    document.body.prepend(banner);
    document.getElementById('btn-reauth').addEventListener('click', () => {
        hideSessionBanner();
        signIn();
    });
    document.getElementById('btn-banner-close').addEventListener('click', hideSessionBanner);
}

function hideSessionBanner() {
    const banner = document.getElementById('session-banner');
    if (banner) banner.remove();
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

async function sheetsRequest(path, options = {}, _retried = false) {
    const url = `${CONFIG.SHEETS_API}/${state.sheetId}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${state.token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    if (res.status === 401 && !_retried) {
        const ok = await handleTokenExpired();
        if (ok) return sheetsRequest(path, options, true);
        throw new Error('Token expired — please sign in again');
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error ${res.status}`);
    }
    return res.json();
}

async function driveRequest(path, options = {}, _retried = false) {
    const url = `${CONFIG.DRIVE_API}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${state.token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    if (res.status === 401 && !_retried) {
        const ok = await handleTokenExpired();
        if (ok) return driveRequest(path, options, true);
        throw new Error('Token expired — please sign in again');
    }
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
        const data = await sheetsRequest('/values:batchGet?ranges=Repos!A1:P1000&ranges=MyNotes!A1:F1000');
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
                obj.code_quality_score = parseInt(obj.code_quality_score, 10) || 0;
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

        // Parse Deep (separate request — tab may not exist yet, must not break main load)
        state.deep = {};
        try {
            const deepData = await sheetsRequest('/values/Deep!A1:U1000');
            const deepRaw = deepData.values || [];
            if (deepRaw.length > 1) {
                const headers = deepRaw[0];
                deepRaw.slice(1).forEach(row => {
                    const obj = {};
                    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
                    if (!obj.full_name) return;
                    ['ax_dev_speed','ax_quality','ax_dx','ax_bundle','value','rubric_version'].forEach(k => { obj[k] = parseInt(obj[k], 10) || 0; });
                    obj.effort_days = parseFloat(obj.effort_days) || 0;
                    try { obj.evidence = obj.evidence ? JSON.parse(obj.evidence) : []; } catch { obj.evidence = []; }
                    // Track original verdict for restore functionality
                    obj._original_verdict = obj.verdict || '';
                    state.deep[obj.full_name] = obj;
                });
            }
        } catch (e) {
            // Deep tab absent — fine, panel falls back to legacy Repos fields
            console.info('Deep tab not loaded (may not exist yet):', e.message);
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
        state.notes[fullName] = { full_name: fullName, my_rating: 0, status: '', my_notes: '', reviewed_at: '', flags: '' };
    }
    state.notes[fullName][field] = value;
    state.notes[fullName].reviewed_at = new Date().toISOString().split('T')[0];

    // Update save indicator
    setSaveStatus(fullName, 'saving');

    // Rebuild the entire MyNotes sheet (simpler than finding the row)
    const rows = [CONFIG.NOTES_HEADERS];
    Object.values(state.notes).forEach(n => {
        rows.push(CONFIG.NOTES_HEADERS.map(h => String(n[h] ?? '')));
    });

    try {
        await sheetsRequest('/values/MyNotes!A1:F1000?valueInputOption=USER_ENTERED', {
            method: 'PUT',
            body: JSON.stringify({ range: 'MyNotes!A1:F1000', values: rows }),
        });
        // Clear draft on successful save
        localStorage.removeItem(DRAFT_PREFIX + fullName);
        setSaveStatus(fullName, 'saved');
    } catch (e) {
        console.error('Failed to save note:', e);
        setSaveStatus(fullName, 'error');
    }
}

// Save status indicator for notes textarea
function setSaveStatus(fullName, status) {
    document.querySelectorAll(`.notes-save-status[data-repo="${fullName}"]`).forEach(el => {
        const labels = currentLang === 'ru'
            ? { saving: 'Сохранение...', saved: '✓ Сохранено', error: '✗ Не сохранено', draft: 'Черновик' }
            : { saving: 'Saving...', saved: '✓ Saved', error: '✗ Not saved', draft: 'Draft' };
        el.textContent = labels[status] || '';
        el.className = `notes-save-status notes-save-${status}`;
        el.setAttribute('data-repo', fullName);
    });
}

// Get draft value from localStorage, or null
function getDraft(fullName) {
    return localStorage.getItem(DRAFT_PREFIX + fullName);
}

// Save draft to localStorage (called on every input)
function saveDraft(fullName, value) {
    localStorage.setItem(DRAFT_PREFIX + fullName, value);
}

// ============================================================
// Filtering & Sorting
// ============================================================

// Parse the CSV flags string into a clean array
function parseFlags(csv) {
    return (csv || '').split(',').map(s => s.trim()).filter(Boolean);
}

// Verdict ordering for sort (lower = higher priority)
const VERDICT_ORDER = { DO_NOW: 1, PILOT: 2, QUICK_WIN: 3, BACKLOG: 4, REJECT: 5 };
const VERDICT_VALUES = ['DO_NOW', 'PILOT', 'QUICK_WIN', 'BACKLOG', 'REJECT'];

function verdictSortValue(v) {
    if (!v) return 99;
    return VERDICT_ORDER[v] || 98;
}

function verdictBadgeClass(v) {
    if (!v) return 'verdict-none';
    const map = {
        DO_NOW: 'verdict-do-now',
        PILOT: 'verdict-pilot',
        QUICK_WIN: 'verdict-quick-win',
        BACKLOG: 'verdict-backlog',
        REJECT: 'verdict-reject',
    };
    return map[v] || 'verdict-none';
}

function verdictLabel(v) {
    if (!v) return '—';
    const map = {
        DO_NOW: '✅ Do now',
        PILOT: '🧪 Pilot',
        QUICK_WIN: '⚡ Quick win',
        BACKLOG: '📌 Backlog',
        REJECT: '🔴 Reject',
    };
    return map[v] || v;
}

// Returns verdict badge HTML for table cell
function verdictBadgeHTML(repo) {
    const d = repo.deep;
    if (d && d.verdict) {
        return `<span class="verdict-badge ${verdictBadgeClass(d.verdict)}">${verdictLabel(d.verdict)}</span>`;
    }
    // Deep-flagged but not yet evaluated
    if (repo.flags && repo.flags.includes('deep')) {
        return `<span class="verdict-badge verdict-queued">⏳</span>`;
    }
    return `<span class="verdict-badge verdict-none">—</span>`;
}

function getFilteredRepos() {
    let repos = [...state.repos];

    // Merge notes + deep-eval into repos for display
    repos = repos.map(r => ({
        ...r,
        my_rating: state.notes[r.full_name]?.my_rating || 0,
        status: state.notes[r.full_name]?.status || 'new',
        my_notes: state.notes[r.full_name]?.my_notes || '',
        flags: parseFlags(state.notes[r.full_name]?.flags),
        deep: state.deep[r.full_name] || null,
        verdict: state.deep[r.full_name]?.verdict || '',
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
    // Flags — multi-value per repo: match if any selected flag is present
    if (state.filters.flags && state.filters.flags.length) {
        repos = repos.filter(r => state.filters.flags.some(f => r.flags.includes(f)));
    }
    // Verdict filter
    if (state.filters.verdict && state.filters.verdict.length) {
        repos = repos.filter(r => {
            const v = r.verdict;
            if (state.filters.verdict.includes(v)) return true;
            // Special: '⏳' matches deep-flagged but unevaluated
            if (state.filters.verdict.includes('⏳') && !v && r.flags.includes('deep')) return true;
            // Special: '—' matches no verdict and no deep flag
            if (state.filters.verdict.includes('—') && !v && !r.flags.includes('deep')) return true;
            return false;
        });
    }
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        repos = repos.filter(r =>
            r.full_name.toLowerCase().includes(q) ||
            (r.summary_ru || '').toLowerCase().includes(q) ||
            (r.application || '').toLowerCase().includes(q)
        );
    }

    // Multi-level sort
    const numericCols = new Set(['stars', 'relevance_score', 'my_rating']);
    const rules = state.sortRules;
    if (rules.length > 0) {
        repos.sort((a, b) => {
            for (const rule of rules) {
                const dir = rule.dir === 'asc' ? 1 : -1;
                let va = a[rule.col];
                let vb = b[rule.col];
                let cmp = 0;
                if (rule.col === 'verdict') {
                    cmp = (verdictSortValue(va) - verdictSortValue(vb)) * dir;
                } else if (typeof va === 'number' && typeof vb === 'number') {
                    cmp = (va - vb) * dir;
                } else if (numericCols.has(rule.col)) {
                    cmp = ((Number(va) || 0) - (Number(vb) || 0)) * dir;
                } else {
                    cmp = String(va || '').localeCompare(String(vb || '')) * dir;
                }
                if (cmp !== 0) return cmp;
            }
            return 0;
        });
    }

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

    // Flags — known values plus any seen in data
    const seenFlags = new Set(FLAG_VALUES);
    Object.values(state.notes).forEach(n => parseFlags(n.flags).forEach(f => seenFlags.add(f)));
    populateMultiselect('filter-flags', [...seenFlags]);

    // Verdict — fixed values plus specials
    populateMultiselect('filter-verdict', [...VERDICT_VALUES, '⏳', '—']);

    // Restore UI state from persisted filters
    ['filter-category', 'filter-language', 'filter-status', 'filter-effort', 'filter-flags', 'filter-verdict'].forEach(updateMultiselectUI);
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
    applyTooltipAttributes();
}

function renderStats(repos) {
    const total = state.repos.length;
    const watched = Object.values(state.notes).filter(n => n.status === 'watch').length;
    $('stat-total').textContent = `${total} ${t('stat_repos')}`;
    $('stat-filtered').textContent = `${repos.length} ${t('stat_shown')}`;
    $('stat-watched').textContent = `${watched} ${t('stat_watched')}`;
}

function renderSortHeaders() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc', 'sort-active');
        // Remove old priority badge
        const oldBadge = th.querySelector('.sort-priority');
        if (oldBadge) oldBadge.remove();

        const col = th.dataset.sort;
        const ruleIndex = state.sortRules.findIndex(r => r.col === col);
        if (ruleIndex !== -1) {
            const rule = state.sortRules[ruleIndex];
            th.classList.add(rule.dir === 'asc' ? 'sort-asc' : 'sort-desc');
            th.classList.add('sort-active');
            // Show priority number only when multi-sorting
            if (state.sortRules.length > 1) {
                const badge = document.createElement('span');
                badge.className = 'sort-priority';
                badge.textContent = ruleIndex + 1;
                th.appendChild(badge);
            }
        }
    });
    // Update sort badge count
    renderSortBadge();
}

function renderSortBadge() {
    const badge = $('sort-badge');
    if (!badge) return;
    const count = state.sortRules.length;
    const countEl = badge.querySelector('.sort-badge-count');
    if (count > 1) {
        countEl.textContent = count;
        countEl.classList.remove('hidden');
        badge.classList.add('active');
    } else {
        countEl.classList.add('hidden');
        badge.classList.remove('active');
    }
}

// --- Sort Rules CRUD ---
function saveSortRules() {
    localStorage.setItem('pr_sort', JSON.stringify(state.sortRules));
}

function setSortSingle(col) {
    const def = SORTABLE_COLS[col];
    const existing = state.sortRules.find(r => r.col === col);
    if (state.sortRules.length === 1 && existing) {
        // Toggle direction
        existing.dir = existing.dir === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortRules = [{ col, dir: def ? def.defaultDir : 'desc' }];
    }
    saveSortRules();
    renderAll();
}

function addSortLevel(col, dir) {
    if (state.sortRules.find(r => r.col === col)) return; // already present
    const def = SORTABLE_COLS[col];
    state.sortRules.push({ col, dir: dir || (def ? def.defaultDir : 'desc') });
    saveSortRules();
    renderAll();
}

function removeSortLevel(index) {
    state.sortRules.splice(index, 1);
    if (state.sortRules.length === 0) {
        state.sortRules = [{ col: 'stars', dir: 'desc' }];
    }
    saveSortRules();
    renderAll();
}

function toggleSortDirection(index) {
    const rule = state.sortRules[index];
    if (rule) {
        rule.dir = rule.dir === 'asc' ? 'desc' : 'asc';
        saveSortRules();
        renderAll();
    }
}

function moveSortLevel(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= state.sortRules.length) return;
    const [moved] = state.sortRules.splice(fromIndex, 1);
    state.sortRules.splice(toIndex, 0, moved);
    saveSortRules();
    renderAll();
}

function clearSort() {
    state.sortRules = [{ col: 'stars', dir: 'desc' }];
    saveSortRules();
    renderAll();
}

// --- Sort Configurator Popup ---
function renderSortConfigurator() {
    const popup = $('sort-configurator-popup');
    if (!popup) return;
    const list = popup.querySelector('.sort-config-list');
    const addBtn = popup.querySelector('.sort-config-add');

    // Render current rules
    list.innerHTML = state.sortRules.map((rule, i) => {
        const label = t(SORTABLE_COLS[rule.col]?.i18nKey || rule.col);
        const arrow = rule.dir === 'asc' ? '↑' : '↓';
        const dirLabel = rule.dir;
        return `<div class="sort-config-item" draggable="true" data-index="${i}">
            <span class="sort-config-handle material-symbols-outlined">drag_indicator</span>
            <span class="sort-config-num">${i + 1}</span>
            <span class="sort-config-col">${label}</span>
            <button class="sort-config-dir" data-index="${i}" title="Toggle direction">
                <span class="sort-config-arrow">${arrow}</span>
                <span class="sort-config-dir-label">${dirLabel}</span>
            </button>
            <button class="sort-config-remove" data-index="${i}" title="Remove">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>`;
    }).join('');

    // Available columns for "Add" button
    const usedCols = new Set(state.sortRules.map(r => r.col));
    const availableCols = Object.keys(SORTABLE_COLS).filter(c => !usedCols.has(c));
    if (availableCols.length === 0) {
        addBtn.classList.add('hidden');
    } else {
        addBtn.classList.remove('hidden');
    }

    // Bind direction toggles
    list.querySelectorAll('.sort-config-dir').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSortDirection(parseInt(btn.dataset.index));
            renderSortConfigurator();
        });
    });

    // Bind remove buttons
    list.querySelectorAll('.sort-config-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeSortLevel(parseInt(btn.dataset.index));
            renderSortConfigurator();
        });
    });

    // Drag & Drop
    let dragIndex = null;
    list.querySelectorAll('.sort-config-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            dragIndex = parseInt(item.dataset.index);
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            dragIndex = null;
            list.querySelectorAll('.sort-config-item').forEach(el => el.classList.remove('drag-over'));
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            list.querySelectorAll('.sort-config-item').forEach(el => el.classList.remove('drag-over'));
            item.classList.add('drag-over');
        });
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            const toIndex = parseInt(item.dataset.index);
            if (dragIndex !== null && dragIndex !== toIndex) {
                moveSortLevel(dragIndex, toIndex);
                renderSortConfigurator();
            }
            item.classList.remove('drag-over');
        });
    });
}

function showSortConfigAddMenu(e) {
    e.stopPropagation();
    const popup = $('sort-configurator-popup');
    let menu = popup.querySelector('.sort-config-add-menu');
    if (menu) { menu.remove(); return; }

    const usedCols = new Set(state.sortRules.map(r => r.col));
    const availableCols = Object.keys(SORTABLE_COLS).filter(c => !usedCols.has(c));
    if (availableCols.length === 0) return;

    menu = document.createElement('div');
    menu.className = 'sort-config-add-menu';
    menu.innerHTML = availableCols.map(col => {
        const label = t(SORTABLE_COLS[col].i18nKey);
        return `<button class="sort-config-add-option" data-col="${col}">${label}</button>`;
    }).join('');

    menu.querySelectorAll('.sort-config-add-option').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            addSortLevel(btn.dataset.col);
            renderSortConfigurator();
            menu.remove();
        });
    });

    popup.querySelector('.sort-config-footer').appendChild(menu);
}

function toggleSortConfigurator() {
    const popup = $('sort-configurator-popup');
    if (!popup) return;
    const isOpen = !popup.classList.contains('hidden');
    // Close all multiselects first
    closeAllMultiselects();
    if (isOpen) {
        popup.classList.add('hidden');
    } else {
        popup.classList.remove('hidden');
        renderSortConfigurator();
    }
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

// Rich deep-eval panel (from Deep tab). Returns '' if no deep row for this repo.
function renderDeepEvalSection(repo) {
    const d = repo.deep;
    if (!d) return '';

    const verdictMeta = {
        DO_NOW:    { text: '✅ Do now',    cls: 'ca-rec-use' },
        PILOT:     { text: '🧪 Pilot',     cls: 'ca-bundle-medium' },
        QUICK_WIN: { text: '⚡ Quick win', cls: 'ca-rec-use' },
        BACKLOG:   { text: '📌 Backlog',   cls: 'ca-bundle-medium' },
        REJECT:    { text: '🔴 Reject',    cls: 'ca-rec-skip' },
    };
    const v = verdictMeta[d.verdict] || { text: d.verdict || '-', cls: '' };
    const valueCls = d.value >= 60 ? 'ca-quality-high' : d.value >= 40 ? 'ca-quality-mid' : 'ca-quality-low';

    // Editable verdict select
    const isOverridden = d._original_verdict && d._original_verdict !== d.verdict;
    const verdictSelectHTML = `<div class="verdict-select-wrap">
        <select class="verdict-select" data-repo="${repo.full_name}">
            ${VERDICT_VALUES.map(vv => `<option value="${vv}" ${d.verdict === vv ? 'selected' : ''}>${verdictLabel(vv)}</option>`).join('')}
        </select>
        ${isOverridden ? `<button class="verdict-restore-btn" data-repo="${repo.full_name}" title="Restore: ${verdictLabel(d._original_verdict)}">
            <span class="material-symbols-outlined">restart_alt</span>
        </button>
        <span class="verdict-override-indicator">✏️ ${t('verdict_override')}</span>` : ''}
    </div>
    <div class="verdict-save-status" data-verdict-repo="${repo.full_name}"></div>`;

    const axis = (label, score) => `<div class="ca-item">
        <div class="ca-label">${label}</div>
        <span class="ca-badge">${score || '-'}/5</span>
    </div>`;

    const evidence = Array.isArray(d.evidence) && d.evidence.length
        ? `<div class="ca-arch"><div class="ca-label">Evidence</div>${d.evidence.map(e =>
            `<div class="detail-app" style="font-size:12px"><code>${e.file || ''}</code> — ${e.quote || ''}</div>`).join('')}</div>`
        : '';

    return `<div class="code-analysis-panel">
        <div class="ca-header">
            <span class="material-symbols-outlined" style="font-size:16px;color:var(--accent)">verified</span>
            <span class="detail-section-title" style="margin:0">${t('de_title')}</span>
            <span class="badge" style="margin-left:auto">${d.target || ''}</span>
        </div>
        <div class="ca-grid">
            <div class="ca-item">
                <div class="ca-label">${t('de_verdict')}</div>
                ${verdictSelectHTML}
            </div>
            <div class="ca-item">
                <div class="ca-label">${t('de_value')}</div>
                <div class="ca-quality-bar">
                    <div class="ca-quality-fill ${valueCls}" style="width:${d.value || 0}%"></div>
                    <span class="ca-quality-text">${d.value || 0}/100</span>
                </div>
            </div>
            <div class="ca-item">
                <div class="ca-label">${t('de_effort')}</div>
                <span class="ca-badge">${d.effort_days || '?'} ${t('de_days')}</span>
            </div>
        </div>
        <div class="ca-grid">
            ${axis(t('de_ax_speed'), d.ax_dev_speed)}
            ${axis(t('de_ax_quality'), d.ax_quality)}
            ${axis(t('de_ax_dx'), d.ax_dx)}
            ${axis(t('de_ax_bundle'), d.ax_bundle)}
        </div>
        ${d.what_it_gives ? `<div class="ca-arch"><div class="ca-label">${t('de_what')}</div><div class="detail-app">${d.what_it_gives}</div></div>` : ''}
        ${d.integration_notes ? `<div class="ca-arch"><div class="ca-label">${t('de_plan')}</div><div class="detail-app">${d.integration_notes}</div></div>` : ''}
        ${evidence}
        <div class="ca-label" style="margin-top:8px;opacity:.6">${d.analyzed_at || ''} · rubric v${d.rubric_version || '?'} · ${d.model_version || ''}</div>
    </div>`;
}

// Flag editor — checkboxes that toggle membership in MyNotes.flags (CSV)
function renderFlagsEditor(repo) {
    const active = repo.flags || [];
    return `<div class="flags-editor" data-repo="${repo.full_name}">
        ${FLAG_VALUES.map(f => `<label class="flag-chip ${active.includes(f) ? 'flag-on' : ''}">
            <input type="checkbox" value="${f}" ${active.includes(f) ? 'checked' : ''}>${f}
        </label>`).join('')}
    </div>`;
}

function renderCodeAnalysisSection(repo) {
    // Prefer rich deep-eval data; fall back to legacy Repos fields
    const deep = renderDeepEvalSection(repo);
    if (deep) return deep;
    // Only show legacy if code analysis data exists
    if (!repo.recommendation) return '';

    const recLabels = {
        'use': { text: '✅ Use', cls: 'ca-rec-use' },
        'evaluate': { text: '🟡 Evaluate', cls: 'ca-rec-evaluate' },
        'skip': { text: '🔴 Skip', cls: 'ca-rec-skip' },
    };
    const rec = recLabels[(repo.recommendation || '').toLowerCase()] || { text: repo.recommendation, cls: '' };

    const bundleLabels = {
        'low': { text: 'Low', cls: 'ca-bundle-low' },
        'medium': { text: 'Medium', cls: 'ca-bundle-medium' },
        'high': { text: 'High', cls: 'ca-bundle-high' },
    };
    const bundle = bundleLabels[(repo.bundle_impact || '').toLowerCase()] || { text: repo.bundle_impact || '-', cls: '' };

    const quality = repo.code_quality_score || 0;
    const qualityCls = quality >= 70 ? 'ca-quality-high' : quality >= 40 ? 'ca-quality-mid' : 'ca-quality-low';

    return `<div class="code-analysis-panel">
        <div class="ca-header">
            <span class="material-symbols-outlined" style="font-size:16px;color:var(--accent)">code</span>
            <span class="detail-section-title" style="margin:0">${t('ca_title')}</span>
        </div>
        <div class="ca-grid">
            <div class="ca-item">
                <div class="ca-label">${t('ca_recommendation')}</div>
                <span class="ca-badge ${rec.cls}">${rec.text}</span>
            </div>
            <div class="ca-item">
                <div class="ca-label">${t('ca_bundle')}</div>
                <span class="ca-badge ${bundle.cls}">${bundle.text}</span>
            </div>
            <div class="ca-item">
                <div class="ca-label">${t('ca_quality')}</div>
                <div class="ca-quality-bar">
                    <div class="ca-quality-fill ${qualityCls}" style="width:${quality}%"></div>
                    <span class="ca-quality-text">${quality}/100</span>
                </div>
            </div>
        </div>
        ${repo.architecture_summary ? `<div class="ca-arch">
            <div class="ca-label">${t('ca_architecture')}</div>
            <div class="detail-app">${repo.architecture_summary}</div>
        </div>` : ''}
    </div>`;
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
            <td class="cell-verdict">${verdictBadgeHTML(repo)}</td>
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
        <td colspan="9">
            <div class="detail-panel">
                <div class="detail-content">
                    <div class="detail-section-title">${t('detail_review')}</div>
                    <p class="detail-text">${repo.summary_ru || t('detail_no_review')}</p>
                    <div class="detail-app-grid">
                        <div>
                            <div class="detail-section-title">${t('detail_application')}</div>
                            <div class="detail-app">${repo.application || '-'}</div>
                        </div>
                        <div>
                            <div class="detail-section-title">${t('detail_limitations')}</div>
                            <div class="detail-app" style="color:var(--text-secondary)">${repo.limitations || '-'}</div>
                        </div>
                    </div>
                    ${renderCodeAnalysisSection(repo)}
                </div>
                <div class="detail-sidebar">
                    <div class="notes-panel">
                        <div class="notes-header">
                            <span>${t('detail_notes')}</span>
                            <span class="material-symbols-outlined" style="font-size:14px">edit_document</span>
                        </div>
                        <textarea class="notes-textarea" data-repo="${repo.full_name}" placeholder="${t('detail_notes_placeholder')}">${getDraft(repo.full_name) || repo.my_notes || ''}</textarea>
                        <div class="notes-save-status ${getDraft(repo.full_name) ? 'notes-save-draft' : ''}" data-repo="${repo.full_name}">${getDraft(repo.full_name) ? (currentLang === 'ru' ? 'Черновик' : 'Draft') : ''}</div>
                    </div>
                </div>
                <div class="detail-footer">
                    <div class="detail-footer-left">
                        <select class="detail-status-select" data-repo="${repo.full_name}">
                            ${['new','watch','skip','integrated'].map(s =>
                                `<option value="${s}" ${repo.status === s ? 'selected' : ''}>${s.toUpperCase()}</option>`
                            ).join('')}
                        </select>
                        ${starsHTML(repo.my_rating, repo.full_name)}
                        ${renderFlagsEditor(repo)}
                    </div>
                    <a class="btn-github" href="${repo.url || 'https://github.com/' + repo.full_name}" target="_blank" rel="noopener">
                        <span class="material-symbols-outlined" style="font-size:14px">open_in_new</span>
                        ${t('detail_github')}
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
                        ${verdictBadgeHTML(repo)}
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
            <div class="mobile-card-section-title">${t('detail_review')}</div>
            <p class="detail-text">${repo.summary_ru || t('detail_no_review')}</p>
        </div>
        <div class="mobile-card-section">
            <div class="mobile-card-section-title">${t('detail_application')}</div>
            <div class="detail-app">${repo.application || '-'}</div>
        </div>
        <div class="mobile-card-section">
            <div class="mobile-card-section-title">${t('detail_limitations')}</div>
            <div class="detail-app" style="color:var(--text-secondary)">${repo.limitations || '-'}</div>
        </div>
        ${renderCodeAnalysisSection(repo)}
        <div class="mobile-card-section">
            <div class="mobile-card-section-title">${t('detail_notes')}</div>
            <textarea class="notes-textarea" data-repo="${repo.full_name}" placeholder="${t('detail_notes_placeholder')}" style="min-height:60px;border:1px solid var(--border);border-radius:4px;background:var(--surface-low)">${getDraft(repo.full_name) || repo.my_notes || ''}</textarea>
            <div class="notes-save-status ${getDraft(repo.full_name) ? 'notes-save-draft' : ''}" data-repo="${repo.full_name}">${getDraft(repo.full_name) ? (currentLang === 'ru' ? 'Черновик' : 'Draft') : ''}</div>
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
                ${t('mobile_github')}
            </a>
        </div>
        ${renderFlagsEditor(repo)}
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
        state.sortRules = [{ col, dir }];
        saveSortRules();
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

    // Sort — click on table headers
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', (e) => {
            const col = th.dataset.sort;
            if (e.shiftKey) {
                // Shift+Click: add/toggle multi-sort level
                const existingIndex = state.sortRules.findIndex(r => r.col === col);
                if (existingIndex !== -1) {
                    // Toggle direction if already in rules
                    state.sortRules[existingIndex].dir =
                        state.sortRules[existingIndex].dir === 'asc' ? 'desc' : 'asc';
                } else {
                    // Add new level
                    const def = SORTABLE_COLS[col];
                    state.sortRules.push({ col, dir: def ? def.defaultDir : 'desc' });
                }
            } else {
                // Normal click: single-column sort
                setSortSingle(col);
                return; // setSortSingle calls renderAll + saveSortRules
            }
            saveSortRules();
            renderAll();
        });
    });

    // Sort badge & configurator
    $('sort-badge').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSortConfigurator();
    });
    $('sort-config-add-btn').addEventListener('click', showSortConfigAddMenu);
    $('sort-config-clear-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        clearSort();
        renderSortConfigurator();
    });
    // Close sort configurator on outside click
    $('sort-configurator-popup').addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => {
        const popup = $('sort-configurator-popup');
        if (popup && !popup.classList.contains('hidden')) {
            popup.classList.add('hidden');
        }
    });
}

// Flag chip toggles (shared by desktop detail + mobile cards)
function bindFlagEditors() {
    document.querySelectorAll('.flags-editor').forEach(editor => {
        const repo = editor.dataset.repo;
        editor.addEventListener('click', (e) => e.stopPropagation());
        editor.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                const checked = Array.from(editor.querySelectorAll('input:checked')).map(c => c.value);
                saveNote(repo, 'flags', checked.join(','));
                renderAll();
            });
        });
    });
}

function bindTableEvents() {
    bindFlagEditors();
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

    // Notes textarea — draft on input, debounced autosave, blur fallback
    document.querySelectorAll('.notes-textarea').forEach(ta => {
        const repo = ta.dataset.repo;
        ta.addEventListener('input', () => {
            saveDraft(repo, ta.value);
            setSaveStatus(repo, 'draft');
            clearTimeout(_saveTimers[repo]);
            _saveTimers[repo] = setTimeout(() => {
                saveNote(repo, 'my_notes', ta.value);
            }, SAVE_DEBOUNCE_MS);
        });
        ta.addEventListener('blur', () => {
            clearTimeout(_saveTimers[repo]);
            saveNote(repo, 'my_notes', ta.value);
        });
        ta.addEventListener('click', (e) => e.stopPropagation());
        ta.addEventListener('keydown', (e) => e.stopPropagation());
    });

    // Verdict select change
    bindVerdictEditors();
}

function bindMobileCardEvents() {
    bindFlagEditors();
    bindVerdictEditors();
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

    // Notes textarea (mobile) — draft on input, debounced autosave, blur fallback
    document.querySelectorAll('.mobile-card .notes-textarea').forEach(ta => {
        const repo = ta.dataset.repo;
        ta.addEventListener('input', () => {
            saveDraft(repo, ta.value);
            setSaveStatus(repo, 'draft');
            clearTimeout(_saveTimers[repo]);
            _saveTimers[repo] = setTimeout(() => {
                saveNote(repo, 'my_notes', ta.value);
            }, SAVE_DEBOUNCE_MS);
        });
        ta.addEventListener('blur', () => {
            clearTimeout(_saveTimers[repo]);
            saveNote(repo, 'my_notes', ta.value);
        });
    });
}

// ============================================================
// Verdict Editing
// ============================================================

function bindVerdictEditors() {
    // Verdict select dropdowns
    document.querySelectorAll('.verdict-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            e.stopPropagation();
            saveVerdictOverride(sel.dataset.repo, e.target.value);
        });
        sel.addEventListener('click', (e) => e.stopPropagation());
    });

    // Verdict restore buttons
    document.querySelectorAll('.verdict-restore-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const repo = btn.dataset.repo;
            const d = state.deep[repo];
            if (d && d._original_verdict) {
                saveVerdictOverride(repo, d._original_verdict);
            }
        });
    });
}

function setVerdictSaveStatus(fullName, status) {
    document.querySelectorAll(`.verdict-save-status[data-verdict-repo="${fullName}"]`).forEach(el => {
        const labels = currentLang === 'ru'
            ? { saving: 'Сохранение...', saved: '✓ Сохранено', error: '✗ Ошибка' }
            : { saving: 'Saving...', saved: '✓ Saved', error: '✗ Error' };
        el.textContent = labels[status] || '';
        el.className = `verdict-save-status ${status}`;
    });
}

async function saveVerdictOverride(fullName, newVerdict) {
    // Create stub if no deep row exists yet
    if (!state.deep[fullName]) {
        const repo = state.repos.find(r => r.full_name === fullName);
        state.deep[fullName] = {
            full_name: fullName,
            url: repo?.url || `https://github.com/${fullName}`,
            target: '',
            gate_stack_fit: 'na',
            gate_health: 'pass',
            license: 'unknown',
            ax_dev_speed: 3,
            ax_quality: 3,
            ax_dx: 3,
            ax_bundle: 3,
            value: 0,
            effort_days: 0,
            verdict: newVerdict,
            one_liner: '',
            what_it_gives: '',
            integration_notes: '',
            evidence: [],
            commit_sha: '',
            rubric_version: 0,
            model_version: 'manual',
            analyzed_at: new Date().toISOString(),
            _original_verdict: newVerdict,
        };
    }

    const d = state.deep[fullName];
    // Store original verdict for restore functionality
    if (!d._original_verdict) {
        d._original_verdict = d.verdict;
    }
    d.verdict = newVerdict;

    setVerdictSaveStatus(fullName, 'saving');

    // Rebuild Deep sheet
    const rows = [CONFIG.DEEP_HEADERS];
    Object.values(state.deep).forEach(dd => {
        rows.push(CONFIG.DEEP_HEADERS.map(h =>
            h === 'evidence' ? JSON.stringify(dd.evidence ?? []) : String(dd[h] ?? '')
        ));
    });

    try {
        await ensureDeepSheet();
        await sheetsRequest('/values/Deep!A1:U1000?valueInputOption=USER_ENTERED', {
            method: 'PUT',
            body: JSON.stringify({ range: 'Deep!A1:U1000', values: rows }),
        });
        setVerdictSaveStatus(fullName, 'saved');
        renderAll();
    } catch (e) {
        console.error('Verdict save failed:', e);
        setVerdictSaveStatus(fullName, 'error');
    }
}

// ============================================================
// Tooltip Engine (Follow-cursor, viewport-clamped)
// ============================================================

const TOOLTIP_TEXTS = {};
function getTooltipTexts() {
    return {
        tip_effort: t('tip_effort'),
        tip_verdict: t('tip_verdict'),
        tip_score: t('tip_score'),
    };
}

let _tooltipEl = null;
let _tooltipVisible = false;
let _tooltipDelay = null;

function ensureTooltipEl() {
    if (_tooltipEl) return _tooltipEl;
    _tooltipEl = document.createElement('div');
    _tooltipEl.className = 'app-tooltip';
    document.body.appendChild(_tooltipEl);
    return _tooltipEl;
}

function showTooltip(html, e) {
    const el = ensureTooltipEl();
    el.innerHTML = html;
    _tooltipVisible = true;
    positionTooltip(e);
    requestAnimationFrame(() => el.classList.add('visible'));
}

function hideTooltip() {
    clearTimeout(_tooltipDelay);
    _tooltipVisible = false;
    if (_tooltipEl) _tooltipEl.classList.remove('visible');
}

function positionTooltip(e) {
    if (!_tooltipEl || !_tooltipVisible) return;
    const pad = 14;
    const rect = _tooltipEl.getBoundingClientRect();
    let x = e.clientX + pad;
    let y = e.clientY + pad;

    // Clamp right
    if (x + rect.width > window.innerWidth - 8) {
        x = e.clientX - rect.width - pad;
    }
    // Clamp bottom
    if (y + rect.height > window.innerHeight - 8) {
        y = e.clientY - rect.height - pad;
    }
    // Clamp left/top
    if (x < 8) x = 8;
    if (y < 8) y = 8;

    _tooltipEl.style.left = x + 'px';
    _tooltipEl.style.top = y + 'px';
}

function initTooltips() {
    // Desktop: hover on table headers with data-tooltip
    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (!target) return;
        clearTimeout(_tooltipDelay);
        const key = target.dataset.tooltip;
        const text = getTooltipTexts()[key] || key;
        const title = target.dataset.tooltipTitle || '';
        const html = (title ? `<div class="app-tooltip-title">${title}</div>` : '') + text;
        _tooltipDelay = setTimeout(() => showTooltip(html, e), 300);
    });

    document.addEventListener('mouseout', (e) => {
        if (e.target.closest('[data-tooltip]')) {
            hideTooltip();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (_tooltipVisible) positionTooltip(e);
    });

    // Mobile: tap on ? buttons
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('.tooltip-trigger-mobile');
        if (!trigger) return;
        e.stopPropagation();
        e.preventDefault();

        // Remove existing mobile tooltip
        closeMobileTooltip();

        const key = trigger.dataset.tooltip;
        const text = getTooltipTexts()[key] || key;
        const title = trigger.dataset.tooltipTitle || '';

        const backdrop = document.createElement('div');
        backdrop.className = 'mobile-tooltip-backdrop';
        backdrop.addEventListener('click', closeMobileTooltip);

        const popup = document.createElement('div');
        popup.className = 'mobile-tooltip-popup';
        popup.id = 'mobile-tooltip-active';
        popup.innerHTML = `
            ${title ? `<div class="app-tooltip-title">${title}</div>` : ''}
            ${text}
            <button class="mobile-tooltip-close" onclick="closeMobileTooltip()">
                <span class="material-symbols-outlined">close</span>
            </button>
        `;

        // Position near the trigger
        const rect = trigger.getBoundingClientRect();
        popup.style.top = Math.min(rect.bottom + 8, window.innerHeight - 200) + 'px';
        popup.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 288)) + 'px';

        document.body.appendChild(backdrop);
        document.body.appendChild(popup);
    });
}

function closeMobileTooltip() {
    document.querySelectorAll('.mobile-tooltip-popup, .mobile-tooltip-backdrop').forEach(el => el.remove());
}

// Add tooltip data attributes to table headers after they exist
function applyTooltipAttributes() {
    // Score column header
    const scoreTh = document.querySelector('th[data-sort="relevance_score"]');
    if (scoreTh && !scoreTh.dataset.tooltip) {
        scoreTh.dataset.tooltip = 'tip_score';
        scoreTh.dataset.tooltipTitle = t('th_score');
    }
    // Verdict column header
    const verdictTh = document.querySelector('th[data-sort="verdict"]');
    if (verdictTh && !verdictTh.dataset.tooltip) {
        verdictTh.dataset.tooltip = 'tip_verdict';
        verdictTh.dataset.tooltipTitle = t('th_verdict');
    }
    // Effort column header
    const effortTh = document.querySelector('th[data-sort="integration_effort"]');
    if (effortTh && !effortTh.dataset.tooltip) {
        effortTh.dataset.tooltip = 'tip_effort';
        effortTh.dataset.tooltipTitle = t('th_effort');
    }
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

    // Reset to first tab on open
    switchSettingsTab('pipeline');

    initSettingsHourOptions();

    const pat = getGitHubPAT();
    $('input-github-pat').value = pat ? '•'.repeat(20) : '';

    if (pat) {
        await loadSettingsData();
    } else {
        setStatusMsg('pat-status', '⚠️ Enter a GitHub PAT with repo scope', 'warning');
    }

    updateDeepQueueStats();
    populateFlagExportSelect();
}

function closeSettings() {
    $('settings-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

function switchSettingsTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.settings-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    // Update panel content
    document.querySelectorAll('.settings-panel-content').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.panel === tabName);
    });
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
// Deep Queue Export
// ============================================================

function getDeepQueue() {
    const deepFlagged = Object.entries(state.notes)
        .filter(([, v]) => parseFlags(v.flags).includes('deep'))
        .map(([k]) => k);
    const deepEvaluated = new Set(Object.keys(state.deep));
    const repoMap = {};
    state.repos.forEach(r => { repoMap[r.full_name] = r.url; });

    const queue = deepFlagged
        .filter(name => !deepEvaluated.has(name))
        .map(name => ({ full_name: name, url: repoMap[name] || `https://github.com/${name}` }));

    return { total: deepFlagged.length, done: deepEvaluated.size, queue };
}

function updateDeepQueueStats() {
    const el = $('deep-queue-stats');
    if (!el) return;
    const { total, done, queue } = getDeepQueue();
    const statsFn = (I18N[currentLang] || I18N.en).deep_export_stats;
    el.textContent = typeof statsFn === 'function'
        ? statsFn(total, done, queue.length)
        : `${total} deep-flagged · ${done} evaluated · ${queue.length} in queue`;
}

function exportDeepQueue() {
    const { queue } = getDeepQueue();
    if (!queue.length) {
        setStatusMsg('deep-export-status', currentLang === 'ru' ? '⚠ Очередь пуста' : '⚠ Queue is empty', 'warning');
        return;
    }
    const blob = new Blob([JSON.stringify(queue, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `deep-eval-queue-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    setStatusMsg('deep-export-status', `✅ ${queue.length} repos exported`, 'success');
}

async function exportDeepQueueClipboard() {
    const { queue } = getDeepQueue();
    if (!queue.length) {
        setStatusMsg('deep-export-status', currentLang === 'ru' ? '⚠ Очередь пуста' : '⚠ Queue is empty', 'warning');
        return;
    }
    try {
        await navigator.clipboard.writeText(JSON.stringify(queue, null, 2));
        setStatusMsg('deep-export-status',
            `✅ ${queue.length} repos → clipboard`,
            'success');
    } catch (e) {
        setStatusMsg('deep-export-status', `❌ ${e.message}`, 'error');
    }
}

// ============================================================
// Flag-based Data Export
// ============================================================

function getReposByFlag(flag) {
    if (!flag) return [];

    // Special: 'current_view' exports whatever is currently filtered
    if (flag === '__current_view__') {
        return getFilteredRepos().map(r => buildExportRow(r.full_name));
    }

    return state.repos
        .filter(r => {
            const flags = parseFlags(state.notes[r.full_name]?.flags);
            return flags.includes(flag);
        })
        .map(r => buildExportRow(r.full_name));
}

function buildExportRow(fullName) {
    const r = state.repos.find(repo => repo.full_name === fullName) || {};
    const n = state.notes[fullName] || {};
    const d = state.deep[fullName] || {};

    return {
        // Repos tab
        full_name: r.full_name || fullName,
        url: r.url || `https://github.com/${fullName}`,
        stars: r.stars || 0,
        language: r.language || '',
        category: r.category || '',
        relevance_score: r.relevance_score || 0,
        summary_ru: r.summary_ru || '',
        application: r.application || '',
        limitations: r.limitations || '',
        integration_effort: r.integration_effort || '',
        worth_tracking: r.worth_tracking || '',
        found_date: r.found_date || '',
        recommendation: r.recommendation || '',
        bundle_impact: r.bundle_impact || '',
        code_quality_score: r.code_quality_score || 0,
        architecture_summary: r.architecture_summary || '',
        // MyNotes tab
        my_rating: n.my_rating || 0,
        status: n.status || 'new',
        my_notes: n.my_notes || '',
        flags: n.flags || '',
        reviewed_at: n.reviewed_at || '',
        // Deep Eval tab
        target: d.target || '',
        gate_stack_fit: d.gate_stack_fit || '',
        gate_health: d.gate_health || '',
        license: d.license || '',
        ax_dev_speed: d.ax_dev_speed || 0,
        ax_quality: d.ax_quality || 0,
        ax_dx: d.ax_dx || 0,
        ax_bundle: d.ax_bundle || 0,
        value: d.value || 0,
        effort_days: d.effort_days || 0,
        verdict: d.verdict || '',
        one_liner: d.one_liner || '',
        what_it_gives: d.what_it_gives || '',
        integration_notes: d.integration_notes || '',
    };
}

function updateFlagExportStats() {
    const select = $('flag-export-select');
    const statsEl = $('flag-export-stats');
    if (!select || !statsEl) return;

    const flag = select.value;
    if (!flag) {
        statsEl.textContent = '';
        return;
    }

    const repos = getReposByFlag(flag);
    const statsFn = (I18N[currentLang] || I18N.en).flag_export_stats;
    const emptyMsg = t('flag_export_empty');

    if (repos.length === 0) {
        statsEl.textContent = emptyMsg;
        statsEl.style.color = 'var(--warning)';
    } else {
        const label = flag === '__current_view__' ? 'current view' : flag;
        statsEl.textContent = typeof statsFn === 'function'
            ? statsFn(repos.length, label)
            : `${repos.length} repos`;
        statsEl.style.color = 'var(--text-secondary)';
    }
}

function populateFlagExportSelect() {
    const select = $('flag-export-select');
    if (!select) return;

    // Gather all known flags from data
    const seenFlags = new Set(FLAG_VALUES);
    Object.values(state.notes).forEach(n => parseFlags(n.flags).forEach(f => seenFlags.add(f)));

    select.innerHTML = `<option value="" disabled selected>${t('flag_export_select')}</option>`;

    // Add current view option
    select.innerHTML += `<option value="__current_view__">${t('flag_export_all')}</option>`;

    // Add flag options with counts
    [...seenFlags].sort().forEach(flag => {
        const count = state.repos.filter(r =>
            parseFlags(state.notes[r.full_name]?.flags).includes(flag)
        ).length;
        select.innerHTML += `<option value="${flag}">${flag} (${count})</option>`;
    });
}

function exportByFlag() {
    const flag = $('flag-export-select')?.value;
    if (!flag) return;

    const repos = getReposByFlag(flag);
    if (!repos.length) {
        setStatusMsg('flag-export-status', t('flag_export_empty'), 'warning');
        return;
    }

    const blob = new Blob([JSON.stringify(repos, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const label = flag === '__current_view__' ? 'current-view' : flag;
    a.href = URL.createObjectURL(blob);
    a.download = `repos-${label}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    setStatusMsg('flag-export-status', `✅ ${repos.length} repos exported`, 'success');
}

async function exportByFlagClipboard() {
    const flag = $('flag-export-select')?.value;
    if (!flag) return;

    const repos = getReposByFlag(flag);
    if (!repos.length) {
        setStatusMsg('flag-export-status', t('flag_export_empty'), 'warning');
        return;
    }

    try {
        await navigator.clipboard.writeText(JSON.stringify(repos, null, 2));
        setStatusMsg('flag-export-status', `✅ ${repos.length} repos → clipboard`, 'success');
    } catch (e) {
        setStatusMsg('flag-export-status', `❌ ${e.message}`, 'error');
    }
}

function exportByFlagMarkdown() {
    const flag = $('flag-export-select')?.value;
    if (!flag) return;

    const repos = getReposByFlag(flag);
    if (!repos.length) {
        setStatusMsg('flag-export-status', t('flag_export_empty'), 'warning');
        return;
    }

    let md = `# Export: ${flag === '__current_view__' ? 'Current View' : `Flag "${flag}"`}\n`;
    md += `> ${repos.length} repositories · ${new Date().toISOString().slice(0, 10)}\n\n`;

    // Group by category
    const grouped = {};
    repos.forEach(r => {
        const cat = r.category || 'Uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(r);
    });

    for (const [cat, items] of Object.entries(grouped).sort()) {
        md += `## ${cat} (${items.length})\n\n`;
        for (const r of items) {
            const stars = r.stars ? `⭐ ${r.stars.toLocaleString()}` : '';
            const verdict = r.verdict ? ` · ${verdictLabel(r.verdict)}` : '';
            const effort = r.integration_effort ? ` · Effort: ${r.integration_effort}` : '';
            const value = r.value ? ` · Value: ${r.value}` : '';

            md += `### ${stars} — [${r.full_name}](${r.url})${verdict}${effort}${value}\n`;
            md += `**Язык:** ${r.language || '—'} | **Target:** ${r.target || '—'}\n\n`;

            if (r.one_liner) md += `> ${r.one_liner}\n\n`;

            if (r.summary_ru) md += `**Обзор:** ${r.summary_ru}\n\n`;
            if (r.application) md += `**Применение:** ${r.application}\n\n`;
            if (r.limitations) md += `**Ограничения:** ${r.limitations}\n\n`;
            if (r.what_it_gives) md += `**Что даёт:** ${r.what_it_gives}\n\n`;
            if (r.integration_notes) md += `**План интеграции:** ${r.integration_notes}\n\n`;
            if (r.my_notes) md += `**Мои заметки:** ${r.my_notes}\n\n`;

            // Deep eval axes
            if (r.value) {
                md += `| Dev Speed | Quality | DX | Bundle | Value | Effort |\n`;
                md += `|---|---|---|---|---|---|\n`;
                md += `| ${r.ax_dev_speed}/5 | ${r.ax_quality}/5 | ${r.ax_dx}/5 | ${r.ax_bundle}/5 | ${r.value} | ${r.effort_days}d |\n\n`;
            }

            md += `---\n\n`;
        }
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    const label = flag === '__current_view__' ? 'current-view' : flag;
    a.href = URL.createObjectURL(blob);
    a.download = `repos-${label}-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    setStatusMsg('flag-export-status', `✅ ${repos.length} repos → Markdown`, 'success');
}

// ============================================================
// Deep Analysis Import
// ============================================================

// Create the Deep tab with header row if it doesn't exist yet
async function ensureDeepSheet() {
    const meta = await sheetsRequest('?fields=sheets.properties.title');
    const titles = (meta.sheets || []).map(s => s.properties.title);
    if (titles.includes('Deep')) return;

    await sheetsRequest(':batchUpdate', {
        method: 'POST',
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'Deep' } } }] }),
    });
    // Write header row
    await sheetsRequest('/values/Deep!A1:U1?valueInputOption=USER_ENTERED', {
        method: 'PUT',
        body: JSON.stringify({ range: 'Deep!A1:U1', values: [CONFIG.DEEP_HEADERS] }),
    });
}

async function processDeepRows(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        setStatusMsg('deep-import-status', `❌ Invalid JSON: ${e.message}`, 'error');
        return false;
    }
    const incoming = Array.isArray(parsed) ? parsed : [parsed];
    const valid = incoming.filter(r => r && r.full_name);
    if (!valid.length) {
        setStatusMsg('deep-import-status', '❌ No rows with full_name', 'error');
        return false;
    }

    try {
        await ensureDeepSheet();
        valid.forEach(r => { state.deep[r.full_name] = r; });
        const rows = [CONFIG.DEEP_HEADERS];
        Object.values(state.deep).forEach(d => {
            rows.push(CONFIG.DEEP_HEADERS.map(h =>
                h === 'evidence' ? JSON.stringify(d.evidence ?? []) : String(d[h] ?? '')
            ));
        });
        await sheetsRequest('/values/Deep!A1:U1000?valueInputOption=USER_ENTERED', {
            method: 'PUT',
            body: JSON.stringify({ range: 'Deep!A1:U1000', values: rows }),
        });
        setStatusMsg('deep-import-status', `✅ Imported ${valid.length} row(s)`, 'success');
        renderAll();
        return true;
    } catch (e) {
        console.error('Deep import failed:', e);
        setStatusMsg('deep-import-status', `❌ ${e.message}`, 'error');
        return false;
    }
}

async function importDeepRows() {
    const btn = $('btn-deep-import');
    const raw = $('deep-import-json').value.trim();
    if (!raw) { setStatusMsg('deep-import-status', 'Nothing to import', 'warning'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined spinning">progress_activity</span> Importing…';
    const ok = await processDeepRows(raw);
    if (ok) $('deep-import-json').value = '';
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined">upload</span> ' + t('deep_import_btn');
}

function importDeepFile() {
    const fileInput = $('deep-import-file');
    const file = fileInput.files[0];
    if (!file) return;

    const btn = $('btn-deep-import-file');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined spinning">progress_activity</span>';

    const reader = new FileReader();
    reader.onload = async (e) => {
        await processDeepRows(e.target.result);
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined">folder_open</span> ' + t('deep_import_file_btn');
        fileInput.value = '';
    };
    reader.onerror = () => {
        setStatusMsg('deep-import-status', '❌ Failed to read file', 'error');
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined">folder_open</span> ' + t('deep_import_file_btn');
        fileInput.value = '';
    };
    reader.readAsText(file);
}

// ============================================================
// Settings Event Bindings
// ============================================================

function bindSettingsEvents() {
    $('btn-deep-export').addEventListener('click', exportDeepQueue);
    $('btn-deep-export-clipboard').addEventListener('click', exportDeepQueueClipboard);
    $('btn-deep-import').addEventListener('click', importDeepRows);
    $('btn-deep-import-file').addEventListener('click', () => $('deep-import-file').click());
    $('deep-import-file').addEventListener('change', importDeepFile);
    // Flag export
    $('btn-flag-export').addEventListener('click', exportByFlag);
    $('btn-flag-export-clipboard').addEventListener('click', exportByFlagClipboard);
    $('btn-flag-export-md').addEventListener('click', exportByFlagMarkdown);
    $('flag-export-select').addEventListener('change', updateFlagExportStats);
    // Open/close
    $('btn-settings').addEventListener('click', openSettings);
    $('btn-settings-mobile').addEventListener('click', () => {
        $('mobile-menu').classList.add('hidden');
        openSettings();
    });
    $('btn-close-settings').addEventListener('click', closeSettings);
    // Backdrop click closes drawer
    document.querySelector('.settings-backdrop').addEventListener('click', closeSettings);

    // Tab switching
    document.querySelectorAll('.settings-tab').forEach(btn => {
        btn.addEventListener('click', () => switchSettingsTab(btn.dataset.tab));
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

