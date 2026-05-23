import fs from 'fs';

const filePath = 'c:/Users/lucad/OneDrive/Desktop/Proyectos/platubot2/data/Superliga.json';
const teamToRemoveId = '5f11cb02-6f21-42dc-af13-4b9cd270f832';

const teamIds = [
    '69a07b2fb7655dc96ac216a9', // Dutch Lions
    '699fe1e370331e79012517ea', // Razgrad Camels
    '69cedbdfdbd7269442456a76', // Estambul Far River
    '699fe6b970331e7901251808', // Super Bebelones Peronistas
    '69cf277750f045493d72cfaa', // Libertadores
    '69cf284150f045493d72d175', // Atletico Monarquia
    'f1d5cf23-2561-4ec8-9d54-9c431d0834c4', // Super Libertarios Progresistas
    '69a0495570331e79012518c5'  // Ghosts
];

const teamNames = {
    '69a07b2fb7655dc96ac216a9': 'Dutch Lions',
    '699fe1e370331e79012517ea': 'Razgrad Camels',
    '69cedbdfdbd7269442456a76': 'Estambul Far River',
    '699fe6b970331e7901251808': 'Super Bebelones Peronistas',
    '69cf277750f045493d72cfaa': 'Libertadores',
    '69cf284150f045493d72d175': 'Atletico Monarquia',
    'f1d5cf23-2561-4ec8-9d54-9c431d0834c4': 'Super Libertarios Progresistas',
    '69a0495570331e79012518c5': 'Ghosts'
};

function generateRoundRobin(teams) {
    const n = teams.length;
    const rounds = n - 1;
    const matchesPerRound = n / 2;
    const schedule = [];

    const pool = [...teams];
    for (let i = 0; i < rounds; i++) {
        const round = [];
        for (let j = 0; j < matchesPerRound; j++) {
            const local = pool[j];
            const visitante = pool[n - 1 - j];
            if (i % 2 === 0) {
                round.push({ local, visitante });
            } else {
                round.push({ local: visitante, visitante: local });
            }
        }
        schedule.push(round);
        // Rotate pool (keep first element fixed)
        pool.splice(1, 0, pool.pop());
    }
    return schedule;
}

function process() {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const season = data.find(s => s.actual);
    if (!season) return console.log('No actual season');

    // 1. Remove EM from equipos list
    season.equipos = season.equipos.filter(e => (e.$oid || e) !== teamToRemoveId);

    // 2. Identify finished matches and remove EM matches
    const playedPairings = new Set();
    const finishedMatchesCount = {};
    teamIds.forEach(id => finishedMatchesCount[id] = 0);

    season.fechas.forEach(f => {
        const mk = f.partidos ? 'partidos' : 'encuentros';
        const matches = f[mk] || [];
        
        // Remove matches involving EM
        f[mk] = matches.filter(m => {
            const isEM = m.localId === teamToRemoveId || m.visitanteId === teamToRemoveId;
            return !isEM;
        });

        // Record finished matches
        f[mk].forEach(m => {
            if (m.finalizado) {
                playedPairings.add(`${m.localId}_${m.visitanteId}`);
                finishedMatchesCount[m.localId]++;
                finishedMatchesCount[m.visitanteId]++;
            }
        });
    });

    console.log('Finished matches count:', finishedMatchesCount);

    // 3. Generate all Double Round Robin matches (56 total)
    const firstRound = generateRoundRobin(teamIds);
    const secondRound = firstRound.map(r => r.map(m => ({ local: m.visitante, visitante: m.local })));
    const allPossibleMatches = [...firstRound, ...secondRound].flat();

    // 4. Filter matches that haven't been played yet
    const remainingMatches = allPossibleMatches.filter(m => {
        return !playedPairings.has(`${m.local}_${m.visitante}`);
    });

    console.log(`Remaining matches to schedule: ${remainingMatches.length}`);

    // 5. Fill matchdays
    // F1-F3 are finished (we only removed EM matches). 
    // F4 has some finished, some not.
    // F5+ are all to be recalculated.

    let matchIdx = 0;

    season.fechas.forEach(f => {
        const mk = f.partidos ? 'partidos' : 'encuentros';
        const isFinished = f[mk].every(m => m.finalizado === true) && f[mk].length > 0;
        
        if (isFinished && f.numero < 4) {
            // Leave as is
            return;
        }

        // For F4 and onwards, we need to fill them up to 4 matches each
        // but preserving already finished matches.
        const existingFinished = f[mk].filter(m => m.finalizado);
        const currentTeams = new Set();
        existingFinished.forEach(m => {
            currentTeams.add(m.localId);
            currentTeams.add(m.visitanteId);
        });

        const newMatches = [...existingFinished];

        // Try to fill the rest of the 4 slots
        while (newMatches.length < 4 && matchIdx < remainingMatches.length) {
            // Find a match where neither team is already playing in this matchday
            let found = false;
            for (let i = matchIdx; i < remainingMatches.length; i++) {
                const candidate = remainingMatches[i];
                if (!currentTeams.has(candidate.local) && !currentTeams.has(candidate.visitante)) {
                    // Found a match!
                    newMatches.push({
                        _id: `recalculated_${f.numero}_${Date.now()}_${i}`,
                        localId: candidate.local,
                        localNombre: teamNames[candidate.local],
                        visitanteId: candidate.visitante,
                        visitanteNombre: teamNames[candidate.visitante],
                        duelosIndividuales: [
                            { localJugadorId: null, localJugadorNombre: null, visitanteJugadorId: null, visitanteJugadorNombre: null, golesLocal: null, golesVisitante: null, finalizado: false },
                            { localJugadorId: null, localJugadorNombre: null, visitanteJugadorId: null, visitanteJugadorNombre: null, golesLocal: null, golesVisitante: null, finalizado: false },
                            { localJugadorId: null, localJugadorNombre: null, visitanteJugadorId: null, visitanteJugadorNombre: null, golesLocal: null, golesVisitante: null, finalizado: false }
                        ],
                        puntosMiniLocal: 0,
                        puntosMiniVisitante: 0,
                        golesTotalLocal: 0,
                        golesTotalVisitante: 0,
                        finalizado: false
                    });
                    currentTeams.add(candidate.local);
                    currentTeams.add(candidate.visitante);
                    remainingMatches.splice(i, 1);
                    found = true;
                    break;
                }
            }
            if (!found) break; // Can't fit more matches in this round
        }
        f[mk] = newMatches;
    });

    // If there are still remaining matches, add them to extra matchdays or something
    // But 14 matchdays should be enough for 56 matches.
    // We have F1-F18.
    
    // Cleanup: remove extra matchdays if they have no matches
    season.fechas = season.fechas.filter(f => {
        const mk = f.partidos ? 'partidos' : 'encuentros';
        return f[mk].length > 0;
    });

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log('Done.');
}

process();
