import fs from "node:fs";
import assert from "node:assert/strict";

const jsPath = "js/admin-growth.js";
const cssPath = "css/kantu-growth.css";
const checkPath = "scripts/check-kantu-growth.mjs";

let js = fs.readFileSync(jsPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");
let check = fs.readFileSync(checkPath, "utf8");

function replaceOnce(source, search, replacement, label) {
  assert.ok(source.includes(search), `No se encontró bloque: ${label}`);
  return source.replace(search, replacement);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  assert.ok(pattern.test(source), `No se encontró patrón: ${label}`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

js = replaceOnce(js, `    const alertState = {
        rows: [],
        initialized: false,
        knownKeys: new Set(),
        audioReady: false,
        audioContext: null,
        pollTimer: null,
        repeatTimer: null
    };
`, `    const alertState = {
        rows: [],
        initialized: false,
        knownKeys: new Set(),
        audioReady: false,
        audioContext: null,
        pollTimer: null,
        timingTimer: null,
        memory: {}
    };

    const ADMIN_ALERT_STORAGE_KEY = "kantu_admin_alert_state_v2";
    const ADMIN_ALERT_SNOOZE_MS = 30 * 60_000;
    const ADMIN_ALERT_REPEAT_MS = 30 * 60_000;
    const ADMIN_ALERT_MILESTONES_MS = Object.freeze([
        0,
        5 * 60_000,
        10 * 60_000,
        15 * 60_000,
        30 * 60_000
    ]);
`, "alertState");

js = replaceOnce(js,
`                <p class="admin-alert-sound-note" id="adminAlertSoundNote">🔔 El sonido urgente se activará después de tu primera interacción con esta pestaña.</p>`,
`                <div class="admin-alert-sound-note"><span id="adminAlertSoundNote">🔔 Haz clic o usa el teclado para activar las alarmas del panel.</span><button type="button" id="adminAlertSoundEnable">Activar sonido</button></div>`,
"sound note");

js = replaceOnce(js,
`            section.querySelector("#adminAlertsRefresh")?.addEventListener("click", () => loadAdminAlerts({ forceSound: false }));`,
`            section.querySelector("#adminAlertsRefresh")?.addEventListener("click", () => loadAdminAlerts({ forceSound: false }));
            section.querySelector("#adminAlertSoundEnable")?.addEventListener("click", armAdminAudio);`,
"sound enable listener");

js = replaceRegexOnce(js,
/    function armAdminAudio\(\) \{[\s\S]*?\n    \}\n\n    function playAdminAlarm\(\) \{[\s\S]*?\n    \}\n\n    function severityLabel/,
`    function armAdminAudio() {
        if (alertState.audioReady) {
            processAdminAlarmSchedule();
            return;
        }
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            const note = el("adminAlertSoundNote");
            const button = el("adminAlertSoundEnable");
            if (!AudioContextClass) {
                if (note) note.textContent = "Este navegador no permite la alarma sonora; las alertas visuales siguen activas.";
                if (button) button.hidden = true;
                return;
            }
            alertState.audioContext = alertState.audioContext || new AudioContextClass();
            const finish = () => {
                alertState.audioReady = alertState.audioContext?.state === "running";
                if (alertState.audioReady) {
                    if (note) note.textContent = "🔊 Sonido activado · avisos a 0, 5, 10, 15 y 30 min; después cada 30 min.";
                    if (button) button.hidden = true;
                    processAdminAlarmSchedule();
                } else if (note) {
                    note.textContent = "🔔 Haz clic en ‘Activar sonido’ para permitir las alarmas del panel.";
                }
            };
            if (alertState.audioContext.state === "suspended") {
                alertState.audioContext.resume().then(finish).catch(() => finish());
            } else {
                finish();
            }
        } catch {
            const note = el("adminAlertSoundNote");
            if (note) note.textContent = "No se pudo activar el sonido; las alertas visuales siguen funcionando.";
        }
    }

    function playAdminAlarm() {
        const ctx = alertState.audioContext;
        const modal = el("adminModal");
        if (!alertState.audioReady || !ctx || ctx.state !== "running" || document.hidden || !modal?.classList.contains("show")) return false;
        const start = ctx.currentTime + .03;
        [880, 660, 880, 660].forEach((frequency, index) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = index % 2 ? "square" : "sawtooth";
            osc.frequency.value = frequency;
            const at = start + index * .19;
            gain.gain.setValueAtTime(.0001, at);
            gain.gain.exponentialRampToValueAtTime(.13, at + .02);
            gain.gain.exponentialRampToValueAtTime(.0001, at + .15);
            osc.connect(gain).connect(ctx.destination);
            osc.start(at);
            osc.stop(at + .17);
        });
        return true;
    }

    function severityLabel`,
"audio functions");

js = replaceOnce(js,
`    function severityLabel(value) {
        return value === "urgent" ? "Urgente" : value === "warning" ? "Atención" : "Informativo";
    }
`,
`    function severityLabel(value) {
        return value === "urgent" ? "Urgente" : value === "warning" ? "Atención" : "Informativo";
    }

    function readAdminAlertMemory() {
        try {
            const parsed = JSON.parse(window.localStorage.getItem(ADMIN_ALERT_STORAGE_KEY) || "{}");
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }

    function persistAdminAlertMemory() {
        try {
            window.localStorage.setItem(ADMIN_ALERT_STORAGE_KEY, JSON.stringify(alertState.memory));
        } catch {
            // La UI sigue funcionando aunque localStorage no esté disponible.
        }
    }

    function adminAlertKey(row) {
        return String(row?.alert_key || `${row?.severity || "info"}:${row?.entity_id || ""}:${row?.title || "alert"}`);
    }

    function ensureUrgentAlertMemory(row, now = Date.now()) {
        const key = adminAlertKey(row);
        let meta = alertState.memory[key];
        if (!meta || typeof meta !== "object") {
            meta = {
                firstSeenAt: now,
                nextAlarmAt: now,
                stage: 0,
                acknowledgedAt: 0,
                snoozedUntil: 0,
                lastSoundAt: 0
            };
            alertState.memory[key] = meta;
        }
        return meta;
    }

    function cleanupResolvedAlertMemory(rows) {
        const activeKeys = new Set(rows.map(adminAlertKey));
        let changed = false;
        Object.keys(alertState.memory).forEach(key => {
            if (activeKeys.has(key)) return;
            delete alertState.memory[key];
            changed = true;
        });
        if (changed) persistAdminAlertMemory();
    }

    function advanceUrgentAlarm(meta, now) {
        let nextStage = Math.max(0, Number(meta.stage) || 0) + 1;
        while (nextStage < ADMIN_ALERT_MILESTONES_MS.length) {
            const candidate = Number(meta.firstSeenAt) + ADMIN_ALERT_MILESTONES_MS[nextStage];
            if (candidate > now) {
                meta.stage = nextStage;
                meta.nextAlarmAt = candidate;
                return;
            }
            nextStage += 1;
        }
        meta.stage = ADMIN_ALERT_MILESTONES_MS.length;
        meta.nextAlarmAt = now + ADMIN_ALERT_REPEAT_MS;
    }

    function alertPendingMinutes(row) {
        const serverMinutes = Math.max(0, Number(row?.minutes_waiting) || 0);
        if (serverMinutes > 0 || row?.severity !== "urgent") return serverMinutes;
        const meta = alertState.memory[adminAlertKey(row)];
        return meta?.firstSeenAt ? Math.max(0, Math.floor((Date.now() - Number(meta.firstSeenAt)) / 60_000)) : 0;
    }

    function adminAlertTimingLabel(row, now = Date.now()) {
        if (row?.severity !== "urgent") return "Sin repetición sonora";
        const meta = ensureUrgentAlertMemory(row, now);
        if (Number(meta.acknowledgedAt) > 0) return "Atendiendo · alarma detenida";
        if (Number(meta.snoozedUntil) > now) {
            const minutes = Math.max(1, Math.ceil((Number(meta.snoozedUntil) - now) / 60_000));
            return `Silenciado · vuelve en ${minutes} min`;
        }
        if (!alertState.audioReady) return "Sonido pendiente de activar";
        const remaining = Number(meta.nextAlarmAt) - now;
        if (remaining <= 0) return "Alarma pendiente";
        const minutes = Math.max(1, Math.ceil(remaining / 60_000));
        return `Próxima alarma en ${minutes} min`;
    }

    function updateAdminAlertTimingText(now = Date.now()) {
        document.querySelectorAll("[data-alert-timing-key]").forEach(node => {
            const row = alertState.rows.find(item => adminAlertKey(item) === node.dataset.alertTimingKey);
            if (row) node.textContent = adminAlertTimingLabel(row, now);
        });
    }

    function processAdminAlarmSchedule() {
        const now = Date.now();
        const due = [];
        alertState.rows.forEach(row => {
            if (row.severity !== "urgent") return;
            const meta = ensureUrgentAlertMemory(row, now);
            if (Number(meta.acknowledgedAt) > 0) return;
            if (Number(meta.snoozedUntil) > now) return;
            if (!Number.isFinite(Number(meta.nextAlarmAt))) meta.nextAlarmAt = now;
            if (Number(meta.nextAlarmAt) <= now) due.push(meta);
        });
        if (!due.length || !playAdminAlarm()) return false;
        due.forEach(meta => {
            meta.snoozedUntil = 0;
            meta.lastSoundAt = now;
            advanceUrgentAlarm(meta, now);
        });
        persistAdminAlertMemory();
        updateAdminAlertTimingText(now);
        return true;
    }

    function handleAdminAlertControl(button) {
        const key = String(button.dataset.alertKey || "");
        const action = String(button.dataset.alertControl || "");
        const row = alertState.rows.find(item => adminAlertKey(item) === key);
        if (!row || row.severity !== "urgent") return;
        const now = Date.now();
        const meta = ensureUrgentAlertMemory(row, now);
        if (action === "ack") {
            meta.acknowledgedAt = now;
            meta.snoozedUntil = 0;
            meta.nextAlarmAt = null;
        } else if (action === "snooze") {
            meta.acknowledgedAt = 0;
            meta.snoozedUntil = now + ADMIN_ALERT_SNOOZE_MS;
            meta.stage = ADMIN_ALERT_MILESTONES_MS.length;
            meta.nextAlarmAt = meta.snoozedUntil;
        } else if (action === "resume") {
            meta.firstSeenAt = now;
            meta.acknowledgedAt = 0;
            meta.snoozedUntil = 0;
            meta.stage = 0;
            meta.nextAlarmAt = now;
        } else {
            return;
        }
        persistAdminAlertMemory();
        renderAdminAlerts();
        if (action === "resume") processAdminAlarmSchedule();
    }

    function refreshAdminAlertTiming() {
        const now = Date.now();
        let rerender = false;
        alertState.rows.forEach(row => {
            if (row.severity !== "urgent") return;
            const meta = ensureUrgentAlertMemory(row, now);
            if (Number(meta.snoozedUntil) > 0 && Number(meta.snoozedUntil) <= now) {
                meta.snoozedUntil = 0;
                rerender = true;
            }
        });
        if (rerender) {
            persistAdminAlertMemory();
            renderAdminAlerts();
        } else {
            updateAdminAlertTimingText(now);
        }
        processAdminAlarmSchedule();
    }
`,
"alert helpers");

js = replaceRegexOnce(js,
/    function renderAdminAlerts\(\) \{[\s\S]*?\n    \}\n\n    async function loadAdminAlerts/,
`    function renderAdminAlerts() {
        const list = el("adminAlertsList");
        const summary = el("adminAlertSummary");
        if (!list || !summary) return;
        const urgent = alertState.rows.filter(row => row.severity === "urgent").length;
        const warning = alertState.rows.filter(row => row.severity === "warning").length;
        const info = alertState.rows.filter(row => row.severity === "info").length;
        summary.innerHTML = `<div><span>Urgentes</span><strong>${urgent}</strong></div><div><span>Necesitan atención</span><strong>${warning}</strong></div><div><span>Informativas</span><strong>${info}</strong></div>`;
        if (!alertState.rows.length) {
            list.innerHTML = '<div class="commerce-empty">No hay incidencias operativas activas. Todo está bajo control.</div>';
            return;
        }
        const now = Date.now();
        list.innerHTML = alertState.rows.map(row => {
            const key = adminAlertKey(row);
            const isUrgent = row.severity === "urgent";
            const meta = isUrgent ? ensureUrgentAlertMemory(row, now) : null;
            const acknowledged = Boolean(meta && Number(meta.acknowledgedAt) > 0);
            const snoozed = Boolean(meta && Number(meta.snoozedUntil) > now);
            const statusClass = acknowledged ? " is-acknowledged" : snoozed ? " is-snoozed" : "";
            const pending = alertPendingMinutes(row);
            const urgentControls = !isUrgent ? "" : acknowledged || snoozed
                ? `<button type="button" class="admin-alert-secondary" data-alert-control="resume" data-alert-key="${core.escapeHtml(key)}">Reactivar alarma</button>`
                : `<button type="button" class="admin-alert-secondary" data-alert-control="ack" data-alert-key="${core.escapeHtml(key)}">Estoy atendiendo</button><button type="button" class="admin-alert-quiet" data-alert-control="snooze" data-alert-key="${core.escapeHtml(key)}">Silenciar 30 min</button>`;
            return `<article class="admin-alert-card ${core.escapeHtml(row.severity || "info")}${statusClass}" data-alert-card-key="${core.escapeHtml(key)}">
                <div class="admin-alert-card-copy"><h4>${core.escapeHtml(row.title || "Alerta")}</h4><p>${core.escapeHtml(row.body || "")}</p><div class="admin-alert-meta"><span class="admin-alert-severity">${severityLabel(row.severity)}</span><span>${pending > 0 ? `${pending} min pendiente` : "Recién detectada"}</span>${isUrgent ? `<span class="admin-alert-timing" data-alert-timing-key="${core.escapeHtml(key)}">${core.escapeHtml(adminAlertTimingLabel(row, now))}</span>` : ""}</div></div>
                <div class="admin-alert-actions"><button type="button" class="admin-alert-review" data-admin-alert-action="${core.escapeHtml(row.action_view || "dashboard")}" data-alert-entity="${core.escapeHtml(row.entity_id || "")}">Revisar</button>${urgentControls}</div>
            </article>`;
        }).join("");
        list.querySelectorAll("[data-admin-alert-action]").forEach(button => button.addEventListener("click", () => openAdminAlertTarget(button)));
        list.querySelectorAll("[data-alert-control]").forEach(button => button.addEventListener("click", () => handleAdminAlertControl(button)));
    }

    async function loadAdminAlerts`,
"render alerts");

js = replaceRegexOnce(js,
/    async function loadAdminAlerts\(\{ forceSound = false \} = \{\}\) \{[\s\S]*?\n    \}\n\n    async function openAdminAlertTarget/,
`    async function loadAdminAlerts({ forceSound = false } = {}) {
        if (!ensureAdminGrowthViews()) return;
        const result = await supabaseClient.rpc("admin_operational_alerts");
        if (result.error) {
            const list = el("adminAlertsList");
            if (list) list.innerHTML = '<div class="admin-empty">No pudimos cargar las alertas operativas.</div>';
            return;
        }
        const rows = Array.isArray(result.data) ? result.data : [];
        const now = Date.now();
        rows.filter(row => row.severity === "urgent").forEach(row => ensureUrgentAlertMemory(row, now));
        cleanupResolvedAlertMemory(rows);
        const nextKeys = new Set(rows.map(row => String(row.alert_key)));
        alertState.rows = rows;
        renderAdminAlerts();
        syncAdminAlertBadge();
        if (forceSound) {
            rows.filter(row => row.severity === "urgent").forEach(row => {
                const meta = ensureUrgentAlertMemory(row, now);
                if (!meta.acknowledgedAt && !(Number(meta.snoozedUntil) > now)) meta.nextAlarmAt = now;
            });
        }
        if (alertState.audioReady) processAdminAlarmSchedule();
        alertState.knownKeys = nextKeys;
        alertState.initialized = true;
        persistAdminAlertMemory();
    }

    async function openAdminAlertTarget`,
"load alerts");

js = replaceOnce(js,
`    function startAdminAlertPolling() {
        window.clearInterval(alertState.pollTimer);
        window.clearInterval(alertState.repeatTimer);
        alertState.pollTimer = window.setInterval(() => {
            const modal = el("adminModal");
            if (modal?.classList.contains("show")) loadAdminAlerts();
        }, 30_000);
        alertState.repeatTimer = window.setInterval(() => {
            if (alertState.rows.some(row => row.severity === "urgent")) playAdminAlarm();
        }, 5 * 60_000);
    }
`,
`    function startAdminAlertPolling() {
        window.clearInterval(alertState.pollTimer);
        window.clearInterval(alertState.timingTimer);
        alertState.pollTimer = window.setInterval(() => {
            const modal = el("adminModal");
            if (modal?.classList.contains("show")) loadAdminAlerts();
        }, 30_000);
        alertState.timingTimer = window.setInterval(refreshAdminAlertTiming, 10_000);
    }
`,
"polling");

js = replaceOnce(js,
`        ensureStyles();
        ensureAdminGrowthViews();
        installRecommendationHooks();
        startAdminAlertPolling();`,
`        ensureStyles();
        alertState.memory = readAdminAlertMemory();
        ensureAdminGrowthViews();
        installRecommendationHooks();
        startAdminAlertPolling();`,
"initialize memory");

js = replaceOnce(js,
`        document.addEventListener("keydown", arm, { once: true, capture: true });

        const modal = el("adminModal");`,
`        document.addEventListener("keydown", arm, { once: true, capture: true });
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) refreshAdminAlertTiming();
        });

        const modal = el("adminModal");`,
"visibility refresh");

const cssMarker = "/* Admin alert escalation v2 */";
if (!css.includes(cssMarker)) {
  css += `\n\n${cssMarker}\n.admin-alert-card-copy { min-width: 0; }\n.admin-alert-meta { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; margin-top: 7px; color: #8b777d; font-size: 9px; }\n.admin-alert-severity { padding: 3px 7px; border-radius: 999px; background: #f6ebed; color: #874154; font-weight: 800; }\n.admin-alert-card.urgent .admin-alert-severity { background: #fff0f2; color: #a31e3f; }\n.admin-alert-timing { color: #96502e; font-weight: 800; }\n.admin-alert-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; max-width: 330px; }\n.admin-alert-card .admin-alert-actions button { min-height: 36px; padding: 7px 10px; }\n.admin-alert-card .admin-alert-review { border-color: #a5405d; background: #9c3454; color: #fff; }\n.admin-alert-card .admin-alert-secondary { border-color: #d8bdc5; background: #fff7f8; color: #8d3450; }\n.admin-alert-card .admin-alert-quiet { border-color: #e2d5ca; background: #fffaf4; color: #765b45; }\n.admin-alert-card.is-acknowledged { background: #fbfaf8; border-color: #ddd4cf; }\n.admin-alert-card.is-acknowledged::before { background: #6f8d7c; }\n.admin-alert-card.is-snoozed { background: #fffaf4; }\n.admin-alert-sound-note { display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n.admin-alert-sound-note span { min-width: 0; }\n.admin-alert-sound-note button { flex: 0 0 auto; min-height: 34px; padding: 6px 10px; border: 1px solid #d7b78f; border-radius: 9px; background: #fffaf4; color: #79522f; font-size: 9px; font-weight: 800; }\n.admin-alert-sound-note button[hidden] { display: none !important; }\n@media (max-width: 760px) {\n    .admin-alert-card .admin-alert-actions { grid-column: 2; max-width: none; justify-content: flex-start; }\n    .admin-alert-card .admin-alert-actions button { grid-column: auto; flex: 1 1 120px; }\n    .admin-alert-sound-note { align-items: flex-start; flex-direction: column; }\n}\n`;
}

check = replaceOnce(check,
`assert.match(admin, /5 \\* 60_000/, "Las alertas urgentes deben poder repetir el aviso sonoro cada 5 minutos.");`,
`assert.match(admin, /5 \\* 60_000[\\s\\S]*10 \\* 60_000[\\s\\S]*15 \\* 60_000[\\s\\S]*30 \\* 60_000/, "La escalada urgente debe cubrir 5, 10, 15 y 30 minutos.");\nassert.match(admin, /ADMIN_ALERT_REPEAT_MS\\s*=\\s*30 \\* 60_000/, "Después de 30 minutos la alarma debe repetir cada 30 minutos.");\nassert.match(admin, /Estoy atendiendo/, "Admin debe permitir reconocer una alerta y detener su repetición.");\nassert.match(admin, /Silenciar 30 min/, "Admin debe permitir silenciar temporalmente una alerta.");\nassert.match(admin, /kantu_admin_alert_state_v2/, "El reconocimiento y silencio deben persistir localmente.");\nassert.match(admin, /cleanupResolvedAlertMemory/, "Las alertas resueltas deben limpiar su estado temporal.");`,
"growth cadence contracts");

fs.writeFileSync(jsPath, js);
fs.writeFileSync(cssPath, css);
fs.writeFileSync(checkPath, check);
console.log("Admin alert escalation applied");
