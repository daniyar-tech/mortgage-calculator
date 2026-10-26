// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let amortizationData = [];
let chart = null;
let compareChart = null;
let lastCalculation = {};
let scenarioCounter = 0;

// ==================== ВАЛИДАЦИЯ ====================
const VALIDATION_RULES = {
    loanAmount:      { min: 50000,   max: 100000000, name: 'Стоимость недвижимости',   integer: false },
    loanTerm:        { min: 1,       max: 50,        name: 'Срок кредита',             integer: true  },
    interestRate:    { min: 0.1,     max: 100,       name: 'Процентная ставка',        integer: false },
    downPayment:     { min: 0,       max: Infinity,  name: 'Перв. взнос',              integer: false },
    earlyAmount:     { min: 1000,    max: Infinity,  name: 'Сумма досрочного платежа', integer: false },
    earlyMonth:      { min: 1,       max: 600,       name: 'Месяц погашения',          integer: true  },
    insuranceRate:   { min: 0.1,     max: 10,        name: 'Ставка страхования',       integer: false },
    annualIncome:    { min: 1,       max: Infinity,  name: 'Годовой доход',            integer: false },
    propertyCost:    { min: 1,       max: Infinity,  name: 'Стоимость жилья',          integer: false },
    currentBalance:  { min: 1,       max: Infinity,  name: 'Остаток долга',            integer: false },
    currentRate:     { min: 0.1,     max: 100,       name: 'Текущая ставка',           integer: false },
    currentTermLeft: { min: 1,       max: 50,        name: 'Осталось платить',         integer: true  },
    newRate:         { min: 0.1,     max: 100,       name: 'Новая ставка',             integer: false },
    newTerm:         { min: 1,       max: 50,        name: 'Новый срок',               integer: true  },
    refinanceCost:   { min: 0,       max: Infinity,  name: 'Расходы',                  integer: false }
};

function formatNumber(n) {
    if (n === Infinity) return '∞';
    if (n >= 1000000) return (n / 1000000) + ' млн';
    if (n >= 1000) return n.toLocaleString('ru-RU');
    return n;
}

function validateField(id, value) {
    const rule = VALIDATION_RULES[id];
    if (!rule) return { valid: true, error: '' };

    if (value === '' || value === null || value === undefined) {
        return { valid: false, error: `${rule.name}: поле не заполнено` };
    }

    const num = parseFloat(value);

    if (isNaN(num)) return { valid: false, error: `${rule.name}: введите число` };
    if (!isFinite(num)) return { valid: false, error: `${rule.name}: слишком большое число` };
    if (num < 0) return { valid: false, error: `${rule.name}: не может быть отрицательным` };
    if (rule.integer && !Number.isInteger(num))
        return { valid: false, error: `${rule.name}: должно быть целым числом` };
    if (num < rule.min) return { valid: false, error: `${rule.name}: минимум ${formatNumber(rule.min)}` };
    if (num > rule.max) return { valid: false, error: `${rule.name}: максимум ${formatNumber(rule.max)}` };

    return { valid: true, error: '' };
}

function showFieldError(id, message) {
    const input = document.getElementById(id);
    if (!input) return;
    input.classList.add('invalid');
    input.classList.remove('valid');
    input.setAttribute('aria-invalid', 'true');

    const container = input.closest('.field, .form-group, .input-wrap') || input.parentElement;
    if (!container) return;

    let errorEl = container.querySelector('.field-error');
    if (!errorEl) {
        errorEl = document.createElement('small');
        errorEl.className = 'field-error';
        errorEl.setAttribute('role', 'alert');
        container.appendChild(errorEl);
    }
    errorEl.textContent = message;
}

function clearFieldError(id) {
    const input = document.getElementById(id);
    if (!input) return;
    input.classList.remove('invalid');
    input.classList.add('valid');
    input.setAttribute('aria-invalid', 'false');
    const container = input.closest('.field, .form-group, .input-wrap') || input.parentElement;
    if (!container) return;
    const errorEl = container.querySelector('.field-error');
    if (errorEl) errorEl.textContent = '';
}

function validateFields(ids) {
    let allValid = true;
    ids.forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        const result = validateField(id, input.value);
        if (!result.valid) {
            showFieldError(id, result.error);
            allValid = false;
        } else {
            clearFieldError(id);
        }
    });
    return allValid;
}

function validateCrossFields() {
    const loanAmountEl = document.getElementById('loanAmount');
    const downPaymentEl = document.getElementById('downPayment');
    const startDateEl = document.getElementById('startDate');

    const loanAmount = loanAmountEl ? parseFloat(loanAmountEl.value) : NaN;
    const downPayment = downPaymentEl ? parseFloat(downPaymentEl.value) : NaN;
    const startDate = startDateEl ? startDateEl.value : '';
    let valid = true;

    if (!isNaN(loanAmount) && !isNaN(downPayment) && downPayment >= loanAmount) {
        showFieldError('downPayment', 'Первоначальный взнос должен быть меньше стоимости недвижимости');
        valid = false;
    } else {
        clearFieldError('downPayment');
    }

    if (startDate) {
        const [year, month, day] = startDate.split('-').map(Number);
        const selected = new Date(year, month - 1, day);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const fiveYearsAgo = new Date(now);
        fiveYearsAgo.setFullYear(now.getFullYear() - 5);

        if (selected > now) {
            showFieldError('startDate', 'Дата не может быть в будущем');
            valid = false;
        } else if (selected < fiveYearsAgo) {
            showFieldError('startDate', 'Дата не может быть старше 5 лет назад');
            valid = false;
        } else {
            clearFieldError('startDate');
        }
    } else {
        clearFieldError('startDate');
    }

    if (lastCalculation.principal && amortizationData.length) {
        const earlyAmountEl = document.getElementById('earlyAmount');
        const earlyMonthEl = document.getElementById('earlyMonth');
        const earlyAmount = earlyAmountEl ? parseFloat(earlyAmountEl.value) : NaN;
        const earlyMonth = earlyMonthEl ? parseInt(earlyMonthEl.value) : NaN;
        const totalMonths = lastCalculation.loanTermYears * 12;

        if (!isNaN(earlyAmount) && !isNaN(earlyMonth)) {
            const idx = Math.min(earlyMonth - 1, amortizationData.length - 1);
            if (idx >= 0 && amortizationData[idx]) {
                const balanceAtMonth = amortizationData[idx].balance;
                if (earlyAmount > balanceAtMonth) {
                    showFieldError('earlyAmount',
                        `Сумма не может превышать остаток долга (${formatMoney(balanceAtMonth)})`);
                    valid = false;
                }
            }
            if (earlyMonth > totalMonths) {
                showFieldError('earlyMonth', `Месяц не может быть больше ${totalMonths}`);
                valid = false;
            }
        }
    }

    return valid;
}

function attachAutoValidation() {
    Object.keys(VALIDATION_RULES).forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;

        input.addEventListener('blur', () => {
            if (input.value !== '') {
                const result = validateField(id, input.value);
                if (result.valid) clearFieldError(id);
                else showFieldError(id, result.error);
            }
        });

        input.addEventListener('input', () => {
            if (input.value === '') return;
            const result = validateField(id, input.value);
            if (!result.valid) showFieldError(id, result.error);
            else clearFieldError(id);
        });
    });
}

function attachInputFilters() {
    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
        });
        input.addEventListener('input', () => {
            if (input.value.length > 15) input.value = input.value.slice(0, 15);
        });
    });
}

// ==================== НАВИГАЦИЯ ====================
document.addEventListener('DOMContentLoaded', function() {
    const startDateEl = document.getElementById('startDate');
    if (startDateEl) startDateEl.value = getLocalDateInputValue();

    document.querySelectorAll('.nav-link').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.querySelectorAll('#tab-calculator input, #tab-calculator select').forEach(el => {
        el.addEventListener('change', calculateMortgage);
    });

    const dependentResults = {
        earlyRepayment: 'earlyResults',
        insurance: 'insuranceResults',
        taxDeduction: 'taxResults',
        refinancing: 'refiResults'
    };
    Object.entries(dependentResults).forEach(([tabName, resultId]) => {
        document.querySelectorAll(`#tab-${tabName} input, #tab-${tabName} select`).forEach(input => {
            const hideResult = () => {
                const result = document.getElementById(resultId);
                if (result) result.style.display = 'none';
            };
            input.addEventListener('input', hideResult);
            input.addEventListener('change', hideResult);
        });
    });

    attachAutoValidation();
    attachInputFilters();
    initTheme();
    initSegmentedPayment();
    
    // Загрузка параметров из URL (если есть)
    loadFromURL();
    
    // Если URL пустой — выполняем первичный расчёт
    if (!window.location.search) {
        calculateMortgage();
    }
    
    loadSavedCalculations();
});

function switchTab(tabName) {
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const btn = document.querySelector(`.nav-link[data-tab="${tabName}"]`);
    const tab = document.getElementById(`tab-${tabName}`);
    if (btn) btn.classList.add('active');
    if (tab) tab.classList.add('active');

    // ПЛАВНО ПРОКРУЧИВАЕМ СТРАНИЦУ НАВЕРХ ПРИ СМЕНЕ ВКЛАДКИ
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initTheme() {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;

    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (saved === 'dark' || (!saved && prefersDark)) {
        document.body.classList.add('dark');
    }

    toggle.setAttribute('aria-pressed', String(document.body.classList.contains('dark')));

    toggle.addEventListener('click', () => {
        const dark = document.body.classList.toggle('dark');
        localStorage.setItem('theme', dark ? 'dark' : 'light');
        toggle.setAttribute('aria-pressed', String(dark));
        if (chart) chart.update();
        if (compareChart) compareChart.update();
    });
}

function initSegmentedPayment() {
    const seg = document.getElementById('paymentTypeSegmented');
    const sel = document.getElementById('paymentType');
    const hint = document.getElementById('paymentTypeHint');
    const note = document.getElementById('paymentTypeNote');
    if (!seg || !sel) return;

    const hints = {
        annuity: 'Платёж одинаков весь срок; сначала в нём больше процентов, потом больше тела кредита.',
        differentiated: 'Платёж уменьшается каждый месяц: тело долга гасится равными долями, проценты — на остаток.'
    };
    const notes = {
        annuity: 'платёж фиксирован на весь срок',
        differentiated: 'платёж уменьшается каждый месяц'
    };

    seg.querySelectorAll('.segmented-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            seg.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            sel.value = btn.dataset.value;
            sel.dispatchEvent(new Event('change'));
            if (hint) hint.textContent = hints[sel.value];
            if (note) note.textContent = notes[sel.value];
        });
    });
}

// ==================== УВЕДОМЛЕНИЯ ====================
function showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

function formatMoney(value) {
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value) + ' ₽';
}

function getPaymentDate(startDate, monthOffset) {
    const targetMonth = startDate.getMonth() + monthOffset;
    const year = startDate.getFullYear() + Math.floor(targetMonth / 12);
    const month = ((targetMonth % 12) + 12) % 12;
    const day = Math.min(startDate.getDate(), new Date(year, month + 1, 0).getDate());
    return new Date(year, month, day);
}

function getLocalDateInputValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ==================== ОСНОВНОЙ РАСЧЁТ ====================
function calculateMortgage() {
    const valid = validateFields(['loanAmount', 'loanTerm', 'interestRate', 'downPayment'])
                  && validateCrossFields();
    if (!valid) return;

    const loanAmount = parseFloat(document.getElementById('loanAmount').value);
    const loanTermYears = parseInt(document.getElementById('loanTerm').value);
    const interestRate = parseFloat(document.getElementById('interestRate').value);
    const downPayment = parseFloat(document.getElementById('downPayment').value);
    const paymentType = document.getElementById('paymentType').value;
    const startDate = document.getElementById('startDate').value;

    const principal = loanAmount - downPayment;
    const monthlyRate = interestRate / 100 / 12;
    const totalMonths = loanTermYears * 12;
    const start = startDate
        ? (() => {
            const [year, month, day] = startDate.split('-').map(Number);
            return new Date(year, month - 1, day);
        })()
        : new Date();

    amortizationData = [];
    let monthlyPayment = 0;
    let totalInterest = 0;

    if (paymentType === 'annuity') {
        if (monthlyRate === 0) {
            monthlyPayment = principal / totalMonths;
        } else {
            const coef = (monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) /
                        (Math.pow(1 + monthlyRate, totalMonths) - 1);
            monthlyPayment = principal * coef;
        }

        let balance = principal;
        for (let i = 1; i <= totalMonths; i++) {
            const interest = balance * monthlyRate;
            let principalPart = monthlyPayment - interest;

            if (i === totalMonths || principalPart > balance) principalPart = balance;

            balance -= principalPart;
            if (balance < 0.01) balance = 0;

            const paymentDate = getPaymentDate(start, i);

            amortizationData.push({
                month: i,
                date: paymentDate.toLocaleDateString('ru-RU'),
                payment: principalPart + interest,
                principal: principalPart,
                interest: interest,
                balance: balance
            });
            totalInterest += interest;
        }
    } else {
        const monthlyPrincipal = principal / totalMonths;
        let balance = principal;

        for (let i = 1; i <= totalMonths; i++) {
            const interest = balance * monthlyRate;
            let principalPart = monthlyPrincipal;

            if (i === totalMonths || principalPart > balance) principalPart = balance;

            balance -= principalPart;
            if (balance < 0.01) balance = 0;

            const paymentDate = getPaymentDate(start, i);

            amortizationData.push({
                month: i,
                date: paymentDate.toLocaleDateString('ru-RU'),
                payment: principalPart + interest,
                principal: principalPart,
                interest: interest,
                balance: balance
            });
            totalInterest += interest;
        }
        monthlyPayment = amortizationData[0].payment;
    }

    const totalPayment = principal + totalInterest;
    const effectiveRate = ((Math.pow(1 + monthlyRate, 12) - 1) * 100).toFixed(2);

    lastCalculation = {
        loanAmount, loanTermYears, interestRate, downPayment,
        paymentType, principal, monthlyPayment, totalPayment,
        totalInterest, effectiveRate, startDate
    };

    updateResults(monthlyPayment, totalPayment, totalInterest, effectiveRate);
    updateAmortizationTable();
    updateChart();

    // --- Расчёт альтернативной схемы для сравнения ---
    const otherType = paymentType === 'annuity' ? 'differentiated' : 'annuity';
    let otherPayment = 0;
    let otherTotalInterest = 0;

    if (otherType === 'annuity') {
        if (monthlyRate === 0) {
            otherPayment = principal / totalMonths;
        } else {
            const coef = (monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / 
                        (Math.pow(1 + monthlyRate, totalMonths) - 1);
            otherPayment = principal * coef;
        }
        otherTotalInterest = otherPayment * totalMonths - principal;
    } else {
        const monthlyPrincipal = principal / totalMonths;
        let bal = principal;
        for (let i = 0; i < totalMonths; i++) {
            otherTotalInterest += bal * monthlyRate;
            bal -= monthlyPrincipal;
        }
        otherPayment = monthlyPrincipal + (principal * monthlyRate);
    }

    const annPayment = paymentType === 'annuity' ? monthlyPayment : otherPayment;
    const annInterest = paymentType === 'annuity' ? totalInterest : otherTotalInterest;
    const diffPayment = paymentType === 'differentiated' ? monthlyPayment : otherPayment;
    const diffInterest = paymentType === 'differentiated' ? totalInterest : otherTotalInterest;

    document.getElementById('annuityPayment').textContent = formatMoney(annPayment);
    document.getElementById('annuityInterest').textContent = formatMoney(annInterest);
    document.getElementById('diffPayment').textContent = formatMoney(diffPayment);
    document.getElementById('diffInterest').textContent = formatMoney(diffInterest);

    document.getElementById('rowAnnuity').classList.toggle('current-row', paymentType === 'annuity');
    document.getElementById('rowDiff').classList.toggle('current-row', paymentType === 'differentiated');

    // Показываем кнопки
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.style.display = 'block';
    const pdfBtn = document.getElementById('pdfBtn');
    if (pdfBtn) pdfBtn.style.display = 'block';
}

function updateResults(monthlyPayment, totalPayment, totalInterest, effectiveRate) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    set('monthlyPayment', formatMoney(monthlyPayment));
    set('totalPayment', formatMoney(totalPayment));
    set('overpayment', formatMoney(totalInterest));
    set('effectiveRate', effectiveRate + ' %');
    set('actualTerm', (lastCalculation.loanTermYears || '—') + ' лет');
    set('requiredIncome', formatMoney(monthlyPayment / 0.5) + '/мес.');

    const note = document.getElementById('paymentTypeNote');
    if (note && lastCalculation.paymentType) {
        note.textContent = lastCalculation.paymentType === 'annuity'
            ? 'платёж фиксирован на весь срок'
            : 'платёж уменьшается каждый месяц';
    }
}

function updateAmortizationTable() {
    const tbody = document.querySelector('#amortizationTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const countEl = document.getElementById('tableCount');
    if (!countEl) return;

    if (!amortizationData.length) {
        countEl.textContent = '';
        return;
    }

    const filter = document.getElementById('yearFilter')?.value || 'all';
    let displayData = [];
    let label = '';

    switch (filter) {
        case 'first100':
            displayData = amortizationData.slice(0, 100);
            label = `Показаны первые 100 из ${amortizationData.length}`;
            break;
        case '1': displayData = amortizationData.slice(0, 12); label = 'Первый год'; break;
        case '2': displayData = amortizationData.slice(12, 24); label = 'Второй год'; break;
        case '3': displayData = amortizationData.slice(24, 36); label = 'Третий год'; break;
        case '5': displayData = amortizationData.slice(0, 60); label = 'Первые 5 лет'; break;
        case '10': displayData = amortizationData.slice(0, 120); label = 'Первые 10 лет'; break;
        case 'last12': displayData = amortizationData.slice(-12); label = 'Последний год'; break;
        case 'all':
        default:
            displayData = amortizationData;
            label = `Всего платежей: ${amortizationData.length}`;
    }

    displayData.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.month}</td>
            <td>${row.date}</td>
            <td>${formatMoney(row.payment)}</td>
            <td>${formatMoney(row.principal)}</td>
            <td>${formatMoney(row.interest)}</td>
            <td>${formatMoney(row.balance)}</td>
        `;
        tbody.appendChild(tr);
    });

    countEl.textContent = label;
}

function updateChart() {
    const canvas = document.getElementById('paymentChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const labels = amortizationData.slice(0, 60).map(i => i.month);
    const principalData = amortizationData.slice(0, 60).map(i => i.principal);
    const interestData = amortizationData.slice(0, 60).map(i => i.interest);

    const isDark = document.body.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(31,27,20,0.06)';
    const textColor = isDark ? '#c9bfa9' : '#4a4234';

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Основной долг', data: principalData, backgroundColor: '#1b4d3a' },
                { label: 'Проценты', data: interestData, backgroundColor: '#c9a961' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Месяц', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Сумма (₽)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                }
            },
            plugins: {
                legend: { position: 'bottom', labels: { color: textColor } }
            }
        }
    });
}

// ==================== ЭКСПОРТ В EXCEL ====================
function exportToExcel() {
    if (!amortizationData.length) {
        showNotification('Сначала выполните расчёт', 'error');
        return;
    }

    const wb = XLSX.utils.book_new();

    const summaryData = [
        ['Параметры кредита', ''],
        ['Стоимость недвижимости', lastCalculation.loanAmount],
        ['Первоначальный взнос', lastCalculation.downPayment],
        ['Сумма кредита', lastCalculation.principal],
        ['Срок кредита (лет)', lastCalculation.loanTermYears],
        ['Процентная ставка (%)', lastCalculation.interestRate],
        ['Тип платежа', lastCalculation.paymentType === 'annuity' ? 'Аннуитетный' : 'Дифференцированный'],
        ['Дата выдачи', lastCalculation.startDate],
        ['', ''],
        ['Результаты расчёта', ''],
        ['Ежемесячный платёж', lastCalculation.monthlyPayment],
        ['Общая сумма выплат', lastCalculation.totalPayment],
        ['Переплата по кредиту', lastCalculation.totalInterest],
        ['Эффективная годовая ставка (%)', lastCalculation.effectiveRate],
        ['Примечание', 'Предварительная оценка; комиссии, страховка и индивидуальные условия банка не учитываются.']
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Результаты');

    const amortHeader = ['№', 'Дата', 'Платёж', 'Основной долг', 'Проценты', 'Остаток долга'];
    const amortRows = amortizationData.map(r => [
        r.month, r.date, +r.payment.toFixed(2), +r.principal.toFixed(2),
        +r.interest.toFixed(2), +r.balance.toFixed(2)
    ]);
    const amortSheet = XLSX.utils.aoa_to_sheet([amortHeader, ...amortRows]);
    amortSheet['!cols'] = [{ wch: 8 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, amortSheet, 'График амортизации');

    const chartData = [['Месяц', 'Основной долг', 'Проценты', 'Общий платёж', 'Остаток долга']];
    amortizationData
        .filter((_, i) => i % 6 === 0 || i === amortizationData.length - 1)
        .forEach(r => {
            chartData.push([
                r.month,
                +r.principal.toFixed(2),
                +r.interest.toFixed(2),
                +r.payment.toFixed(2),
                +r.balance.toFixed(2)
            ]);
        });
    const chartSheet = XLSX.utils.aoa_to_sheet(chartData);
    chartSheet['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, chartSheet, 'Данные для графика');

    const instructions = [
        ['ИНСТРУКЦИЯ ПО ПОСТРОЕНИЮ ГРАФИКА'],
        [''],
        ['1. Перейдите на лист "Данные для графика"'],
        ['2. Выделите диапазон A1:D' + chartData.length],
        ['3. Вставка → Диаграмма → Линейчатая или График'],
        ['4. Настройте подписи и заголовок по желанию']
    ];
    const instrSheet = XLSX.utils.aoa_to_sheet(instructions);
    instrSheet['!cols'] = [{ wch: 60 }];
    XLSX.utils.book_append_sheet(wb, instrSheet, 'Инструкция');

    XLSX.writeFile(wb, `ипотечный_расчёт_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('Файл Excel успешно создан', 'success');
}

// ==================== ЭКСПОРТ В PDF ====================
function exportToPDF() {
    if (!amortizationData.length) {
        showNotification('Сначала выполните расчёт', 'error');
        return;
    }
    window.print();
}

// ==================== СБРОС ФОРМЫ ====================
function resetForm() {
    document.getElementById('loanAmount').value = 5000000;
    document.getElementById('loanTerm').value = 20;
    document.getElementById('interestRate').value = 12;
    document.getElementById('downPayment').value = 1000000;
    document.getElementById('paymentType').value = 'annuity';
    document.getElementById('startDate').value = getLocalDateInputValue();
    
    document.querySelectorAll('.segmented-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.value === 'annuity');
    });
    
    document.querySelectorAll('.field-error').forEach(e => e.textContent = '');
    document.querySelectorAll('.invalid').forEach(e => e.classList.remove('invalid'));
    document.querySelectorAll('.valid').forEach(e => e.classList.remove('valid'));
    
    document.getElementById('paymentTypeHint').textContent = 'Платёж одинаков весь срок; сначала в нём больше процентов, потом больше тела кредита.';
    
    calculateMortgage();
    showNotification('Форма сброшена', 'info');
}

// ==================== ПОДЕЛИТЬСЯ ССЫЛКОЙ ====================
function buildShareURL() {
    const params = new URLSearchParams({
        sum: document.getElementById('loanAmount').value,
        term: document.getElementById('loanTerm').value,
        rate: document.getElementById('interestRate').value,
        dp: document.getElementById('downPayment').value,
        type: document.getElementById('paymentType').value
    });
    const url = window.location.origin + window.location.pathname + '?' + params.toString();
    
    navigator.clipboard.writeText(url).then(() => {
        showNotification('Ссылка скопирована в буфер обмена', 'success');
    }).catch(() => {
        prompt('Скопируйте ссылку вручную:', url);
    });
}

function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('sum')) return;

    if (params.has('sum')) document.getElementById('loanAmount').value = params.get('sum');
    if (params.has('term')) document.getElementById('loanTerm').value = params.get('term');
    if (params.has('rate')) document.getElementById('interestRate').value = params.get('rate');
    if (params.has('dp')) document.getElementById('downPayment').value = params.get('dp');
    if (params.has('type')) {
        const type = params.get('type');
        document.getElementById('paymentType').value = type;
        document.querySelectorAll('.segmented-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.value === type);
        });
        document.getElementById('paymentTypeHint').textContent = type === 'annuity' 
            ? 'Платёж одинаков весь срок; сначала в нём больше процентов, потом больше тела кредита.'
            : 'Платёж уменьшается каждый месяц: тело долга гасится равными долями, проценты — на остаток.';
    }
    calculateMortgage();
    showNotification('Параметры загружены из ссылки', 'info');
}

// ==================== ДОСРОЧНОЕ ПОГАШЕНИЕ ====================
function calculateEarlyRepayment() {
    if (!lastCalculation.principal) {
        showNotification('Сначала рассчитайте основной кредит', 'error');
        return;
    }

    const valid = validateFields(['earlyAmount', 'earlyMonth']) && validateCrossFields();
    if (!valid) return;

    const earlyAmount = parseFloat(document.getElementById('earlyAmount').value);
    const earlyMonth = parseInt(document.getElementById('earlyMonth').value);
    const earlyType = document.getElementById('earlyType').value;

    const principal = lastCalculation.principal;
    const monthlyRate = lastCalculation.interestRate / 100 / 12;
    const totalMonths = lastCalculation.loanTermYears * 12;

    const paymentType = lastCalculation.paymentType;
    const basePayment = amortizationData[0].payment;
    const monthlyPrincipal = principal / totalMonths;
    const baseTotalInterest = amortizationData.reduce((sum, payment) => sum + payment.interest, 0);

    let balance = principal;
    let currentPayment = basePayment;
    let currentPrincipal = monthlyPrincipal;
    let paymentAfterEarly = basePayment;
    let totalInterest = 0;
    let newTotalMonths = 0;
    let paidOffInEarlyMonth = false;

    for (let i = 1; i <= totalMonths; i++) {
        if (balance <= 0) break;

        const interest = balance * monthlyRate;
        let principalPart = paymentType === 'annuity'
            ? Math.max(0, currentPayment - interest)
            : currentPrincipal;
        principalPart = Math.min(principalPart, balance);

        if (i === earlyMonth) {
            principalPart = Math.min(principalPart + earlyAmount, balance);
        }

        balance -= principalPart;
        totalInterest += interest;
        newTotalMonths = i;
        if (i === earlyMonth && balance < 0.01) paidOffInEarlyMonth = true;

        if (i === earlyMonth && earlyType === 'reducePayment' && balance > 0) {
            const remainingMonths = totalMonths - i;
            if (remainingMonths > 0) {
                if (paymentType === 'annuity') {
                    currentPayment = monthlyRate === 0
                        ? balance / remainingMonths
                        : balance * (monthlyRate * Math.pow(1 + monthlyRate, remainingMonths)) /
                            (Math.pow(1 + monthlyRate, remainingMonths) - 1);
                } else {
                    currentPrincipal = balance / remainingMonths;
                    currentPayment = currentPrincipal + balance * monthlyRate;
                }
                paymentAfterEarly = currentPayment;
            }
        } else if (i === earlyMonth && paymentType === 'differentiated' && balance > 0) {
            paymentAfterEarly = currentPrincipal + balance * monthlyRate;
        }

        if (balance < 0.01) {
            balance = 0;
            break;
        }
    }

    const savings = baseTotalInterest - totalInterest;
    const newTermYears = Math.floor(newTotalMonths / 12);
    const newTermMonths = newTotalMonths % 12;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('earlyNewTerm', `${newTermYears} г. ${newTermMonths} мес. (было ${lastCalculation.loanTermYears})`);
    set('interestSavings', formatMoney(savings));
    set('newOverpayment', formatMoney(totalInterest));
    set('newMonthlyPayment', paidOffInEarlyMonth
        ? 'Кредит погашен'
        : formatMoney(paymentAfterEarly));

    const box = document.getElementById('earlyResults');
    if (box) box.style.display = 'block';
    showNotification('Расчёт досрочного погашения выполнен', 'success');
}

// ==================== СТРАХОВКА ====================
function calculateInsurance() {
    if (!amortizationData.length) {
        showNotification('Сначала рассчитайте основной кредит', 'error');
        return;
    }

    if (!validateFields(['insuranceRate'])) return;

    const rate = parseFloat(document.getElementById('insuranceRate').value) / 100;
    const life = document.getElementById('lifeInsurance').checked;
    const property = document.getElementById('propertyInsurance').checked;
    const title = document.getElementById('titleInsurance').checked;

    let totalRate = 0;
    if (life) totalRate += rate;
    if (property) totalRate += rate * 0.5;
    if (title) totalRate += rate * 0.3;

    if (totalRate === 0) {
        showNotification('Выберите хотя бы один вид страхования', 'error');
        return;
    }

    const tbody = document.querySelector('#insuranceTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let totalInsurance = 0;
    const years = lastCalculation.loanTermYears;

    for (let year = 1; year <= years; year++) {
        const monthIndex = (year - 1) * 12;
        if (monthIndex >= amortizationData.length) break;

        const balanceStart = year === 1
            ? lastCalculation.principal
            : amortizationData[monthIndex - 1].balance;

        const insurance = balanceStart * totalRate;
        totalInsurance += insurance;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${year}</td>
            <td>${formatMoney(balanceStart)}</td>
            <td>${formatMoney(insurance)}</td>
        `;
        tbody.appendChild(tr);
    }

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('insuranceYear1', formatMoney(lastCalculation.principal * totalRate));
    set('insuranceTotal', formatMoney(totalInsurance));

    const box = document.getElementById('insuranceResults');
    if (box) box.style.display = 'block';
    showNotification('Расчёт страховки выполнен', 'success');
}

// ==================== НАЛОГОВЫЙ ВЫЧЕТ ====================
function calculateTaxDeduction() {
    if (!lastCalculation.principal) {
        showNotification('Сначала рассчитайте основной кредит', 'error');
        return;
    }

    if (!validateFields(['annualIncome', 'propertyCost'])) return;

    const annualIncome = parseFloat(document.getElementById('annualIncome').value);
    const propertyCost = parseFloat(document.getElementById('propertyCost').value);
    const totalInterest = lastCalculation.totalInterest;

    const MAX_PROPERTY = 2000000;
    const MAX_INTEREST = 3000000;
    const TAX_RATE = 0.13;

    const propertyBase = Math.min(propertyCost, MAX_PROPERTY);
    const interestBase = Math.min(totalInterest, MAX_INTEREST);

    const propertyDeduction = propertyBase * TAX_RATE;
    const interestDeduction = interestBase * TAX_RATE;
    const totalDeduction = propertyDeduction + interestDeduction;

    const annualTax = annualIncome * TAX_RATE;
    const years = Math.ceil(totalDeduction / annualTax);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('propertyDeduction', formatMoney(propertyDeduction));
    set('interestDeduction', formatMoney(interestDeduction));
    set('totalDeduction', formatMoney(totalDeduction));
    set('deductionYears', `${years} лет`);

    const box = document.getElementById('taxResults');
    if (box) box.style.display = 'block';
    showNotification('Налоговый вычет рассчитан', 'success');
}

// ==================== РЕФИНАНСИРОВАНИЕ ====================
function calculateRefinancing() {
    const valid = validateFields([
        'currentBalance', 'currentRate', 'currentTermLeft',
        'newRate', 'newTerm', 'refinanceCost'
    ]);
    if (!valid) return;

    const currentBalance = parseFloat(document.getElementById('currentBalance').value);
    const currentRate = parseFloat(document.getElementById('currentRate').value) / 100 / 12;
    const currentTermLeft = parseInt(document.getElementById('currentTermLeft').value) * 12;

    const newRate = parseFloat(document.getElementById('newRate').value) / 100 / 12;
    const newTerm = parseInt(document.getElementById('newTerm').value) * 12;
    const refiCost = parseFloat(document.getElementById('refinanceCost').value);

    const currentCoef = (currentRate * Math.pow(1 + currentRate, currentTermLeft)) /
                       (Math.pow(1 + currentRate, currentTermLeft) - 1);
    const currentPayment = currentBalance * currentCoef;
    const currentTotal = currentPayment * currentTermLeft;
    const currentOverpay = currentTotal - currentBalance;

    const newCoef = (newRate * Math.pow(1 + newRate, newTerm)) /
                   (Math.pow(1 + newRate, newTerm) - 1);
    const newPayment = currentBalance * newCoef;
    const newTotal = newPayment * newTerm;
    const newOverpay = newTotal - currentBalance;

    const monthlySavings = currentPayment - newPayment;
    const totalSavings = currentOverpay - newOverpay - refiCost;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('currentPayment', formatMoney(currentPayment));
    set('currentOverpay', formatMoney(currentOverpay));
    set('newPayment', formatMoney(newPayment));
    set('newOverpay', formatMoney(newOverpay));
    set('monthlySavings', formatMoney(monthlySavings));
    set('refiCostResult', formatMoney(refiCost));
    set('totalSavings', formatMoney(totalSavings));
    const resultHint = document.getElementById('refiResultHint');
    if (resultHint) {
        resultHint.textContent = totalSavings > 0
            ? 'По этой упрощённой оценке рефинансирование снижает суммарные расходы после учёта указанной стоимости оформления.'
            : 'По этим условиям рефинансирование не даёт суммарной экономии после учёта расходов на оформление.';
    }

    const box = document.getElementById('refiResults');
    if (box) box.style.display = 'block';
    showNotification('Расчёт рефинансирования выполнен', 'success');
}

// ==================== СРАВНЕНИЕ СЦЕНАРИЕВ ====================
function addScenario() {
    const container = document.getElementById('scenariosContainer');
    if (!container) return;
    if (container.querySelectorAll('.scenario-card').length >= 3) {
        showNotification('Максимум 3 сценария', 'error');
        return;
    }
    scenarioCounter++;

    const card = document.createElement('div');
    card.className = 'scenario-card';
    card.id = `scenario-${scenarioCounter}`;
    card.innerHTML = `
        <button class="remove-scenario" type="button" aria-label="Удалить сценарий" title="Удалить сценарий" onclick="removeScenario(${scenarioCounter})">×</button>
        <h4>Сценарий ${scenarioCounter}</h4>
        <div class="field">
            <label>Сумма кредита (₽)</label>
            <input type="number" class="sc-amount" value="5000000" min="50000" max="100000000" step="50000" aria-label="Сумма кредита">
        </div>
        <div class="field">
            <label>Срок (лет)</label>
            <input type="number" class="sc-term" value="${20 - (container.querySelectorAll('.scenario-card').length * 5)}" min="1" max="50" step="1" aria-label="Срок кредита в годах">
        </div>
        <div class="field">
            <label>Ставка (%)</label>
            <input type="number" class="sc-rate" value="${12 - (container.querySelectorAll('.scenario-card').length)}" min="0.1" max="100" step="0.1" aria-label="Годовая ставка">
        </div>
        <div class="field">
            <label>Тип платежа</label>
            <select class="sc-type">
                <option value="annuity">Аннуитетный</option>
                <option value="differentiated">Дифференцированный</option>
            </select>
        </div>
    `;
    container.appendChild(card);

    card.querySelectorAll('input[type="number"]').forEach(inp => {
        inp.addEventListener('keydown', (e) => {
            if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
        });
        inp.addEventListener('input', hideScenarioResults);
    });
    card.querySelector('select').addEventListener('change', hideScenarioResults);
    hideScenarioResults();
}

function hideScenarioResults() {
    const box = document.getElementById('compareResults');
    if (box) box.style.display = 'none';
}

function removeScenario(id) {
    const card = document.getElementById(`scenario-${id}`);
    if (card) {
        card.remove();
        const cards = document.querySelectorAll('.scenario-card');
        cards.forEach((c, idx) => {
            c.querySelector('h4').textContent = `Сценарий ${idx + 1}`;
        });
        hideScenarioResults();
    }
}

function clearScenarios() {
    const container = document.getElementById('scenariosContainer');
    if (container) container.innerHTML = '';
    scenarioCounter = 0;
    const box = document.getElementById('compareResults');
    if (box) box.style.display = 'none';
}

function compareScenarios() {
    const cards = document.querySelectorAll('.scenario-card');
    if (cards.length < 2) {
        showNotification('Добавьте минимум 2 сценария', 'error');
        return;
    }

    let hasError = false;
    cards.forEach((card, idx) => {
        const amount = parseFloat(card.querySelector('.sc-amount').value);
        const term = Number(card.querySelector('.sc-term').value);
        const rate = parseFloat(card.querySelector('.sc-rate').value);

        if (!Number.isFinite(amount) || amount < 50000 || amount > 100000000) {
            showNotification(`Сценарий ${idx + 1}: сумма от 50 000 до 100 000 000 ₽`, 'error');
            hasError = true;
        }
        if (!Number.isInteger(term) || term < 1 || term > 50) {
            showNotification(`Сценарий ${idx + 1}: срок от 1 до 50 лет`, 'error');
            hasError = true;
        }
        if (!Number.isFinite(rate) || rate < 0.1 || rate > 100) {
            showNotification(`Сценарий ${idx + 1}: ставка от 0.1 до 100%`, 'error');
            hasError = true;
        }
    });
    if (hasError) return;

    const scenarios = [];
    cards.forEach((card, idx) => {
        const amount = parseFloat(card.querySelector('.sc-amount').value);
        const termYears = Number(card.querySelector('.sc-term').value);
        const rate = parseFloat(card.querySelector('.sc-rate').value);
        const type = card.querySelector('.sc-type').value;

        const monthlyRate = rate / 100 / 12;
        const months = termYears * 12;
        let monthlyPayment = 0;
        let totalInterest = 0;

        if (type === 'annuity') {
            const coef = (monthlyRate * Math.pow(1 + monthlyRate, months)) /
                        (Math.pow(1 + monthlyRate, months) - 1);
            monthlyPayment = amount * coef;
            totalInterest = monthlyPayment * months - amount;
        } else {
            const monthlyPrincipal = amount / months;
            let balance = amount;
            for (let i = 0; i < months; i++) {
                const interest = balance * monthlyRate;
                totalInterest += interest;
                balance -= monthlyPrincipal;
            }
            monthlyPayment = monthlyPrincipal + (amount * monthlyRate);
        }

        scenarios.push({
            num: idx + 1,
            amount, termYears, rate, type,
            monthlyPayment,
            totalPayment: amount + totalInterest,
            totalInterest
        });
    });

    const tbody = document.querySelector('#compareTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const rows = [
        ['Сумма кредита', ...scenarios.map(s => formatMoney(s.amount))],
        ['Срок', ...scenarios.map(s => s.termYears + ' лет')],
        ['Ставка', ...scenarios.map(s => s.rate + '%')],
        ['Тип платежа', ...scenarios.map(s => s.type === 'annuity' ? 'Аннуитетный' : 'Дифференцированный')],
        ['Первый ежемесячный платёж', ...scenarios.map(s => formatMoney(s.monthlyPayment))],
        ['Общая сумма выплат', ...scenarios.map(s => formatMoney(s.totalPayment))],
        ['Переплата', ...scenarios.map(s => formatMoney(s.totalInterest))]
    ];

    rows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    const samePrincipal = scenarios.every(s => s.amount === scenarios[0].amount);
    const resultHint = document.getElementById('scenarioResultHint');
    if (samePrincipal) {
        const best = scenarios.reduce((a, b) => a.totalPayment < b.totalPayment ? a : b);
        showNotification(`Наименьшая сумма выплат — у сценария №${best.num}`, 'success');
        if (resultHint) resultHint.textContent =
            `При одинаковой сумме кредита наименьшая расчётная сумма выплат — у сценария №${best.num}. Это сравнение не учитывает страховку, комиссии и изменение ставки.`;
    } else {
        showNotification('Сценарии рассчитаны; суммы кредита различаются', 'info');
        if (resultHint) resultHint.textContent =
            'Суммы кредита различаются, поэтому нельзя корректно назвать один вариант самым выгодным только по общей сумме выплат. Для прямого сравнения задайте одинаковую сумму.';
    }

    const canvas = document.getElementById('compareChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (compareChart) compareChart.destroy();

    const isDark = document.body.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(31,27,20,0.06)';
    const textColor = isDark ? '#c9bfa9' : '#4a4234';

    compareChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: scenarios.map(s => `Сценарий ${s.num}`),
            datasets: [
                { label: 'Основной долг', data: scenarios.map(s => s.amount), backgroundColor: '#1b4d3a' },
                { label: 'Переплата', data: scenarios.map(s => s.totalInterest), backgroundColor: '#c9a961' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true, ticks: { color: textColor }, grid: { color: gridColor } },
                y: { stacked: true, title: { display: true, text: 'Сумма (₽)', color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } }
            },
            plugins: { legend: { position: 'bottom', labels: { color: textColor } } }
        }
    });

    const box = document.getElementById('compareResults');
    if (box) box.style.display = 'block';
}

// ==================== СОХРАНЕНИЕ ====================
function saveCalculation() {
    if (!lastCalculation.principal) {
        showNotification('Сначала выполните расчёт', 'error');
        return;
    }

    const enteredName = prompt('Название расчёта:', `Расчёт от ${new Date().toLocaleDateString('ru-RU')}`);
    if (enteredName === null) return;
    const name = enteredName.trim();
    if (!name) {
        showNotification('Введите название расчёта', 'error');
        return;
    }

    const saved = JSON.parse(localStorage.getItem('mortgageCalculations') || '[]');
    saved.push({
        id: Date.now(),
        name: name,
        date: new Date().toLocaleString('ru-RU'),
        data: { ...lastCalculation }
    });

    localStorage.setItem('mortgageCalculations', JSON.stringify(saved));
    loadSavedCalculations();
    showNotification('Расчёт сохранён', 'success');
}

function loadSavedCalculations() {
    const saved = JSON.parse(localStorage.getItem('mortgageCalculations') || '[]');
    const container = document.getElementById('savedContainer');
    if (!container) return;
    container.innerHTML = '';

    if (saved.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:2rem;">Нет сохранённых расчётов</p>';
        return;
    }

    saved.forEach(item => {
        const div = document.createElement('div');
        div.className = 'saved-item';
        const info = document.createElement('div');
        info.className = 'saved-info';
        const title = document.createElement('h4');
        title.textContent = item.name;
        const date = document.createElement('p');
        date.textContent = `Дата: ${item.date}`;
        const details = document.createElement('p');
        details.textContent = `Стоимость жилья: ${formatMoney(item.data.loanAmount)} · Сумма кредита: ${formatMoney(item.data.principal)} · Срок: ${item.data.loanTermYears} лет · Ставка: ${item.data.interestRate}%`;
        const payment = document.createElement('p');
        payment.textContent = `Платёж: ${formatMoney(item.data.monthlyPayment)}`;
        info.append(title, date, details, payment);

        const actions = document.createElement('div');
        actions.className = 'saved-actions';
        const loadButton = document.createElement('button');
        loadButton.className = 'btn-load';
        loadButton.type = 'button';
        loadButton.textContent = 'Загрузить';
        loadButton.addEventListener('click', () => loadCalculation(item.id));
        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn-delete';
        deleteButton.type = 'button';
        deleteButton.textContent = 'Удалить';
        deleteButton.addEventListener('click', () => deleteCalculation(item.id));
        actions.append(loadButton, deleteButton);
        div.append(info, actions);
        container.appendChild(div);
    });
}

function loadCalculation(id) {
    const saved = JSON.parse(localStorage.getItem('mortgageCalculations') || '[]');
    const item = saved.find(s => s.id === id);
    if (!item) return;

    document.getElementById('loanAmount').value = item.data.loanAmount;
    document.getElementById('loanTerm').value = item.data.loanTermYears;
    document.getElementById('interestRate').value = item.data.interestRate;
    document.getElementById('downPayment').value = item.data.downPayment;
    document.getElementById('paymentType').value = item.data.paymentType;
    if (item.data.startDate) document.getElementById('startDate').value = item.data.startDate;

    const seg = document.getElementById('paymentTypeSegmented');
    if (seg) {
        seg.querySelectorAll('.segmented-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.value === item.data.paymentType);
        });
    }

    calculateMortgage();
    switchTab('calculator');
    showNotification('Расчёт загружен', 'success');
}

function deleteCalculation(id) {
    if (!confirm('Удалить этот расчёт?')) return;
    let saved = JSON.parse(localStorage.getItem('mortgageCalculations') || '[]');
    saved = saved.filter(s => s.id !== id);
    localStorage.setItem('mortgageCalculations', JSON.stringify(saved));
    loadSavedCalculations();
    showNotification('Расчёт удалён', 'info');
}

function clearSaved() {
    if (!confirm('Удалить все сохранённые расчёты?')) return;
    localStorage.removeItem('mortgageCalculations');
    loadSavedCalculations();
    showNotification('Все расчёты удалены', 'info');
}