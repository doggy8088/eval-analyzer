// Global state
let allData = [];
let metaData = {};
let currentDataset = '';

// DOM elements
const fileInput = document.getElementById('file-input');
const fileStatus = document.getElementById('file-status');
const controls = document.getElementById('controls');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('error-message');
const initialMessage = document.getElementById('initial-message');
const contentArea = document.getElementById('content-area');
const datasetSelect = document.getElementById('dataset-select');
const normalizeCheckbox = document.getElementById('normalize-checkbox');
const pageSizeSelect = document.getElementById('page-size');
const sortModeSelect = document.getElementById('sort-mode');
const chartsContainer = document.getElementById('charts-container');
const toolbar = document.getElementById('toolbar');
const downloadsContainer = document.getElementById('downloads-container');

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
});

function setupEventListeners() {
    fileInput.addEventListener('change', handleFileUpload);
    datasetSelect.addEventListener('change', handleDatasetChange);
    normalizeCheckbox.addEventListener('change', renderCurrentDataset);
    pageSizeSelect.addEventListener('change', renderCurrentDataset);
    sortModeSelect.addEventListener('change', renderCurrentDataset);
    
    // Drag and drop support
    fileInput.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileInput.classList.add('dragover');
    });
    
    fileInput.addEventListener('dragleave', () => {
        fileInput.classList.remove('dragover');
    });
    
    fileInput.addEventListener('drop', (e) => {
        e.preventDefault();
        fileInput.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files);
        processFiles(files);
    });
}

async function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    await processFiles(files);
}

async function processFiles(files) {
    showLoading();
    hideError();
    
    try {
        const validFiles = files.filter(file => 
            file.name.endsWith('.json') || file.name.endsWith('.jsonl')
        );
        
        if (validFiles.length === 0) {
            throw new Error('請選擇有效的 JSON 或 JSONL 檔案');
        }
        
        fileStatus.textContent = `處理 ${validFiles.length} 個檔案...`;
        
        const results = await Promise.all(validFiles.map(processFile));
        const validResults = results.filter(result => result !== null);
        
        if (validResults.length === 0) {
            throw new Error('沒有找到有效的 Twinkle Eval 檔案');
        }
        
        // Combine all data
        allData = [];
        metaData = {};
        
        validResults.forEach(({ data, meta, sourceLabel }) => {
            allData.push(...data);
            metaData[sourceLabel] = meta;
        });
        
        fileStatus.textContent = `成功載入 ${validResults.length} 個檔案，共 ${allData.length} 筆記錄`;
        
        // Populate dataset selector
        populateDatasetSelector();
        showControls();
        hideInitialMessage();
        
    } catch (error) {
        showError(`處理檔案時發生錯誤：${error.message}`);
        fileStatus.textContent = '檔案處理失敗';
    } finally {
        hideLoading();
    }
}

async function processFile(file) {
    try {
        const text = await readFileAsText(file);
        const doc = parseTwinkleDoc(text);
        const { data, meta } = extractRecords(doc);
        
        if (data.length === 0) {
            console.warn(`檔案 ${file.name} 沒有有效的記錄`);
            return null;
        }
        
        return { data, meta, sourceLabel: data[0].sourceLabel };
    } catch (error) {
        console.error(`處理檔案 ${file.name} 時發生錯誤：`, error);
        showError(`❌ 無法讀取 ${file.name}：${error.message}`);
        return null;
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('檔案讀取失敗'));
        reader.readAsText(file, 'UTF-8');
    });
}

function parseTwinkleDoc(text) {
    text = text.trim();
    
    // Try parsing as JSON first
    try {
        const obj = JSON.parse(text);
        return validateTwinkleDoc(obj);
    } catch (e) {
        // Try parsing as JSONL
        const lines = text.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim().replace(/,$/, '');
            if (!trimmedLine) continue;
            
            try {
                const obj = JSON.parse(trimmedLine);
                return validateTwinkleDoc(obj);
            } catch (e) {
                continue;
            }
        }
        throw new Error('檔案不是有效的 JSON 或 JSONL 格式');
    }
}

function validateTwinkleDoc(obj) {
    if (typeof obj !== 'object' || obj === null) {
        throw new Error('檔案不是有效的 Twinkle Eval JSON 物件');
    }
    
    if (!obj.timestamp || !obj.config || !obj.dataset_results) {
        throw new Error('缺少必要欄位：timestamp, config, dataset_results');
    }
    
    return obj;
}

function extractRecords(doc) {
    const model = doc.config?.model?.name || '<unknown>';
    const timestamp = doc.timestamp || '<no-ts>';
    const sourceLabel = `${model} @ ${timestamp}`;
    
    const data = [];
    const meta = {};
    
    for (const [dsPath, dsPayload] of Object.entries(doc.dataset_results || {})) {
        if (typeof dsPayload !== 'object' || dsPayload === null) continue;
        
        let dsName = dsPath.startsWith('datasets/') 
            ? dsPath.split('datasets/')[1].replace(/^\/+|\/+$/g, '') 
            : dsPath;
        
        // If dsName is empty after processing, use a default name
        if (!dsName) {
            dsName = dsPath || 'default_dataset';
        }
            
        let avgMeta = dsPayload.average_accuracy;
        const results = dsPayload.results || [];
        
        for (const item of results) {
            if (typeof item !== 'object' || item === null) continue;
            
            const filePath = item.file;
            const accMean = item.accuracy_mean;
            
            if (filePath == null || accMean == null) continue;
            
            const fname = filePath.split('/').pop();
            const category = fname.split('.')[0];
            
            data.push({
                dataset: dsName,
                category: category,
                file: fname,
                accuracyMean: parseFloat(accMean),
                sourceLabel: sourceLabel
            });
        }
        
        // Calculate average if not provided
        if (avgMeta == null && results.length > 0) {
            const values = results
                .map(item => item.accuracy_mean)
                .filter(val => val != null)
                .map(val => parseFloat(val));
            
            if (values.length > 0) {
                avgMeta = values.reduce((sum, val) => sum + val, 0) / values.length;
            }
        }
        
        if (avgMeta != null) {
            meta[dsName] = parseFloat(avgMeta);
        }
    }
    
    return { data, meta };
}

function populateDatasetSelector() {
    const datasets = [...new Set(allData.map(item => item.dataset))].sort();
    
    datasetSelect.innerHTML = '';
    datasets.forEach(dataset => {
        const option = document.createElement('option');
        option.value = dataset;
        option.textContent = dataset;
        datasetSelect.appendChild(option);
    });
    
    if (datasets.length > 0) {
        currentDataset = datasets[0];
        datasetSelect.value = currentDataset;
        renderCurrentDataset();
    }
}

function handleDatasetChange() {
    currentDataset = datasetSelect.value;
    renderCurrentDataset();
}

function renderCurrentDataset() {
    if (!currentDataset || allData.length === 0) return;
    
    const workData = allData.filter(item => item.dataset === currentDataset);
    if (workData.length === 0) return;
    
    const normalize = normalizeCheckbox.checked;
    const pageSize = parseInt(pageSizeSelect.value);
    const sortMode = sortModeSelect.value;
    
    // Apply normalization
    const processedData = workData.map(item => ({
        ...item,
        displayValue: item.accuracyMean * (normalize ? 100 : 1)
    }));
    
    // Group by category and calculate averages for sorting
    const categoryAverages = {};
    processedData.forEach(item => {
        if (!categoryAverages[item.category]) {
            categoryAverages[item.category] = [];
        }
        categoryAverages[item.category].push(item.displayValue);
    });
    
    const categoryOrder = Object.keys(categoryAverages).map(category => ({
        category,
        average: categoryAverages[category].reduce((sum, val) => sum + val, 0) / categoryAverages[category].length
    }));
    
    // Sort categories
    if (sortMode === 'desc') {
        categoryOrder.sort((a, b) => b.average - a.average);
    } else if (sortMode === 'asc') {
        categoryOrder.sort((a, b) => a.average - b.average);
    } else {
        categoryOrder.sort((a, b) => a.category.localeCompare(b.category));
    }
    
    const sortedCategories = categoryOrder.map(item => item.category);
    
    // Create paginated charts
    const totalCategories = sortedCategories.length;
    const totalPages = Math.ceil(totalCategories / pageSize);
    
    chartsContainer.innerHTML = '';
    const pagesMeta = [];
    for (let page = 0; page < totalPages; page++) {
        const startIdx = page * pageSize;
        const endIdx = Math.min(startIdx + pageSize, totalCategories);
        const pageCategories = sortedCategories.slice(startIdx, endIdx);
        
        const pageData = processedData.filter(item => pageCategories.includes(item.category));
        createChartSection(pageData, pageCategories, startIdx + 1, endIdx, totalCategories, normalize);
        pagesMeta.push({
            start: startIdx + 1,
            end: endIdx,
            categories: pageCategories,
            data: pageData,
        });
    }
    renderDownloads(pagesMeta, normalize);
    showContent();
}

function createChartSection(data, categories, start, end, total, normalize) {
    const section = document.createElement('div');
    section.className = 'chart-section';
    
    const header = document.createElement('div');
    header.className = 'chart-header';
    
    const title = document.createElement('h3');
    title.className = 'chart-title';
    // 與 Python UI 一致：標題不包含 dataset 名稱
    title.textContent = `📊 類別 ${start}-${end} / ${total}`;
    
    header.appendChild(title);
    
    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    
    const tableContainer = document.createElement('div');
    const table = createDataTable(data, categories, normalize);
    tableContainer.appendChild(table);
    
    section.appendChild(header);
    section.appendChild(chartContainer);
    section.appendChild(tableContainer);
    
    chartsContainer.appendChild(section);
    
    // Create chart
    createChart(chartContainer, data, categories, normalize);
}

function createChart(container, data, categories, normalize) {
    // Clear existing content
    container.innerHTML = '';
    // Tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    container.appendChild(tooltip);
    
    // Get unique source labels
    const sourceLabels = [...new Set(data.map(item => item.sourceLabel))];
    
    // Create SVG chart
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    // 放大繪圖座標，提供更寬的右側圖例
    svg.setAttribute('viewBox', '0 0 900 560');
    svg.style.background = 'transparent';
    
    // 根據最長類別文字動態調整底部外邊距，避免與 x 軸標題重疊
    const approxCharWidth = 6.5; // 對應 font-size 11 的估算
    const maxCatLen = categories.reduce((m, c) => Math.max(m, (c || '').length), 0);
    const labelSpace = Math.min(300, Math.max(40, Math.round(maxCatLen * approxCharWidth)));
    const margin = { top: 20, right: 260, bottom: 80 + labelSpace, left: 60 };
    const chartWidth = 900 - margin.left - margin.right;
    const chartHeight = 560 - margin.top - margin.bottom;
    
    // Calculate data ranges
    const maxValue = Math.max(...data.map(item => item.displayValue));
    // 與 Python 版刻度一致：0–1 以 0.05 間距，或 0–100
    const yMax = normalize ? 100 : Math.min(1.0, Math.ceil((maxValue || 1) / 0.05) * 0.05);
    const ySteps = normalize ? 10 : Math.max(1, Math.round(yMax / 0.05));
    
    // Colors for different models
    const colors = [
        '#8ab6ff', '#f6a5c0', '#9dd39c', '#ffd67f', '#cba0ff', 
        '#88e1dd', '#ffa07f', '#b39ddb', '#7fd3ff', '#ffe6a8'
    ];
    
    // Create chart group
    const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    chartGroup.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
    
    // Draw axes
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', 0);
    xAxis.setAttribute('y1', chartHeight);
    xAxis.setAttribute('x2', chartWidth);
    xAxis.setAttribute('y2', chartHeight);
    xAxis.setAttribute('stroke', '#4a5160');
    xAxis.setAttribute('stroke-width', 1);
    chartGroup.appendChild(xAxis);
    
    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', 0);
    yAxis.setAttribute('y1', 0);
    yAxis.setAttribute('x2', 0);
    yAxis.setAttribute('y2', chartHeight);
    yAxis.setAttribute('stroke', '#4a5160');
    yAxis.setAttribute('stroke-width', 1);
    chartGroup.appendChild(yAxis);
    
    // Frame (plot area border)
    const frame = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    frame.setAttribute('x', 0);
    frame.setAttribute('y', 0);
    frame.setAttribute('width', chartWidth);
    frame.setAttribute('height', chartHeight);
    frame.setAttribute('fill', 'none');
    frame.setAttribute('stroke', '#2a2f3a');
    frame.setAttribute('rx', 6);
    chartGroup.appendChild(frame);
    
    // Draw y-axis labels
    for (let i = 0; i <= ySteps; i++) {
        const value = (yMax / ySteps) * i;
        const y = chartHeight - (i / ySteps) * chartHeight;
        
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', -10);
        label.setAttribute('y', y + 4);
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('font-size', '12');
        label.setAttribute('fill', '#9aa3b2');
        label.textContent = normalize ? value.toFixed(0) : value.toFixed(2);
        chartGroup.appendChild(label);
        
        if (i > 0) {
            const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            gridLine.setAttribute('x1', 0);
            gridLine.setAttribute('y1', y);
            gridLine.setAttribute('x2', chartWidth);
            gridLine.setAttribute('y2', y);
            gridLine.setAttribute('stroke', '#2a2f3a');
            gridLine.setAttribute('stroke-width', 1);
            chartGroup.appendChild(gridLine);
        }
    }
    
    // Calculate bar dimensions
    const categoryWidth = chartWidth / categories.length;
    const barWidth = categoryWidth / sourceLabels.length * 0.8;
    const barSpacing = barWidth * 0.1;
    
    // Draw bars
    categories.forEach((category, categoryIndex) => {
        const categoryX = categoryIndex * categoryWidth;
        
        sourceLabels.forEach((label, labelIndex) => {
            const item = data.find(d => d.category === category && d.sourceLabel === label);
            if (!item) return;
            
            const barHeight = (item.displayValue / (yMax || 1)) * chartHeight;
            const barX = categoryX + labelIndex * (barWidth + barSpacing) + categoryWidth * 0.1;
            const barY = chartHeight - barHeight;
            
            const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bar.setAttribute('x', barX);
            bar.setAttribute('y', barY);
            bar.setAttribute('width', barWidth);
            bar.setAttribute('height', barHeight);
            bar.setAttribute('fill', colors[labelIndex % colors.length]);
            bar.setAttribute('opacity', 0.85);
            bar.setAttribute('cursor', 'pointer');
            // Custom hover tooltip
            const valueText = normalize ? item.displayValue.toFixed(1) : item.displayValue.toFixed(4);
            const showTip = (evt) => {
                const rect = container.getBoundingClientRect();
                const left = evt.clientX - rect.left + 14;
                const top = evt.clientY - rect.top + 14;
                tooltip.style.left = `${left}px`;
                tooltip.style.top = `${top}px`;
                tooltip.innerHTML = `
                    <div class="row"><div class="key">source_label</div><div class="val">${label}</div></div>
                    <div class="row"><div class="key">file</div><div class="val">${item.file}</div></div>
                    <div class="row"><div class="key">accuracy_mean</div><div class="val">${valueText}</div></div>
                `;
                tooltip.style.display = 'block';
                bar.setAttribute('opacity', 1);
                bar.setAttribute('stroke', '#cfd6e6');
                bar.setAttribute('stroke-width', 0.5);
            };
            const hideTip = () => {
                tooltip.style.display = 'none';
                bar.setAttribute('opacity', 0.85);
                bar.removeAttribute('stroke');
                bar.removeAttribute('stroke-width');
            };
            bar.addEventListener('mousemove', showTip);
            bar.addEventListener('mouseenter', showTip);
            bar.addEventListener('mouseleave', hideTip);

            chartGroup.appendChild(bar);
        });
        
        // Add category label
        const categoryLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        const labelX = categoryX + categoryWidth / 2;
        const labelY = chartHeight + 18; // 與 x 軸標題保有距離
        categoryLabel.setAttribute('x', labelX);
        categoryLabel.setAttribute('y', labelY);
        categoryLabel.setAttribute('text-anchor', 'end');
        categoryLabel.setAttribute('font-size', '11');
        categoryLabel.setAttribute('fill', '#cfd6e6');
        categoryLabel.setAttribute('transform', `rotate(-90, ${labelX}, ${labelY})`);
        categoryLabel.textContent = category;
        chartGroup.appendChild(categoryLabel);
    });
    
    // Add legend (always visible, to the right margin with card background)
    if (sourceLabels.length >= 1) {
        const legend = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        // 放到右側外邊距，不覆蓋圖表
        legend.setAttribute('transform', `translate(${chartWidth + 20}, 20)`);
        
        const legendWidth = 210;
        const legendHeight = sourceLabels.length * 20 + 28;
        const legendBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        legendBg.setAttribute('x', 0);
        legendBg.setAttribute('y', 0);
        legendBg.setAttribute('width', legendWidth);
        legendBg.setAttribute('height', legendHeight);
        legendBg.setAttribute('rx', 8);
        legendBg.setAttribute('fill', '#111624');
        legendBg.setAttribute('stroke', '#2a2f3a');
        legend.appendChild(legendBg);

        // Title above legend
        const legendTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        legendTitle.setAttribute('x', 12);
        legendTitle.setAttribute('y', 16);
        legendTitle.setAttribute('font-size', '11');
        legendTitle.setAttribute('fill', '#9aa3b2');
        legendTitle.textContent = 'source_label';
        legend.appendChild(legendTitle);
        
        sourceLabels.forEach((label, index) => {
            const legendItem = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            legendItem.setAttribute('transform', `translate(12, ${28 + index * 20})`);
            
            const swatch = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            swatch.setAttribute('x', 0);
            swatch.setAttribute('y', -10);
            swatch.setAttribute('width', 12);
            swatch.setAttribute('height', 12);
            swatch.setAttribute('fill', colors[index % colors.length]);
            legendItem.appendChild(swatch);
            
            const legendText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            legendText.setAttribute('x', 18);
            legendText.setAttribute('y', 0);
            legendText.setAttribute('font-size', '11');
            legendText.setAttribute('fill', '#cfd6e6');
            const short = label.length > 28 ? label.substring(0, 28) + '…' : label;
            legendText.textContent = short;
            const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            t.textContent = label;
            legendText.appendChild(t);
            legendItem.appendChild(legendText);
            
            legend.appendChild(legendItem);
        });
        
        chartGroup.appendChild(legend);
    }
    
    // Add axis titles
    const yTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yTitle.setAttribute('x', -chartHeight / 2);
    yTitle.setAttribute('y', -35);
    yTitle.setAttribute('text-anchor', 'middle');
    yTitle.setAttribute('font-size', '12');
    yTitle.setAttribute('fill', '#cfd6e6');
    yTitle.setAttribute('transform', `rotate(-90, -35, ${chartHeight / 2})`);
    yTitle.textContent = normalize ? 'accuracy_mean (0-100)' : 'accuracy_mean';
    chartGroup.appendChild(yTitle);
    
    const xTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xTitle.setAttribute('x', chartWidth / 2);
    // x 軸標題動態放置在所有類別文字下方
    xTitle.setAttribute('y', chartHeight + 40 + labelSpace);
    xTitle.setAttribute('text-anchor', 'middle');
    xTitle.setAttribute('font-size', '12');
    xTitle.setAttribute('fill', '#cfd6e6');
    xTitle.textContent = 'category';
    chartGroup.appendChild(xTitle);
    
    svg.appendChild(chartGroup);
    container.appendChild(svg);
}

function createDataTable(data, categories, normalize) {
    const table = document.createElement('table');
    table.className = 'data-table';
    
    // Get unique source labels
    const sourceLabels = [...new Set(data.map(item => item.sourceLabel))];
    
    // Create header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const categoryHeader = document.createElement('th');
    categoryHeader.textContent = 'category';
    headerRow.appendChild(categoryHeader);
    
    sourceLabels.forEach(label => {
        const th = document.createElement('th');
        th.textContent = label;
        th.className = 'number-cell';
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement('tbody');
    
    categories.forEach(category => {
        const row = document.createElement('tr');
        
        const categoryCell = document.createElement('td');
        categoryCell.textContent = category;
        row.appendChild(categoryCell);
        
        sourceLabels.forEach(label => {
            const cell = document.createElement('td');
            cell.className = 'number-cell';
            
            const item = data.find(d => d.category === category && d.sourceLabel === label);
            if (item) {
                cell.textContent = normalize ? item.displayValue.toFixed(1) : item.displayValue.toFixed(4);
            } else {
                cell.textContent = '-';
            }
            
            row.appendChild(cell);
        });
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    return table;
}

function downloadPageCSV(data, categories, start, end, normalize) {
    const sourceLabels = [...new Set(data.map(item => item.sourceLabel))];
    
    // Create CSV content
    const headers = ['category', ...sourceLabels];
    const rows = [headers.join(',')];
    
    categories.forEach(category => {
        const row = [category];
        sourceLabels.forEach(label => {
            const item = data.find(d => d.category === category && d.sourceLabel === label);
            row.push(item ? (normalize ? item.displayValue.toFixed(1) : item.displayValue.toFixed(4)) : '');
        });
        rows.push(row.join(','));
    });
    
    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `twinkle_${currentDataset}_${start}_${end}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// UI state management functions
function showLoading() {
    loading.style.display = 'block';
    contentArea.style.display = 'none';
    initialMessage.style.display = 'none';
}

function hideLoading() {
    loading.style.display = 'none';
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function hideError() {
    errorMessage.style.display = 'none';
}

function showControls() {
    controls.style.display = 'block';
    if (toolbar) toolbar.style.display = 'flex';
}

function renderDownloads(pagesMeta, normalize) {
    if (!downloadsContainer) return;
    downloadsContainer.innerHTML = '';
    if (!pagesMeta || pagesMeta.length === 0) {
        downloadsContainer.style.display = 'none';
        return;
    }
    pagesMeta.forEach(({ start, end, categories, data }) => {
        const btn = document.createElement('button');
        btn.className = 'download-btn';
        btn.textContent = `下載此頁 CSV (${start}-${end})`;
        btn.addEventListener('click', () => downloadPageCSV(data, categories, start, end, normalize));
        downloadsContainer.appendChild(btn);
    });
    downloadsContainer.style.display = 'flex';
}

function hideInitialMessage() {
    initialMessage.style.display = 'none';
}

function showContent() {
    contentArea.style.display = 'block';
}
