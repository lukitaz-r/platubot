import { AttachmentBuilder } from 'discord.js';
import Supersupercopa from '../../models/superliga/Supersupercopa.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import { generarBracketCopa } from '../../utils/visual/copaVisualGenerator.js';

export default {
  name: 'supersupercopa-bracket',
  aliases: ['ssc-bracket', 'sscb'],
  desc: 'Bracket de la Supersupercopa (fase eliminatoria)',

  run: async (client, message) => {
    const copa = await Supersupercopa.findOne({ estadoGlobal: 'Activa' });
    if (!copa) return message.reply('❌ No hay Supersupercopa activa.');
    if (copa.fase === 'grupos') return message.reply('❌ La SSC está en fase de grupos. Usa `!ssc-tabla` para ver las tablas.');

    const equiposDB = await EquipoSuperliga.find({});
    const typingMsg = await message.reply('<a:loading:1461897825439711468> Generando bracket...');

    try {
      // Mapear las llaves al formato del generador de brackets
      const mapLlave = (ll) => {
        if (!ll) return null;
        const teamL = equiposDB.find(e => e._id.toString() === ll.localId?.toString());
        const teamV = equiposDB.find(e => e._id.toString() === ll.visitanteId?.toString());

        return {
          equipo1: teamL ? { nombre: teamL.nombre, avatar: teamL.escudo, discordId: teamL._id.toString() } : { nombre: ll.localNombre || 'TBD', discordId: ll.localId?.toString() || 'TBD' },
          equipo2: teamV ? { nombre: teamV.nombre, avatar: teamV.escudo, discordId: teamV._id.toString() } : { nombre: ll.visitanteNombre || 'TBD', discordId: ll.visitanteId?.toString() || 'TBD' },
          // En Superliga, los goles son los puntos mini (duelos ganados)
          ida: { golesLocal: ll.ida.puntosMiniLocal, golesVisitante: ll.ida.puntosMiniVisitante },
          // En la vuelta, equipo1 es visitante, así que su score es puntosMiniVisitante
          vuelta: { golesLocal: ll.vuelta.puntosMiniVisitante, golesVisitante: ll.vuelta.puntosMiniLocal },
          desempate: ll.desempate ? { golesLocal: ll.desempate.puntosMiniLocal, golesVisitante: ll.desempate.puntosMiniVisitante } : null,
          ganador: ll.ganadorId?.toString()
        };
      };

      const mockTorneo = {
        nombre: `Supersupercopa - ${copa.temporada || ''}`,
        tema: copa.tema || {},
        fasesEliminatoria: ['Semifinales', 'Final'],
        llaves: {
          'Semifinales': (copa.semifinales || []).map(mapLlave).filter(m => m !== null),
          'Final': copa.final ? [mapLlave(copa.final)] : []
        }
      };

      if (mockTorneo.llaves['Semifinales'].length === 0 && mockTorneo.llaves['Final'].length === 0) {
        return typingMsg.edit('❌ No hay enfrentamientos eliminatorios todavía.');
      }

      const buffer = await generarBracketCopa(mockTorneo);
      const attachment = new AttachmentBuilder(buffer, { name: 'ssc-bracket.png' });

      let content = '';
      if (copa.fase === 'finalizado' && copa.final?.ganadorId) {
        const winner = equiposDB.find(e => e._id.toString() === copa.final.ganadorId.toString())?.nombre || 'Campeón';
        content = `🏆 **¡Campeón de la Supersupercopa: ${winner}!**`;
      }

      await typingMsg.edit({ content: content || null, files: [attachment] });
    } catch (error) {
      console.error('Error generando bracket SSC:', error);
      await typingMsg.edit('❌ Ocurrió un error al generar el bracket visual.');
    }
  }
};
