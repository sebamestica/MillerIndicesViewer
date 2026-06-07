
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CONFIG, getState, updateState } from './state.js';
import { buildLatticeGroup } from './lattice-renderer.js';
import * as HCP_RENDERER from './hcp-renderer.js';
import * as HCP_MATH from './hcp-math.js';


let scene, camera, renderer, labelRenderer, controls;

const baseCellGroup = new THREE.Group();
const planeGroup = new THREE.Group();
const latticeGroup = new THREE.Group();
const defectGroup = new THREE.Group();
const crystalGroup = new THREE.Group();     // Agrupador para deformación física
const axisGroup = new THREE.Group();
const overlayObjects = new THREE.Group();

let needsRender = true;

export function requestRender() {
    needsRender = true;
}

/**
 * APLICA DEFORMACIÓN VISUAL AL CRISTAL (Axial + Cizalle)
 * Utiliza escalado inteligente para evitar rupturas del renderizado ante valores extremos.
 */
export function applyVisualDeformation(ex, ey, ez, gxy = 0) {
    const maxStrain = Math.max(Math.abs(ex), Math.abs(ey), Math.abs(ez), Math.abs(gxy));
    
    let visualFactor = 25; 
    let shearFactor = 15; 
    
    // Amplificación dinámica para deformaciones ínfimas (microdeformaciones)
    if (maxStrain > 0 && maxStrain < 0.005) {
        const targetMaxVisualStrain = 0.15; // Queremos que la deformación visual máxima sea del 15%
        const boost = targetMaxVisualStrain / maxStrain;
        visualFactor = boost;
        shearFactor = boost * 0.6; // Mantener relación proporcional
    }
    
    // Función de compresión suave (Smart Scaling)
    // Evita que los átomos se alejen infinitamente de la vista
    const smartScale = (val, factor) => {
        const threshold = 0.6; // Límite de desplazamiento visual relativo al cubo
        const raw = val * factor;
        // Si el valor es muy grande, usamos una función asintótica (Math.tanh)
        if (Math.abs(raw) > threshold) {
            return Math.sign(raw) * (threshold + (Math.tanh(Math.abs(raw) - threshold) * 0.2));
        }
        return raw;
    };

    // Aplicar escalado seguro
    const sx = 1 + smartScale(ex, visualFactor);
    const sy = 1 + smartScale(ey, visualFactor);
    const sz = 1 + smartScale(ez, visualFactor);
    const sxy = smartScale(gxy, shearFactor);

    crystalGroup.matrix.identity();
    
    // Matriz 4x4 (Shear en XY: el eje X se inclina hacia Y)
    crystalGroup.matrix.set(
        sx,  sxy, 0,   0,
        0,   sy,  0,   0,
        0,   0,   sz,  0,
        0,   0,   0,   1
    );
    
    crystalGroup.matrixAutoUpdate = false; 
    requestRender();
}

/**
 * ACTUALIZA LAS FLECHAS DE CARA (TENSORES DE DEFORMACIÓN)
 * @param {Object} strains {ex, ey, ez, gxy, gyz, gzx}
 * @param {Object} stress {xx, yy, zz, xy, yz, zx} opcional
 */
export function updateMechanicalArrows(strains, stress = null) {
    const s = CONFIG.scale;
    
    // Limpiar flechas anteriores
    while(overlayObjects.children.length > 0) {
        disposeObject(overlayObjects.children[0]);
        overlayObjects.remove(overlayObjects.children[0]);
    }

    if (!strains) return;
    
    const ex = strains.ex || 0;
    const ey = strains.ey || 0;
    const ez = strains.ez || 0;
    const gxy = strains.gxy || 0;

    const maxStrain = Math.max(Math.abs(ex), Math.abs(ey), Math.abs(ez), Math.abs(gxy));

    const createArrow = (dir, origin, strainVal, isShear = false) => {
        if (Math.abs(strainVal) < 1e-12) return;
        
        let color = strainVal > 0 ? 0xff4444 : 0x4444ff; // Tracción: Rojo (+), Compresión: Azul (-)
        if (isShear) color = 0xddaa00; // Shear: Dorado/Naranja
        
        // Determinar longitud visual razonable de la flecha
        // Usamos una longitud mínima para que siempre sea visible, y escalamos proporcionalmente
        let length;
        if (maxStrain > 0) {
            const relativeStrain = Math.abs(strainVal) / maxStrain;
            length = s * (0.4 + 0.8 * relativeStrain);
        } else {
            length = s * 0.5;
        }
        
        let arrowDir;
        let arrowOrigin;

        if (isShear) {
            arrowDir = strainVal > 0 ? dir.clone() : dir.clone().negate();
            arrowOrigin = origin.clone();
        } else {
            if (strainVal > 0) {
                // Tracción/Estiramiento: Apunta hacia afuera
                arrowDir = dir.clone().normalize();
                arrowOrigin = origin.clone();
            } else {
                // Compresión: Apunta hacia adentro (comienza desplazado hacia afuera y entra a la cara)
                arrowDir = dir.clone().negate().normalize();
                arrowOrigin = origin.clone().add(dir.clone().normalize().multiplyScalar(length));
            }
        }

        const arrow = new THREE.ArrowHelper(arrowDir, arrowOrigin, length, color, 0.25 * s, 0.12 * s);
        overlayObjects.add(arrow);
    };

    // --- DEFORMACIONES NORMALES (Perpendiculares a las caras del cubo) ---
    // Eje X
    createArrow(new THREE.Vector3(1, 0, 0), new THREE.Vector3(s, s/2, s/2), ex);
    createArrow(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, s/2, s/2), ex);

    // Eje Y
    createArrow(new THREE.Vector3(0, 1, 0), new THREE.Vector3(s/2, s, s/2), ey);
    createArrow(new THREE.Vector3(0, -1, 0), new THREE.Vector3(s/2, 0, s/2), ey);

    // Eje Z
    createArrow(new THREE.Vector3(0, 0, 1), new THREE.Vector3(s/2, s/2, s), ez);
    createArrow(new THREE.Vector3(0, 0, -1), new THREE.Vector3(s/2, s/2, 0), ez);

    // --- DEFORMACIONES DE CIZALLE (Paralelas a las caras) ---
    if (Math.abs(gxy) > 1e-12) {
        createArrow(new THREE.Vector3(0, 1, 0), new THREE.Vector3(s, 0, s/2), gxy, true);
        createArrow(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, s, s/2), gxy, true);
        
        createArrow(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, s, s/2), gxy, true);
        createArrow(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(s, 0, s/2), gxy, true);
    }

    requestRender();
}

export function initializeScene() {
    const wrapper = document.getElementById('canvas-wrapper');
    if (!wrapper) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    camera = new THREE.PerspectiveCamera(40, wrapper.clientWidth / wrapper.clientHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true, 
        powerPreference: "high-performance"
    });
    renderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
    applySafePixelRatio();
    wrapper.appendChild(renderer.domElement);

    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    document.getElementById('label-container').appendChild(labelRenderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.6;
    controls.screenSpacePanning = true;
    
    controls.addEventListener('start', () => {
        updateState({ hasUserAdjustedCamera: true });
    });
    controls.addEventListener('change', requestRender);
    
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.4);
    mainLight.position.set(10, 20, 15);
    
    scene.add(ambient, hemiLight, mainLight);
    
    // Jerarquía de capas
    crystalGroup.add(baseCellGroup);
    crystalGroup.add(planeGroup);
    crystalGroup.add(latticeGroup);
    crystalGroup.add(defectGroup);

    scene.add(crystalGroup);
    scene.add(axisGroup);
    scene.add(overlayObjects);

    window.addEventListener('resize', onResize);
    resetCameraView(true);
    animate();
}

function applySafePixelRatio() {
    const state = getState();
    const dpr = Math.min(window.devicePixelRatio, state.performance?.pixelRatioLimit || 2);
    renderer.setPixelRatio(dpr);
}

function animate() {
    requestAnimationFrame(animate);
    const moved = controls.update();
    if (needsRender || moved) {
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
        needsRender = false;
    }
}

function onResize() {
    const wrapper = document.getElementById('canvas-wrapper');
    if (!wrapper) return;
    
    camera.aspect = wrapper.clientWidth / wrapper.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
    labelRenderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
    requestRender();
}

/**
 * Limpieza inteligente de capas (PARTE A)
 */
export function clearAllLayers() {
    [baseCellGroup, axisGroup, planeGroup, latticeGroup, defectGroup, overlayObjects].forEach(g => {
        while(g.children.length > 0) {
            const obj = g.children[0];
            disposeObject(obj);
            g.remove(obj);
        }
    });
}

function disposeObject(obj) {
    if (obj.children) obj.children.forEach(disposeObject);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
    }
}

export function clearDynamicObjects() {
    // En la nueva arquitectura, limpiamos los grupos de elementos variables
    [planeGroup, latticeGroup, defectGroup, overlayObjects].forEach(g => {
        while(g.children.length > 0) {
            const obj = g.children[0];
            disposeObject(obj);
            g.remove(obj);
        }
    });
}

export function resetCameraView(force = true) {
    const state = getState();
    if (state.hasUserAdjustedCamera && !force) return;
    if (force) updateState({ hasUserAdjustedCamera: false });

    const s = CONFIG.scale;
    const sys = state.system || 'cubic';
    const isMobile = window.innerWidth < 1000;
    let dist = isMobile ? s * 6 : s * 4.4;
    
    // Altura de cámara suavizada para mobile
    camera.position.set(dist, dist * 0.85, dist);
    controls.target.set(s / 2, s / 2, s / 2);
    controls.update();
    requestRender();
}

/**
 * RECONSTRUCCIÓN DE GEOMETRÍA BASE (Cubo / Prisma)
 */
export function rebuildSystemBaseGeometry(system, caRatio = 1.633) {
    const s = CONFIG.scale;
    console.log(`[Scene] Reconstruyendo geometría base: ${system}, scale=${s}`);

    // Limpieza de la capa base
    while(baseCellGroup.children.length > 0) {
        disposeObject(baseCellGroup.children[0]);
        baseCellGroup.remove(baseCellGroup.children[0]);
    }

    const grid = new THREE.GridHelper(s * 8, 20, 0xcccccc, 0xeeeeee);
    baseCellGroup.add(grid);

    if (system === 'hcp') {
        HCP_RENDERER.drawHcpPrism(baseCellGroup, s, s * caRatio);
    } else {
        const box = new THREE.BoxGeometry(s, s, s);
        const edges = new THREE.EdgesGeometry(box);
        const cell = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ 
            color: 0x000000, linewidth: 2, transparent: false, opacity: 1 
        }));
        cell.position.set(s/2, s/2, s/2);
        baseCellGroup.add(cell);
    }
    requestRender();
}

/**
 * RECONSTRUCCIÓN DE CAPA DE PLANOS
 */
export function rebuildPlaneLayer(state, points) {
    while(planeGroup.children.length > 0) {
        disposeObject(planeGroup.children[0]);
        planeGroup.remove(planeGroup.children[0]);
    }

    if (!points || points.length < 3) return;

    if (state.system === 'cubic') {
        const sc = CONFIG.scale;
        const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => p.clone().multiplyScalar(sc)));
        const indices = [];
        for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
        geo.setIndex(indices);
        geo.computeVertexNormals();

        const mesh = new THREE.Mesh(geo, sharedPlaneMat);
        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ 
            color: CONFIG.colors.planeEdge, linewidth: 2 
        }));
        planeGroup.add(mesh, line);
    } else {
        HCP_RENDERER.drawHcpPlane(planeGroup, points, CONFIG.colors.plane, CONFIG.colors.planeEdge);
    }

    renderNormalVector(state);
    renderOriginPoint(state);
    requestRender();
}

/**
 * RECONSTRUCCIÓN DE CAPA DE RED (Átomos de Referencia)
 */
export function rebuildReferenceLatticeLayer(structure, isVisible, caRatio = 1.633) {
    while(latticeGroup.children.length > 0) {
        disposeObject(latticeGroup.children[0]);
        latticeGroup.remove(latticeGroup.children[0]);
    }

    if (!isVisible) return;
    const sc = CONFIG.scale;
    const state = getState();
    
    if (state.system === 'hcp') {
        HCP_RENDERER.drawHcpLattice(latticeGroup, sc, sc * caRatio, state.performance);
    } else {
        const group = buildLatticeGroup(structure, sc, 'none', caRatio, false);
        latticeGroup.add(group);
    }
    requestRender();
}

/**
 * RECONSTRUCCIÓN DE CAPA DE DEFECTOS
 */
export function rebuildDefectLayer(structure, defectType, isVisible, caRatio = null) {
    while(defectGroup.children.length > 0) {
        disposeObject(defectGroup.children[0]);
        defectGroup.remove(defectGroup.children[0]);
    }

    if (!isVisible || defectType === 'none') return;
    const sc = CONFIG.scale;
    const state = getState();
    if (state.system === 'hcp') return; // Not implemented for HCP yet
    
    const finalStructure = structure;

    // Solo pedimos los átomos defectuosos (onlyDefects=true)
    const group = buildLatticeGroup(finalStructure, sc, defectType, caRatio, true);
    defectGroup.add(group);
    requestRender();
}

/**
 * RECONSTRUCCIÓN DE CAPA DE EJES
 */
export function rebuildAxisLayer(system) {
    while(axisGroup.children.length > 0) {
        const obj = axisGroup.children[0];
        disposeObject(obj);
        axisGroup.remove(obj);
    }

    const s = CONFIG.scale;

    if (system === 'hcp') {
        const axisLen = s * 2.5; // Alargados para mejor visibilidad en HCP
        const caRatio = getState().caRatio || 1.633;
        const cLen = axisLen * (caRatio / 1.633);
        
        // Direcciones HCP (X=a1, Y=c, Z=transversal)
        // a1: (1, 0, 0)
        // a2: (-0.5, 0, sqrt(3)/2)
        // a3: (-0.5, 0, -sqrt(3)/2)
        // c:  (0, 1, 0)
        
        buildAxis(new THREE.Vector3(1, 0, 0), CONFIG.colors.a1, 'a1', axisLen);
        buildAxis(new THREE.Vector3(-0.5, 0, 0.866), CONFIG.colors.a2, 'a2', axisLen);
        buildAxis(new THREE.Vector3(-0.5, 0, -0.866), CONFIG.colors.a3, 'a3', axisLen);
        buildAxis(new THREE.Vector3(0, 1, 0), CONFIG.colors.c, 'c', cLen);
        
    } else {
        const axisLen = s * 2.2;
        // Direcciones Cúbicas (Mapping: h->Z, k->X, l->Y)
        // a1 (Index h): (0, 0, 1) -> Label X
        // a2 (Index k): (1, 0, 0) -> Label Y
        // a3 (Index l): (0, 1, 0) -> Label Z (UP)
        
        buildAxis(new THREE.Vector3(0, 0, 1), CONFIG.colors.a1, 'X', axisLen);
        buildAxis(new THREE.Vector3(1, 0, 0), CONFIG.colors.a2, 'Y', axisLen);
        buildAxis(new THREE.Vector3(0, 1, 0), CONFIG.colors.c, 'Z', axisLen);
    }
    requestRender();
}

function buildAxis(dir, color, text, len) {
    const s = CONFIG.scale;
    const arrow = new THREE.ArrowHelper(dir.clone().normalize(), new THREE.Vector3(0,0,0), len, color, s*0.14, s*0.07);
    axisGroup.add(arrow);

    const div = document.createElement('div');
    const labelId = text.toLowerCase();
    div.className = `axis-label ${labelId}`;
    div.textContent = text;
    
    // El color de borde y texto sigue al color del eje
    div.style.border = `1px solid #${new THREE.Color(color).getHexString()}`;
    div.style.color = '#' + new THREE.Color(color).getHexString();

    const label = new CSS2DObject(div);
    const offset = s * 0.18;
    label.position.copy(dir.clone().multiplyScalar(len + offset));
    axisGroup.add(label);
}

let sharedPlaneMat = new THREE.MeshPhongMaterial({
    color: CONFIG.colors.plane, side: THREE.DoubleSide, transparent: true, opacity: 0.65, shininess: 90
});

export function renderNormalVector(state) {
    const { system, h, k, l, shift, vecScale, caRatio } = state;
    const sc = CONFIG.scale;

    if (system === 'hcp') {
        const dir = HCP_MATH.getHcpCartesianNormal(h, k, l, sc, sc * (caRatio || 1.633)).normalize();
        if (dir.lengthSq() > 1e-6) {
           const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0,0,0), sc * vecScale, CONFIG.colors.vector, sc*0.2, sc*0.1);
           planeGroup.add(arrow);
        }
    } else {
        const dir = new THREE.Vector3(k, l, h).normalize();
        const origin = new THREE.Vector3(shift.y * sc, shift.z * sc, shift.x * sc);
        const arrow = new THREE.ArrowHelper(dir, origin, sc * vecScale, CONFIG.colors.vector, sc*0.2, sc*0.1);
        planeGroup.add(arrow);
    }
}

export function renderOriginPoint(state) {
    const sc = CONFIG.scale;
    const { system, shift } = state;
    if (system === 'hcp') return; // Origin marker not standard for HCP basal center here

    const geo = new THREE.SphereGeometry(sc * 0.08, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.position.set(shift.y, shift.z, shift.x).multiplyScalar(sc);
    planeGroup.add(sphere);
}

export function renderCrystallographicDirection(u, v, w, system) {
    if (system !== 'cubic') return; 
    const sc = CONFIG.scale;
    const dir = new THREE.Vector3(v, w, u).normalize();
    const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0,0,0), sc * 1.8, 0xffa500, sc*0.15, sc*0.08);
    overlayObjects.add(arrow);
}

export function renderLoadDirection(lx, ly, lz) {
    if (lx === 0 && ly === 0 && lz === 0) return;
    const sc = CONFIG.scale;
    const dir = new THREE.Vector3(ly, lz, lx).normalize();
    const origin = new THREE.Vector3(sc * 1.2, sc * 1.2, sc * 1.2);
    const arrow = new THREE.ArrowHelper(dir, origin, sc * 1.5, 0xff0000, sc*0.15, sc*0.08);
    overlayObjects.add(arrow);
}

// Mantener compatibilidad anterior
export function buildStaticEnvironment(sys) { rebuildSystemBaseGeometry(sys); rebuildAxisLayer(sys); }
export function renderLattice3D(structure, defectType, isVisible, caRatio) {
    rebuildReferenceLatticeLayer(structure, isVisible, caRatio);
    rebuildDefectLayer(structure, defectType, isVisible, caRatio);
}
