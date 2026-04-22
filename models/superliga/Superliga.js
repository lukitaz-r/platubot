import JsonModel from '../../database/JsonModel.js';

const defaults = {
  temporada: '',
  actual: false,
  fechas: [],
  fechaInicio: null,
  fechaFin: null
};

export default new JsonModel('Superliga', defaults);
