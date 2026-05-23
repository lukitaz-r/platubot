/**
 * Parsea un string de moneda (ej: 1M, 500k, 1.5M, 1000000) a un número.
 * @param {string} str - El string a parsear
 * @returns {number|null} - El número parseado o null si es inválido
 */
export function parseCurrency(str) {
  if (!str) return null;
  const upperVal = str.toUpperCase().trim().replace(',', '.');
  let multiplier = 1;
  let numStr = upperVal;

  if (upperVal.endsWith('M')) {
    multiplier = 1000000;
    numStr = upperVal.slice(0, -1);
  } else if (upperVal.endsWith('K')) {
    multiplier = 1000;
    numStr = upperVal.slice(0, -1);
  }

  const val = parseFloat(numStr);
  if (isNaN(val)) return null;
  
  return Math.floor(val * multiplier);
}
