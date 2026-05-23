import EquipoSuperliga from '../../models/superliga/Equipos.js';

/**
 * Calcula el salario de un jugador basado en su media actual.
 * Pisos y techos:
 *   media >= 90 → piso 1.5M (escala hasta ~2M en media 99)
 *   media >= 85 → piso 1M (escala hasta 1.5M en media 89)
 *   media >= 80 → piso 500k (escala hasta 1M en media 84)
 *   media <  80 → techo 250k (escala desde ~200k en media 65)
 *
 * @param {number} media - Media actual del jugador
 * @returns {number} Salario anual en monedas del juego
 */
export function calcularSalario(media) {
    media = Math.max(65, Math.min(99, media));

    if (media >= 90) {
        // Piso 1.5M, escala hasta 2M en media 99
        return 1_500_000 + Math.round((media - 90) * (500_000 / 9));
    } else if (media >= 85) {
        // Piso 1M, escala hasta 1.5M en media 89
        return 1_000_000 + Math.round((media - 85) * (500_000 / 5));
    } else if (media >= 80) {
        // Piso 500k, escala hasta 1M en media 84
        return 500_000 + Math.round((media - 80) * (500_000 / 5));
    } else {
        // Techo 250k, escala desde ~200k en media 65
        return Math.round(250_000 * (media / 80));
    }
}

/**
 * Calcula el valor de mercado de un jugador basado en su media.
 * Rango: Media 65 = 100_000, Media 99 = 3_000_000.
 * Usa interpolación lineal.
 * 
 * @param {number} media - Media actual del jugador
 * @returns {number} Valor en monedas, redondeado a múltiplos de 10k
 */
export function calcularValorJugador(media) {
    media = Math.max(65, Math.min(99, media));
    
    // Rango de media: 34 puntos (99 - 65)
    // Rango de valor: 2.95M (3M - 50k)
    // Aumento por punto de media: ~85,294
    
    const valorBase = 50_000;
    const progreso = (media - 65) / (99 - 65);
    const valorCalculado = valorBase + (progreso * 2_950_000);
    
    // Redondear a la decena de mil entera para que quede prolijo
    return Math.round(valorCalculado / 10_000) * 10_000;
}

/**
 * Calcula el cambio de media tras un duelo 1v1.
 * 
 * Fórmula:
 *  Δ = 0.25 (base por ganar)
 *    + 0.30 (si el ganador tiene MENOR media que el perdedor → upset)
 *    + 0.30 (si la diferencia de goles >= 3 → goleada)
 *    + |mediaPerdedor - mediaGanador| / mediaGanador (bonus solo si upset)
 *
 * @param {number} mediaGanador - Media actual del ganador
 * @param {number} mediaPerdedor - Media actual del perdedor
 * @param {number} golesGanador - Goles del ganador
 * @param {number} golesPerdedor - Goles del perdedor
 * @returns {number} delta - Puntos de media a sumar/restar (redondeado a 2 decimales)
 */
export function calcularCambioMedia(mediaGanador, mediaPerdedor, golesGanador, golesPerdedor) {
    let delta = 0.25; // Base por ganar

    // Bonus upset: ganador tenía MENOR media que el perdedor
    if (mediaGanador < mediaPerdedor) {
        delta += 0.30;
    }

    // Bonus goleada: diferencia de goles >= 3
    if ((golesGanador - golesPerdedor) >= 3) {
        delta += 0.30;
    }

    // Bonus porcentual por diferencia de media (solo si upset)
    if (mediaGanador < mediaPerdedor) {
        delta += (mediaPerdedor - mediaGanador) / mediaGanador;
    }

    return Math.round(delta * 100) / 100; // Redondear a 2 decimales
}

/**
 * Busca al jugador en su equipo, calcula y aplica el cambio de media tras un duelo.
 * Clamp: [65, 99]. Guarda ambos equipos al final.
 *
 * @param {string} ganadorId - Discord ID del jugador ganador
 * @param {string} perdedorId - Discord ID del jugador perdedor
 * @param {number} golesGanador - Goles del ganador en el duelo
 * @param {number} golesPerdedor - Goles del perdedor en el duelo
 * @returns {Promise<Object|null>} { ganadorNombre, perdedorNombre, delta, nuevaMediaGanador, nuevaMediaPerdedor } o null si falló
 */
export async function aplicarCambioMediaDuelo(ganadorId, perdedorId, golesGanador, golesPerdedor) {
    try {
        // Buscar jugadores en sus equipos
        const eqGanador = await EquipoSuperliga.findOne({
            $or: [
                { 'jugadores.id': ganadorId },
                { 'coach.id': ganadorId }
            ]
        });
        const eqPerdedor = await EquipoSuperliga.findOne({
            $or: [
                { 'jugadores.id': perdedorId },
                { 'coach.id': perdedorId }
            ]
        });

        if (!eqGanador || !eqPerdedor) return null;

        // Obtener referencia al jugador ganador
        let jugGanador = eqGanador.jugadores.find(j => j.id === ganadorId);
        let esCoachGanador = false;
        if (!jugGanador && eqGanador.coach?.id === ganadorId) {
            // Coach no tiene media dinámica, ignorar
            esCoachGanador = true;
        }

        // Obtener referencia al jugador perdedor
        let jugPerdedor = eqPerdedor.jugadores.find(j => j.id === perdedorId);
        let esCoachPerdedor = false;
        if (!jugPerdedor && eqPerdedor.coach?.id === perdedorId) {
            esCoachPerdedor = true;
        }

        // Si ambos son coaches, no hay cambio de media
        if (esCoachGanador && esCoachPerdedor) return null;

        // Si uno es coach, solo aplica al no-coach (con formula usando media del coach como 80)
        const mediaGanador = jugGanador ? jugGanador.media : 80;
        const mediaPerdedor = jugPerdedor ? jugPerdedor.media : 80;

        const delta = calcularCambioMedia(mediaGanador, mediaPerdedor, golesGanador, golesPerdedor);

        // Aplicar al ganador (si no es coach)
        let nuevaMediaGanador = mediaGanador;
        if (jugGanador) {
            const maxGanador = jugGanador.mediaInicial ? Math.min(99, jugGanador.mediaInicial + 10) : 99;
            const minGanador = jugGanador.mediaInicial ? Math.max(65, jugGanador.mediaInicial - 20) : 65;
            jugGanador.media = Math.min(maxGanador, Math.max(minGanador, jugGanador.media + delta));
            nuevaMediaGanador = jugGanador.media;
        }

        // Aplicar al perdedor (si no es coach)
        let nuevaMediaPerdedor = mediaPerdedor;
        if (jugPerdedor) {
            const maxPerdedor = jugPerdedor.mediaInicial ? Math.min(99, jugPerdedor.mediaInicial + 10) : 99;
            const minPerdedor = jugPerdedor.mediaInicial ? Math.max(65, jugPerdedor.mediaInicial - 20) : 65;
            jugPerdedor.media = Math.min(maxPerdedor, Math.max(minPerdedor, jugPerdedor.media - delta));
            nuevaMediaPerdedor = jugPerdedor.media;
        }

        // Guardar equipos afectados
        const equiposGuardados = new Set();
        await eqGanador.save();
        equiposGuardados.add(eqGanador._id.toString());
        if (!equiposGuardados.has(eqPerdedor._id.toString())) {
            await eqPerdedor.save();
        }

        return {
            ganadorNombre: jugGanador?.nombre || eqGanador.coach.nombre,
            perdedorNombre: jugPerdedor?.nombre || eqPerdedor.coach.nombre,
            delta,
            nuevaMediaGanador: Math.round(nuevaMediaGanador * 100) / 100,
            nuevaMediaPerdedor: Math.round(nuevaMediaPerdedor * 100) / 100
        };
    } catch (error) {
        console.error('[mediaCalculator] Error aplicando cambio de media:', error);
        return null;
    }
}
