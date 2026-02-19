const API_ENDPOINT = "https://nominatim.openstreetmap.org/search";

/**
 * Pulisce e standardizza una stringa di indirizzo italiano per migliorare l'accuratezza della geocodifica.
 * @param {string} address L'indirizzo originale.
 * @returns {string} L'indirizzo pulito e standardizzato.
 */
const standardizeAndCleanAddress = (address) => {
    if (!address) return '';

    let cleanAddress = address.toLowerCase();

    // 1. Espande le abbreviazioni comuni
    const abbreviations = {
        'v\\.le': 'viale',
        'p\\.zza': 'piazza',
        'p\\.za': 'piazza',
        'c\\.so': 'corso',
        'str\\.': 'strada',
        's\\.s\\.': 'strada statale',
        'v\\.': 'via', // Deve essere dopo abbreviazioni più lunghe come v.le
    };

    for (const abbr in abbreviations) {
        cleanAddress = cleanAddress.replace(new RegExp(`\\b${abbr}\\b`, 'g'), abbreviations[abbr]);
    }

    // 2. Rimuove informazioni superflue che confondono il geocoder
    cleanAddress = cleanAddress
        .replace(/\b(piano terra|primo piano|interno \d+|int\.\s*\d+|scala\s*\w+)\b/g, ' ')
        .replace(/c\/o.*$/, '') // Rimuove "c/o" e tutto ciò che segue
        .replace(/[^\w\sàèéìòù',-]/g, ' ') // Rimuove punteggiatura non essenziale
        .replace(/ , /g, ' ')
        .replace(/ - /g, ' ');

    // 3. Normalizza gli spazi
    cleanAddress = cleanAddress.replace(/\s+/g, ' ').trim();

    return cleanAddress;
};


/**
 * Tenta di estrarre il comune da una stringa di indirizzo completa.
 */
const extractMunicipality = (address) => {
    const parts = address.split(',');
    for (let i = parts.length - 1; i >= 0; i--) {
        let cleanedPart = parts[i]
            .replace(/\b\d{5}\b/g, '')
            .replace(/\s*\(\s*[A-Z]{2}\s*\)\s*/g, '')
            .replace(/\s+\b[A-Z]{2}\b\s*$/, '')
            .replace(/italia/ig, '')
            .trim();
        
        if (cleanedPart) {
            cleanedPart = cleanedPart.replace(/^[^\w\sÀ-ú]+|[^\w\sÀ-ú]+$/g, '').trim();
            if (cleanedPart) {
               return cleanedPart;
            }
        }
    }
    return null;
};

/**
 * Tenta di estrarre un CAP a 5 cifre da una stringa di indirizzo.
 */
const extractZipCode = (address) => {
    const zipMatch = address.match(/\b(\d{5})\b/);
    return zipMatch ? zipMatch[0] : null;
};


const fetchGeocode = async (query) => {
    if (!query || query.trim() === '') {
        return null;
    }
    const url = `${API_ENDPOINT}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=it`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'GeoDistanceCalculator/1.0 (https://example.com)'
            }
        });
        if (!response.ok) {
            console.error(`Errore API Geocoding per "${query}": ${response.statusText}`);
            return null;
        }
        const data = await response.json();
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon),
            };
        }
        return null;
    } catch (error) {
        console.error(`Fallimento nel recuperare dati di geocoding per "${query}":`, error);
        return null;
    }
};

export const geocodeAddress = async (address) => {
    if (!address || address.trim() === '') {
        return null;
    }

    const triedQueries = new Set();

    const tryQuery = async (query, logMessage) => {
        if (!query) return null;
        const normalizedQuery = query.toLowerCase().trim();
        if (triedQueries.has(normalizedQuery)) {
            return null; 
        }
        triedQueries.add(normalizedQuery);
        console.log(`${logMessage}: "${query}" (originale: "${address}")`);
        return await fetchGeocode(query);
    };

    // Tentativo 1: Indirizzo standardizzato e pulito (NUOVO)
    const standardizedAddress = standardizeAndCleanAddress(address);
    let result = await tryQuery(standardizedAddress, "Tentativo 1 (standardizzato)");
    if (result) return result;
    
    // Tentativo 2: Indirizzo completo originale (se la standardizzazione fallisce)
    result = await tryQuery(address, "Tentativo 2 (originale)");
    if (result) return result;

    // Tentativo 3 (Fallback): Comune e CAP
    const municipality = extractMunicipality(address);
    const zipCode = extractZipCode(address);

    if (municipality && zipCode) {
        const municipalityAndZip = `${municipality} ${zipCode}`;
        result = await tryQuery(municipalityAndZip, "Fallback 2 (comune e CAP)");
        if (result) return result;
    }

    // Tentativo 4 (Fallback): Solo il comune
    if (municipality) {
        result = await tryQuery(municipality, "Fallback 3 (solo comune)");
        if (result) return result;
    }

    console.warn(`Impossibile geocodificare l'indirizzo: "${address}"`);
    return null;
};