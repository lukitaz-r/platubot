/**
 * Mapeo masivo de nombres de países en español a códigos ISO Alpha-2.
 * Soporta nombres comunes, siglas y variaciones.
 */
const countryMap = {
    // Sudamérica
    'argentina': 'ar', 'brasil': 'br', 'uruguay': 'uy', 'chile': 'cl', 'colombia': 'co',
    'peru': 'pe', 'ecuador': 'ec', 'venezuela': 've', 'bolivia': 'bo', 'paraguay': 'py',
    'surinam': 'sr', 'guyana': 'gy',

    // Norte y Centroamérica
    'mexico': 'mx', 'eeuu': 'us', 'estados unidos': 'us', 'usa': 'us', 'canada': 'ca',
    'costa rica': 'cr', 'panama': 'pa', 'honduras': 'hn', 'el salvador': 'sv', 'guatemala': 'gt',
    'jamaica': 'jm', 'cuba': 'cu', 'haiti': 'ht', 'republica dominicana': 'do', 'trinidad y tobago': 'tt',
    'curazao': 'cw', 'puerto rico': 'pr', 'nicaragua': 'ni', 'belice': 'bz',

    // Europa
    'españa': 'es', 'francia': 'fr', 'italia': 'it', 'alemania': 'de', 'inglaterra': 'gb-eng',
    'portugal': 'pt', 'paises bajos': 'nl', 'holanda': 'nl', 'belgica': 'be', 'croacia': 'hr',
    'italia': 'it', 'inglaterra': 'gb-eng', 'escocia': 'gb-sct', 'gales': 'gb-wls', 'irlanda del norte': 'gb-nir',
    'irlanda': 'ie', 'suiza': 'ch', 'suecia': 'se', 'dinamarca': 'dk', 'noruega': 'no',
    'finlandia': 'fi', 'austria': 'at', 'polonia': 'pl', 'ucrania': 'ua', 'rusia': 'ru',
    'turquia': 'tr', 'grecia': 'gr', 'serbia': 'rs', 'republica checa': 'cz', 'hungria': 'hu',
    'rumania': 'ro', 'bulgaria': 'bg', 'eslovaquia': 'sk', 'eslovenia': 'si', 'islandia': 'is',
    'albania': 'al', 'georgia': 'ge', 'bosnia': 'ba', 'montenegro': 'me', 'macedonia': 'mk',
    'luxemburgo': 'lu', 'chipre': 'cy', 'malta': 'mt', 'andorra': 'ad', 'monaco': 'mc',

    // África
    'marruecos': 'ma', 'egipto': 'eg', 'senegal': 'sn', 'nigeria': 'ng', 'camerun': 'cm',
    'ghana': 'gh', 'costa de marfil': 'ci', 'tunez': 'tn', 'argelia': 'dz', 'sudafrica': 'za',
    'congo': 'cg', 'rd congo': 'cd', 'mali': 'ml', 'burkina faso': 'bf', 'guinea': 'gn',
    'gambia': 'gm', 'zambia': 'zm', 'angola': 'ao', 'cabo verde': 'cv',

    // Asia
    'japon': 'jp', 'corea del sur': 'kr', 'china': 'cn', 'qatar': 'qa', 'arabia saudita': 'sa',
    'australia': 'au', 'iran': 'ir', 'iraq': 'iq', 'emiratos arabes': 'ae', 'uae': 'ae',
    'vietnam': 'vn', 'tailandia': 'th', 'uzbekistan': 'uz', 'india': 'in', 'indonesia': 'id',
    'libano': 'lb', 'siria': 'sy', 'jordania': 'jo', 'palestina': 'ps', 'israel': 'il',

    // Oceanía
    'nueva zelanda': 'nz', 'fiyi': 'fj', 'tahiti': 'pf', 'papua nueva guinea': 'pg'
};

/**
 * Retorna la URL de la bandera para un país dado.
 * @param {string} name Nombre del país
 * @returns {string|null} URL de la imagen
 */
export function getFlagUrl(name) {
    if (!name) return null;
    
    // Normalización: minúsculas, sin espacios extra, sin tildes
    const clean = name.toLowerCase().trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); 
        
    const code = countryMap[clean];
    
    if (code) {
        // flagcdn usa códigos ISO. Los especiales de UK (eng, sct, wls) funcionan directo.
        return `https://flagcdn.com/w160/${code.toLowerCase()}.png`;
    }
    
    return null;
}
