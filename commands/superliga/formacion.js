import { 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ComponentType,
  AttachmentBuilder
} from 'discord.js';
import { join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import Superliga from '../../models/superliga/Superliga.js';
import Supersupercopa from '../../models/superliga/Supersupercopa.js';
import EquipoSuperliga from '../../models/superliga/Equipos.js';
import { generarAlineacion } from '../../utils/visual/alineacionGenerator.js';
import { generarCarta } from '../../utils/visual/cardGenerator.js';

export default {
  name: 'superliga-formacion',
  aliases: ['sl-formacion', 'slfrm', 'ssc-formacion', 'sl-alineacion', 'ssc-alineacion'],
  desc: 'Carga la formación de tu equipo para la fecha actual',

  run: async (client, message) => {
    // 1. Identificar el equipo del coach
    const allEquipos = await EquipoSuperliga.find({});
    const equiposCoach = allEquipos.filter(e => e.coach?.id === message.author.id);
    if (equiposCoach.length === 0) {
      return message.reply('❌ No eres coach de ningún equipo.');
    }

    // 2. Buscar en qué competición hay partido pendiente (Superliga o Supersupercopa)
    let liga = await Superliga.findOne({ actual: true });
    let ssc = null;
    let modo = null; // 'superliga' | 'supersupercopa'
    let equipo = null;
    let fechaActual = null;
    let partido = null;
    let equipoId = null;
    let competicionRef = null; // la referencia al documento para guardar

    // Buscar primero en Supersupercopa
    ssc = await Supersupercopa.findOne({ estadoGlobal: 'Activa' });

    for (const eq of equiposCoach) {
      const eId = eq._id?.$oid ?? eq._id;
      
      // Buscar en SSC
      if (ssc && ssc.fase === 'grupos') {
        for (const grupo of ssc.grupos) {
          if (!grupo.equipos.includes(eId) && !grupo.equipos.includes(eq.nombre)) continue;
          const fa = grupo.fechas.find(f => (f.partidos ?? f.encuentros).some(p => !p.finalizado));
          if (!fa) continue;
          
          // Validar fecha anterior
          if (fa.numero > 1) {
            const fAnt = grupo.fechas.find(f => f.numero === fa.numero - 1);
            if (fAnt && fAnt.partidos.some(p => !p.finalizado)) continue;
          }
          
          const p = fa.partidos.find(p => 
            p.localId === eId || p.visitanteId === eId || 
            p.localNombre === eq.nombre || p.visitanteNombre === eq.nombre
          );
          if (p && !p.finalizado) {
            modo = 'supersupercopa';
            equipo = eq;
            fechaActual = fa;
            partido = p;
            equipoId = eId;
            competicionRef = ssc;
            break;
          }
        }
        if (modo) break;
      }
      
      if (ssc && ['semifinales', 'final'].includes(ssc.fase)) {
        const partidos = ssc.fase === 'semifinales' ? ssc.semifinales : (ssc.final ? [ssc.final] : []);
        const p = partidos.find(p => 
          !p.finalizado && (p.localId === eId || p.visitanteId === eId || 
          p.localNombre === eq.nombre || p.visitanteNombre === eq.nombre)
        );
        if (p) {
          modo = 'supersupercopa';
          equipo = eq;
          fechaActual = { numero: ssc.fase === 'semifinales' ? 'Semi' : 'Final' };
          partido = p;
          equipoId = eId;
          competicionRef = ssc;
          break;
        }
      }
      
      // Buscar en Superliga
      if (liga) {
        const fa = liga.fechas.find(f => (f.partidos ?? f.encuentros).some(p => !p.finalizado));
        if (fa) {
          if (fa.numero > 1) {
            const fAnt = liga.fechas.find(f => f.numero === fa.numero - 1);
            if (fAnt && (fAnt.partidos ?? fAnt.encuentros).some(p => !p.finalizado)) continue;
          }
          const p = (fa.partidos ?? fa.encuentros).find(p => 
            p.localId === eId || p.visitanteId === eId || 
            p.localNombre === eq.nombre || p.visitanteNombre === eq.nombre
          );
          if (p && !p.finalizado) {
            modo = 'superliga';
            equipo = eq;
            fechaActual = fa;
            partido = p;
            equipoId = eId;
            competicionRef = liga;
            break;
          }
        }
      }
    }

    if (!modo || !partido) {
      return message.reply('❌ No tienes partidos pendientes en ninguna competición activa, o la fecha anterior aún no terminó.');
    }

    if (equipo.jugadores.length !== 3) {
      return message.reply(`❌ El equipo **${equipo.nombre}** debe tener exactamente 3 jugadores para formar (tiene ${equipo.jugadores.length}).`);
    }

    const loading = await message.reply(`<a:loading:1461897825439711468> Generando alineacion...`);

    const esLocal = (partido.localId === equipoId || partido.localNombre === equipo.nombre);
    const duelosIndividuales = partido.duelosIndividuales || partido.miniPartidos || [];

    // Asegurar que haya 3 duelosIndividuales inicializados
    while (duelosIndividuales.length < 3) {
      duelosIndividuales.push({
        localJugadorId: null, localJugadorNombre: null,
        visitanteJugadorId: null, visitanteJugadorNombre: null,
        golesLocal: null, golesVisitante: null, finalizado: false
      });
    }
    if (!partido.duelosIndividuales) partido.duelosIndividuales = duelosIndividuales;

    // 2.5 Verificar si el visitante ya alineó (si el que ejecuta es local)
    if (esLocal && !duelosIndividuales.every(d => d.visitanteJugadorId)) {
      return loading.edit('❌ El equipo visitante aún no ha alineado. Deben alinear ellos primero.');
    }
    // Generar o cargar carta de un miembro
    const getCardB64 = async (miembro, eqRef) => {
      // 1. Si ya tiene la ruta guardada en el objeto
      if (miembro.carta) {
        try {
          const fullPath = join(process.cwd(), miembro.carta);
          if (existsSync(fullPath)) {
            const buf = readFileSync(fullPath);
            if (buf.length > 0) return `data:image/png;base64,${buf.toString('base64')}`;
          }
        } catch {}
      }

      // 2. Buscar en la carpeta de generadas (ID_hash.png) por si existe aunque no esté en el objeto
      const cacheDir = join(process.cwd(), 'assets', 'cartas', 'generadas');
      if (existsSync(cacheDir)) {
        try {
          const files = readdirSync(cacheDir);
          const existing = files.find(f => f.startsWith(`${miembro.id}_`) && f.endsWith('.png'));
          if (existing) {
            const fullPath = join(cacheDir, existing);
            const buf = readFileSync(fullPath);
            if (buf.length > 0) return `data:image/png;base64,${buf.toString('base64')}`;
          }
        } catch {}
      }

      // 3. Generar si nada de lo anterior funcionó
      const user = await client.users.fetch(miembro.id, { force: true }).catch(() => null);
      const avatar = user?.displayAvatarURL({ extension: 'png', forceStatic: true, size: 512 }) || null;
      const esCoach = eqRef.coach?.id === miembro.id;
      const buf = await generarCarta({
        nombre: miembro.nombre,
        id: miembro.id,
        avatar,
        media: miembro.media || 80,
        mediaInicial: miembro.mediaInicial || miembro.media || 80,
        pais: miembro.pais || 'Argentina',
        escudo: eqRef.escudo,
        esCoach,
        stats: miembro.stats,
      });
      return `data:image/png;base64,${buf.toString('base64')}`;
    };

    // Buscar equipo rival
    const rivalId = esLocal ? partido.visitanteId : partido.localId;
    const rivalNombre = esLocal ? partido.visitanteNombre : partido.localNombre;
    const equiposDB = await EquipoSuperliga.find({});
    const rivalEq = equiposDB.find(e => (e._id?.$oid ?? e._id) === rivalId || e.nombre === rivalNombre);

    // ─── VISITANTE: auto-alinea los 3 jugadores sin interacción ───
    if (!esLocal) {
      const jugadores = [...equipo.jugadores];
      for (let i = 0; i < 3; i++) {
        duelosIndividuales[i].visitanteJugadorId = jugadores[i].id;
        duelosIndividuales[i].visitanteJugadorNombre = jugadores[i].nombre;
      }
      await competicionRef.save();

      // Generar cartas para la imagen de confirmación
      const dtLocalCard = rivalEq ? await getCardB64(rivalEq.coach, rivalEq) : null;
      const dtVisitanteCard = await getCardB64(equipo.coach, equipo);
      const jugCardsVis = [];
      for (const j of jugadores) {
        jugCardsVis.push(await getCardB64(j, equipo));
      }

      const imgBuffer = await generarAlineacion({
        escudoLocal: rivalEq?.escudo,
        escudoVisitante: equipo.escudo,
        dtLocalCard,
        dtVisitanteCard,
        jugadoresLocalCards: [null, null, null],
        jugadoresVisitanteCards: jugCardsVis,
      });

      const attach = new AttachmentBuilder(imgBuffer, { name: 'alineacion.png' });
      return loading.edit({
        content: `✅ **${equipo.nombre}** alineado como visitante para la **Fecha ${fechaActual.numero}**.\n` +
                 `**#1**: <@${jugadores[0].id}>\n**#2**: <@${jugadores[1].id}>\n**#3**: <@${jugadores[2].id}>`,
        files: [attach]
      });
    }

    // ─── LOCAL: menú interactivo visual progresivo ───
    const dtLocalCard = await getCardB64(equipo.coach, equipo);
    const dtVisitanteCard = rivalEq ? await getCardB64(rivalEq.coach, rivalEq) : null;

    // Pre-generar cartas de todos los jugadores del local
    const jugadorCardMap = {};
    for (const j of equipo.jugadores) {
      jugadorCardMap[j.id] = await getCardB64(j, equipo);
    }

    // Pre-generar cartas de visitantes alineados
    const visitanteCards = [];
    for (let i = 0; i < 3; i++) {
      const vId = duelosIndividuales[i]?.visitanteJugadorId;
      if (vId && rivalEq) {
        const vMem = rivalEq.jugadores.find(j => j.id === vId) || rivalEq.coach;
        if (vMem) {
          visitanteCards.push(await getCardB64(vMem, rivalEq));
        }
      }
    }

    // Opciones: todos los jugadores del equipo
    const allOpts = equipo.jugadores.map(j => ({ label: j.nombre, value: j.id, description: `Media: ${Math.trunc(j.media)}` }));
    if (allOpts.length < 3) return loading.edit('❌ El equipo no tiene suficientes jugadores.');

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('alin_multi')
        .setPlaceholder('Elegí tus 3 jugadores en orden (Mini 1, 2, 3)')
        .setMinValues(3)
        .setMaxValues(3)
        .addOptions(allOpts)
    );
    const imgBuffer = await generarAlineacion({
        escudoLocal: equipo.escudo,
        escudoVisitante: rivalEq?.escudo,
        dtLocalCard,
        dtVisitanteCard,
        jugadoresLocalCards: [null, null, null],
        jugadoresVisitanteCards: visitanteCards,
      });

    const attach = new AttachmentBuilder(imgBuffer, { name: 'alineacion.png' });
    const m = await loading.edit({
      content: `📋 **Alineación: ${equipo.nombre}** — **Fecha ${fechaActual.numero}**\nElegí los 3 jugadores en el orden que quieras alinearlos (el orden de selección = Mini 1, 2, 3):`,
      files: [attach],
      components: [menu]
    });

    const collector = m.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      componentType: ComponentType.StringSelect,
      time: 120000
    });

    collector.on('collect', async i => {
      await i.deferUpdate();

      const ids = i.values; // array de 3 IDs en orden de selección
      const seleccionados = ids.map(id => {
        const jug = equipo.jugadores.find(j => j.id === id);
        return { id: jug.id, nombre: jug.nombre, cardB64: jugadorCardMap[jug.id] };
      });

      // Guardar formación
      for (let idx = 0; idx < 3; idx++) {
        duelosIndividuales[idx].localJugadorId = seleccionados[idx].id;
        duelosIndividuales[idx].localJugadorNombre = seleccionados[idx].nombre;
      }
      await competicionRef.save();

      // Generar imagen final (una sola vez)
      const finalImg = await generarAlineacion({
        escudoLocal: equipo.escudo,
        escudoVisitante: rivalEq?.escudo,
        dtLocalCard,
        dtVisitanteCard,
        jugadoresLocalCards: seleccionados.map(s => s.cardB64),
        jugadoresVisitanteCards: visitanteCards,
      });

      collector.stop('success');
      await m.edit({
        content: `✅ Formación de **${equipo.nombre}** confirmada para la **Fecha ${fechaActual.numero}**.\n` +
                 `<@${seleccionados[0].id}> vs <@${partido.duelosIndividuales[0].visitanteJugadorId}>\n` +
                 `<@${seleccionados[1].id}> vs <@${partido.duelosIndividuales[1].visitanteJugadorId}>\n` +
                 `<@${seleccionados[2].id}> vs <@${partido.duelosIndividuales[2].visitanteJugadorId}>`,
        files: [new AttachmentBuilder(finalImg, { name: 'alineacion.png' })],
        components: []
      });
    });

    collector.on('end', async (_, reason) => {
      if (reason !== 'success') {
        await m.edit({ content: '❌ Tiempo agotado. Formación no guardada.', components: [] }).catch(() => {});
      }
    });
  }
};
