export default function generarRoundRobin(jugadores, vueltas = 1) {
  const n = jugadores.length;
  const lista = [...jugadores];
  if (n % 2 !== 0) lista.push({ nombre: 'BYE', id: 'BYE' });
  const total = lista.length;
  const fechas = [];

  for (let vuelta = 0; vuelta < vueltas; vuelta++) {
    for (let ronda = 0; ronda < total - 1; ronda++) {
      const fecha = { numero: fechas.length + 1, partidos: [] };
      for (let i = 0; i < total / 2; i++) {
        const local = lista[i];
        const visitante = lista[total - 1 - i];
        if (local.id === 'BYE' || visitante.id === 'BYE') continue;
        // En vueltas pares se invierten local/visitante
        if (vuelta % 2 === 0) {
          fecha.partidos.push({
            _id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
            localId: local.id, localNombre: local.nombre,
            visitanteId: visitante.id, visitanteNombre: visitante.nombre,
            golesLocal: null, golesVisitante: null,
            finalizado: false,
            imagenResultado: null,
          });
        } else {
          fecha.partidos.push({
            _id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
            localId: visitante.id, localNombre: visitante.nombre,
            visitanteId: local.id, visitanteNombre: local.nombre,
            golesLocal: null, golesVisitante: null,
            finalizado: false,
            imagenResultado: null,
          });
        }
      }
      fechas.push(fecha);
      // Rotar (primer elemento fijo)
      lista.splice(1, 0, lista.pop());
    }
  }
  return fechas;
}