from pathlib import Path

admin_path = Path('js/admin-growth.js')
admin = admin_path.read_text(encoding='utf-8')
old = '''        const arm = () => armAdminAudio();
        document.addEventListener("pointerdown", arm, { once: true, capture: true });
        document.addEventListener("keydown", arm, { once: true, capture: true });
'''
new = '''        const arm = () => armAdminAudio();
        document.addEventListener("click", arm, { once: true, capture: true });
'''
if old not in admin:
    raise SystemExit('audio arming block not found')
admin = admin.replace(old, new, 1)
admin_path.write_text(admin, encoding='utf-8')

check_path = Path('scripts/check-kantu-growth.mjs')
check = check_path.read_text(encoding='utf-8')
needle = '''assert.match(admin, /addEventListener\\("click", adminAlertActionHandler, true\\)/, "Las acciones del Centro de alertas deben capturarse de forma estable ante capas UI intermedias.");
'''
addition = needle + '''assert.match(admin, /addEventListener\\("click", arm, \\{ once: true, capture: true \\}\\)/, "El audio Admin debe activarse en click para no desplazar la tarjeta entre pointerdown y pointerup.");
assert.doesNotMatch(admin, /addEventListener\\("pointerdown", arm/, "La activación de audio no debe consumir el primer click por un cambio de layout durante pointerdown.");
'''
if needle not in check:
    raise SystemExit('contract insertion point not found')
check = check.replace(needle, addition, 1)
check_path.write_text(check, encoding='utf-8')
print('Admin audio first-click race fixed')
