import JsonModel from '../../database/JsonModel.js';

const defaults = {
  nombre: 'Superliga',
  temporada: '',
  actual: false,
  fechas: [], // Cada fecha contiene un array 'encuentros'
  fechaInicio: null,
  fechaFin: null
};

export default new JsonModel('Superliga', defaults);
