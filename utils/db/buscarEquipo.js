/**
 * Busca un equipo en la base de datos de Superliga permitiendo coincidencias parciales.
 * @param {string} query El texto a buscar.
 * @param {object} EquipoModel El modelo de EquipoSuperliga.
 * @returns {Promise<object|string>} El equipo encontrado o un string con el error/sugerencias.
 */
export default async function buscarEquipo(query, EquipoModel) {
  if (!query) return '❌ No se proporcionó un término de búsqueda.';

  const todos = await EquipoModel.find({});
  const normalizar = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  const q = normalizar(query);
  
  // 1. Coincidencia exacta
  const exacto = todos.find(e => normalizar(e.nombre) === q);
  if (exacto) return exacto;

  // 2. Coincidencia que empieza con
  const empiezan = todos.filter(e => normalizar(e.nombre).startsWith(q));
  if (empiezan.length === 1) return empiezan[0];

  // 3. Coincidencia que contiene
  const contienen = todos.filter(e => normalizar(e.nombre).includes(q));
  if (contienen.length === 1) return contienen[0];
  
  if (contienen.length > 1) {
    return `❌ Se encontraron varios equipos para "**${query}**":\n${contienen.map(e => `• ${e.nombre}`).join('\n')}\nPor favor, sé más específico.`;
  }

  return `❌ No se encontró ningún equipo que coincida con "**${query}**".`;
}
