from pathlib import Path

admin_path = Path('js/admin-growth.js')
admin = admin_path.read_text(encoding='utf-8')

admin = admin.replace(
'''    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    const alertState = {
''',
'''    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;
    if (window.__KantuAdminGrowthLoaded === true) return;
    window.__KantuAdminGrowthLoaded = true;

    const alertState = {
''',
1
)

admin = admin.replace(
'''        pollTimer: null,
        timingTimer: null,
        memory: {}
''',
'''        pollTimer: null,
        timingTimer: null,
        memoryLoaded: false,
        memory: {}
''',
1
)

old_install = '''    function installAdminAlertActionDelegation() {
        if (document.documentElement.dataset.kantuAdminAlertDelegation === "true") return;
        document.documentElement.dataset.kantuAdminAlertDelegation = "true";
        document.addEventListener("click", event => {
            const list = el("adminAlertsList");
            if (!list) return;
            const control = event.target.closest?.("[data-alert-control]");
            if (control && list.contains(control)) {
                handleAdminAlertControl(control);
                return;
            }
            const review = event.target.closest?.("[data-admin-alert-action]");
            if (review && list.contains(review)) openAdminAlertTarget(review);
        });
    }
'''
new_install = '''    let adminAlertActionHandler = null;

    function installAdminAlertActionDelegation() {
        if (adminAlertActionHandler) return;
        adminAlertActionHandler = event => {
            const list = el("adminAlertsList");
            if (!list) return;
            const control = event.target.closest?.("[data-alert-control]");
            if (control && list.contains(control)) {
                handleAdminAlertControl(control);
                return;
            }
            const review = event.target.closest?.("[data-admin-alert-action]");
            if (review && list.contains(review)) openAdminAlertTarget(review);
        };
        document.addEventListener("click", adminAlertActionHandler, true);
    }

    function ensureAdminAlertRuntime() {
        if (!alertState.memoryLoaded) {
            alertState.memory = readAdminAlertMemory();
            alertState.memoryLoaded = true;
        }
        installAdminAlertActionDelegation();
        return ensureAdminGrowthViews();
    }
'''
if old_install not in admin:
    raise SystemExit('current Admin alert delegation block not found')
admin = admin.replace(old_install, new_install, 1)

admin = admin.replace(
'''    async function loadAdminAlerts({ forceSound = false } = {}) {
        if (!ensureAdminGrowthViews()) return;
''',
'''    async function loadAdminAlerts({ forceSound = false } = {}) {
        if (!ensureAdminAlertRuntime()) return;
''',
1
)

admin = admin.replace(
'''    function initialize() {
        ensureStyles();
        alertState.memory = readAdminAlertMemory();
        installAdminAlertActionDelegation();
        ensureAdminGrowthViews();
''',
'''    function initialize() {
        ensureStyles();
        ensureAdminAlertRuntime();
''',
1
)

required = [
    'window.__KantuAdminGrowthLoaded = true;',
    'memoryLoaded: false',
    'function ensureAdminAlertRuntime()',
    'if (!ensureAdminAlertRuntime()) return;',
    'document.addEventListener("click", adminAlertActionHandler, true);'
]
for needle in required:
    if needle not in admin:
        raise SystemExit(f'missing Admin runtime fix marker: {needle}')
admin_path.write_text(admin, encoding='utf-8')

check_path = Path('scripts/check-kantu-growth.mjs')
check = check_path.read_text(encoding='utf-8')
needle = '''assert.match(admin, /cleanupResolvedAlertMemory/, "Las alertas resueltas deben limpiar su estado temporal.");
'''
insert = needle + '''assert.match(admin, /__KantuAdminGrowthLoaded/, "Admin Growth debe ser singleton para no duplicar timers ni estados.");
assert.match(admin, /function ensureAdminAlertRuntime\(\)/, "refreshAlerts debe poder completar su runtime aunque initialize todavía no haya terminado.");
assert.match(admin, /async function loadAdminAlerts[\\s\\S]*ensureAdminAlertRuntime\(\)/, "La carga de alertas debe garantizar memoria, vista y acciones antes de renderizar.");
assert.match(admin, /addEventListener\("click", adminAlertActionHandler, true\)/, "Las acciones del Centro de alertas deben capturarse de forma estable ante capas UI intermedias.");
'''
if needle not in check:
    raise SystemExit('growth contract insertion point not found')
check = check.replace(needle, insert, 1)
check_path.write_text(check, encoding='utf-8')

print('Admin alert runtime race fixed and contracts strengthened')
