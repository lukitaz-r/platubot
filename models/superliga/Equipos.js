import JsonModel from '../../database/JsonModel.js';

const defaults = {
  nombre: '',
  escudo: '',
  dinero: 2000000,
  presupuestoInicial: 2000000,
  ingresosPartidos: 0,
  ingresosPosicion: 0,
  coach: {
    nombre: '',
    id: '',
    carta: '',
    pais: 'Argentina',
    partidosGanados: 0,
    partidosPerdidos: 0,
    golesAFavor: 0,
    golesEnContra: 0,
    media: 80,
    mediaInicial: 80,
    stats: {
      actividad: 80,
      tiro: 80,
      pase: 80,
      iq: 80,
      aura: 80,
      esquinazo: 80
    },
    contrato: 1,
    clausula: {
      tipo: 'ninguna',
      valor: ''
    }
  },
  jugadores: [],
  historial: [],
  historialJugadores: {}, // { "Temporada 1": [ {id, nombre, media}, ... ] }
  libroTraspasos: [], // [ { tipo: 'Alta/Baja', jugador: 'Nombre', fecha: Date, monto: 0, equipoRelacionado: '' } ]
  tablaHistorica: {
    puntosAcumulados: 0,
    partidosGanados: 0,
    partidosPerdidos: 0,
    diferenciaGoles: 0,
    titulosTotales: 0
  }
};

export default new JsonModel('EquipoSuperliga', defaults);
