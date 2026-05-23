import JsonModel from '../../database/JsonModel.js';

const defaults = {
  nombre: 'Coppa',
  prefix: 'coppa',
  estado: 'EnCurso', // 'EnCurso', 'Finalizado'
  tema: {
    primario: '#022c16',
    secundario: '#064e3b',
    acento: '#4ade80',
    texto: '#ffffff',
    borde: '#059669',
  },
  tipoEncuentro: 'ida_vuelta',
  hayTercerPuesto: false,
  fasesEliminatoria: [], // ['Octavos', 'Cuartos', 'Semifinales', 'Final']
  equipos: [],           // [{ nombre, discordId }]
  llaves: {},            // { 'Octavos': [ { id, equipo1, equipo2, ida, vuelta, desempate, ganador } ] }
  faseActual: 0,
  createdBy: null
};

// We will simulate virtuals at runtime where needed since this is JSON Model now.
export default new JsonModel('Coppa', defaults);
