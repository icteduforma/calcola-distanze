// --- UTILS ---
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return parseFloat((R * c).toFixed(2));
};

const parseCsv = (csvText) => {
    const rows = [];
    let currentRow = [], currentField = '', inQuotes = false;
    let text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < text.length; i++) {
        const char = text[i], next = text[i+1];
        if (inQuotes) {
            if (char === '"' && next === '"') { currentField += '"'; i++; }
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
    const filtered = rows.filter(r => r.some(f => f.trim() !== ''));
    return { headers: filtered[0] || [], rows: filtered.slice(1) };
};

// --- GEO LOGIC ---
const fetchGeocode = async (query) => {
    if (!query) return null;
    const API = "https://nominatim.openstreetmap.org/search";
    const box = "10.38,46.67,13.13,44.79"; // Veneto
    const q = /^\d{5}$/.test(query.trim()) ? `CAP ${query}, Veneto, Italia` : `${query}, Veneto, Italia`;
    
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
    const zip = address.match(/\b(\d{5})\b/)?.[0];
    
    // 1. CAP (Priorità utente)
    if (zip) {
        result = await fetchGeocode(zip);
        if (result) return result;
    }

    // 2. Indirizzo completo
    return await fetchGeocode(address);
};

// --- UI CONTROL ---
document.addEventListener('DOMContentLoaded', () => {
    let companies = null, users = null, companyCol = null, userCol = null;
    let results = [];

    const DOMElements = {
        setupSection: document.getElementById('setup-section'),
        processingSection: document.getElementById('processing-section'),
        resultsSection: document.getElementById('results-section'),
        companiesUploader: document.getElementById('companies-uploader-container'),
        usersUploader: document.getElementById('users-uploader-container'),
        calculateBtn: document.getElementById('calculate-button'),
        calculateBtnContainer: document.getElementById('calculate-button-container'),
        progress: document.getElementById('progress-message'),
        resultsBody: document.getElementById('results-table-body'),
        resultsHead: document.getElementById('results-table-head')
    };

    const renderUploader = (type) => {
        const container = type === 'companies' ? DOMElements.companiesUploader : DOMElements.usersUploader;
        container.innerHTML = `<input type="file" id="file-${type}" class="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" accept=".csv" />`;
        document.getElementById(`file-${type}`).addEventListener('change', (e) => handleFile(e.target.files[0], type));
    };

    const handleFile = (file, type) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = parseCsv(e.target.result);
            if (type === 'companies') { companies = data; companyCol = null; }
            else { users = data; userCol = null; }
            
            const selector = type === 'companies' ? document.getElementById('companies-selector-container') : document.getElementById('users-selector-container');
            const uploader = type === 'companies' ? DOMElements.companiesUploader : DOMElements.usersUploader;
            
            uploader.classList.add('hidden');
            selector.innerHTML = `
                <p class="text-sm font-bold mb-2">${file.name}</p>
                <select class="w-full p-2 border rounded" id="select-${type}">
                    <option value="">Seleziona colonna indirizzo...</option>
                    ${data.headers.map((h, i) => `<option value="${i}">${h}</option>`).join('')}
                </select>`;
            selector.classList.remove('hidden');
            document.getElementById(`select-${type}`).addEventListener('change', (ev) => {
                if (type === 'companies') companyCol = ev.target.value;
                else userCol = ev.target.value;
                DOMElements.calculateBtnContainer.classList.toggle('hidden', !(companies && users && companyCol !== null && userCol !== null));
            });
        };
        reader.readAsText(file);
    };

    DOMElements.calculateBtn.addEventListener('click', async () => {
        DOMElements.setupSection.classList.add('hidden');
        DOMElements.processingSection.classList.remove('hidden');
        results = [];

        const process = async (list, col, label) => {
            const geo = [];
            for (let i = 0; i < list.rows.length; i++) {
                DOMElements.progress.textContent = `${label}: ${i+1}/${list.rows.length}`;
                const coords = await geocodeAddress(list.rows[i][col]);
                if (coords) geo.push({ data: list.rows[i], ...coords });
                await new Promise(r => setTimeout(r, 1000));
            }
            return geo;
        };

        const geoCompanies = await process(companies, companyCol, 'Aziende');
        const geoUsers = await process(users, userCol, 'Utenti');

        geoUsers.forEach(u => {
            geoCompanies.forEach(c => {
                results.push({ 
                    uData: u.data, 
                    cData: c.data, 
                    dist: calculateDistance(u.lat, u.lon, c.lat, c.lon) 
                });
            });
        });

        results.sort((a, b) => a.dist - b.dist);
        DOMElements.resultsHead.innerHTML = `<tr>${users.headers.map(h => `<th>${h}</th>`).join('')}${companies.headers.map(h => `<th>${h}</th>`).join('')}<th>Km</th></tr>`;
        DOMElements.resultsBody.innerHTML = results.map(r => `<tr>${[...r.uData, ...r.cData, r.dist].map(v => `<td>${v}</td>`).join('')}</tr>`).join('');
        
        DOMElements.processingSection.classList.add('hidden');
        DOMElements.resultsSection.classList.remove('hidden');
    });

    renderUploader('companies');
    renderUploader('users');
    document.getElementById('reset-button').addEventListener('click', () => location.reload());
});
