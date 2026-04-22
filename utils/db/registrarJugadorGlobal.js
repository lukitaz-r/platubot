import Jugador from "../../models/Jugador.js";

export default async function registrarJugadorGlobal(n, id) {
  try {
    let jugador = await Jugador.findOne({ id: id })
    if (jugador) {
      if (jugador.ligaActual !== 'Primera Platubi') {
        jugador.ligaActual = 'Primera Platubi';
        await jugador.save();
        return { success: true, message: 'Jugador actualizado globalmente.', data: jugador };
      }
      return { success: false, message: 'El jugador ya existe en la base de datos global.', data: jugador };
    }
    jugador = await Jugador.create({ nombre: n, id: id, ligaActual: 'Primera Platubi' });
    return { success: true, message: 'Jugador registrado globalmente.', data: jugador };
  } catch (error) {
    console.error('Error en registrarJugadorGlobal:', error);
    return { success: false, message: 'Error al registrar jugador global.', error };
  }
}