
import * as THREE from 'three';

const EPS = 1e-6;
// N_A * 10^-24 para usar con Angstroms^3 y unidades de masa atómica (u)
export const AVOGADRO_SCALE = 0.602214076; 

/**
 * Calcula el espaciado interplanar para sistemas cúbicos
 * d = 1/sqrt( (h^2+k^2+l^2)/a^2 ) -> Cúbico
 */
export function calculateDhkl(a, h, k, l, system = 'cubic', c = null) {
    if (!a || a <= 0) return 0;
    if (h === 0 && k === 0 && l === 0) return 0;

    // Solo cúbico soportado
    const sumSq = h*h + k*k + l*l;
    return a / Math.sqrt(sumSq);
}

/**
 * Calcula el número de átomos por celda unitaria según la estructura
 */
export function getAtomsPerUnitCell(structure) {
    const s = structure?.toUpperCase();
    switch(s) {
        case 'SC': return 1;
        case 'BCC': return 2;
        case 'FCC': return 4;
        default: return 0;
    }
}

/**
 * Calcula la densidad teórica (g/cm³)
 * rho = (n * A) / (V_c * N_A)
 * @param {number} n Átomos por celda
 * @param {number} A Peso atómico (g/mol)
 * @param {number} V Volumen de celda (Å³)
 */
export function calculateTheoreticalDensity(n, A, V) {
    if (!V || V <= 0 || !n || !A) return 0;
    // AVOGADRO_SCALE (0.6022) maneja la conversión de Å³ a cm³
    return (n * A) / (V * AVOGADRO_SCALE);
}

/**
 * Calcula el radio atómico teórico según estructura
 */
export function calculateAtomicRadius(a, structure) {
    if (!a || a <= 0) return 0;
    const s = structure?.toLowerCase();
    
    switch(s) {
        case 'sc': return a / 2;
        case 'bcc': return (Math.sqrt(3) / 4) * a;
        case 'fcc': return a / (2 * Math.sqrt(2)); // Igual a (sqrt(2)/4)*a
        default: return 0;
    }
}

export function validateCubicIndices(h, k, l) {
    return !(h === 0 && k === 0 && l === 0);
}

export function parseIntegerInput(value) {
    if (value === undefined || value === null || value === "") return null;
    let cleaned = String(value).trim();
    cleaned = cleaned.replace(/[^0-9-]/g, '');
    if (!cleaned || cleaned === '-') return null;
    
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? null : parsed;
}

export function parseFloatInput(value) {
    if (value === undefined || value === null || value === "") return 0;
    const cleaned = String(value).replace(/,/g, '.').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

export function computeVectorMagnitude(h, k, i, l, system) {
    // Solo cúbico soportado
    return Math.sqrt(h*h + k*k + l*l);
}

/**
 * Calcula el volumen de la celda unitaria
 */
export function calculateUnitCellVolume(a, system = 'cubic', c = null) {
    if (!a || a <= 0) return 0;
    // Solo cúbico soportado
    return Math.pow(a, 3);
}
