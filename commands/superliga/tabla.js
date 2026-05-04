import { AttachmentBuilder } from 'discord.js';
import Superliga from '../../models/superliga/Superliga.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import { generarTablaSuperligaImagen, prepararDatosTabla } from '../../utils/visual/tablaSuperligaGenerator.js';

export default {
  name: 'superliga-tabla',
  aliases: ['sl-tabla', 'slt'],
  desc: 'Muestra la tabla de posiciones dinámica de la Superliga',

  run: async (client, message) => {
    const liga = await Superliga.findOne({ actual: true });
    if (!liga) return message.reply('❌ No hay una temporada de Superliga activa.');

    const equiposDB = await EquipoSuperliga.find({});
    
    // Inicializar estadísticas usando liga.equipos para que sea 100% DINÁMICO
    // (Acepta cualquier número de participantes)
    const stats = {};
    
    liga.equipos.forEach(id => {
        // Buscar el equipo en la base de datos por ID
        const eqDB = equiposDB.find(e => (e._id?.$oid ?? e._id) === id);
        if (eqDB) {
            stats[eqDB.nombre] = {
                nombre: eqDB.nombre,
                pj: 0, pg: 0, pe: 0, pp: 0,
                gf: 0, gc: 0, dg: 0, pts: 0,
                id: id,
                enfrentamientos: {}
            };
        }
    });

    liga.fechas.forEach(f => {
      const enc = f.partidos ? f.partidos : f.encuentros;
      enc.forEach(p => {
        [p.localNombre, p.visitanteNombre].forEach(nombre => {
          if (nombre && !stats[nombre]) {
            const eqDB = equiposDB.find(e => e.nombre === nombre);
            stats[nombre] = {
              nombre: nombre,
              pts: 0, pj: 0, pg: 0, pp: 0,
              gf: 0, gc: 0, dg: 0, 
              id: eqDB?._id?.$oid ?? eqDB?._id ?? nombre,
              enfrentamientos: {}
            };
          }
        });
      });
    });

    // Procesar resultados (GF/GC = Sets ganados/perdidos)
    liga.fechas.forEach(fecha => {
      const enc = fecha.partidos ? fecha.partidos : fecha.encuentros;
      enc.forEach(partido => {
        if (!partido.finalizado) return;
        const local = partido.localNombre ?? partido.local.nombre;
        const visitante = partido.visitanteNombre ?? partido.visitante.nombre;
        const loc = stats[local];
        const vis = stats[visitante];
        if (!loc || !vis) return;

        loc.pj++; vis.pj++;
        
        const setsL = partido.puntosMiniLocal ?? partido.resultado?.golesLocal ?? 0;
        const setsV = partido.puntosMiniVisitante ?? partido.resultado?.golesVisitante ?? 0;

        loc.gf += setsL;
        loc.gc += setsV;
        vis.gf += setsV;
        vis.gc += setsL;

        if (setsL > setsV) {
          loc.pg++; loc.pts += 3; vis.pp++;
          loc.enfrentamientos[vis.nombre] = (loc.enfrentamientos[vis.nombre] || 0) + 1;
        } else if (setsV > setsL) {
          vis.pg++; vis.pts += 3; loc.pp++;
          vis.enfrentamientos[loc.nombre] = (vis.enfrentamientos[loc.nombre] || 0) + 1;
        }
      });
    });

    const listaTabla = Object.values(stats).map(e => {
      e.dg = e.gf - e.gc;
      return e;
    });

    // Ordenar: PTS > DG > GF > Duelos
    listaTabla.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.dg !== a.dg) return b.dg - a.dg;
      if (b.gf !== a.gf) return b.gf - a.gf;
      const duelo = a.enfrentamientos[b.nombre] || 0;
      const dueloRival = b.enfrentamientos[a.nombre] || 0;
      return dueloRival - duelo;
    });

    const typingMsg = await message.reply('<a:loading:1461897825439711468> Generando tabla de la Superliga...');
    
    try {
        const datosConEscudos = prepararDatosTabla(listaTabla, equiposDB);
        const imageBuffer = await generarTablaSuperligaImagen(datosConEscudos, liga.temporada);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'tabla-superliga.png' });

        await typingMsg.edit({ content: null, files: [attachment] });
    } catch (error) {
        console.error('Error tabla Superliga:', error);
        await typingMsg.edit('❌ Hubo un error al generar la tabla gráfica.');
    }
  }
};
