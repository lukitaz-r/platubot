import JsonModel from '../../database/JsonModel.js';

const defaults = {
  temporada: '',
  fase: 'grupos', // 'grupos' | 'semifinales' | 'final' | 'finalizado'
  tema: {
    primario: '#0a0e14',
    secundario: '#161d26',
    acento: '#f1c40f',
    texto: '#ffffff',
    borde: '#374151',
  },
  grupos: [
    { nombre: 'A', equipos: [], fechas: [] },
    { nombre: 'B', equipos: [], fechas: [] }
  ],
  semifinales: [], // 2 partidos
  final: null,
  estadoGlobal: 'Inactiva' // 'Inactiva' | 'Activa' | 'Finalizada'
};

export default new JsonModel('Supersupercopa', defaults);