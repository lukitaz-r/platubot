import JsonModel from '../../database/JsonModel.js';

const defaults = {
  temporada: '',
  cuartos: [],
  equiposEsperandoSemis: [],
  semifinales: [],
  final: null,
  estadoGlobal: 'Inactiva'
};

export default new JsonModel('Supersupercopa', defaults);