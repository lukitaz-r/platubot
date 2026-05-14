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
        const llaves = ssc.fase === 'semifinales' ? ssc.semifinales : (ssc.final ? [ssc.final] : []);
        for (const ll of llaves) {
          // Buscar qué partido de la llave está pendiente (Ida -> Vuelta -> Desempate)
          const matches = [
            { m: ll.ida, label: 'Ida' },
            { m: ll.vuelta, label: 'Vuelta' },
            { m: ll.desempate, label: 'Desempate' }
          ].filter(x => x.m); // Filtrar desempate si no existe

          const pData = matches.find(x => 
            !x.m.finalizado && (x.m.localId === eId || x.m.visitanteId === eId || 
            x.m.localNombre === eq.nombre || x.m.visitanteNombre === eq.nombre)
          );

          if (pData) {
            modo = 'supersupercopa';
            equipo = eq;
            // Incluir el tipo de partido (Ida/Vuelta/Desempate) en el número de fecha
            fechaActual = { numero: `${ssc.fase === 'semifinales' ? 'Semi' : 'Final'} - ${pData.label}` };
            partido = pData.m;
            equipoId = eId;
            competicionRef = ssc;
            break;
          }
        }
        if (modo) break;
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

    let jugadoresElegibles = [...equipo.jugadores];
    if (jugadoresElegibles.length === 2 && equipo.coach) {
      jugadoresElegibles.push({
        id: equipo.coach.id,
        nombre: equipo.coach.nombre,
        media: 80,
        mediaInicial: 80,
        pais: 'Argentina'
      });
    }

    if (jugadoresElegibles.length !== 3) {
      return message.reply(`❌ El equipo **${equipo.nombre}** debe tener exactamente 3 jugadores para formar (tiene ${jugadoresElegibles.length}).`);
    }

    const loading = await message.reply(`<a:loading:1461897825439711468> Generando alineacion...`);

    const esLocal = (partido.localId === equipoId || partido.localNombre === equipo.nombre);
    const isDesempate = partido.label === 'Desempate' || partido.tipo === 'Desempate' || (fechaActual.numero && String(fechaActual.numero).includes('Desempate'));
    const expectedDuels = isDesempate ? 1 : 3;

    const duelosIndividuales = partido.duelosIndividuales || partido.miniPartidos || [];

    // Asegurar que haya expectedDuels duelosIndividuales inicializados
    while (duelosIndividuales.length < expectedDuels) {
      duelosIndividuales.push({
        localJugadorId: null, localJugadorNombre: null,
        visitanteJugadorId: null, visitanteJugadorNombre: null,
        golesLocal: null, golesVisitante: null, finalizado: false
      });
    }
    if (duelosIndividuales.length > expectedDuels) duelosIndividuales.length = expectedDuels;
    if (!partido.duelosIndividuales) partido.duelosIndividuales = duelosIndividuales;

    // 2.5 Verificar si el visitante ya alineó (si el que ejecuta es local)
    if (esLocal && !duelosIndividuales.slice(0, expectedDuels).every(d => d.visitanteJugadorId)) {
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

    // ─── VISITANTE: auto-alinea los 3 jugadores sin interacción (SOLO para partidos normales) ───
    if (!esLocal && !isDesempate) {
      const jugadores = [...jugadoresElegibles];
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

    // ─── LOCAL o VISITANTE EN DESEMPATE: menú interactivo visual progresivo ───
    const dtLocalCard = esLocal ? await getCardB64(equipo.coach, equipo) : (rivalEq ? await getCardB64(rivalEq.coach, rivalEq) : null);
    const dtVisitanteCard = !esLocal ? await getCardB64(equipo.coach, equipo) : (rivalEq ? await getCardB64(rivalEq.coach, rivalEq) : null);

    const escudoLocalParam = esLocal ? equipo.escudo : rivalEq?.escudo;
    const escudoVisitanteParam = !esLocal ? equipo.escudo : rivalEq?.escudo;

    // Pre-generar cartas de todos los jugadores del equipo
    const jugadorCardMap = {};
    for (const j of jugadoresElegibles) {
      jugadorCardMap[j.id] = await getCardB64(j, equipo);
    }

    // Identificar cartas ya elegidas por el rival
    const rivalCards = [null, null, null];
    if (esLocal && rivalEq) { 
        for (let i = 0; i < expectedDuels; i++) {
            const rId = duelosIndividuales[i]?.visitanteJugadorId;
            if (rId) {
                const rMem = rivalEq.jugadores.find(j => j.id === rId);
                if (rMem) {
                    const card = await getCardB64(rMem, rivalEq);
                    if (isDesempate) rivalCards[1] = card; // Medio
                    else rivalCards[i] = card;
                }
            }
        }
    }

    const jugadoresLocalCardsArgs = esLocal ? [null, null, null] : rivalCards;
    const jugadoresVisitanteCardsArgs = !esLocal ? [null, null, null] : rivalCards;

    // Opciones: todos los jugadores del equipo
    const allOpts = jugadoresElegibles.map(j => ({ label: j.nombre, value: j.id, description: `Media: ${Math.trunc(j.media || 80)}` }));
    if (allOpts.length < 3) return loading.edit('❌ El equipo no tiene suficientes jugadores.');

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('alin_multi')
        .setPlaceholder(isDesempate ? 'Elegí a tu jugador para el Desempate' : 'Elegí tus 3 jugadores en orden (Mini 1, 2, 3)')
        .setMinValues(expectedDuels)
        .setMaxValues(expectedDuels)
        .addOptions(allOpts)
    );

    const imgBuffer = await generarAlineacion({
        escudoLocal: escudoLocalParam,
        escudoVisitante: escudoVisitanteParam,
        dtLocalCard,
        dtVisitanteCard,
        jugadoresLocalCards: jugadoresLocalCardsArgs,
        jugadoresVisitanteCards: jugadoresVisitanteCardsArgs,
      });

    const attach = new AttachmentBuilder(imgBuffer, { name: 'alineacion.png' });
    const m = await loading.edit({
      content: `📋 **Alineación: ${equipo.nombre}** — **${fechaActual.numero}**\n${isDesempate ? 'Elegí a tu jugador para el **Desempate**:' : 'Elegí los 3 jugadores en el orden que quieras alinearlos (el orden de selección = Mini 1, 2, 3):'}`,
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

      const ids = i.values;
      const seleccionados = ids.map(id => {
        const jug = jugadoresElegibles.find(j => j.id === id);
        return { id: jug.id, nombre: jug.nombre, cardB64: jugadorCardMap[jug.id] };
      });

      // Guardar formación
      for (let idx = 0; idx < expectedDuels; idx++) {
        if (esLocal) {
            duelosIndividuales[idx].localJugadorId = seleccionados[idx].id;
            duelosIndividuales[idx].localJugadorNombre = seleccionados[idx].nombre;
        } else {
            duelosIndividuales[idx].visitanteJugadorId = seleccionados[idx].id;
            duelosIndividuales[idx].visitanteJugadorNombre = seleccionados[idx].nombre;
        }
      }
      await competicionRef.save();

      const myCards = [null, null, null];
      for (let idx = 0; idx < expectedDuels; idx++) {
          if (isDesempate) myCards[1] = seleccionados[idx].cardB64;
          else myCards[idx] = seleccionados[idx].cardB64;
      }

      // Generar imagen final
      const finalImg = await generarAlineacion({
        escudoLocal: escudoLocalParam,
        escudoVisitante: escudoVisitanteParam,
        dtLocalCard,
        dtVisitanteCard,
        jugadoresLocalCards: esLocal ? myCards : rivalCards,
        jugadoresVisitanteCards: !esLocal ? myCards : rivalCards,
      });

      collector.stop('success');

      let finalContent = `✅ Formación de **${equipo.nombre}** confirmada para la **${fechaActual.numero}**.\n`;
      if (isDesempate) {
          finalContent += `**Desempate**: <@${seleccionados[0].id}> vs ${esLocal ? `<@${duelosIndividuales[0].visitanteJugadorId}>` : '⏳'}`;
      } else {
          finalContent += `<@${seleccionados[0].id}> vs ${esLocal ? `<@${duelosIndividuales[0].visitanteJugadorId}>` : '⏳'}\n` +
                          `<@${seleccionados[1].id}> vs ${esLocal ? `<@${duelosIndividuales[1].visitanteJugadorId}>` : '⏳'}\n` +
                          `<@${seleccionados[2].id}> vs ${esLocal ? `<@${duelosIndividuales[2].visitanteJugadorId}>` : '⏳'}`;
      }

      await m.edit({
        content: finalContent,
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
