import fs from 'fs';

const filePath = 'c:/Users/lucad/OneDrive/Desktop/Proyectos/platubot2/data/Superliga.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const match2 = {
  "_id": "1778199361459_8pq42h0sf8w",
  "localId": "5f11cb02-6f21-42dc-af13-4b9cd270f832",
  "localNombre": "Escuadrón Marrón por la Salvación de Occidente",
  "visitanteId": "69a0495570331e79012518c5",
  "visitanteNombre": "Ghosts",
  "duelosIndividuales": [
    {
      "localJugadorId": "1287076064832651327",
      "localJugadorNombre": "Karkos",
      "visitanteJugadorId": "1285655821346144267",
      "visitanteJugadorNombre": "FacuZ16 🇵🇦",
      "golesLocal": null,
      "golesVisitante": null,
      "finalizado": false
    },
    {
      "localJugadorId": "1495584399725432883",
      "localJugadorNombre": "santulado",
      "visitanteJugadorId": "934647569701797910",
      "visitanteJugadorNombre": "jaded10078",
      "golesLocal": 4,
      "golesVisitante": 5,
      "finalizado": true,
      "logMedia": "📈 **jaded10078**: 90.4 (+0.25)\n📉 **santulado**: 79.75 (-0.25)"
    },
    {
      "localJugadorId": "672164926948900864",
      "localJugadorNombre": "hammeriti",
      "visitanteJugadorId": "1449512445549871125",
      "visitanteJugadorNombre": "Sebas",
      "golesLocal": 2,
      "golesVisitante": 5,
      "finalizado": true,
      "logMedia": "📈 **Sebas**: 87.58 (+0.55)\n📉 **hammeriti**: 79.45 (-0.55)"
    }
  ],
  "puntosMiniLocal": 0,
  "puntosMiniVisitante": 2,
  "golesTotalLocal": 6,
  "golesTotalVisitante": 10,
  "finalizado": true,
  "golesLocal": 0,
  "golesVisitante": 2,
  "resultado": {
    "golesLocal": 0,
    "golesVisitante": 2
  },
  "premiosEntregados": true
};

const match3 = {
  "_id": "1778199361460_np2c24dgeh",
  "localId": "5f11cb02-6f21-42dc-af13-4b9cd270f832",
  "localNombre": "Escuadrón Marrón por la Salvación de Occidente",
  "visitanteId": "69cf284150f045493d72d175",
  "visitanteNombre": "Atletico Monarquia",
  "duelosIndividuales": [
    {
      "localJugadorId": "1287076064832651327",
      "localJugadorNombre": "Karkos",
      "visitanteJugadorId": "992866773047193710",
      "visitanteJugadorNombre": "Benja",
      "golesLocal": 2,
      "golesVisitante": 5,
      "finalizado": true,
      "logMedia": "📈 **Benja**: 86.74 (+0.55)\n📉 **Karkos**: 78.47 (-0.55)"
    },
    {
      "localJugadorId": "672164926948900864",
      "localJugadorNombre": "hammeriti",
      "visitanteJugadorId": "625472211779584030",
      "visitanteJugadorNombre": "Confe2007",
      "golesLocal": 2,
      "golesVisitante": 5,
      "finalizado": true,
      "logMedia": "📈 **Confe2007**: 88.61 (+0.55)\n📉 **hammeriti**: 78.8 (-0.55)"
    },
    {
      "localJugadorId": "1495584399725432883",
      "localJugadorNombre": "santulado",
      "visitanteJugadorId": "1333674349152174091",
      "visitanteJugadorNombre": "Dmilito2010",
      "golesLocal": null,
      "golesVisitante": null,
      "finalizado": false
    }
  ],
  "puntosMiniLocal": 0,
  "puntosMiniVisitante": 2,
  "golesTotalLocal": 4,
  "golesTotalVisitante": 10,
  "finalizado": true,
  "golesLocal": 0,
  "golesVisitante": 2,
  "resultado": {
    "golesLocal": 0,
    "golesVisitante": 2
  },
  "premiosEntregados": true
};

data.forEach(season => {
    if (season.actual && season.fechas) {
        season.fechas.forEach(f => {
            if (f.numero === 2) {
                const enc = f.partidos ?? f.encuentros;
                if (!enc.find(m => m._id === match2._id)) {
                    enc.push(match2);
                    console.log('Restored match 2');
                }
            }
            if (f.numero === 3) {
                const enc = f.partidos ?? f.encuentros;
                if (!enc.find(m => m._id === match3._id)) {
                    enc.push(match3);
                    console.log('Restored match 3');
                }
            }
        });
    }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('Superliga restoration done.');
