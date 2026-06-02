import JsonModel from '../../database/JsonModel.js';

const defaults = {
  nombre: '',
  prefix: '',
  estado: 'Configuracion', // 'Configuracion', 'Inscripcion', 'EnCurso', 'Finalizado'
  tipoJugadores: 'users',
  tipoCompeticion: 'individual', // 'individual', 'duo', 'equipos'
  logo: null,
  inscripcionAbierta: true,
  equipoConfig: {
    minJugadores: 2,
    maxJugadores: 5,
  },
  historialResultados: [],
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
  tipoEncuentro: 'unico',
  hayTercerPuesto: false,
  fasesEliminatoria: [],

  equipos: [],
  enfrentamientosGrupos: [],
  llaves: {},
  faseActual: 0,
  createdBy: null
};

const torneoModel = new JsonModel('Torneo', defaults);

// Invalidate cache on any tournament update
const originalUpdate = torneoModel.updateDocument;
torneoModel.updateDocument = async function (docInstance) {
  const result = await originalUpdate.call(this, docInstance);
  if (docInstance && docInstance.prefix) {
    try {
      const { invalidateCache } = await import('../../utils/visual/imageCache.js');
      invalidateCache(docInstance.prefix);
    } catch (e) {
      console.error('[Torneo Model] Error invalidating cache:', e);
    }
  }
  return result;
};

export default torneoModel;
