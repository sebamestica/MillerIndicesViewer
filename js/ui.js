import { getState, updateState, getActiveCrystalSystem } from './state.js';
import { parseIntegerInput } from './math.js';
import { resetCameraView } from './scene.js';
import * as AdvancedPanel from './advanced-panel.js';
import * as CalculatorPanel from './calculator-panel.js';


export function bindUIEvents(updateScene, updateSceneThrottled) {
    // Tab buttons for system switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = (e) => {
            const sys = e.currentTarget.dataset.system;
            if (sys) {
                import('./app.js').then(app => {
                    // El orquestador app.switchCrystalSystemSafely ya maneja la sincronización
                    app.switchCrystalSystemSafely(sys);
                });
            }
        };
    });

    const allInputs = document.querySelectorAll('.coord-input, #cli-input');
    allInputs.forEach(input => {
        input.oninput = () => {
            sanitizeIntegerInput(input);
            if (input.id === 'h-h' || input.id === 'h-k') {
                const hH = document.getElementById('h-h');
                const hK = document.getElementById('h-k');
                const hI = document.getElementById('h-i');
                const h = parseIntegerInput(hH.value);
                const k = parseIntegerInput(hK.value);
                if (hI) hI.value = (h !== null && k !== null) ? -(h + k) : '...';
            }
            updateSceneThrottled();
        };
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                document.getElementById('btn-apply').click();
            }
            e.stopPropagation();
        };
        input.onkeyup = (e) => e.stopPropagation();
    });

    document.getElementById('btn-apply').onclick = updateScene;
    document.getElementById('btn-reset').onclick = () => resetCameraView(true);

    ['toggle-plane', 'toggle-vector', 'toggle-origin'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onchange = updateScene;
    });

    const scaleInput = document.getElementById('input-scale');
    if (scaleInput) {
        scaleInput.oninput = (e) => {
            const val = parseFloat(e.target.value);
            updateState({ vecScale: val });
            const valTxt = document.getElementById('val-scale-txt');
            if (valTxt) valTxt.textContent = val;
            updateScene();
        };
    }

    const cliInput = document.getElementById('cli-input');
    const cliRunBtn = document.getElementById('btn-cli-run');
    if (cliInput && cliRunBtn) {
        const handleCLI = () => {
            const cmd = cliInput.value.trim();
            if(cmd) {
                processCLICommand(cmd, updateScene);
                cliInput.value = '';
            }
        };
        cliRunBtn.onclick = handleCLI;
        cliInput.onkeypress = (e) => { if(e.key === 'Enter') handleCLI(); };
    }


    const engToggle = document.getElementById('eng-toggle');
    if (engToggle) {
        engToggle.onchange = (e) => {
            if (e.target.checked) {
                const calcPanel = document.getElementById('calc-panel');
                if (calcPanel) calcPanel.classList.remove('visible');
                const mechPanel = document.getElementById('mech-panel');
                if (mechPanel) mechPanel.classList.remove('visible');
            }
            AdvancedPanel.setEngineeringModeEnabled(e.target.checked);
            updateScene();
        };
    }
}

export function sanitizeIntegerInput(el) {
    let val = el.value;
    let sanitized = val.replace(/[^-0-9]/g, '');
    const isNegative = sanitized.startsWith('-');
    const digitsOnly = sanitized.replace(/-/g, '');
    sanitized = (isNegative ? '-' : '') + digitsOnly;
    if (val !== sanitized) el.value = sanitized;
    return sanitized;
}

export function sanitizeFloatInput(el) {
    let val = el.value;
    // Remueve todo lo que no sea dígito, signo menos, signo más, punto o coma
    let sanitized = val.replace(/[^-+0-9.,]/g, '');
    
    // Permitir un signo opcional (+ o -) al inicio
    let firstChar = '';
    if (sanitized.startsWith('-') || sanitized.startsWith('+')) {
        firstChar = sanitized.charAt(0);
        sanitized = sanitized.slice(1);
    }
    
    // Quitar cualquier otro signo que haya quedado
    sanitized = sanitized.replace(/[-+]/g, '');
    
    // Permitir solo el primer punto o coma, y eliminar los demás
    let parts = sanitized.split(/[.,]/);
    if (parts.length > 2) {
        sanitized = parts[0] + '.' + parts.slice(1).join('');
    } else if (parts.length === 2) {
        const match = val.match(/[.,]/);
        const sep = match ? match[0] : '.';
        sanitized = parts[0] + sep + parts[1];
    }
    
    sanitized = firstChar + sanitized;
    if (val !== sanitized) el.value = sanitized;
    return sanitized;
}

/**
 * CAMBIO Visual del sistema - No dispara lógica pesada (la lógica está en app.js)
 */
export function switchSystemUI(sys) {
    const isCubic = (sys === 'cubic');
    
    // 1. UI Tabs
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.system === sys));
    
    // 2. Visibilidad de Contenedores de Input
    const cubicInputs = document.getElementById('inputs-cubic');
    const hcpInputs = document.getElementById('inputs-hcp');
    if (cubicInputs) cubicInputs.style.display = isCubic ? 'grid' : 'none';
    if (hcpInputs) hcpInputs.style.display = isCubic ? 'none' : 'grid';

    // 3. Textos y etiquetas principales
    const btnMech = document.getElementById('btn-open-mech');
    if (btnMech) {
        btnMech.style.opacity = isCubic ? '1' : '0.4';
        btnMech.style.cursor = isCubic ? 'pointer' : 'not-allowed';
        btnMech.title = isCubic ? '' : 'La simulación mecánica automática no está disponible para HCP.';
    }

    if (isCubic) {
        document.getElementById('system-subtitle').textContent = 'Laboratorio Cristalográfico Cúbico';
        document.getElementById('input-title').textContent = 'Índices (h k l)';
        document.getElementById('val-sys').textContent = 'Cúbico';
        const legend = document.getElementById('legend-axes');
        if (legend) legend.textContent = 'Ejes Cúbicos: X (Azul), Y (Rojo), Z (Verde)';
    } else {
        document.getElementById('system-subtitle').textContent = 'Laboratorio Cristalográfico Hexagonal (HCP)';
        document.getElementById('input-title').textContent = 'Índices (h k i l)';
        document.getElementById('val-sys').textContent = 'Hexagonal / HCP';
        const legend = document.getElementById('legend-axes');
        if (legend) legend.textContent = 'Ejes HCP: a1 (Azul), a2 (Rojo), a3 (Naranja), c (Verde)';
    }

    // 4. Actualizar presets
    buildPresetsUI(sys);
}


export function buildPresetsUI(system) {
    const container = document.getElementById('preset-container');
    if (!container) return;
    container.innerHTML = '';
    const items = system === 'cubic' 
        ? [[1,0,0],[1,1,0],[1,1,1],[2,1,1],[-1,1,1],[1,0,-1]]
        : [[1,0,-1,0],[1,1,-2,0],[0,0,0,1],[1,0,-1,1],[1,1,-2,1],[-1,2,-1,0]];

    items.forEach(p => {
        const chip = document.createElement('div');
        chip.className = 'preset-chip';
        chip.textContent = `(${p.join(' ')})`;
        chip.onclick = () => {
            if(system === 'cubic') {
                document.getElementById('c-h').value = p[0];
                document.getElementById('c-k').value = p[1];
                document.getElementById('c-l').value = p[2];
            } else {
                document.getElementById('h-h').value = p[0];
                document.getElementById('h-k').value = p[1];
                document.getElementById('h-l').value = p[3];
                document.getElementById('h-i').value = p[2];
            }
            document.getElementById('btn-apply').click();
        };
        container.appendChild(chip);
    });
}


export function updateSidebarInputs(h, k, l) {
    const sys = getActiveCrystalSystem();
    if (sys === 'cubic') {
        const inH = document.getElementById('c-h');
        const inK = document.getElementById('c-k');
        const inL = document.getElementById('c-l');
        if (inH) inH.value = h;
        if (inK) inK.value = k;
        if (inL) inL.value = l;
    } else {
        const inH = document.getElementById('h-h');
        const inK = document.getElementById('h-k');
        const inL = document.getElementById('h-l');
        const inI = document.getElementById('h-i');
        if (inH) inH.value = h;
        if (inK) inK.value = k;
        if (inL) inL.value = l;
        if (inI) inI.value = -(h + k);
    }
}


export function updateTechnicalPanel(state, points) {
    const { system, h, k, i, l } = state.indices;
    const sys = state.system || state.activeCrystalSystem;
    
    if (sys === 'cubic') {
        document.getElementById('val-coords').textContent = `(${h} ${k} ${l})`;
        let mag = Math.sqrt(h*h + k*k + l*l);
        document.getElementById('val-vec').textContent = `|V| ≈ ${mag.toFixed(3)}`;
    } else {
        document.getElementById('val-coords').textContent = `(${h} ${k} ${i} ${l})`;
        document.getElementById('val-vec').textContent = `Renderizado (HCP)`;
    }
    document.getElementById('val-inter').textContent = `${points.length} puntos`;
}


export function showError(msg, type="error") {
    const err = document.getElementById('error-box');
    if (!err) return;
    if (msg) {
        err.textContent = msg;
        err.style.display = 'block';
        err.style.color = type === 'info' ? 'var(--text-secondary)' : 'var(--danger)';
        err.style.backgroundColor = type === 'info' ? '#e9ecef' : '#ffeeba';
        err.style.borderColor = type === 'info' ? '#ced4da' : '#ffc107';
    } else {
        err.style.display = 'none';
    }
}


function processCLICommand(cmdStr, updateScene) {
    const out = document.getElementById('cli-output');
    if (!out) return;
    const print = (msg, type='normal') => {
        const color = type === 'error' ? 'var(--danger)' : (type === 'success' ? 'var(--success)' : 'var(--text-main)');
        out.innerHTML += `<div style="color: ${color}">> ${msg}</div>`;
        out.scrollTop = out.scrollHeight;
    };

    print(cmdStr, 'normal');
    const parts = cmdStr.toLowerCase().split(/\s+/);
    if(parts.length === 0) return;
    const cmd = parts[0];

    try {
        if (cmd === 'help' || cmd === 'examples') {
            print('Sistema: system [cubic]', 'success');
            print('Cúbico: plane [h k l] | vector [h k l]', 'success');
        } else if (cmd === 'clear') {
            out.innerHTML = '> Consola limpiada.<br>';
        } else if (cmd === 'system') {
            if (parts[1] !== 'cubic') {
                print('Error: Solo "cubic" es soportado. Sistema hexagonal en reconstrucción.', 'error');
            } else {
                import('./app.js').then(app => {
                    app.switchCrystalSystemSafely('cubic');
                    print('Sistema: cúbico', 'success');
                });
            }
        } else if (cmd === 'plane' || cmd === 'vector') {
            if (parts.length >= 4) {
                import('./app.js').then(app => {
                    app.switchCrystalSystemSafely('cubic');
                    document.getElementById('c-h').value = parts[1];
                    document.getElementById('c-k').value = parts[2];
                    document.getElementById('c-l').value = parts[3];
                    document.getElementById('toggle-plane').checked = (cmd === 'plane');
                    document.getElementById('toggle-vector').checked = (cmd === 'vector');
                    updateScene();
                    print(`Renderizando ${cmd} cúbico (${parts[1]} ${parts[2]} ${parts[3]})`, 'success');
                });
            } else {
                print('Error: Faltan índices (h k l)', 'error');
            }
        } else {
            print(`Error: Comando no reconocido '${cmd}'`, 'error');
        }
    } catch (e) {
        print('Error de ejecución', 'error');
    }
}
