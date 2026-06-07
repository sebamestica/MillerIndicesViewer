/**
 * LÓGICA MATEMÁTICA MECÁNICA (v3.1)
 * Implementación de Tensor de Esfuerzos, Descomposición Hidrostática/Desviadora,
 * Ley de Hooke Generalizada y Criterios de Falla (Von Mises).
 */

/**
 * Calcula el Módulo de Corte (G) a partir de E y ν
 * G = E / (2 * (1 + ν))
 */
export function calculateShearModulus(youngGPa, poisson) {
    const E = youngGPa * 1000; // MPa
    return E / (2 * (1 + poisson));
}

/**
 * Calcula el tensor de deformación ε (strains) completo
 * @param {Object} stress {xx, yy, zz, xy, yz, zx} en MPa
 * @param {number} young Módulo de Young en GPa
 * @param {number} poisson Coeficiente de Poisson
 * @returns {Object} {ex, ey, ez, gxy, gyz, gzx}
 */
export function calculateStrains(stress, young, poisson) {
    // Soporte para formato antiguo {x, y, z}
    const xx = stress.xx !== undefined ? stress.xx : (stress.x || 0);
    const yy = stress.yy !== undefined ? stress.yy : (stress.y || 0);
    const zz = stress.zz !== undefined ? stress.zz : (stress.z || 0);
    const xy = stress.xy || 0;
    const yz = stress.yz || 0;
    const zx = stress.zx || 0;

    const E = young * 1000; // Convertir GPa a MPa
    const v = poisson;
    const G = E / (2 * (1 + v));
    
    // Ley de Hooke Generalizada (Isotrópica)
    const ex = (1 / E) * (xx - v * (yy + zz));
    const ey = (1 / E) * (yy - v * (xx + zz));
    const ez = (1 / E) * (zz - v * (xx + yy));

    // Esfuerzos de Cizalle (Angular Strains)
    // γ = τ / G
    const gxy = xy / G;
    const gyz = yz / G;
    const gzx = zx / G;

    return { ex, ey, ez, gxy, gyz, gzx };
}

/**
 * Descompone un tensor de esfuerzos en sus partes Hidrostática y Desviadora
 * @param {Object} stress {xx, yy, zz, xy, yz, zx}
 */
export function decomposeStressTensor(stress) {
    const xx = stress.xx !== undefined ? stress.xx : (stress.x || 0);
    const yy = stress.yy !== undefined ? stress.yy : (stress.y || 0);
    const zz = stress.zz !== undefined ? stress.zz : (stress.z || 0);
    const xy = stress.xy || 0;
    const yz = stress.yz || 0;
    const zx = stress.zx || 0;
    
    // Esfuerzo Hidrostático Promedio (P)
    const P = (xx + yy + zz) / 3;
    
    // Tensor Hidrostático (Solo componentes diagonales iguales a P)
    const hydrostatic = {
        xx: P, yy: P, zz: P,
        xy: 0, yz: 0, zx: 0
    };
    
    // Tensor Desviador (Matriz de Distorsión)
    // Sij = σij - Pδij
    const deviatoric = {
        xx: xx - P,
        yy: yy - P,
        zz: zz - P,
        xy: xy,
        yz: yz,
        zx: zx
    };
    
    return { P, hydrostatic, deviatoric };
}

/**
 * Calcula el cambio volumétrico fraccional (ΔV/V0)
 * Para pequeñas deformaciones: ΔV/V0 ≈ εx + εy + εz
 */
export function calculateVolumeChange(strains) {
    return (strains.ex || 0) + (strains.ey || 0) + (strains.ez || 0);
}

/**
 * Calcula el Esfuerzo Cortante Resuelto (RSS) sobre un plano hkl
 * Simplificación para visualización educativa:
 * τ = σ * cos(phi) * cos(lambda)
 */
export function calculateRSS(stress, indices) {
    const xx = stress.xx !== undefined ? stress.xx : (stress.x || 0);
    const yy = stress.yy !== undefined ? stress.yy : (stress.y || 0);
    const zz = stress.zz !== undefined ? stress.zz : (stress.z || 0);
    const xy = stress.xy || 0;
    const yz = stress.yz || 0;
    const zx = stress.zx || 0;

    const h = indices.h || 0;
    const k = indices.k || 0;
    const l = indices.l || 0;
    
    const len = Math.sqrt(h*h + k*k + l*l);
    if (len === 0) return 0;
    
    // Normal unitaria al plano
    const nx = k / len; // Para emparejar con el renderizado de Three.js (Normal: k, l, h)
    const ny = l / len;
    const nz = h / len;

    // Vector de tracción: T = sigma * n
    const Tx = xx * nx + xy * ny + zx * nz;
    const Ty = xy * nx + yy * ny + yz * nz;
    const Tz = zx * nx + yz * ny + zz * nz;

    // Esfuerzo normal: sn = T . n
    const sn = Tx * nx + Ty * ny + Tz * nz;

    // Esfuerzo cortante resuelto (RSS): tau = sqrt(|T|^2 - sn^2)
    const T_sq = Tx*Tx + Ty*Ty + Tz*Tz;
    const tau = Math.sqrt(Math.max(0, T_sq - sn*sn));

    return tau;
}

/**
 * Calcula analíticamente los esfuerzos principales (valores propios) de un tensor de esfuerzo 3x3 simétrico.
 * @param {Object} stress {xx, yy, zz, xy, yz, zx} en MPa
 * @returns {Array} [sigma1, sigma2, sigma3] ordenados de mayor a menor
 */
export function calculatePrincipalStresses(stress) {
    const xx = stress.xx !== undefined ? stress.xx : (stress.x || 0);
    const yy = stress.yy !== undefined ? stress.yy : (stress.y || 0);
    const zz = stress.zz !== undefined ? stress.zz : (stress.z || 0);
    const xy = stress.xy || 0;
    const yz = stress.yz || 0;
    const zx = stress.zx || 0;

    const I1 = xx + yy + zz;
    const p = I1 / 3;

    // Tensor desviador s
    const sxx = xx - p;
    const syy = yy - p;
    const szz = zz - p;

    // Invariante J2 de la parte desviadora
    const J2 = 0.5 * (sxx*sxx + syy*syy + szz*szz) + xy*xy + yz*yz + zx*zx;

    // Invariante J3 (determinante de la parte desviadora)
    const J3 = sxx * (syy * szz - yz * yz) - xy * (xy * szz - yz * zx) + zx * (xy * yz - syy * zx);

    if (J2 < 1e-12) {
        return [p, p, p];
    }

    const arg = (3 * J3 / (2 * J2)) * Math.sqrt(3 / J2);
    const cosTheta = Math.max(-1, Math.min(1, arg));
    const theta = Math.acos(cosTheta) / 3;

    const term = 2 * Math.sqrt(J2 / 3);
    const lam1 = p + term * Math.cos(theta);
    const lam2 = p + term * Math.cos(theta - (2 * Math.PI / 3));
    const lam3 = p + term * Math.cos(theta + (2 * Math.PI / 3));

    const eigs = [lam1, lam2, lam3];
    eigs.sort((a, b) => b - a);
    return eigs;
}

/**
 * Calcula el esfuerzo equivalente de Tresca: sigma_Tresca = sigma_1 - sigma_3
 */
export function calculateTresca(stress) {
    const principal = calculatePrincipalStresses(stress);
    return principal[0] - principal[2];
}

/**
 * Calcula la densidad de energía de deformación elástica (U) en MJ/m³
 */
export function calculateStrainEnergy(stress, strains) {
    const xx = stress.xx !== undefined ? stress.xx : (stress.x || 0);
    const yy = stress.yy !== undefined ? stress.yy : (stress.y || 0);
    const zz = stress.zz !== undefined ? stress.zz : (stress.z || 0);
    const xy = stress.xy || 0;
    const yz = stress.yz || 0;
    const zx = stress.zx || 0;

    const termNormal = xx * strains.ex + yy * strains.ey + zz * strains.ez;
    const termShear = xy * strains.gxy + yz * strains.gyz + zx * strains.gzx;

    return 0.5 * (termNormal + termShear);
}

/**
 * Calcula el Esfuerzo de Von Mises (Esfuerzo Equivalente)
 * σvm = √[ σx^2 + σy^2 + σz^2 - (σxσy + σyσz + σzσx) + 3(τxy^2 + τyz^2 + τzx^2) ]
 * @param {Object} stress {xx, yy, zz, xy, yz, zx}
 */
export function calculateVonMises(stress) {
    const xx = stress.xx !== undefined ? stress.xx : (stress.x || 0);
    const yy = stress.yy !== undefined ? stress.yy : (stress.y || 0);
    const zz = stress.zz !== undefined ? stress.zz : (stress.z || 0);
    const xy = stress.xy || 0;
    const yz = stress.yz || 0;
    const zx = stress.zx || 0;

    const term1 = Math.pow(xx, 2) + Math.pow(yy, 2) + Math.pow(zz, 2);
    const term2 = xx * yy + yy * zz + zz * xx;
    const term3 = 3 * (Math.pow(xy, 2) + Math.pow(yz, 2) + Math.pow(zx, 2));

    return Math.sqrt(Math.max(0, term1 - term2 + term3));
}

/**
 * Calcula el Factor de Seguridad (n)
 * n = Límite Elástico / Esfuerzo Equivalente
 */
export function calculateSafetyFactor(vonMises, yieldStrength) {
    if (!yieldStrength || yieldStrength <= 0) return Infinity;
    if (vonMises <= 0) return Infinity;
    return yieldStrength / vonMises;
}

