import JsonModel from '../database/JsonModel.js';

const defaults = {
  nombre: '',
  id: '',
  ligaActual: 'Sin Liga',
  titulos: 0,
  partidosGanadosHistorico: 0,
  partidosPerdidosHistorico: 0,
  woHistorico: 0,
  golesAFavorHistorico: 0,
  golesEnContraHistorico: 0,
  historial: []
};

export default new JsonModel('Jugador', defaults);