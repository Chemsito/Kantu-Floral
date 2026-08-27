from pathlib import Path

path = Path('js/admin-growth.js')
text = path.read_text(encoding='utf-8')
old_block = '''        if (list.dataset.kantuAlertActionsBound !== "true") {
            list.dataset.kantuAlertActionsBound = "true";
            list.addEventListener("click", event => {
                const control = event.target.closest?.("[data-alert-control]");
                if (control) {
                    handleAdminAlertControl(control);
                    return;
                }
                const review = event.target.closest?.("[data-admin-alert-action]");
                if (review) openAdminAlertTarget(review);
            });
        }
'''
if old_block not in text:
    raise SystemExit('old list delegation not found')
text = text.replace(old_block, '', 1)
needle = '''    function refreshAdminAlertTiming() {
'''
insert = '''    function installAdminAlertActionDelegation() {
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
if needle not in text:
    raise SystemExit('refresh needle not found')
text = text.replace(needle, insert + needle, 1)
init_old = '''        alertState.memory = readAdminAlertMemory();
        ensureAdminGrowthViews();
'''
init_new = '''        alertState.memory = readAdminAlertMemory();
        installAdminAlertActionDelegation();
        ensureAdminGrowthViews();
'''
if init_old not in text:
    raise SystemExit('initialize needle not found')
text = text.replace(init_old, init_new, 1)
path.write_text(text, encoding='utf-8')
print('Document-level Admin alert delegation applied')
