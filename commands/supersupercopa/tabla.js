import { AttachmentBuilder } from 'discord.js';
import Supersupercopa from '../../models/superliga/Supersupercopa.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import { generarTablaSuperligaImagen, prepararDatosTabla } from '../../utils/visual/tablaSuperligaGenerator.js';

export default {
  name: 'supersupercopa-tabla',
  aliases: ['ssc-tabla', 'ssct'],
  desc: 'Tabla de posiciones de la Supersupercopa (fase de grupos)',

  run: async (client, message) => {
    const copa = await Supersupercopa.findOne({ estadoGlobal: 'Activa' });
    if (!copa) return message.reply('❌ No hay Supersupercopa activa.');
    if (copa.fase !== 'grupos') return message.reply('❌ La Supersupercopa no está en fase de grupos. Usa `!ssc-bracket` para ver las eliminatorias.');

    const equiposDB = await EquipoSuperliga.find({});
    const typingMsg = await message.reply('<a:loading:1461897825439711468> Generando tablas de los grupos...');

    const attachments = [];

    for (const grupo of copa.grupos) {
      const stats = {};
      grupo.equipos.forEach(id => {
        const eq = equiposDB.find(e => (e._id?.$oid ?? e._id) === id);
        if (eq) stats[eq.nombre] = { nombre: eq.nombre, pj: 0, pg: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0, id };
      });

      // Fallback por nombre
      grupo.fechas.forEach(f => f.partidos.forEach(p => {
        [p.localNombre, p.visitanteNombre].forEach(n => {
          if (n && !stats[n]) {
            const eq = equiposDB.find(e => e.nombre === n);
            stats[n] = { nombre: n, pj: 0, pg: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0, id: eq?._id?.$oid ?? eq?._id ?? n };
          }
        });
      }));

      grupo.fechas.forEach(f => f.partidos.forEach(p => {
        if (!p.finalizado) return;
        const l = stats[p.localNombre], v = stats[p.visitanteNombre];
        if (!l || !v) return;
        l.pj++; v.pj++;
        const sl = p.puntosMiniLocal ?? 0, sv = p.puntosMiniVisitante ?? 0;
        l.gf += sl; l.gc += sv; v.gf += sv; v.gc += sl;
        if (sl > sv) { l.pg++; l.pts += 3; v.pp++; }
        else if (sv > sl) { v.pg++; v.pts += 3; l.pp++; }
      }));

      const lista = Object.values(stats).map(e => { e.dg = e.gf - e.gc; return e; })
        .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);

      const datos = prepararDatosTabla(lista, equiposDB);
      const img = await generarTablaSuperligaImagen(datos, `Grupo ${grupo.nombre}`);
      attachments.push(new AttachmentBuilder(img, { name: `grupo-${grupo.nombre}.png` }));
    }

    await typingMsg.edit({ content: null, files: attachments });
  }
};
