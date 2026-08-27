from pathlib import Path

path = Path('js/admin-growth.js')
text = path.read_text(encoding='utf-8')
old = '''        list.querySelectorAll("[data-admin-alert-action]").forEach(button => button.addEventListener("click", () => openAdminAlertTarget(button)));
        list.querySelectorAll("[data-alert-control]").forEach(button => button.addEventListener("click", () => handleAdminAlertControl(button)));
    }
'''
new = '''        if (list.dataset.kantuAlertActionsBound !== "true") {
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
    }
'''
if old not in text:
    raise SystemExit('target block not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Admin alert event delegation applied')
