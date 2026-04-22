import JsonModel from '../../database/JsonModel.js';

const defaults = {
  nombre: '',
  prefix: '',
  estado: 'Configuracion', // 'Configuracion', 'Inscripcion', 'EnCurso', 'Finalizado'
  tipoJugadores: 'users',
  canalResultados: null,

  formatoPreset: 'personalizado',
  cantidadParticipantes: 0,
  clasificadosDirectos: [],
  championsConfig: {
    directos: 0,
    playoff: 0,
    eliminados: 0,
    bracketSize: 0,
  },

  tema: {
    primario: '#1a1a2e',
    secundario: '#16213e',
    acento: '#e94560',
    texto: '#ffffff',
    borde: '#0f3460',
  },

  gruposHabilitados: false,
  cantidadGrupos: 0,
  jugadoresPorGrupo: 0,
  clasificadosPorGrupo: 2,
  mejorTercero: false,
  cantMejoresTerceros: 0,
  sorteoGrupos: true,
  criteriosClasificacion: ['puntos', 'dif', 'gf'],

  playoffsHabilitados: true,
  formatoEliminatoria: 'partido_unico',
  hayTercerPuesto: false,
  fasesEliminatoria: [],

  equipos: [],
  enfrentamientosGrupos: [],
  llaves: {},
  faseActual: 0,
  createdBy: null
};

export default new JsonModel('Torneo', defaults);
