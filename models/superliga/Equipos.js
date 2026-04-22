import JsonModel from '../../database/JsonModel.js';

const defaults = {
  nombre: '',
  escudo: '',
  dinero: 2000000,
  coach: {
    nombre: '',
    id: '',
    carta: '',
    pais: 'Argentina',
    partidosGanados: 0,
    partidosPerdidos: 0,
    golesAFavor: 0,
    golesEnContra: 0
  },
  jugadores: [],
  historial: [],
  tablaHistorica: {
    puntosAcumulados: 0,
    partidosGanados: 0,
    partidosPerdidos: 0,
    diferenciaGoles: 0,
    titulosTotales: 0
  }
};

export default new JsonModel('EquipoSuperliga', defaults);
