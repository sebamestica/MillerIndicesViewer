import { getState, updateState } from './state.js';
import * as MechMath from './mechanical-math.js';
import * as MechData from './mechanical-data.js';
import { drawStressStrainCurve } from './mechanical-chart.js';
import { generateMechanicalAdvice } from './advisor-engine.js';
import { parseFloatInput } from './math.js';

/**
 * MECHANICAL PANEL (v3.2)
 * Interfaz con análisis de Von Mises, Factor de Seguridad y Gráfico σ-ε.
 */

let isPanelOpen = false;

export function initializeMechanicalPanel() {
    renderMechanicalContent();
    bindMechanicalEvents();
}

export function toggleMechanicalPanel() {
    isPanelOpen ? closeMechanicalPanel() : openMechanicalPanel();
}

export function openMechanicalPanel() {
    const state = getState();
    if (state.system !== 'cubic') {
        alert("La calculadora mecánica solo está disponible para el Sistema Cúbico.");
        return;
    }

    const panel = document.getElementById('mech-panel');
    if (panel) {
        panel.classList.add('visible');
        isPanelOpen = true;
        updateState({ isMechanicalOpen: true });
        
        // Sincronización de Modos (Exclusividad)
        document.getElementById('calc-panel')?.classList.remove('visible');
        document.body.classList.remove('calc-mode-active');

        document.getElementById('advanced-panel')?.classList.remove('visible');
        document.body.classList.remove('eng-mode-active');
        const engToggle = document.getElementById('eng-toggle');
        if (engToggle) engToggle.checked = false;

        document.body.classList.add('mech-mode-active');
    }
}

export function closeMechanicalPanel() {
    const panel = document.getElementById('mech-panel');
    if (panel) {
        panel.classList.remove('visible');
        isPanelOpen = false;
        updateState({ isMechanicalOpen: false });
        document.body.classList.remove('mech-mode-active');
        
        // RESET: Volver a la normalidad al salir
        resetMechanicalDeformation();
    }
}

function renderMechanicalContent() {
    const container = document.getElementById('mech-sections');
    if (!container) return;

    container.innerHTML = `
        <div class="mech-section">
            <h3 class="mech-section-title">1. Configuración de Material</h3>
            <div class="mech-field">
                <label class="mech-label">Seleccionar Material</label>
                <select id="mech-material-select" class="mech-select">
                    ${MechData.MECHANICAL_MATERIALS.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
                </select>
            </div>
            <div class="input-grid grid-3">
                <div class="mech-field">
                    <label class="mech-label">Young (GPa)</label>
                    <input type="number" id="mech-young" value="200" step="1" class="mech-input">
                </div>
                <div class="mech-field">
                    <label class="mech-label">Poisson (ν)</label>
                    <input type="number" id="mech-poisson" value="0.30" step="0.01" class="mech-input">
                </div>
                <div class="mech-field">
                    <label class="mech-label">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px; color: #e53e3e;"><path d="M12 2v20M2 12h20"/><path d="m17 7-5-5-5 5"/><path d="m17 17-5 5-5-5"/></svg>
                        Límite σy (MPa)
                    </label>
                    <input type="number" id="mech-yield" value="250" step="0.0001" class="mech-input">
                </div>
            </div>
            <div id="mech-material-info" style="margin-top: 10px; font-size: 0.75rem; color: #718096; background: #f7fafc; padding: 8px; border-radius: 4px; border-left: 3px solid #cbd5e0;">
                Calculando propiedades derivadas...
            </div>
        </div>

        <div class="mech-section">
            <h3 class="mech-section-title">2. Estado de Carga (Tensor)</h3>
            <div class="mech-field">
                <label class="mech-label">Tipo de Escenario</label>
                <select id="mech-load-type" class="mech-select">
                    <option value="uniaxial">Uniaxial (Carga en X)</option>
                    <option value="biaxial">Biaxial (Plano X-Y)</option>
                    <option value="triaxial">Triaxial (X-Y-Z)</option>
                    <option value="shear">Corte Puro (τxy)</option>
                    <option value="general">Tensor Completo</option>
                </select>
            </div>
            <div class="input-grid grid-3">
                <div class="mech-field">
                    <label class="mech-label">σxx (MPa)</label>
                    <input type="number" id="mech-stress-xx" value="100" step="any" class="mech-input">
                </div>
                <div class="mech-field">
                    <label class="mech-label">σyy (MPa)</label>
                    <input type="number" id="mech-stress-yy" value="0" step="any" class="mech-input" disabled>
                </div>
                <div class="mech-field">
                    <label class="mech-label">σzz (MPa)</label>
                    <input type="number" id="mech-stress-zz" value="0" step="any" class="mech-input" disabled>
                </div>
            </div>
            <div class="input-grid grid-3" id="mech-shear-inputs" style="display: none; margin-top: 10px;">
                <div class="mech-field">
                    <label class="mech-label">τxy (MPa)</label>
                    <input type="number" id="mech-stress-xy" value="0" step="any" class="mech-input">
                </div>
                <div class="mech-field">
                    <label class="mech-label">τyz (MPa)</label>
                    <input type="number" id="mech-stress-yz" value="0" step="any" class="mech-input">
                </div>
                <div class="mech-field">
                    <label class="mech-label">τzx (MPa)</label>
                    <input type="number" id="mech-stress-zx" value="0" step="any" class="mech-input">
                </div>
            </div>
        </div>

        <div class="mech-section">
            <h3 class="mech-section-title">3. Análisis de Falla y Gráfico σ-ε</h3>
            <div class="mech-chart-container" style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                <canvas id="mech-sigma-epsilon-chart" width="280" height="150" style="width: 100%; height: auto;"></canvas>
            </div>
            <div class="mech-metric-box" id="mech-results-container">
                <div style="font-size: 0.75rem; color: #718096; text-align: center; padding: 10px;">
                    Configura la carga para iniciar simulación.
                </div>
            </div>
        </div>

        <!-- Placeholder para el Asesor en Móvil -->
        <div id="mech-advisor-mobile-placeholder"></div>

        <div style="padding: 10px 0;">
            <button id="mech-btn-apply" class="primary-btn" style="background: #2b6cb0; padding: 14px;">Ejecutar Simulación Física</button>
            <button id="mech-btn-reset" class="primary-btn" style="background: #edf2f7; color: #4a5568; margin-top: 10px;">Resetear Geometría</button>
        </div>
    `;
    
    // Actualizar info inicial
    updateMaterialDerivedInfo();
}

function updateMaterialDerivedInfo() {
    const E = parseFloatInput(document.getElementById('mech-young')?.value || 200);
    const v = parseFloatInput(document.getElementById('mech-poisson')?.value || 0.3);
    const Sy = parseFloatInput(document.getElementById('mech-yield')?.value || 250);
    const G = MechMath.calculateShearModulus(E, v);
    
    const info = document.getElementById('mech-material-info');
    if (info) {
        info.innerHTML = `
            <strong>Módulo G:</strong> ${(G/1000).toFixed(2)} GPa | 
            <strong>σy:</strong> ${Sy} MPa <br>
            <strong>Resiliencia:</strong> ${(0.5 * Math.pow(Sy, 2) / (E * 1000)).toFixed(3)} MJ/m³
        `;
    }
    
    // Dibujar gráfico vacío o inicial
    drawStressStrainCurve('mech-sigma-epsilon-chart', 0, 0, Sy, E);
}

function bindMechanicalEvents() {
    document.getElementById('btn-close-mech')?.addEventListener('click', closeMechanicalPanel);
    
    // Toggle de inputs según tipo de carga
    document.getElementById('mech-load-type')?.addEventListener('change', (e) => {
        const type = e.target.value;
        const inXX = document.getElementById('mech-stress-xx');
        const inYY = document.getElementById('mech-stress-yy');
        const inZZ = document.getElementById('mech-stress-zz');
        const shearBox = document.getElementById('mech-shear-inputs');
        
        // Reset defaults
        inXX.disabled = false;
        inYY.disabled = true; inYY.value = 0;
        inZZ.disabled = true; inZZ.value = 0;
        shearBox.style.display = 'none';

        if (type === 'biaxial') {
            inYY.disabled = false;
        } else if (type === 'triaxial') {
            inYY.disabled = false;
            inZZ.disabled = false;
        } else if (type === 'shear') {
            inXX.disabled = true; inXX.value = 0;
            shearBox.style.display = 'grid';
        } else if (type === 'general') {
            inYY.disabled = false;
            inZZ.disabled = false;
            shearBox.style.display = 'grid';
        }
    });

    // Cambio de material
    document.getElementById('mech-material-select')?.addEventListener('change', (e) => {
        const mat = MechData.getMaterialById(e.target.value);
        const inputE = document.getElementById('mech-young');
        const inputV = document.getElementById('mech-poisson');
        const inputY = document.getElementById('mech-yield');
        
        if (mat.id !== 'custom') {
            inputE.value = mat.young;
            inputV.value = mat.poisson;
            inputY.value = mat.yield;
            inputE.disabled = true;
            inputV.disabled = true;
            inputY.disabled = true;
        } else {
            inputE.disabled = false;
            inputV.disabled = false;
            inputY.disabled = false;
        }
        updateMaterialDerivedInfo();
    });

    ['mech-young', 'mech-poisson', 'mech-yield'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateMaterialDerivedInfo);
    });

    // Soporte de Teclado Completo: Enter para calcular en cualquier input
    const mechInputs = document.querySelectorAll('#mech-panel input');
    mechInputs.forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                runMechanicalPipeline();
            }
            e.stopPropagation(); // Evitar que otros atajos globales interfieran
        });
    });

    document.getElementById('mech-btn-apply')?.addEventListener('click', () => {
        runMechanicalPipeline();
    });

    document.getElementById('mech-btn-reset')?.addEventListener('click', () => {
        resetMechanicalDeformation();
    });
}

function runMechanicalPipeline() {
    const getSafeVal = (id, limit = 1000000) => {
        const val = parseFloatInput(document.getElementById(id)?.value || 0);
        if (isNaN(val)) return 0;
        return Math.max(-limit, Math.min(val, limit));
    };

    const stress = {
        xx: getSafeVal('mech-stress-xx'),
        yy: getSafeVal('mech-stress-yy'),
        zz: getSafeVal('mech-stress-zz'),
        xy: getSafeVal('mech-stress-xy'),
        yz: getSafeVal('mech-stress-yz'),
        zx: getSafeVal('mech-stress-zx')
    };
    
    const young = parseFloatInput(document.getElementById('mech-young').value || 200);
    const poisson = parseFloatInput(document.getElementById('mech-poisson').value || 0.3);
    const yieldLimit = parseFloatInput(document.getElementById('mech-yield').value || 250);
    
    // 1. Calcular Strains (Ley de Hooke Generalizada)
    const strains = MechMath.calculateStrains(stress, young, poisson);
    const volumeChange = MechMath.calculateVolumeChange(strains);
    
    // 2. Criterios de Falla y Métricas Avanzadas
    const vonMises = MechMath.calculateVonMises(stress);
    const factorSafety = MechMath.calculateSafetyFactor(vonMises, yieldLimit);
    
    const principalStresses = MechMath.calculatePrincipalStresses(stress);
    const tresca = MechMath.calculateTresca(stress);
    const trescaFs = MechMath.calculateSafetyFactor(tresca, yieldLimit);
    
    const strainEnergy = MechMath.calculateStrainEnergy(stress, strains);
    const resilience = 0.5 * Math.pow(yieldLimit, 2) / (young * 1000);
    
    // 3. Descomposición del Tensor
    const { P } = MechMath.decomposeStressTensor(stress);
    
    // 4. Obtener hkl actual para RSS
    const state = getState();
    const rss = MechMath.calculateRSS(stress, state.indices);

    // 5. Actualizar UI y Gráfico
    updateMechanicalResultsUI(strains, volumeChange, rss, vonMises, factorSafety, yieldLimit, principalStresses, tresca, trescaFs, strainEnergy, resilience);
    drawStressStrainCurve('mech-sigma-epsilon-chart', vonMises, strains.ex, yieldLimit, young);

    // 6. Aplicar a la escena 3D
    import('./scene.js').then(Scene => {
        Scene.applyVisualDeformation(strains.ex, strains.ey, strains.ez, strains.gxy);
        Scene.updateMechanicalArrows(strains, stress);
        
        // 7. Actualizar Asesor
        updateAdvisor(stress, strains, vonMises, yieldLimit, factorSafety, rss);
    });
}

function updateAdvisor(stress, strains, vonMises, yieldLimit, fs, rss) {
    const advisor = generateMechanicalAdvice(stress, strains, vonMises, yieldLimit, fs, rss);
    const container = document.getElementById('mech-advisor-container');
    const content = document.getElementById('mech-advisor-content');
    
    if (!container || !content) return;

    // Actualizar contenido y estilo
    content.innerHTML = advisor.text;
    container.className = `mech-advisor status-${advisor.status}`;
    container.style.display = 'block';

    // Manejo de ubicación responsiva (Movimiento del DOM si es necesario)
    const isMobile = window.innerWidth <= 1000;
    const mobilePlaceholder = document.getElementById('mech-advisor-mobile-placeholder');
    
    if (isMobile && mobilePlaceholder) {
        if (container.parentElement !== mobilePlaceholder) {
            mobilePlaceholder.appendChild(container);
        }
    } else {
        const app = document.getElementById('app');
        if (container.parentElement !== app) {
            app.appendChild(container);
        }
    }
}

function updateMechanicalResultsUI(strains, volume, rss, vonMises, fs, yieldLimit, principalStresses = [0,0,0], tresca = 0, trescaFs = Infinity, strainEnergy = 0, resilience = 0) {
    const container = document.getElementById('mech-results-container');
    if (!container) return;

    const fsText = fs === Infinity ? '∞' : fs.toFixed(2);
    const fsColor = fs < 1 ? '#e53e3e' : fs < 2 ? '#dd6b20' : '#38a169';

    const trescaFsText = trescaFs === Infinity ? '∞' : trescaFs.toFixed(2);
    const trescaFsColor = trescaFs < 1 ? '#e53e3e' : trescaFs < 2 ? '#dd6b20' : '#38a169';

    const formatVal = (v, d = 4) => {
        if (Math.abs(v) < 0.001 && v !== 0) return v.toExponential(4);
        return v.toFixed(d);
    };

    const maxStrain = Math.max(Math.abs(strains.ex), Math.abs(strains.ey), Math.abs(strains.ez), Math.abs(strains.gxy));
    const isAmplified = maxStrain > 0 && maxStrain < 0.005;

    // Relación de energía elástica respecto a resiliencia
    const energyRatio = resilience > 0 ? (strainEnergy / resilience) * 100 : 0;

    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px;">
            <!-- CRITERIOS DE FALLA Y SEGURIDAD -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <!-- VON MISES -->
                <div style="padding: 10px; background: ${vonMises > yieldLimit ? '#fff5f5' : '#f0fff4'}; border-radius: 6px; border: 1px solid ${vonMises > yieldLimit ? '#feb2b2' : '#c6f6d5'};">
                    <div style="font-size: 0.7rem; font-weight: 700; color: #4a5568; text-transform: uppercase;">Von Mises</div>
                    <div style="font-weight: 800; color: ${vonMises > yieldLimit ? '#c53030' : '#2f855a'}; font-size: 0.9rem; margin-top: 2px;">${formatVal(vonMises, 4)} MPa</div>
                    <div style="font-size: 0.65rem; color: #718096; margin-top: 4px;">FS (n): <span style="font-weight:700; color:${fsColor};">${fsText}</span></div>
                </div>
                <!-- TRESCA -->
                <div style="padding: 10px; background: ${tresca > yieldLimit ? '#fff5f5' : '#f0fff4'}; border-radius: 6px; border: 1px solid ${tresca > yieldLimit ? '#feb2b2' : '#c6f6d5'};">
                    <div style="font-size: 0.7rem; font-weight: 700; color: #4a5568; text-transform: uppercase;">Tresca</div>
                    <div style="font-weight: 800; color: ${tresca > yieldLimit ? '#c53030' : '#2f855a'}; font-size: 0.9rem; margin-top: 2px;">${formatVal(tresca, 4)} MPa</div>
                    <div style="font-size: 0.65rem; color: #718096; margin-top: 4px;">FS (n): <span style="font-weight:700; color:${trescaFsColor};">${trescaFsText}</span></div>
                </div>
            </div>
            
            ${(vonMises > yieldLimit || tresca > yieldLimit) ? '<div style="color: #c53030; font-size: 0.7rem; font-weight: 700; text-align: center; background: #fff5f5; border: 1px solid #feb2b2; padding: 4px; border-radius: 4px;">ADVERTENCIA: PLASTICIDAD / FALLA DETECTADA</div>' : ''}

            <!-- ESFUERZOS PRINCIPALES -->
            <div style="background: #f7fafc; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <div style="font-size: 0.7rem; font-weight: 700; color: #4a5568; text-transform: uppercase; margin-bottom: 4px; text-align: center; border-bottom: 1px dashed #cbd5e0; padding-bottom: 3px;">Esfuerzos Principales</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; text-align: center;">
                    <div>
                        <div style="font-size: 0.6rem; color: #718096;">σ₁ (Máx)</div>
                        <div style="font-weight: 700; font-size: 0.75rem; color: #2d3748;">${formatVal(principalStresses[0], 2)}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.6rem; color: #718096;">σ₂ (Med)</div>
                        <div style="font-weight: 700; font-size: 0.75rem; color: #2d3748;">${formatVal(principalStresses[1], 2)}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.6rem; color: #718096;">σ₃ (Mín)</div>
                        <div style="font-weight: 700; font-size: 0.75rem; color: #2d3748;">${formatVal(principalStresses[2], 2)}</div>
                    </div>
                </div>
            </div>

            <!-- ENERGÍA ELÁSTICA -->
            <div style="background: #f0f4f8; padding: 8px; border-radius: 6px; border: 1px solid #d9e2ec; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 0.7rem; font-weight: 700; color: #486581; text-transform: uppercase;">Dens. Energía Elástica (U)</div>
                    <div style="font-size: 0.65rem; color: #627d98;">Capacidad Usada: <span style="font-weight: 700; color: #102a43;">${energyRatio.toFixed(3)}%</span></div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 800; color: #102a43; font-size: 0.85rem;">${formatVal(strainEnergy, 6)} MJ/m³</div>
                </div>
            </div>

            <!-- DEFORMACIONES -->
            <div style="display: flex; flex-direction: column; gap: 4px; padding: 5px; background: #fff; border: 1px solid #edf2f7; border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                    <span style="color: #4a5568;">ε Axial (Promedio)</span>
                    <span style="font-weight: 700;">${formatVal((strains.ex + strains.ey + strains.ez)/3 * 100, 6)} %</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; border-top: 1px solid #f7fafc; padding-top: 2px;">
                    <span style="color: #4a5568;">γ Cizalle (xy)</span>
                    <span style="font-weight: 700;">${formatVal(strains.gxy * 100, 6)} %</span>
                </div>
            </div>

            <!-- MÉTRICAS SECUNDARIAS -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
                <div style="text-align: center;">
                    <div style="font-size: 0.65rem; color: #718096; text-transform: uppercase;">ΔV/V0</div>
                    <div style="font-weight: 700; font-size: 0.8rem; color: #2b6cb0;">${formatVal(volume * 100, 6)}%</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 0.65rem; color: #718096; text-transform: uppercase;">RSS (Schmid)</div>
                    <div style="font-weight: 700; font-size: 0.8rem; color: #c53030;">${formatVal(rss, 4)} MPa</div>
                </div>
            </div>

            ${isAmplified ? `
            <div style="font-size: 0.65rem; color: #718096; text-align: center; font-style: italic; background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px;">
                ⚠️ Visualización amplificada dinámicamente para microdeformaciones.
            </div>
            ` : ''}
        </div>
    `;
}

function resetMechanicalDeformation() {
    import('./scene.js').then(Scene => {
        Scene.applyVisualDeformation(0, 0, 0, 0);
        Scene.updateMechanicalArrows(null);
    });
    const results = document.getElementById('mech-results-container');
    if (results) results.innerHTML = '<div style="font-size: 0.75rem; color: #718096; text-align: center; padding: 10px;">Simulación restablecida.</div>';
    
    const yieldLimit = parseFloatInput(document.getElementById('mech-yield')?.value || 250);
    const young = parseFloatInput(document.getElementById('mech-young')?.value || 200);
    drawStressStrainCurve('mech-sigma-epsilon-chart', 0, 0, yieldLimit, young);
    
    // Ocultar asesor al resetear
    const advisor = document.getElementById('mech-advisor-container');
    if (advisor) advisor.style.display = 'none';
}
