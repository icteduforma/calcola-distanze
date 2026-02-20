// --- Funzioni di Utilità ---
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Raggio della Terra in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
};
const deg2rad = (deg) => {
    return deg * (Math.PI / 180);
};

const parseCsv = (csvText) => {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    let text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
                if(currentField.length > 0) {
                    currentField += char;
                }
            } else if (char === ',') {
                currentRow.push(currentField);
                currentField = '';
            } else if (char === '\n') {
                currentRow.push(currentField);
                rows.push(currentRow);
                currentRow = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }
    }
    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }
    if (rows.length > 0 && rows[rows.length - 1].every(field => field.trim() === '')) {
      rows.pop();
    }
    if (rows.length === 0) {
        return { headers: [], rows: [] };
    }
    const headers = rows[0];
    const dataRows = rows.slice(1);
    return { headers, rows: dataRows };
};

const exportToCsv = (headers, data, fileName) => {
    const escapeCsvField = (field) => {
        const stringField = String(field ?? '');
        if (/[",\n]/.test(stringField)) {
            return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
    };
    const csvContent = [
        headers.map(escapeCsvField).join(','),
        ...data.map(row => row.map(escapeCsvField).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// --- SERVIZIO GEOCODIFICA NOMINATIM ---
const geocodeAddress = async (address) => {
    const API_ENDPOINT = "https://nominatim.openstreetmap.org/search";
    
    if (!window.geocodeCache) {
        window.geocodeCache = new Map();
    }

    if (!address || address.trim() === '') return null;

    const fetchGeocode = async (query) => {
        if (!query) return null;
        const url = `${API_ENDPOINT}?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'GeoDistanceCalculator/6.0' } });
            if (!response.ok) return null;
            const data = await response.json();
            if (data && data.length > 0) {
                const res = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
                window.geocodeCache.set(query, res);
                return res;
            }
            return null;
        } catch (error) {
            console.error(`Fetch fallito per "${query}":`, error);
            return null;
        }
    };

    let result = await fetchGeocode(address);
    if (result) return result;

    if (!address.toLowerCase().includes('italia')) {
        result = await fetchGeocode(`${address}, Italia`);
        if (result) return result;
    }

    const zipMatch = address.match(/\b(\d{5})\b/);
    if (zipMatch) {
        result = await fetchGeocode(`${zipMatch[1]}, Italia`);
        if (result) return result;
    }

    return null;
};

// --- SERVIZIO PERCORSI OSRM ---
const getDrivingDistance = async (lat1, lon1, lat2, lon2) => {
    // Attenzione: OSRM usa le coordinate invertite (Longitudine,Latitudine)
    const OSRM_URL = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;

    try {
        const response = await fetch(OSRM_URL);
        if (!response.ok) return null;
        
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
            // OSRM restituisce metri, converto in km
            const distanceKm = data.routes[0].distance / 1000;
            return parseFloat(distanceKm.toFixed(2));
        }
        return null;
    } catch (error) {
        console.error("Errore OSRM:", error);
        return null;
    }
};

// --- Logica Principale dell'Applicazione ---
document.addEventListener('DOMContentLoaded', () => {

    // --- STATE ---
    let companies = null;
    let users = null;
    let companyAddressCol = null;
    let userAddressCol = null;
    let results = [];
    let errors = [];
    let activeTab = 'results';
    let filter = '';
    let usedDrivingMode = false; // Traccia se abbiamo calcolato i percorsi stradali

    // --- DOM ELEMENTS ---
    const DOMElements = {
        setupSection: document.getElementById('setup-section'),
        processingSection: document.getElementById('processing-section'),
        resultsSection: document.getElementById('results-section'),
        companiesTitleIcon: document.getElementById('companies-title-icon'),
        companiesUploaderContainer: document.getElementById('companies-uploader-container'),
        companiesSelectorContainer: document.getElementById('companies-selector-container'),
        usersTitleIcon: document.getElementById('users-title-icon'),
        usersUploaderContainer: document.getElementById('users-uploader-container'),
        usersSelectorContainer: document.getElementById('users-selector-container'),
        calculateButtonContainer: document.getElementById('calculate-button-container'),
        calculateButton: document.getElementById('calculate-button'),
        calculateDrivingButton: document.getElementById('calculate-driving-button'), // NUOVO
        spinnerContainer: document.getElementById('spinner-container'),
        progressMessage: document.getElementById('progress-message'),
        resetButton: document.getElementById('reset-button'),
        tabResults: document.getElementById('tab-results'),
        tabErrors: document.getElementById('tab-errors'),
        resultsContent: document.getElementById('results-content'),
        errorsContent: document.getElementById('errors-content'),
        filterInput: document.getElementById('filter-input'),
        downloadResultsButton: document.getElementById('download-results-button'),
        downloadErrorsButton: document.getElementById('download-errors-button'),
        resultsTableHead: document.getElementById('results-table-head'),
        resultsTableBody: document.getElementById('results-table-body'),
        errorsTableBody: document.getElementById('errors-table-body'),
        noResultsMessage: document.getElementById('no-results-message'),
        noErrorsMessage: document.getElementById('no-errors-message'),
    };

    // --- ICONS ---
    const iconProps = `class="w-6 h-6" stroke-width="1.5" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    const smallIconProps = `class="w-5 h-5" stroke-width="1.5" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    const Icons = {
      Company: () => `<svg xmlns="http://www.w3.org/2000/svg" ${iconProps} viewBox="0 0 24 24"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M3 21l18 0" /><path d="M5 21v-14l8 -4v18" /><path d="M19 21v-10l-6 -4" /><path d="M9 9l0 .01" /><path d="M9 12l0 .01" /><path d="M9 15l0 .01" /><path d="M9 18l0 .01" /></svg>`,
      User: () => `<svg xmlns="http://www.w3.org/2000/svg" ${iconProps} viewBox="0 0 24 24"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></svg>`,
      Upload: () => `<svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-slate-400 mb-2" stroke-width="1.5" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /><path d="M12 11v6" /><path d="M9.5 13.5l2.5 -2.5l2.5 2.5" /></svg>`,
      File: () => `<svg xmlns="http://www.w3.org/2000/svg" ${smallIconProps} viewBox="0 0 24 24"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /></svg>`,
      Close: () => `<svg xmlns="http://www.w3.org/2000/svg" ${smallIconProps} viewBox="0 0 24 24"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>`,
      Download: () => `<svg xmlns="http://www.w3.org/2000/svg" ${smallIconProps} viewBox="0 0 24 24"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" /></svg>`,
      Reset: () => `<svg xmlns="http://www.w3.org/2000/svg" ${smallIconProps} viewBox="0 0 24 24"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>`,
      Spinner: () => `<svg class="animate-spin h-10 w-10 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`,
    };

    // --- TEMPLATE & RENDER FUNCTIONS ---
    const createFileUploaderHTML = (id) => `<div class="border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 border-slate-300 bg-slate-50" data-type="${id}"><input type="file" id="file-upload-${id}" class="hidden" accept=".csv" /><label for="file-upload-${id}" class="cursor-pointer flex flex-col items-center">${Icons.Upload()}<span class="text-blue-600 font-semibold">Scegli un file</span><p class="text-slate-500 text-sm">o trascinalo qui</p><p class="text-xs text-slate-400 mt-1">Formato supportato: CSV</p></label></div>`;
    const createColumnSelectorHTML = (fileName, headers, type) => `<div class="space-y-4"><div class="flex justify-between items-center bg-slate-100 p-3 rounded-md"><div class="flex items-center gap-2 text-slate-700 font-medium">${Icons.File()}<span>${fileName}</span></div><button data-clear-type="${type}" class="text-slate-500 hover:text-red-600 transition-colors">${Icons.Close()}</button></div><div><label class="block text-sm font-medium text-slate-600 mb-2">Seleziona la colonna contenente l'indirizzo:</label><div class="max-h-60 overflow-y-auto space-y-2 pr-2">${headers.map((header, index) => `<div><label class="flex items-center p-3 rounded-lg cursor-pointer transition-all bg-white border border-slate-200 hover:bg-slate-50"><input type="radio" name="column-selector-${type}" value="${index}" class="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500" /><span class="ml-3 text-sm text-slate-800">${header}</span></label></div>`).join('')}</div></div></div>`;
    
    const renderResultsTable = () => {
        const lowercasedFilter = filter.toLowerCase();
        const filteredResults = results.filter(res => !filter || res.companyData.some(d => String(d).toLowerCase().includes(lowercasedFilter)) || res.userData.some(d => String(d).toLowerCase().includes(lowercasedFilter)));
        
        const thClass = "px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider";
        DOMElements.resultsTableHead.innerHTML = `<tr>
            ${users.headers.map(h => `<th class="${thClass}">${h}</th>`).join('')}
            <th class="${thClass} bg-blue-50">Lat Utente</th>
            <th class="${thClass} bg-blue-50">Lon Utente</th>
            ${companies.headers.map(h => `<th class="${thClass}">${h}</th>`).join('')}
            <th class="${thClass} bg-green-50">Lat Azienda</th>
            <th class="${thClass} bg-green-50">Lon Azienda</th>
            <th class="${thClass}">Distanza (km)</th>
            ${usedDrivingMode ? `<th class="${thClass} bg-indigo-50 text-indigo-700">Distanza Stradale (km)</th>` : ''}
        </tr>`;
        
        const tdClass = "px-4 py-3 whitespace-nowrap text-sm text-slate-600";
        DOMElements.resultsTableBody.innerHTML = filteredResults.map(res => `<tr class="hover:bg-slate-50">
            ${res.userData.map(d => `<td class="${tdClass}">${d}</td>`).join('')}
            <td class="${tdClass} bg-blue-50/30 text-xs font-mono">${res.userLat}</td>
            <td class="${tdClass} bg-blue-50/30 text-xs font-mono">${res.userLon}</td>
            ${res.companyData.map(d => `<td class="${tdClass}">${d}</td>`).join('')}
            <td class="${tdClass} bg-green-50/30 text-xs font-mono">${res.companyLat}</td>
            <td class="${tdClass} bg-green-50/30 text-xs font-mono">${res.companyLon}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-blue-700">${res.distance}</td>
            ${usedDrivingMode ? `<td class="px-4 py-3 whitespace-nowrap text-sm font-bold text-indigo-700 bg-indigo-50/30">${res.drivingDistance !== null ? res.drivingDistance : 'N/D'}</td>` : ''}
        </tr>`).join('');
        
        DOMElements.noResultsMessage.classList.toggle('hidden', filteredResults.length > 0);
    };
    
    const renderErrorsTable = () => {
        DOMElements.errorsTableBody.innerHTML = errors.map(err => `<tr class="hover:bg-slate-50"><td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">${err.type}</td><td class="px-4 py-3 whitespace-nowrap text-sm text-red-600 font-mono">${err.address}</td><td class="px-4 py-3 whitespace-nowrap text-sm text-slate-500">${err.originalData.join(', ')}</td></tr>`).join('');
        DOMElements.noErrorsMessage.classList.toggle('hidden', errors.length > 0);
    };
    
    // --- UI LOGIC ---
    const showSection = (section) => ['setupSection', 'processingSection', 'resultsSection'].forEach(s => DOMElements[s].classList.toggle('hidden', s !== section));
    const updateCalculateButtonState = () => DOMElements.calculateButtonContainer.classList.toggle('hidden', !(companies && users && companyAddressCol !== null && userAddressCol !== null));
    const setActiveTab = (tabId) => {
        activeTab = tabId;
        DOMElements.resultsContent.classList.toggle('hidden', tabId !== 'results');
        DOMElements.errorsContent.classList.toggle('hidden', tabId !== 'errors');
        ['tabResults', 'tabErrors'].forEach(t => {
            const isSelected = (t === 'tabResults' && tabId === 'results') || (t === 'tabErrors' && tabId === 'errors');
            DOMElements[t].classList.toggle('bg-blue-600', isSelected);
            DOMElements[t].classList.toggle('text-white', isSelected);
            DOMElements[t].classList.toggle('text-slate-600', !isSelected);
            DOMElements[t].querySelector('span').classList.toggle('bg-white', isSelected);
            DOMElements[t].querySelector('span').classList.toggle('text-blue-600', isSelected);
            DOMElements[t].querySelector('span').classList.toggle('bg-slate-200', !isSelected);
            DOMElements[t].querySelector('span').classList.toggle('text-slate-600', !isSelected);
        });
    };

    // --- CORE LOGIC ---
    const handleFileLoad = (fileContent, fileName, type) => {
        const parsedData = parseCsv(fileContent);
        if (parsedData.headers.length === 0 || parsedData.rows.length === 0) return alert('Il file CSV è vuoto o malformattato.');
        const parsed = { ...parsedData, fileName };
        const isCompany = type === 'companies';
        const uploader = isCompany ? DOMElements.companiesUploaderContainer : DOMElements.usersUploaderContainer;
        const selector = isCompany ? DOMElements.companiesSelectorContainer : DOMElements.usersSelectorContainer;
        if (isCompany) { companies = parsed; companyAddressCol = null; } 
        else { users = parsed; userAddressCol = null; }
        uploader.classList.add('hidden');
        selector.innerHTML = createColumnSelectorHTML(fileName, parsed.headers, type);
        selector.classList.remove('hidden');
        updateCalculateButtonState();
    };

    // Modificata per accettare la modalità 'straight' o 'driving'
    const handleCalculate = async (mode = 'straight') => {
        showSection('processingSection');
        results = [];
        errors = [];
        usedDrivingMode = (mode === 'driving');
        
        const MAX_OSRM_CALLS = 200; // Limite di sicurezza per l'API stradale
        
        const geocodeData = async (data, addressCol, type) => {
            const geocodedRecords = [];
            for (let i = 0; i < data.rows.length; i++) {
                const row = data.rows[i];
                const address = row[addressCol];
                if (!address || address.trim() === '') continue;
                
                DOMElements.progressMessage.textContent = `Geocodifica ${type} ${i + 1} di ${data.rows.length}: ${address}`;
                
                let coordinates = null;
                if (window.geocodeCache && window.geocodeCache.has(address)) {
                    coordinates = window.geocodeCache.get(address);
                } else {
                    coordinates = await geocodeAddress(address);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                if (coordinates) {
                    geocodedRecords.push({ data: row, ...coordinates });
                } else {
                    errors.push({ type, originalData: row, address });
                }
            }
            return geocodedRecords;
        };
        
        const geocodedCompanies = await geocodeData(companies, companyAddressCol, 'Azienda');
        const geocodedUsers = await geocodeData(users, userAddressCol, 'Utente');
        
        DOMElements.progressMessage.textContent = 'Calcolo delle distanze in linea d\'aria...';
        
        // FASE 1: Calcola TUTTE le distanze in linea d'aria (Veloce e Locale)
        for (const user of geocodedUsers) {
            for (const company of geocodedCompanies) {
                const linearDist = calculateDistance(user.lat, user.lon, company.lat, company.lon);
                results.push({ 
                    userData: user.data, 
                    userLat: user.lat,
                    userLon: user.lon,
                    companyData: company.data, 
                    companyLat: company.lat,
                    companyLon: company.lon,
                    distance: parseFloat(linearDist.toFixed(2)),
                    drivingDistance: null // Preimpostato a null
                });
            }
        }
        
        // Ordina tutto l'array in base alla distanza in linea d'aria (dal più vicino al più lontano)
        results.sort((a, b) => a.distance - b.distance);

        // FASE 2: Calcola la distanza stradale SOLO per i primi MAX_OSRM_CALLS
        if (usedDrivingMode) {
            const pairsToCalculate = Math.min(MAX_OSRM_CALLS, results.length);
            
            for (let i = 0; i < pairsToCalculate; i++) {
                DOMElements.progressMessage.textContent = `Calcolo percorso stradale ${i + 1} di ${pairsToCalculate}...`;
                const r = results[i];
                
                r.drivingDistance = await getDrivingDistance(r.userLat, r.userLon, r.companyLat, r.companyLon);
                
                // Rispettiamo l'API pubblica di OSRM con 1 secondo di pausa
                await new Promise(resolve => setTimeout(resolve, 1000)); 
            }
            
            // Ri-ordina SOLO i primi 200 risultati in base alla vera distanza stradale
            const calculatedPortion = results.slice(0, pairsToCalculate).sort((a, b) => {
                const distA = a.drivingDistance !== null ? a.drivingDistance : Infinity;
                const distB = b.drivingDistance !== null ? b.drivingDistance : Infinity;
                return distA - distB;
            });
            
            // Reinserisce la porzione riordinata in cima all'array principale
            results.splice(0, pairsToCalculate, ...calculatedPortion);
        }

        DOMElements.tabResults.innerHTML = `Risultati <span class="ml-1 px-2 py-0.5 rounded-full text-xs">${results.length}</span>`;
        DOMElements.tabErrors.innerHTML = `Errori <span class="ml-1 px-2 py-0.5 rounded-full text-xs">${errors.length}</span>`;
        
        renderResultsTable();
        renderErrorsTable();
        setActiveTab('results');
        showSection('resultsSection');
    };

    const resetState = () => {
        companies = users = companyAddressCol = userAddressCol = null;
        results = errors = [];
        filter = DOMElements.filterInput.value = '';
        usedDrivingMode = false;
        DOMElements.companiesUploaderContainer.classList.remove('hidden');
        DOMElements.companiesSelectorContainer.classList.add('hidden');
        DOMElements.usersUploaderContainer.classList.remove('hidden');
        DOMElements.usersSelectorContainer.classList.add('hidden');
        updateCalculateButtonState();
        showSection('setupSection');
    };

    // --- EVENT LISTENERS ---
    const initFileUploader = (container, type) => {
        const handleFile = (file) => {
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => handleFileLoad(e.target.result, file.name, type);
                reader.readAsText(file);
            }
        };
        container.addEventListener('change', (e) => e.target.matches('input[type="file"]') && handleFile(e.target.files[0]));
        const dropZone = container.querySelector('[data-type]');
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-blue-500'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-blue-500'));
        dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('border-blue-500'); handleFile(e.dataTransfer.files[0]); });
    };

    document.body.addEventListener('click', (e) => {
        const clearButton = e.target.closest('[data-clear-type]');
        if (clearButton) {
            const type = clearButton.dataset.clearType;
            if (type === 'companies') { companies = null; companyAddressCol = null; DOMElements.companiesUploaderContainer.classList.remove('hidden'); DOMElements.companiesSelectorContainer.classList.add('hidden'); } 
            else { users = null; userAddressCol = null; DOMElements.usersUploaderContainer.classList.remove('hidden'); DOMElements.usersSelectorContainer.classList.add('hidden'); }
            updateCalculateButtonState();
        }
    });
    document.body.addEventListener('change', (e) => {
        const target = e.target;
        if (target.matches('input[name^="column-selector-"]')) {
            const isCompany = target.name.includes('companies');
            if(isCompany) companyAddressCol = parseInt(target.value, 10);
            else userAddressCol = parseInt(target.value, 10);
            updateCalculateButtonState();
        }
    });

    DOMElements.calculateButton.addEventListener('click', () => handleCalculate('straight'));
    DOMElements.calculateDrivingButton.addEventListener('click', () => handleCalculate('driving'));
    
    DOMElements.resetButton.addEventListener('click', resetState);
    DOMElements.tabResults.addEventListener('click', () => setActiveTab('results'));
    DOMElements.tabErrors.addEventListener('click', () => setActiveTab('errors'));
    DOMElements.filterInput.addEventListener('input', (e) => { filter = e.target.value; renderResultsTable(); });
    
    DOMElements.downloadResultsButton.addEventListener('click', () => {
        let headers = [...users.headers, 'Lat Utente', 'Lon Utente', ...companies.headers, 'Lat Azienda', 'Lon Azienda', 'Distanza (km)'];
        if (usedDrivingMode) headers.push('Distanza Stradale (km)');

        const exportData = results.map(r => {
            let row = [
                ...r.userData, r.userLat, r.userLon, 
                ...r.companyData, r.companyLat, r.companyLon, 
                r.distance
            ];
            if (usedDrivingMode) row.push(r.drivingDistance !== null ? r.drivingDistance : 'N/D');
            return row;
        });
        exportToCsv(headers, exportData, 'risultati_distanze.csv');
    });
    
    DOMElements.downloadErrorsButton.addEventListener('click', () => exportToCsv(['Tipo', 'Indirizzo', 'Dati Originali'], errors.map(e => [e.type, e.address, e.originalData.join('; ')]), 'errori.csv'));

    // --- INITIALIZATION ---
    DOMElements.companiesTitleIcon.innerHTML = `${Icons.Company()} Lista Aziende`;
    DOMElements.usersTitleIcon.innerHTML = `${Icons.User()} Lista Utenti`;
    DOMElements.companiesUploaderContainer.innerHTML = createFileUploaderHTML('companies');
    DOMElements.usersUploaderContainer.innerHTML = createFileUploaderHTML('users');
    DOMElements.spinnerContainer.innerHTML = Icons.Spinner();
    DOMElements.resetButton.innerHTML = `${Icons.Reset()} Nuovo Calcolo`;
    DOMElements.downloadResultsButton.innerHTML = `${Icons.Download()} Scarica Risultati (CSV)`;
    DOMElements.downloadErrorsButton.innerHTML = `${Icons.Download()} Scarica Errori (CSV)`;
    initFileUploader(DOMElements.companiesUploaderContainer, 'companies');
    initFileUploader(DOMElements.usersUploaderContainer, 'users');
    resetState();
});