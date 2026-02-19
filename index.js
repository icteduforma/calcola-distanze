import { geocodeAddress } from './services/geoService.js';
import { calculateDistance } from './utils/distanceHelper.js';
import { parseCsv, exportToCsv } from './utils/csvHelper.js';

// --- STATE ---
let companies = null;
let users = null;
let companyAddressCol = null;
let userAddressCol = null;
let results = [];
let errors = [];
let activeTab = 'results';
let filter = '';

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
const createFileUploaderHTML = (id) => `
    <div class="border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 border-slate-300 bg-slate-50" data-type="${id}">
        <input type="file" id="file-upload-${id}" class="hidden" accept=".csv" />
        <label for="file-upload-${id}" class="cursor-pointer flex flex-col items-center">
            ${Icons.Upload()}
            <span class="text-blue-600 font-semibold">Scegli un file</span>
            <p class="text-slate-500 text-sm">o trascinalo qui</p>
            <p class="text-xs text-slate-400 mt-1">Formato supportato: CSV</p>
        </label>
    </div>`;

const createColumnSelectorHTML = (fileName, headers, type) => `
    <div class="space-y-4">
        <div class="flex justify-between items-center bg-slate-100 p-3 rounded-md">
            <div class="flex items-center gap-2 text-slate-700 font-medium">
                ${Icons.File()}
                <span>${fileName}</span>
            </div>
            <button data-clear-type="${type}" class="text-slate-500 hover:text-red-600 transition-colors">
                ${Icons.Close()}
            </button>
        </div>
        <div>
            <label class="block text-sm font-medium text-slate-600 mb-2">Seleziona la colonna contenente l'indirizzo:</label>
            <div class="max-h-60 overflow-y-auto space-y-2 pr-2">
                ${headers.map((header, index) => `
                    <div>
                        <label class="flex items-center p-3 rounded-lg cursor-pointer transition-all bg-white border border-slate-200 hover:bg-slate-50">
                            <input type="radio" name="column-selector-${type}" value="${index}" class="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500" />
                            <span class="ml-3 text-sm text-slate-800">${header}</span>
                        </label>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>`;

const renderResultsTable = () => {
    const tableHead = DOMElements.resultsTableHead;
    const tableBody = DOMElements.resultsTableBody;

    tableHead.innerHTML = `<tr>
        ${users.headers.map(h => `<th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">${h}</th>`).join('')}
        ${companies.headers.map(h => `<th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">${h}</th>`).join('')}
        <th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Distanza (km)</th>
    </tr>`;

    const lowercasedFilter = filter.toLowerCase();
    const filteredResults = results.filter(res => 
        !filter ||
        res.companyData.some(d => String(d).toLowerCase().includes(lowercasedFilter)) ||
        res.userData.some(d => String(d).toLowerCase().includes(lowercasedFilter))
    );

    DOMElements.noResultsMessage.classList.toggle('hidden', filteredResults.length > 0);
    
    tableBody.innerHTML = filteredResults.map(res => `
        <tr class="hover:bg-slate-50">
            ${res.userData.map(d => `<td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">${d}</td>`).join('')}
            ${res.companyData.map(d => `<td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">${d}</td>`).join('')}
            <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-blue-700">${res.distance}</td>
        </tr>
    `).join('');
};

const renderErrorsTable = () => {
    const tableBody = DOMElements.errorsTableBody;
    DOMElements.noErrorsMessage.classList.toggle('hidden', errors.length > 0);
    tableBody.innerHTML = errors.map(err => `
        <tr class="hover:bg-slate-50">
            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">${err.type}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-red-600 font-mono">${err.address}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-500">${err.originalData.join(', ')}</td>
        </tr>
    `).join('');
};

// --- UI UPDATE LOGIC ---

const showSection = (section) => {
    ['setupSection', 'processingSection', 'resultsSection'].forEach(s => {
        DOMElements[s].classList.add('hidden');
    });
    DOMElements[section].classList.remove('hidden');
};

const updateCalculateButtonState = () => {
    const canCalculate = companies && users && companyAddressCol !== null && userAddressCol !== null;
    DOMElements.calculateButtonContainer.classList.toggle('hidden', !canCalculate);
};

const setActiveTab = (tabId) => {
    activeTab = tabId;
    DOMElements.resultsContent.classList.toggle('hidden', tabId !== 'results');
    DOMElements.errorsContent.classList.toggle('hidden', tabId !== 'errors');

    const resultTabClasses = DOMElements.tabResults.classList;
    const errorTabClasses = DOMElements.tabErrors.classList;

    resultTabClasses.toggle('bg-blue-600', tabId === 'results');
    resultTabClasses.toggle('text-white', tabId === 'results');
    resultTabClasses.toggle('text-slate-600', tabId !== 'results');
    resultTabClasses.toggle('hover:bg-slate-200', tabId !== 'results');

    errorTabClasses.toggle('bg-blue-600', tabId === 'errors');
    errorTabClasses.toggle('text-white', tabId === 'errors');
    errorTabClasses.toggle('text-slate-600', tabId !== 'errors');
    errorTabClasses.toggle('hover:bg-slate-200', tabId !== 'errors');

    // update badge colors
    DOMElements.tabResults.querySelector('span').classList.toggle('bg-white', tabId === 'results');
    DOMElements.tabResults.querySelector('span').classList.toggle('text-blue-600', tabId === 'results');
    DOMElements.tabResults.querySelector('span').classList.toggle('bg-slate-200', tabId !== 'results');
    DOMElements.tabResults.querySelector('span').classList.toggle('text-slate-600', tabId !== 'results');

    DOMElements.tabErrors.querySelector('span').classList.toggle('bg-white', tabId === 'errors');
    DOMElements.tabErrors.querySelector('span').classList.toggle('text-blue-600', tabId === 'errors');
    DOMElements.tabErrors.querySelector('span').classList.toggle('bg-slate-200', tabId !== 'errors');
    DOMElements.tabErrors.querySelector('span').classList.toggle('text-slate-600', tabId !== 'errors');
};

// --- EVENT HANDLERS & CORE LOGIC ---

const handleFileLoad = (fileContent, fileName, type) => {
    try {
        const parsedData = parseCsv(fileContent);
        if (parsedData.headers.length === 0 || parsedData.rows.length === 0) {
            alert('Il file CSV è vuoto o malformattato.');
            return;
        }

        const parsed = { ...parsedData, fileName };

        if (type === 'companies') {
            companies = parsed;
            companyAddressCol = null;
            DOMElements.companiesUploaderContainer.classList.add('hidden');
            DOMElements.companiesSelectorContainer.innerHTML = createColumnSelectorHTML(fileName, companies.headers, 'companies');
            DOMElements.companiesSelectorContainer.classList.remove('hidden');
        } else {
            users = parsed;
            userAddressCol = null;
            DOMElements.usersUploaderContainer.classList.add('hidden');
            DOMElements.usersSelectorContainer.innerHTML = createColumnSelectorHTML(fileName, users.headers, 'users');
            DOMElements.usersSelectorContainer.classList.remove('hidden');
        }
        updateCalculateButtonState();
    } catch (error) {
        console.error("Error parsing CSV:", error);
        alert(`Errore durante la lettura del file CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};

const handleCalculate = async () => {
    showSection('processingSection');
    results = [];
    errors = [];
    
    const currentErrors = [];

    const geocodeData = async (data, addressCol, type) => {
        const geocodedRecords = [];
        for (let i = 0; i < data.rows.length; i++) {
            const row = data.rows[i];
            const address = row[addressCol];

            if (!address || address.trim() === '') continue;

            DOMElements.progressMessage.textContent = `Geocodifica ${type} ${i + 1} di ${data.rows.length}: ${address}`;
            
            const coordinates = await geocodeAddress(address);
            if (coordinates) {
                geocodedRecords.push({ data: row, ...coordinates });
            } else {
                currentErrors.push({ type, originalData: row, address });
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Respect API usage policies
        }
        return geocodedRecords;
    };
    
    const geocodedCompanies = await geocodeData(companies, companyAddressCol, 'Azienda');
    const geocodedUsers = await geocodeData(users, userAddressCol, 'Utente');

    DOMElements.progressMessage.textContent = 'Calcolo delle distanze...';
    const newResults = [];
    for (const user of geocodedUsers) {
        for (const company of geocodedCompanies) {
            const distance = calculateDistance(user.lat, user.lon, company.lat, company.lon);
            newResults.push({
                userData: user.data,
                companyData: company.data,
                distance: parseFloat(distance.toFixed(2)),
            });
        }
    }

    newResults.sort((a, b) => a.distance - b.distance);
    
    results = newResults;
    errors = currentErrors;

    DOMElements.tabResults.innerHTML = `Risultati <span class="ml-1 px-2 py-0.5 rounded-full text-xs">${results.length}</span>`;
    DOMElements.tabErrors.innerHTML = `Indirizzi Non Trovati <span class="ml-1 px-2 py-0.5 rounded-full text-xs">${errors.length}</span>`;
    
    renderResultsTable();
    renderErrorsTable();
    setActiveTab('results');
    showSection('resultsSection');
};

const resetState = () => {
    companies = null;
    users = null;
    companyAddressCol = null;
    userAddressCol = null;
    results = [];
    errors = [];
    filter = '';
    DOMElements.filterInput.value = '';

    DOMElements.companiesUploaderContainer.classList.remove('hidden');
    DOMElements.companiesSelectorContainer.classList.add('hidden');
    DOMElements.companiesSelectorContainer.innerHTML = '';
    DOMElements.usersUploaderContainer.classList.remove('hidden');
    DOMElements.usersSelectorContainer.classList.add('hidden');
    DOMElements.usersSelectorContainer.innerHTML = '';

    updateCalculateButtonState();
    showSection('setupSection');
};

const initFileUploader = (container, type) => {
    const handleFile = (file) => {
        if (file) {
            if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
                alert('Per favore, seleziona un file in formato CSV.');
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                handleFileLoad(e.target.result, file.name, type);
            };
            reader.readAsText(file);
        }
    };

    container.addEventListener('change', (e) => {
        if (e.target.matches('input[type="file"]')) {
            handleFile(e.target.files ? e.target.files[0] : null);
        }
    });

    const dropZone = container.querySelector('[data-type]');
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('border-blue-500', 'bg-blue-50');
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('border-blue-500', 'bg-blue-50');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('border-blue-500', 'bg-blue-50');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    });
};

// --- INITIALIZATION ---
const init = () => {
    // Initial HTML content
    DOMElements.companiesTitleIcon.innerHTML = `${Icons.Company()} Lista Aziende`;
    DOMElements.usersTitleIcon.innerHTML = `${Icons.User()} Lista Utenti`;
    DOMElements.companiesUploaderContainer.innerHTML = createFileUploaderHTML('companies');
    DOMElements.usersUploaderContainer.innerHTML = createFileUploaderHTML('users');
    DOMElements.spinnerContainer.innerHTML = Icons.Spinner();
    DOMElements.resetButton.innerHTML = `${Icons.Reset()} Nuovo Calcolo`;
    DOMElements.downloadResultsButton.innerHTML = `${Icons.Download()} Scarica Risultati (CSV)`;
    DOMElements.downloadErrorsButton.innerHTML = `${Icons.Download()} Scarica Errori (CSV)`;

    // Setup file uploaders
    initFileUploader(DOMElements.companiesUploaderContainer, 'companies');
    initFileUploader(DOMElements.usersUploaderContainer, 'users');
    
    // Global event listeners (for dynamically added content)
    document.body.addEventListener('click', (e) => {
        const clearButton = e.target.closest('[data-clear-type]');
        if (clearButton) {
            const type = clearButton.dataset.clearType;
            if (type === 'companies') {
                companies = null;
                companyAddressCol = null;
                DOMElements.companiesUploaderContainer.classList.remove('hidden');
                DOMElements.companiesSelectorContainer.classList.add('hidden');
                DOMElements.companiesSelectorContainer.innerHTML = '';
            } else {
                users = null;
                userAddressCol = null;
                DOMElements.usersUploaderContainer.classList.remove('hidden');
                DOMElements.usersSelectorContainer.classList.add('hidden');
                DOMElements.usersSelectorContainer.innerHTML = '';
            }
            updateCalculateButtonState();
        }
    });

    document.body.addEventListener('change', (e) => {
        if (e.target.matches('input[name="column-selector-companies"]')) {
            companyAddressCol = parseInt(e.target.value, 10);
            e.target.closest('label').classList.add('bg-blue-100', 'border-blue-400', 'ring-2', 'ring-blue-300');
            updateCalculateButtonState();
        }
        if (e.target.matches('input[name="column-selector-users"]')) {
            userAddressCol = parseInt(e.target.value, 10);
            e.target.closest('label').classList.add('bg-blue-100', 'border-blue-400', 'ring-2', 'ring-blue-300');
            updateCalculateButtonState();
        }
    });

    // Static event listeners
    DOMElements.calculateButton.addEventListener('click', handleCalculate);
    DOMElements.resetButton.addEventListener('click', resetState);
    DOMElements.tabResults.addEventListener('click', () => setActiveTab('results'));
    DOMElements.tabErrors.addEventListener('click', () => setActiveTab('errors'));
    DOMElements.filterInput.addEventListener('input', (e) => {
        filter = e.target.value;
        renderResultsTable();
    });
    DOMElements.downloadResultsButton.addEventListener('click', () => {
        const headers = [...users.headers, ...companies.headers, 'Distanza (km)'];
        const data = results.map(r => [...r.userData, ...r.companyData, r.distance]);
        exportToCsv(headers, data, 'risultati_distanze.csv');
    });
    DOMElements.downloadErrorsButton.addEventListener('click', () => {
        const headers = ['Tipo', 'Indirizzo non trovato', ...errors[0]?.originalData.map((_, i) => `Dato Originale ${i+1}`) || []];
        const data = errors.map(e => [e.type, e.address, ...e.originalData]);
        exportToCsv(headers, data, 'errori_geocodifica.csv');
    });

    // Initial state
    resetState();
};

document.addEventListener('DOMContentLoaded', init);