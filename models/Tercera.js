import JsonModel from '../database/JsonModel.js';

const defaults = {
  nombreLiga: 'Coppa',
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
  partidos: []
};

export default new JsonModel('Tercera', defaults);