import sharp from 'sharp';

/**
 * Extrae los 5 colores dominantes de una imagen.
 * Usa cuantización por reducción de colores con sharp y median-cut.
 * 
 * @param {string|Buffer} input - Path a la imagen o buffer
 * @returns {Promise<{ primario: string, secundario: string, acento: string, texto: string, borde: string }>} Paleta de colores hex
 */
export async function extractPalette(input) {
    // 1. Redimensionar a 50x50 para reducir cómputo
    const pixels = await sharp(input)
        .resize(50, 50, { fit: 'cover' })
        .raw()
        .toBuffer({ resolveWithObject: true });

    // 2. Recopilar todos los colores como RGB
    const colors = [];
    for (let i = 0; i < pixels.data.length; i += pixels.info.channels) {
        colors.push([
            pixels.data[i],     // R
            pixels.data[i + 1], // G
            pixels.data[i + 2], // B
        ]);
    }

    // 3. Cuantizar usando median-cut recursivo de profundidad 3 (8 colores)
    const rawPalette = medianCut(colors, 3);

    // Si no se pudieron extraer colores, retornar una paleta por defecto
    if (!rawPalette || rawPalette.length === 0) {
        return {
            primario: '#1a1a2e',
            secundario: '#16213e',
            borde: '#0f3460',
            acento: '#e94560',
            texto: '#ffffff'
        };
    }

    // 4. Ordenar por luminosidad (más oscuro → más claro)
    rawPalette.sort((a, b) => luminance(a) - luminance(b));

    // 5. Encontrar la acentuación: el color más vibrante/saturado (excluyendo el más oscuro/fondo)
    let accentIdx = Math.min(rawPalette.length - 1, 4);
    let maxSat = -1;
    for (let i = 1; i < rawPalette.length; i++) {
        const sat = saturation(rawPalette[i]);
        if (sat > maxSat) {
            maxSat = sat;
            accentIdx = i;
        }
    }
    const acento = rawPalette[accentIdx];

    // Filtrar el acento para asignar los otros roles
    const remaining = rawPalette.filter((_, idx) => idx !== accentIdx);

    const primario = rawPalette[0];
    // Asegurarnos de que primario no sea demasiado claro para un tema oscuro si hay alternativas
    const secundario = remaining[0] || rawPalette[0];
    const borde = remaining[1] || remaining[0] || rawPalette[0];

    // Asegurarnos de que el texto contraste bien con el color primario
    const texto = luminance(primario) < 128 ? '#ffffff' : '#1a1a1a';

    return {
        primario: rgbToHex(primario),
        secundario: rgbToHex(secundario),
        borde: rgbToHex(borde),
        acento: rgbToHex(acento),
        texto: texto,
    };
}

function luminance([r, g, b]) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function saturation([r, g, b]) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (max === 0) return 0;
    return d / max;
}

function rgbToHex([r, g, b]) {
    return '#' + [r, g, b].map(c => {
        const hex = c.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function medianCut(colors, depth) {
    if (colors.length === 0) return [];
    if (depth === 0) {
        // Promediar los colores en esta caja
        let r = 0, g = 0, b = 0;
        for (const c of colors) {
            r += c[0];
            g += c[1];
            b += c[2];
        }
        return [[
            Math.round(r / colors.length),
            Math.round(g / colors.length),
            Math.round(b / colors.length)
        ]];
    }

    // Encontrar el canal con el mayor rango
    let minR = 255, maxR = 0;
    let minG = 255, maxG = 0;
    let minB = 255, maxB = 0;

    for (const c of colors) {
        if (c[0] < minR) minR = c[0];
        if (c[0] > maxR) maxR = c[0];
        if (c[1] < minG) minG = c[1];
        if (c[1] > maxG) maxG = c[1];
        if (c[2] < minB) minB = c[2];
        if (c[2] > maxB) maxB = c[2];
    }

    const rangeR = maxR - minR;
    const rangeG = maxG - minG;
    const rangeB = maxB - minB;

    let channelIdx = 0;
    if (rangeG >= rangeR && rangeG >= rangeB) {
        channelIdx = 1;
    } else if (rangeB >= rangeR && rangeB >= rangeG) {
        channelIdx = 2;
    }

    // Ordenar colores por el canal dominante
    colors.sort((a, b) => a[channelIdx] - b[channelIdx]);

    const median = Math.floor(colors.length / 2);
    const left = colors.slice(0, median);
    const right = colors.slice(median);

    return [
        ...medianCut(left, depth - 1),
        ...medianCut(right, depth - 1)
    ];
}
