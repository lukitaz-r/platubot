function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

export default function generarRoundRobin(jugadores, vueltas = 1) {
  const n = jugadores.length;
  const lista = [...jugadores];
  shuffle(lista); // Aleatorizar orden inicial de equipos

  if (n % 2 !== 0) lista.push({ nombre: 'BYE', id: 'BYE' });
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
        let swap = (i === 0) ? (ronda % 2 === 0) : ((i + ronda) % 2 === 0);
        if (vuelta % 2 !== 0) swap = !swap;

        if (swap) {
          [local, visitante] = [visitante, local];
        }

        partidosRonda.push({
          _id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          localId: local.id,
          localNombre: local.nombre,
          visitanteId: visitante.id,
          visitanteNombre: visitante.nombre,
          golesLocal: null,
          golesVisitante: null,
          finalizado: false,
          imagenResultado: null,
        });
      }
      shuffle(partidosRonda); // Aleatorizar orden de partidos en la fecha
      fechasVuelta.push({ partidos: partidosRonda });
      tempLista.splice(1, 0, tempLista.pop());
    }

    shuffle(fechasVuelta); // Aleatorizar orden de las fechas en la vuelta
    fechasVuelta.forEach((f) => {
      f.numero = fechas.length + 1;
      fechas.push(f);
    });
  }
  return fechas;
}