import { sanitizeIntegerInput } from './ui.js';
import * as MaterialsData from './materials-data.js';
import * as CrystalCalculator from './crystal-calculator.js';
import { getActiveCalculatorContext, setActiveCalculatorContext, getState } from './state.js';
import { parseFloatInput } from './math.js';

let isPanelOpen = false;

export async function initializeCalculatorPanel() {
    renderCalculatorContent();
    bindCalculatorEvents();
    
    await MaterialsData.loadIsotopesLibrary();
    const materials = await MaterialsData.loadMaterialsLibrary();
    populateMaterialSelector(materials);
}

export function syncCalculatorWithAppState(state) {
    const isHex = state && state.system === 'hcp';
    setActiveCalculatorContext(isHex ? 'hcp' : 'cubic');
    
    // 1. Actualizar Switch UI
    const btnCubic = document.getElementById('calc-switch-cubic');
    const btnHex = document.getElementById('calc-switch-hex');
    
    if (btnCubic) btnCubic.classList.toggle('active', !isHex);
    if (btnHex) btnHex.classList.toggle('active', isHex);

    // 2. Mostrar/Ocultar campos hexagonales
    const cContainer = document.getElementById('calc-c-container');
    if (cContainer) cContainer.style.display = isHex ? 'block' : 'none';

    // 3. Selector de Estructura
    const structSelect = document.getElementById('calc-structure-select');
    if (structSelect) {
        if (isHex) {
            structSelect.innerHTML = '<option value="HCP">Hexagonal Compacta (HCP)</option>';
            structSelect.value = 'HCP';
            structSelect.disabled = true;
        } else {
            structSelect.innerHTML = `
                <option value="SC">Cúbica Simple (SC)</option>
                <option value="BCC">Cúbica Centrada en el Cuerpo (BCC)</option>
                <option value="FCC" selected>Cúbica Centrada en las Caras (FCC)</option>
            `;
            structSelect.disabled = false;
            structSelect.value = state.structure || 'FCC';
        }
    }

    // 4. Aviso de Sincronización
    const infoMsg = document.getElementById('calc-info-msg');
    if (infoMsg) {
        infoMsg.textContent = `Datos sincronizados con la escena 3D (${isHex ? 'hexagonal' : 'cúbico'}).`;
    }

    // 5. Miller Indices
    const hInput = document.getElementById('calc-h');
    const kInput = document.getElementById('calc-k');
    const lInput = document.getElementById('calc-l');
    
    if (hInput) hInput.value = state.indices.h;
    if (kInput) kInput.value = state.indices.k;
    if (lInput) lInput.value = state.indices.l;
    
    const lLabel = document.querySelector('label[for="calc-l"]');
    if (isHex && lLabel) {
        const iVal = -(state.indices.h + state.indices.k);
        lLabel.textContent = `l (i=${iVal})`;
    } else if (lLabel) {
        lLabel.textContent = `l`;
    }
}

export function toggleCalculatorPanel() {
    isPanelOpen ? closeCalculatorPanel() : openCalculatorPanel();
}

export function hydrateCalculatorFromGlobalState() {
    const state = getState();
    const isHex = state.system === 'hexagonal';
    
    const inputA = document.getElementById('calc-a');
    const inputC = document.getElementById('calc-c');
    const inputMass = document.getElementById('calc-mass');
    const inputH = document.getElementById('calc-h');
    const inputK = document.getElementById('calc-k');
    const inputL = document.getElementById('calc-l');

    if (inputA) inputA.value = state.latticeParams.a || '';
    if (inputC) inputC.value = state.latticeParams.c || '';
    if (inputMass) inputMass.value = state.latticeParams.mass || '';
    
    if (inputH) inputH.value = state.indices.h ?? 1;
    if (inputK) inputK.value = state.indices.k ?? 1;
    if (inputL) inputL.value = state.indices.l ?? 1;

    syncCalculatorWithAppState(state);
    
    if (typeof window.triggerCalculatorUpdate === 'function') {
        window.triggerCalculatorUpdate();
    }
}

export function openCalculatorPanel() {
    const panel = document.getElementById('calc-panel');
    if (panel) {
        panel.classList.add('visible');
        isPanelOpen = true;
        hydrateCalculatorFromGlobalState();
        
        // Sincronización de Modos (Exclusividad)
        document.getElementById('advanced-panel')?.classList.remove('visible');
        document.body.classList.remove('eng-mode-active');
        const engToggle = document.getElementById('eng-toggle');
        if (engToggle) engToggle.checked = false;

        document.getElementById('mech-panel')?.classList.remove('visible');
        document.body.classList.remove('mech-mode-active');
        
        document.body.classList.add('calc-mode-active');
    }
}

export function closeCalculatorPanel() {
    const panel = document.getElementById('calc-panel');
    if (panel) {
        panel.classList.remove('visible');
        isPanelOpen = false;
        document.body.classList.remove('calc-mode-active');
    }
}

function populateMaterialSelector(materials) {
    const select = document.getElementById('calc-material-select');
    if (!select) return;
    
    if (!materials || materials.length === 0) {
        select.innerHTML = '<option value="custom">Error al cargar catálogo</option>';
        return;
    }
    
    select.innerHTML = '<option value="custom">Manual / Personalizado</option>';
    materials.forEach(mat => {
        const opt = document.createElement('option');
        opt.value = mat.id;
        opt.textContent = `${mat.name} (${mat.symbol}) - ${mat.structure}`;
        select.appendChild(opt);
    });
}

function applySelectedMaterial(materialId) {
    const mat = MaterialsData.getMaterialById(materialId);
    const structSelect = document.getElementById('calc-structure-select');
    const inputA = document.getElementById('calc-a');
    const inputMass = document.getElementById('calc-mass');

    if (mat) {
        structSelect.value = mat.structure;
        structSelect.disabled = true;
        inputA.value = mat.latticeParameterA;
        inputA.disabled = true;
        inputMass.value = mat.atomicMass;
        inputMass.disabled = true;
        
        // Reset Isotopic to Natural on choice
        const isoMode = document.getElementById('calc-iso-mode');
        if (isoMode) isoMode.value = 'natural';
        document.getElementById('calc-iso-single-container').style.display = 'none';
        document.getElementById('calc-iso-custom-container').style.display = 'none';

        updateMaterialSummary(mat);
        updateIsotopeDropdown(mat);
    } else {
        structSelect.disabled = false;
        inputA.disabled = false;
        inputMass.disabled = false;
        clearMaterialSummary();
        updateIsotopeDropdown(null);
    }
}

function updateIsotopeDropdown(mat) {
    const singleSelect = document.getElementById('calc-iso-single-select');
    const customList = document.getElementById('calc-iso-custom-list');
    if (!singleSelect || !customList) return;

    if (!mat) {
        singleSelect.innerHTML = '<option value="">Seleccione un material del catálogo...</option>';
        customList.innerHTML = '';
        return;
    }

    const iso = MaterialsData.getIsotopesForSymbol(mat.symbol);
    if (!iso || iso.length === 0) {
        singleSelect.innerHTML = '<option value="">No hay datos isotópicos para ' + mat.symbol + '</option>';
        customList.innerHTML = '<div style="color:#d9534f;">Sin datos isotópicos.</div>';
        return;
    }

    singleSelect.innerHTML = iso.map((i, idx) => 
        `<option value="${idx}">${i.isotope} (Masa: ${i.mass} u, Abundancia: ${i.abundance}%)</option>`
    ).join('');

    customList.innerHTML = iso.map((i, idx) => `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; align-items:center;">
            <span>${i.isotope} (${i.mass} u)</span>
            <div><input type="number" id="calc-iso-mix-${idx}" class="calc-input iso-mix-input" style="width:60px; padding:2px;" value="${i.abundance}" min="0" max="100"> %</div>
        </div>
    `).join('');

    const mixInputs = document.querySelectorAll('.iso-mix-input');
    mixInputs.forEach(inp => inp.addEventListener('input', () => {
        if (typeof window.triggerCalculatorUpdate === 'function') window.triggerCalculatorUpdate();
    }));
}

function updateMaterialSummary(mat) {
    const container = document.getElementById('calc-summary-badge');
    if (!container) return;
    container.innerHTML = `
        <div style="background: #e6fffa; color: #006666; padding: 10px; border-radius: 6px; font-size: 0.8rem; border: 1px solid #b2f5ea;">
            <strong>${mat.name} (${mat.symbol})</strong>: ${mat.spaceGroup} - Fuente: ${mat.source}
        </div>
    `;
}

function clearMaterialSummary() {
    const container = document.getElementById('calc-summary-badge');
    if (container) container.innerHTML = '';
}

export function syncCalculatorStateToScene() {
    const inputs = getCalculatorInputs();
    
    import('./app.js').then(app => {
        const sys = getActiveCalculatorContext();
        app.switchCrystalSystemSafely(sys);
        
        import('./state.js').then(stateMod => {
            stateMod.updateState({
                latticeParams: { a: inputs.a, c: inputs.c, mass: inputs.atomicMass },
                h: inputs.h,
                k: inputs.k,
                l: inputs.l,
                i: sys === 'hcp' ? -(inputs.h + inputs.k) : 0
            });
            
            import('./ui.js').then(ui => {
                ui.updateSidebarInputs(inputs.h, inputs.k, inputs.l);
                app.updateSceneGeometry();
            });
        });
    });
}

function bindCalculatorEvents() {
    document.getElementById('btn-close-calc')?.addEventListener('click', closeCalculatorPanel);
    
    // Nuevo botón de "Aplicar a Escena"
    const btnSyncToScene = document.getElementById('calc-btn-apply-scene');
    if (btnSyncToScene) {
        btnSyncToScene.onclick = () => {
            syncCalculatorStateToScene();
        };
    }

    document.getElementById('calc-material-select')?.addEventListener('change', (e) => {
        applySelectedMaterial(e.target.value);
        if (typeof window.triggerCalculatorUpdate === 'function') window.triggerCalculatorUpdate();
    });

    ['calc-a', 'calc-c', 'calc-mass', 'calc-h', 'calc-k', 'calc-l', 'calc-structure-select', 'calc-iso-mode', 'calc-iso-single-select'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        
        el.addEventListener('input', () => {
             if (typeof window.triggerCalculatorUpdate === 'function') window.triggerCalculatorUpdate();
        });

        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                syncCalculatorStateToScene();
            }
            e.stopPropagation();
        });
    });

    document.getElementById('calc-iso-header')?.addEventListener('click', () => {
        const content = document.getElementById('calc-iso-content');
        const arrow = document.getElementById('calc-iso-arrow');
        if (!content || !arrow) return;
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
        arrow.style.transform = content.style.display === 'none' ? 'rotate(0deg)' : 'rotate(180deg)';
    });

    document.getElementById('calc-iso-mode')?.addEventListener('change', (e) => {
        const mode = e.target.value;
        document.getElementById('calc-iso-single-container').style.display = (mode === 'single') ? 'block' : 'none';
        document.getElementById('calc-iso-custom-container').style.display = (mode === 'custom') ? 'block' : 'none';
    });

    const btnCubic = document.getElementById('calc-switch-cubic');
    const btnHex = document.getElementById('calc-switch-hex');

    btnCubic?.addEventListener('click', () => {
        import('./app.js').then(app => app.switchCrystalSystemSafely('cubic'));
    });
    btnHex?.addEventListener('click', () => {
        import('./app.js').then(app => app.switchCrystalSystemSafely('hcp'));
    });
}

function renderCalculatorContent() {
    const container = document.getElementById('calc-sections');
    if (!container) return;

    container.innerHTML = `
        <div id="calc-system-selector" style="margin-bottom: 20px; display: flex; background: #f1f3f5; padding: 4px; border-radius: 10px; gap: 4px;">
            <button id="calc-switch-cubic" class="calc-system-btn active" style="flex:1; padding: 8px; border:none; border-radius: 7px; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">CÚBICO</button>
            <button id="calc-switch-hex" class="calc-system-btn" style="flex:1; padding: 8px; border:none; border-radius: 7px; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">HEXAGONAL</button>
        </div>

        <div class="calc-section">
            <h3 class="calc-section-title">1. Material y Red</h3>
            <div class="calc-field">
                <label>Material del Catálogo</label>
                <select id="calc-material-select" class="calc-select">
                    <option value="custom">Cargando...</option>
                </select>
            </div>
            <div id="calc-summary-badge" style="margin-bottom: 12px;"></div>

            <!-- Panel Isotópico Colapsable -->
            <div id="calc-iso-panel" style="border: 1px solid #edf2f7; border-radius: 6px; margin-bottom: 15px; overflow: hidden;">
                <div id="calc-iso-header" style="background: #f7fafc; padding: 10px 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf2f7;">
                    <span style="font-size: 0.75rem; font-weight: 700; color: #4a5568;">COMPOSICIÓN ISOTÓPICA</span>
                    <span id="calc-iso-arrow" style="font-size: 0.6rem; transition: transform 0.2s;">▼</span>
                </div>
                <div id="calc-iso-content" style="padding: 12px; display: none; background: #fff;">
                    <div style="font-size: 0.65rem; color: #718096; margin-bottom: 10px; line-height: 1.3; background: #fffaf0; padding: 8px; border-radius: 4px; border-left: 3px solid #ed8936;">
                        <strong>Aviso Físico:</strong> La composición isotópica modifica masa y densidad, pero no altera la geometría cristalográfica ideal del modelo.
                    </div>
                    <div class="calc-field">
                        <label>Modo Isotópico</label>
                        <select id="calc-iso-mode" class="calc-select" style="font-size: 0.8rem; padding: 6px;">
                            <option value="natural">Natural (Masa Estándar)</option>
                            <option value="single">Isótopo Único</option>
                            <option value="custom">Mezcla Personalizada</option>
                        </select>
                    </div>
                    <div id="calc-iso-single-container" style="display: none;" class="calc-field">
                        <label>Seleccionar Isótopo</label>
                        <select id="calc-iso-single-select" class="calc-select" style="font-size: 0.8rem; padding: 6px;"></select>
                    </div>
                    <div id="calc-iso-custom-container" style="display: none;">
                        <label style="display: block; font-size: 0.7rem; font-weight: 700; margin-bottom: 8px;">Ajustar Abundancias (%)</label>
                        <div id="calc-iso-custom-list" style="margin-bottom: 10px; border-bottom: 1px dashed #eee; padding-bottom: 10px;"></div>
                    </div>
                </div>
            </div>

            <div class="calc-field">
                <label id="calc-struct-label">Estructura de Referencia</label>
                <select id="calc-structure-select" class="calc-select">
                    <option value="SC">Cúbica Simple (SC)</option>
                    <option value="BCC">Cúbica Centrada en el Cuerpo (BCC)</option>
                    <option value="FCC" selected>Cúbica Centrada en las Caras (FCC)</option>
                </select>
            </div>
            <div class="calc-grid">
                <div class="calc-field">
                    <label>a (Å)</label>
                    <input type="number" id="calc-a" value="4.05" step="0.001" class="calc-input">
                </div>
                <div class="calc-field" id="calc-c-container" style="display: none;">
                    <label>c (Å)</label>
                    <input type="number" id="calc-c" value="9.25" step="0.001" class="calc-input">
                </div>
                <div class="calc-field">
                    <label>Masa (u)</label>
                    <input type="number" id="calc-mass" value="26.98" step="0.01" class="calc-input">
                </div>
            </div>
            <div id="calc-hex-results" style="display: none; margin-top: 15px; padding: 12px; background: #f0f7ff; border-radius: 8px; border: 1px solid #cce3ff;"></div>
        </div>

        <div class="calc-section">
            <h3 class="calc-section-title">2. Métricas de Material</h3>
            <div class="calc-metric-box">
                <div class="calc-metric-item"><span>Radio Atómico (r)</span><strong id="calc-val-r">-</strong></div>
                <div class="calc-metric-item"><span>Masa Efectiva (M)</span><strong id="calc-val-effective-mass">-</strong></div>
                <div class="calc-metric-item"><span>Densidad Teórica</span><strong id="calc-val-rho-v">-</strong></div>
            </div>
        </div>

        <div class="calc-section">
            <h3 class="calc-section-title">3. Orientación (h k l)</h3>
            <div class="calc-grid-3">
                <div class="calc-field"><label>h</label><input type="number" id="calc-h" value="1" class="calc-input"></div>
                <div class="calc-field"><label>k</label><input type="number" id="calc-k" value="1" class="calc-input"></div>
                <div class="calc-field"><label>l</label><input type="number" id="calc-l" value="1" class="calc-input"></div>
            </div>
        </div>

        <div class="calc-section">
            <h3 class="calc-section-title">4. Métricas Geométricas</h3>
            <div class="calc-metric-box alternate">
                <div class="calc-metric-item"><span>Espaciado d_hkl</span><strong id="calc-val-d">-</strong></div>
                <div class="calc-metric-item"><span>Área Plano</span><strong id="calc-val-area">-</strong></div>
                <div class="calc-metric-item"><span>Átomos (N_p)</span><strong id="calc-val-np">-</strong></div>
                <div class="calc-metric-item"><span>Densidad (ρ_p)</span><strong id="calc-val-rho-p">-</strong></div>
            </div>
        </div>

        <div style="padding: 15px; text-align: center;">
            <button id="calc-btn-apply-scene" class="primary-btn" style="background: #008080;">
                APLICAR DATOS AL VISOR 3D
            </button>
            <div id="calc-info-msg" style="margin-top: 12px; font-size: 0.7rem; color: var(--text-muted); font-style: italic;">
                Se detectarán automáticamente cambios en la red y sistema.
            </div>
        </div>
    `;
}

export function updateCrystalCalculatorResults(results) {
    const panel = document.getElementById('calc-panel');
    if (!panel || !panel.classList.contains('visible')) return;
    if (!results) return;

    const formatVal = (v, d = 4) => {
        if (Math.abs(v) < 0.001 && v !== 0) return v.toExponential(4);
        return v.toFixed(d);
    };

    const setVal = (id, val, suffix = "") => {
        const el = document.getElementById(id);
        if (el) el.textContent = (val === 0 || isNaN(val)) ? '-' : `${formatVal(val, 4)}${suffix}`;
    };

    const isHex = (results.hexVol > 0);

    setVal('calc-val-r', results.atomicRadius, " Å");
    setVal('calc-val-rho-v', results.theoreticalDensity, " g/cm³");
    setVal('calc-val-d', results.interplanarSpacing, " Å");
    
    // Área y Átomos (Solo si son significativos)
    setVal('calc-val-area', results.planeArea, " Å²");
    document.getElementById('calc-val-np').textContent = (results.atomCount === 0) ? '-' : results.atomCount;
    setVal('calc-val-rho-p', results.planarDensity, " at/Å²");
    
    setVal('calc-val-effective-mass', results.isotopicEffectiveMass, " u");

    // Hexagonal Specific
    const hexResults = document.getElementById('calc-hex-results');
    if (isHex) {
        if (hexResults) {
            hexResults.style.display = 'block';
            hexResults.innerHTML = `
                <div class="data-row small"><span>Relación c/a</span><span style="font-weight: 700;">${results.hexCA.toFixed(4)}</span></div>
                <div class="data-row small"><span>Volumen Celda</span><span style="font-weight: 700;">${results.hexVol.toFixed(3)} Å³</span></div>
                <div style="font-size: 0.65rem; color: #718096; margin-top: 5px; border-top: 1px solid #cce3ff; padding-top: 5px;">
                    Nota: Radio HCP basado en a=2r.
                </div>
            `;
        }
        // Bloquear métricas no soportadas visualmente
        document.getElementById('calc-val-area').parentElement.style.opacity = "0.5";
        document.getElementById('calc-val-np').parentElement.style.opacity = "0.5";
        document.getElementById('calc-val-rho-p').parentElement.style.opacity = "0.5";
    } else {
        if (hexResults) hexResults.style.display = 'none';
        document.getElementById('calc-val-area').parentElement.style.opacity = "1";
        document.getElementById('calc-val-np').parentElement.style.opacity = "1";
        document.getElementById('calc-val-rho-p').parentElement.style.opacity = "1";
    }
}

export function getCalculatorInputs() {
    return {
        a: parseFloatInput(document.getElementById('calc-a')?.value || 0),
        c: parseFloatInput(document.getElementById('calc-c')?.value || 0),
        atomicMass: parseFloatInput(document.getElementById('calc-mass')?.value || 0),
        structure: document.getElementById('calc-structure-select')?.value || 'FCC',
        h: parseInt(document.getElementById('calc-h')?.value || 0),
        k: parseInt(document.getElementById('calc-k')?.value || 0),
        l: parseInt(document.getElementById('calc-l')?.value || 0),
        isoMode: document.getElementById('calc-iso-mode')?.value || 'natural',
        isoSingleIdx: document.getElementById('calc-iso-single-select')?.value,
        isoMaterialId: document.getElementById('calc-material-select')?.value,
        getIsotopicCustomMix: () => {
            const inputs = document.querySelectorAll('.iso-mix-input');
            const mix = [];
            inputs.forEach(inp => mix.push(parseFloatInput(inp.value) || 0));
            return mix;
        }
    };
}
