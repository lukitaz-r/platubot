import EquipoSuperliga from '../../models/superliga/Equipos.js';

/**
 * Registra un movimiento en el libroTraspasos de un equipo.
 * @param {string} equipoId - ID del equipo
 * @param {Object} mov - Datos del movimiento
 * @param {string} mov.tipo - 'Alta' | 'Baja' | 'Modificación' | 'Préstamo'
 * @param {string} mov.jugador - Nombre del jugador
 * @param {string} mov.jugadorId - Discord ID del jugador
 * @param {number} [mov.monto=0] - Monto involucrado
 * @param {string} [mov.equipoRelacionado=''] - Nombre del otro equipo
 * @param {string} [mov.detalle=''] - Detalle extra
 */
export async function registrarMovimiento(equipoId, { tipo, jugador, jugadorId, monto = 0, equipoRelacionado = '', detalle = '' }) {
  const allEquipos = await EquipoSuperliga.find({});
  const equipo = allEquipos.find(e => (e._id?.$oid ?? e._id) === equipoId);
  if (!equipo) return;

  if (!equipo.libroTraspasos) equipo.libroTraspasos = [];

  equipo.libroTraspasos.push({
    tipo,
    jugador,
    jugadorId,
    fecha: new Date().toISOString(),
    monto,
    equipoRelacionado,
    detalle,
  });

  await equipo.save();
}
