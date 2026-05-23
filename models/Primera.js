import JsonModel from '../database/JsonModel.js';

const defaults = {
  nombreLiga: 'Primera División',
  fechaDeInicio: Date.now(),
  fechaDeFin: null,
  reglas: {
    puestosCampeon: 1,
    puestosAscenso: 0,
    puestosPromocionAscenso: 0,
    puestosReducido: 0,
    puestosPromocionDescenso: 0,
    cantidadDescenso: 0
  },
  jugadores: [],
  partidos: [],
  playoff: {
    habilitado: false,
    estado: 'Pendiente',
    partidos: []
  }
};

export default new JsonModel('Primera', defaults);
