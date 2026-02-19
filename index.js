// --- FUNZIONI DI UTILITÀ ---

const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Raggio della Terra in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(2));
};

const parseCsv = (csvText) => {
    const rows = [];
    let currentRow = [], currentField = '', inQuotes = false;
    let text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < text.length; i++) {
        const char = text[i], nextChar = text[i + 1];
        if (inQuotes) {
            if (char === '"' && nextChar === '"') { currentField += '"'; i++; }
            else if (char === '"') inQuotes = false;
            else currentField += char;
        } else {
            if (char === '"') inQuotes = true;
            else if (char === ',') { currentRow.push(currentField); currentField = ''; }
            else if (char === '\n') { currentRow.push(currentField); rows.push(currentRow); currentRow = []; currentField = ''; }
            else currentField += char;
        }
    }
    if (currentField || currentRow.length) { currentRow.push(currentField); rows.push(currentRow); }
    const validRows = rows.filter(r => r.some(f => f.trim() !== ''));
    return { headers: validRows[0] || [], rows: validRows.slice(1) };
};

const exportToCsv = (headers, data, fileName) => {
    const escape = (f) => /[",\n]/.test(String(f)) ? `"${String(f).replace(/"/g, '""')}"` : String(f);
    const content = [headers.map(escape).join(','), ...data.map(r => r.map(escape).join(','))].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
};

// --- LOGICA DI GEOPOSIZIONAMENTO (VENETO ORIENTED) ---

const standardizeAddress = (addr) => {
    if (!addr) return '';
    let clean = addr.toLowerCase();
    const abbr = {'v\\.le': 'viale', 'p\\.zza': 'piazza', 'p\\.za': 'piazza', 'c\\.so': 'corso', 'v\\.': 'via'};
    for (const a in abbr) clean = clean.replace(new RegExp(`\\b${a}\\b`, 'g'), abbr[a]);
    return clean.replace(/\b(piano terra|interno \d+|scala \w+)\b/g, '').replace(/[^\w\sàèéìòù',-]/g, ' ').replace(/\s+/g, ' ').trim();
};

const extractZipCode = (addr) => {
    const match = addr.match(/\b(\d{5})\b/);
    return match ? match[0] : null;
};

const fetchGeocode = async (query) => {
    if (!query) return null;
    const API = "https://nominatim.openstreetmap.org/search";
    const box = "10.38,46.67,13.13,44.79"; // Veneto
    const isZip = /^\d{5}$/.test(query.trim());
    const q = isZip ? `CAP ${query}, Veneto, Italia` : `${query}, Veneto, Italia`;
    
    try {
        const res = await fetch(`${API}?q=${encodeURIComponent(q)}&format=json&limit=1&viewbox=${box}&bounded=1`, {
            headers: { 'User-Agent': 'GeoDistCalc/1.0' }
        });
        const data = await res.json();
        return data.length ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) } : null;
    } catch (e) { return null; }
};

const geocodeAddress = async (address) => {
    let result = null;
    const tried = new Set();
    const tryQ = async (q) => {
        if (!q || tried.has(q.toLowerCase())) return null;
        tried.add(q.toLowerCase());
        return await fetchGeocode(q);
    };

    // 1. CAP (Priorità utente)
    const zip = extractZipCode(address);
    if (zip) {
        result = await tryQ(zip);
        if (result) return result;
    }

    // 2. Indirizzo pulito
    result = await tryQ(standardizeAddress(address));
    if (result) return result;

    // 3. Indirizzo originale
    return await tryQ(address);
};

// --- APP UI LOGIC ---

document.addEventListener('DOMContentLoaded', () => {
    let companies = null, users = null, companyCol = null, userCol = null;
    let results = [], errors = [];

    const DOMElements = {
        setupSection: document.getElementById('setup-section'),
        processingSection: document.getElementById('processing-section'),
        resultsSection: document.getElementById('results-section'),
        companiesUploaderContainer: document.getElementById('companies-uploader-container'),
        usersUploaderContainer: document.getElementById('users-uploader-container'),
        calculateButton: document.getElementById('calculate-button'),
        calculateButtonContainer: document.getElementById('calculate-button-container'),
        progressMessage: document.getElementById('progress-message'),
        resultsTableBody: document.getElementById('results-table-body'),
        resultsTableHead: document.getElementById('results-table-head'),
        resetButton: document.getElementById('reset-button')
    };

    const updateUI = () => {
        DOMElements.calculateButtonContainer.classList.toggle('hidden', !(companies && users && companyCol !== null && userCol !== null));
    };

    const handleFile = (file, type) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = parseCsv(e.target.result);
            if (type === 'companies') { companies = data; companyCol = null; }
            else { users = data; userCol = null; }
            
            const container = type === 'companies' ? document.getElementById('companies-selector-container') : document.getElementById('users-selector-container');
            const uploader = type === 'companies' ? DOMElements.companiesUploaderContainer : DOMElements.usersUploaderContainer;
            
            uploader.classList.add('hidden');
            container.innerHTML = `
                <div class="p-3 bg-slate-100 rounded mb-2"><b>File:</b> ${file.name}</div>
                <label class="block text-sm mb-2">Colonna Indirizzo:</label>
                ${data.headers.map((h, i) => `
                    <label class="flex items-center mb-1 cursor-pointer">
                        <input type="radio" name="col-${type}" value="${i}" class="mr-2"> ${h}
                    </label>
                `).join('')}
            `;
            container.classList.remove('hidden');
            container.addEventListener('change', (ev) => {
                if (type === 'companies') companyCol = parseInt(ev.target.value);
                else userCol = parseInt(ev.target.value);
                updateUI();
            });
        };
        reader.readAsText(file);
    };

    DOMElements.calculateButton.addEventListener('click', async () => {
        DOMElements.setupSection.classList.add('hidden');
        DOMElements.processingSection.classList.remove('hidden');
        results = []; errors = [];

        const process = async (list, col, label) => {
            const geocoded = [];
            for (let i = 0; i < list.rows.length; i++) {
                DOMElements.progressMessage.textContent = `${label}: riga ${i+1}/${list.rows.length}`;
                const coords = await geocodeAddress(list.rows[i][col]);
                if (coords) geocoded.push({ data: list.rows[i], ...coords });
                else errors.push({ type: label, address: list.rows[i][col], data: list.rows[i] });
                await new Promise(r => setTimeout(r, 1000));
            }
            return geocoded;
        };

        const geoCompanies = await process(companies, companyCol, 'Azienda');
        const geoUsers = await process(users, userCol, 'Utente');

        geoUsers.forEach(u => {
            geoCompanies.forEach(c => {
                const d = calculateDistance(u.lat, u.lon, c.lat, c.lon);
                results.push({ userData: u.data, companyData: c.data, distance: d });
            });
        });

        results.sort((a, b) => a.distance - b.distance);
        
        DOMElements.resultsTableHead.innerHTML = `<tr>${users.headers.map(h => `<th>${h}</th>`).join('')}${companies.headers.map(h => `<th>${h}</th>`).join('')}<th>Km</th></tr>`;
        DOMElements.resultsTableBody.innerHTML = results.map(r => `<tr>${[...r.userData, ...r.companyData, r.distance].map(v => `<td>${v}</td>`).join('')}</tr>`).join('');
        
        DOMElements.processingSection.classList.add('hidden');
        DOMElements.resultsSection.classList.remove('hidden');
    });

    document.getElementById('file-upload-companies').addEventListener('change', (e) => handleFile(e.target.files[0], 'companies'));
    document.getElementById('file-upload-users').addEventListener('change', (e) => handleFile(e.target.files[0], 'users'));
    DOMElements.resetButton.addEventListener('click', () => location.reload());
});
