/**
 * Parses a CSV string into headers and rows of strings.
 * Handles quoted fields containing commas and newlines.
 * @param {string} csvText The raw CSV string.
 * @returns {{headers: string[], rows: string[][]}} An object with headers and rows.
 */
export const parseCsv = (csvText) => {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    let text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n'); // Normalize newlines

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i++; // Skip the next quote
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
                // handle case where field starts with quote but has content before it (malformed but common)
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
    
    // Add the last field and row if the file doesn't end with a newline
    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }
    
    // Cleanup for trailing empty rows
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

const escapeCsvField = (field) => {
    const stringField = String(field ?? '');
    if (/[",\n]/.test(stringField)) {
        return `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
};

/**
 * Exports data to a CSV file and triggers a download.
 * @param {string[]} headers Array of header strings.
 * @param {any[][]} data 2D array of data.
 * @param {string} fileName The name of the file to download.
 */
export const exportToCsv = (headers, data, fileName) => {
    const csvContent = [
        headers.map(escapeCsvField).join(','),
        ...data.map(row => row.map(escapeCsvField).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};