import JsonModel from '../../database/JsonModel.js';

const defaults = {
  nombre: '',
  id: '',
  mediaInicial: 80,
  media: 80,
  valor: 500000,
  pais: 'Argentina',
  partidosGanados: 0,
  partidosPerdidos: 0,
  golesAFavor: 0,
  golesEnContra: 0,
  suspendido: 0,
  exEquipo: ''
};

export default new JsonModel('JugadorLibre', defaults);