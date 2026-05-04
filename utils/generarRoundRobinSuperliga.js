function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

export default function generarRoundRobinSuperliga(equipos, vueltas = 1) {
  const n = equipos.length;
  const lista = [...equipos];
  shuffle(lista); // Aleatorizar orden inicial de equipos

  if (n % 2 !== 0) lista.push({ nombre: 'BYE', id: 'BYE', coach: { id: 'BYE' } });
  const total = lista.length;
  const fechas = [];

  for (let vuelta = 0; vuelta < vueltas; vuelta++) {
    const fechasVuelta = [];
    const tempLista = [...lista];

    for (let ronda = 0; ronda < total - 1; ronda++) {
      const partidosRonda = [];
      for (let i = 0; i < total / 2; i++) {
        let local = tempLista[i];
        let visitante = tempLista[total - 1 - i];

        if (local.id === 'BYE' || visitante.id === 'BYE') continue;

        // Balancear localías: alternar quién es local según la ronda y el índice
        // En vueltas impares, invertimos el resultado de esta lógica
        let swap = (i === 0) ? (ronda % 2 === 0) : ((i + ronda) % 2 === 0);
        if (vuelta % 2 !== 0) swap = !swap;

        if (swap) {
          [local, visitante] = [visitante, local];
        }
        
        const localId = local._id?.$oid ?? local._id;
        const visitanteId = visitante._id?.$oid ?? visitante._id;

        const partido = {
          _id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          localId,
          localNombre: local.nombre,
          visitanteId,
          visitanteNombre: visitante.nombre,
          duelosIndividuales: Array.from({ length: 3 }, () => ({
            localJugadorId: null, localJugadorNombre: null, 
            visitanteJugadorId: null, visitanteJugadorNombre: null,
            golesLocal: null, golesVisitante: null, finalizado: false 
          })),
          puntosMiniLocal: 0,
          puntosMiniVisitante: 0,
          golesTotalLocal: 0,
          golesTotalVisitante: 0,
          finalizado: false
        };

        partidosRonda.push(partido);
      }
      shuffle(partidosRonda); // Aleatorizar orden de partidos en la fecha
      fechasVuelta.push({ partidos: partidosRonda });
      tempLista.splice(1, 0, tempLista.pop());
    }

    shuffle(fechasVuelta); // Aleatorizar orden de las fechas en la vuelta
    fechasVuelta.forEach((f, idx) => {
        f.numero = fechas.length + idx + 1;
        fechas.push(f);
    });
  }
  return fechas;
}
