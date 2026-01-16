import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, addDoc, query, orderBy, serverTimestamp, where, writeBatch, increment } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCC_extnva4tzETKgInxCp1eBkCvU5YMH8",
    authDomain: "motherhomesolarwarehouseerp.firebaseapp.com",
    projectId: "motherhomesolarwarehouseerp",
    storageBucket: "motherhomesolarwarehouseerp.firebasestorage.app",
    messagingSenderId: "465177516115",
    appId: "1:465177516115:web:3c01d9171a8be67d548ea6",
    measurementId: "G-3DFLEEJM7V"
};

let app, auth, db;
let currentUser = null;
let accounts = []; // Local Cache for CoA
let staffList = [];
let projectList = [];

async function initApp() {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    } catch (e) {
        console.error("Firebase Init Error:", e);
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            document.getElementById('authContainer').classList.add('hidden');
            document.getElementById('appContainer').classList.remove('hidden');
            document.getElementById('userEmailDisplay').innerText = user.email;
            
            // Expose functions to window for HTML onclick events
            window.handleLogout = () => signOut(auth);
            window.showView = showView;
            window.loadDashboard = loadDashboard;
            window.openAccountModal = openAccountModal;
            window.saveAccount = saveAccount;
            
            // Journal
            window.openJournalModal = openJournalModal;
            window.addJvRow = addJvRow;
            window.saveJournalEntry = saveJournalEntry;
            window.calcJvTotals = calcJvTotals;

            // New Modules
            window.openStaffModal = openStaffModal;
            window.saveStaff = saveStaff;
            window.openProjectModal = openProjectModal;
            window.saveProject = saveProject;
            window.loadPayroll = loadPayroll;
            window.processSalary = processSalary;
            window.openExpenseModal = openExpenseModal;
            window.toggleExpType = toggleExpType;
            window.saveExpense = saveExpense;

            await loadCoA();
            await loadProjects(); // Load projects for dropdowns
            loadDashboard();
        } else {
            document.getElementById('authContainer').classList.remove('hidden');
            document.getElementById('appContainer').classList.add('hidden');
            currentUser = null;
        }
    });
}

// --- AUTH ---
window.handleLogin = async () => {
    const e = document.getElementById('loginEmail').value;
    const p = document.getElementById('loginPass').value;
    try { await signInWithEmailAndPassword(auth, e, p); } 
    catch(err) { alert("Login Failed: " + err.message); }
}

// --- NAVIGATION ---
function showView(viewId) {
    ['dashboardView', 'coaView', 'journalView', 'ledgerView', 'reportsView', 'staffView', 'projectView', 'payrollView'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    
    const target = document.getElementById(viewId);
    if(target) target.classList.remove('hidden');
    
    // Active Nav State
    if(viewId === 'dashboardView') document.getElementById('nav-dashboard').classList.add('active');
    if(viewId === 'coaView') document.getElementById('nav-coa').classList.add('active');
    if(viewId === 'staffView') { document.getElementById('nav-staff').classList.add('active'); loadStaff(); }
    if(viewId === 'projectView') { document.getElementById('nav-project').classList.add('active'); loadProjects(); }
    if(viewId === 'payrollView') { document.getElementById('nav-payroll').classList.add('active'); loadPayroll(); }
    if(viewId === 'journalView') {
        document.getElementById('nav-journal').classList.add('active');
        loadJournals();
    }
    if(viewId === 'reportsView') {
        document.getElementById('nav-reports').classList.add('active');
        generateReports();
    }
}

// --- CHART OF ACCOUNTS ---
async function loadCoA() {
    const q = query(collection(db, "chart_of_accounts"), orderBy("code"));
    const snap = await getDocs(q);
    accounts = [];
    const tbody = document.getElementById('coaTableBody');
    if(tbody) tbody.innerHTML = '';

    snap.forEach(d => {
        const acc = { id: d.id, ...d.data() };
        accounts.push(acc);
        if(tbody) {
            tbody.innerHTML += `
                <tr>
                    <td class="fw-bold">${acc.code}</td>
                    <td>${acc.name}</td>
                    <td><span class="badge bg-light text-dark border">${acc.type}</span></td>
                    <td class="fw-bold text-end">${(acc.balance || 0).toLocaleString()}</td>
                    <td class="text-end"><button class="btn btn-sm btn-outline-primary">Edit</button></td>
                </tr>
            `;
        }
    });
}

function openAccountModal() {
    // Inject Modal if missing
    if(!document.getElementById('accountModal')) {
        const modalHtml = `
        <div class="modal fade" id="accountModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Add Account</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label small fw-bold">Account Code</label>
                            <input type="text" id="newAccCode" class="form-control" placeholder="e.g. 1001">
                        </div>
                        <div class="mb-3">
                            <label class="form-label small fw-bold">Account Name</label>
                            <input type="text" id="newAccName" class="form-control" placeholder="e.g. Cash on Hand">
                        </div>
                        <div class="mb-3">
                            <label class="form-label small fw-bold">Type</label>
                            <select id="newAccType" class="form-select">
                                <option value="Asset">Asset</option>
                                <option value="Liability">Liability</option>
                                <option value="Equity">Equity</option>
                                <option value="Income">Income</option>
                                <option value="Expense">Expense</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="saveAccount()">Save Account</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    new bootstrap.Modal(document.getElementById('accountModal')).show();
}

async function saveAccount() {
    const code = document.getElementById('newAccCode').value;
    const name = document.getElementById('newAccName').value;
    const type = document.getElementById('newAccType').value;
    
    if(!code || !name) return alert("Code and Name are required");
    
    try {
        await addDoc(collection(db, "chart_of_accounts"), {
            code, name, type, balance: 0, createdAt: serverTimestamp()
        });
        bootstrap.Modal.getInstance(document.getElementById('accountModal')).hide();
        loadCoA();
    } catch(e) {
        console.error(e);
        alert("Error saving account: " + e.message);
    }
}

// --- JOURNAL ENTRIES ---
async function loadJournals() {
    const tbody = document.getElementById('journalTableBody');
    if(!tbody) return;
    
    const q = query(collection(db, "journal_entries"), orderBy("date", "desc"));
    const snap = await getDocs(q);
    tbody.innerHTML = '';
    
    snap.forEach(d => {
        const j = d.data();
        tbody.innerHTML += `
            <tr>
                <td>${j.date}</td>
                <td class="fw-bold text-primary">${j.ref}</td>
                <td>${j.desc}</td>
                <td>${(j.totalAmount || 0).toLocaleString()}</td>
                <td class="text-end"><button class="btn btn-sm btn-light border">View</button></td>
            </tr>
        `;
    });
}

function openJournalModal() {
    document.getElementById('jvDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('jvRef').value = "JV-" + Date.now().toString().slice(-6);
    document.getElementById('jvDesc').value = "";
    document.getElementById('jvRows').innerHTML = "";
    addJvRow();
    addJvRow();
    new bootstrap.Modal(document.getElementById('journalModal')).show();
}

function addJvRow() {
    const tbody = document.getElementById('jvRows');
    let options = '<option value="">Select Account...</option>';
    accounts.forEach(a => {
        options += `<option value="${a.id}">${a.code} - ${a.name}</option>`;
    });
    
    const row = `
        <tr>
            <td><select class="form-select form-select-sm jv-acc">${options}</select></td>
            <td><input type="number" class="form-control form-control-sm jv-dr" placeholder="0" onchange="calcJvTotals()"></td>
            <td><input type="number" class="form-control form-control-sm jv-cr" placeholder="0" onchange="calcJvTotals()"></td>
            <td><button class="btn btn-sm text-danger" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button></td>
        </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', row);
}

function calcJvTotals() {
    // Optional: Add visual total calculation here
}

async function saveJournalEntry() {
    const date = document.getElementById('jvDate').value;
    const ref = document.getElementById('jvRef').value;
    const desc = document.getElementById('jvDesc').value;
    
    const rows = document.querySelectorAll('#jvRows tr');
    const lines = [];
    let totalDr = 0;
    let totalCr = 0;
    
    rows.forEach(r => {
        const accId = r.querySelector('.jv-acc').value;
        const dr = parseFloat(r.querySelector('.jv-dr').value) || 0;
        const cr = parseFloat(r.querySelector('.jv-cr').value) || 0;
        if(accId && (dr > 0 || cr > 0)) {
            lines.push({ accId, dr, cr });
            totalDr += dr;
            totalCr += cr;
        }
    });
    
    if(lines.length < 2) return alert("At least 2 lines required");
    if(Math.abs(totalDr - totalCr) > 1) return alert(`Unbalanced! Dr: ${totalDr}, Cr: ${totalCr}`);
    
    try {
        const batch = writeBatch(db);
        
        // 1. Create Journal
        const jvRef = doc(collection(db, "journal_entries"));
        batch.set(jvRef, {
            date, ref, desc, totalAmount: totalDr, lines, 
            createdAt: serverTimestamp(), createdBy: currentUser.email
        });
        
        // 2. Update Balances
        for(const line of lines) {
            const acc = accounts.find(a => a.id === line.accId);
            if(acc) {
                let change = 0;
                // Asset/Expense: Dr (+), Cr (-)
                // Liability/Equity/Income: Cr (+), Dr (-)
                if(['Asset', 'Expense'].includes(acc.type)) {
                    change = line.dr - line.cr;
                } else {
                    change = line.cr - line.dr;
                }
                
                const accRef = doc(db, "chart_of_accounts", line.accId);
                batch.update(accRef, { balance: increment(change) });
            }
        }
        
        await batch.commit();
        bootstrap.Modal.getInstance(document.getElementById('journalModal')).hide();
        alert("Journal Posted!");
        loadCoA();
        loadJournals();
        loadDashboard();
    } catch(e) {
        console.error(e);
        alert("Error posting journal: " + e.message);
    }
}

// --- STAFF MANAGEMENT ---
async function loadStaff() {
    const q = query(collection(db, "staff"), orderBy("name"));
    const snap = await getDocs(q);
    staffList = [];
    const tbody = document.getElementById('staffTableBody');
    if(tbody) tbody.innerHTML = '';

    snap.forEach(d => {
        const s = { id: d.id, ...d.data() };
        staffList.push(s);
        if(tbody) {
            tbody.innerHTML += `
                <tr>
                    <td class="fw-bold">${s.name}</td>
                    <td>${s.role}</td>
                    <td>${(s.baseSalary||0).toLocaleString()}</td>
                    <td>${(s.otRate||0).toLocaleString()}</td>
                    <td><span class="badge bg-success">Active</span></td>
                    <td class="text-end"><button class="btn btn-sm btn-outline-primary" onclick="openStaffModal('${s.id}')">Edit</button></td>
                </tr>`;
        }
    });
}

function openStaffModal(id=null) {
    document.getElementById('staffId').value = id || '';
    if(id) {
        const s = staffList.find(x => x.id === id);
        document.getElementById('staffName').value = s.name;
        document.getElementById('staffRole').value = s.role;
        document.getElementById('staffSalary').value = s.baseSalary;
        document.getElementById('staffOT').value = s.otRate;
    } else {
        document.getElementById('staffName').value = '';
        document.getElementById('staffSalary').value = '';
        document.getElementById('staffOT').value = '';
    }
    new bootstrap.Modal(document.getElementById('staffModal')).show();
}

async function saveStaff() {
    const id = document.getElementById('staffId').value;
    const data = {
        name: document.getElementById('staffName').value,
        role: document.getElementById('staffRole').value,
        baseSalary: parseFloat(document.getElementById('staffSalary').value) || 0,
        otRate: parseFloat(document.getElementById('staffOT').value) || 0
    };
    
    if(id) await updateDoc(doc(db, "staff", id), data);
    else await addDoc(collection(db, "staff"), data);
    
    bootstrap.Modal.getInstance(document.getElementById('staffModal')).hide();
    loadStaff();
}

// --- PROJECT MANAGEMENT ---
async function loadProjects() {
    const q = query(collection(db, "projects"), orderBy("startDate", "desc"));
    const snap = await getDocs(q);
    projectList = [];
    const tbody = document.getElementById('projectTableBody');
    const select = document.getElementById('expProject');
    if(tbody) tbody.innerHTML = '';
    if(select) select.innerHTML = '<option value="">-- Choose Job Order --</option>';

    snap.forEach(d => {
        const p = { id: d.id, ...d.data() };
        projectList.push(p);
        
        // Calculate Net Profit (Revenue - Expenses)
        const profit = (p.contractValue || 0) - (p.totalExpenses || 0);
        const profitColor = profit >= 0 ? 'text-success' : 'text-danger';

        if(tbody) {
            tbody.innerHTML += `
                <tr>
                    <td class="fw-bold text-primary">${p.jobId}</td>
                    <td>${p.clientName}</td>
                    <td>${p.startDate}</td>
                    <td>${(p.contractValue||0).toLocaleString()}</td>
                    <td><span class="badge bg-info text-dark">${p.status}</span></td>
                    <td class="fw-bold ${profitColor}">${profit.toLocaleString()}</td>
                    <td class="text-end"><button class="btn btn-sm btn-outline-primary" onclick="openProjectModal('${p.id}')">Edit</button></td>
                </tr>`;
        }
        if(select && p.status === 'Active') {
            select.innerHTML += `<option value="${p.id}">${p.jobId} - ${p.clientName}</option>`;
        }
    });
}

function openProjectModal(id = null) {
    document.getElementById('projectIdHidden').value = id || '';
    if (id) {
        const p = projectList.find(x => x.id === id);
        document.getElementById('projId').value = p.jobId;
        document.getElementById('projClient').value = p.clientName;
        document.getElementById('projValue').value = p.contractValue;
        document.getElementById('projDate').value = p.startDate;
        document.getElementById('projStatus').value = p.status;
        document.querySelector('#projectModal .modal-title').innerText = "Edit Project";
    } else {
        document.getElementById('projId').value = 'JOB-' + new Date().getFullYear() + '-';
        document.getElementById('projClient').value = '';
        document.getElementById('projValue').value = '';
        document.getElementById('projDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('projStatus').value = 'Active';
        document.querySelector('#projectModal .modal-title').innerText = "New Project";
    }
    new bootstrap.Modal(document.getElementById('projectModal')).show();
}

async function saveProject() {
    const id = document.getElementById('projectIdHidden').value;
    const data = {
        jobId: document.getElementById('projId').value,
        clientName: document.getElementById('projClient').value,
        contractValue: parseFloat(document.getElementById('projValue').value) || 0,
        startDate: document.getElementById('projDate').value,
        status: document.getElementById('projStatus').value
    };
    
    if (id) {
        await updateDoc(doc(db, "projects", id), data);
    } else {
        data.totalExpenses = 0;
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "projects"), data);
    }
    bootstrap.Modal.getInstance(document.getElementById('projectModal')).hide();
    loadProjects();
}

// --- EXPENSE MODULE ---
function openExpenseModal() {
    toggleExpType();
    new bootstrap.Modal(document.getElementById('expenseModal')).show();
}

function toggleExpType() {
    const isProject = document.getElementById('expTypeProject').checked;
    const projDiv = document.getElementById('projectSelectDiv');
    const catSelect = document.getElementById('expCategory');
    
    if(isProject) {
        projDiv.classList.remove('hidden');
        catSelect.innerHTML = `
            <option>Materials</option>
            <option>Site Advance</option>
            <option>Labour Charges</option>
            <option>Transport / Logistics</option>
        `;
    } else {
        projDiv.classList.add('hidden');
        catSelect.innerHTML = `
            <option>Office Rent</option>
            <option>Utilities (Elec/Water)</option>
            <option>Internet / Phone</option>
            <option>Office Food / Welfare</option>
            <option>General / Maintenance</option>
            <option>Salary</option>
        `;
    }
}

async function saveExpense() {
    const isProject = document.getElementById('expTypeProject').checked;
    const projectId = document.getElementById('expProject').value;
    const category = document.getElementById('expCategory').value;
    const amount = parseFloat(document.getElementById('expAmount').value) || 0;
    const desc = document.getElementById('expDesc').value;
    const creditAcc = document.getElementById('expCreditAcc').value; // Cash or Bank
    
    if(isProject && !projectId) return alert("Please select a project");
    if(amount <= 0) return alert("Invalid amount");

    try {
        const batch = writeBatch(db);
        
        // 1. Create Journal Entry (Expense Dr, Cash/Bank Cr)
        // Note: In a real app, we'd look up Account IDs. Here we simulate.
        const jvRef = doc(collection(db, "journal_entries"));
        batch.set(jvRef, {
            date: new Date().toISOString().split('T')[0],
            ref: "EXP-" + Date.now().toString().slice(-6),
            desc: `${category} - ${desc} ${isProject ? '(Project)' : '(Office)'}`,
            totalAmount: amount,
            projectId: isProject ? projectId : null,
            category: category,
            createdAt: serverTimestamp()
        });

        // 2. Update Project Expense Total if applicable
        if(isProject) {
            const projRef = doc(db, "projects", projectId);
            batch.update(projRef, { totalExpenses: increment(amount) });
        }

        // 3. Update Cash/Bank Balance (Simulated Account Update)
        // Find Cash or Bank account in loaded accounts
        const cashAcc = accounts.find(a => a.name.includes(creditAcc));
        if(cashAcc) {
            const accRef = doc(db, "chart_of_accounts", cashAcc.id);
            batch.update(accRef, { balance: increment(-amount) }); // Credit Asset = Decrease
        }

        await batch.commit();
        bootstrap.Modal.getInstance(document.getElementById('expenseModal')).hide();
        alert("Expense Recorded!");
        loadDashboard();
        loadProjects();
    } catch(e) {
        console.error(e);
        alert("Error: " + e.message);
    }
}

// --- PAYROLL SYSTEM ---
async function loadPayroll() {
    if(staffList.length === 0) await loadStaff();
    const month = document.getElementById('payrollMonth').value || new Date().toISOString().slice(0,7);
    
    // Check existing payroll logs for this month
    const q = query(collection(db, "payroll_logs"), where("month", "==", month));
    const snap = await getDocs(q);
    const paidStaffIds = snap.docs.map(d => d.data().staffId);

    const tbody = document.getElementById('payrollTableBody');
    tbody.innerHTML = '';

    staffList.forEach(s => {
        const isPaid = paidStaffIds.includes(s.id);
        const statusBadge = isPaid ? '<span class="badge bg-success">Paid</span>' : '<span class="badge bg-warning text-dark">Pending</span>';
        const actionBtn = isPaid 
            ? `<button class="btn btn-sm btn-secondary" disabled>Paid</button>` 
            : `<button class="btn btn-sm btn-success" onclick="processSalary('${s.id}')">Pay Salary</button>`;
        
        // Input for OT
        const otInput = isPaid ? '-' : `<input type="number" id="ot_${s.id}" class="form-control form-control-sm" style="width:80px" placeholder="0" onchange="calcSalary('${s.id}', ${s.baseSalary}, ${s.otRate})">`;
        const totalDisplay = `<span id="total_${s.id}" class="fw-bold">${s.baseSalary.toLocaleString()}</span>`;

        tbody.innerHTML += `
            <tr>
                <td>${s.name}</td>
                <td>${s.baseSalary.toLocaleString()}</td>
                <td>${otInput}</td>
                <td id="otAmt_${s.id}">0</td>
                <td>${totalDisplay}</td>
                <td>${statusBadge}</td>
                <td class="text-end">${actionBtn}</td>
            </tr>
        `;
    });
}

window.calcSalary = (id, base, rate) => {
    const otHrs = parseFloat(document.getElementById(`ot_${id}`).value) || 0;
    const otAmt = otHrs * rate;
    const total = base + otAmt;
    document.getElementById(`otAmt_${id}`).innerText = otAmt.toLocaleString();
    document.getElementById(`total_${id}`).innerText = total.toLocaleString();
}

async function processSalary(staffId) {
    if(!confirm("Confirm Pay Salary? This will deduct from Cash.")) return;
    
    const s = staffList.find(x => x.id === staffId);
    const otHrs = parseFloat(document.getElementById(`ot_${staffId}`).value) || 0;
    const total = s.baseSalary + (otHrs * s.otRate);
    const month = document.getElementById('payrollMonth').value;

    try {
        const batch = writeBatch(db);
        
        // 1. Log Payroll
        const logRef = doc(collection(db, "payroll_logs"));
        batch.set(logRef, {
            staffId, name: s.name, month, 
            base: s.baseSalary, ot: otHrs * s.otRate, total,
            paidAt: serverTimestamp()
        });

        // 2. Create Expense Transaction (Office Overhead)
        const jvRef = doc(collection(db, "journal_entries"));
        batch.set(jvRef, {
            date: new Date().toISOString().split('T')[0],
            ref: "PAY-" + Date.now().toString().slice(-6),
            desc: `Salary - ${s.name} (${month})`,
            totalAmount: total,
            category: "Salary",
            createdAt: serverTimestamp()
        });

        // 3. Deduct Cash (Simulated)
        const cashAcc = accounts.find(a => a.name.includes("Cash"));
        if(cashAcc) {
            const accRef = doc(db, "chart_of_accounts", cashAcc.id);
            batch.update(accRef, { balance: increment(-total) });
        }

        await batch.commit();
        alert("Salary Paid!");
        loadPayroll();
        loadDashboard();
    } catch(e) {
        console.error(e);
        alert("Error: " + e.message);
    }
}

// --- DASHBOARD & REPORTS ---
async function loadDashboard() {
    let cash = 0, bank = 0, ar = 0;
    let totalRevenue = 0;
    let totalExpenses = 0;
    
    // 1. Calculate Cash/Bank from Accounts
    accounts.forEach(a => {
        const name = a.name.toLowerCase();
        if(name.includes('cash')) cash += a.balance;
        if(name.includes('bank')) bank += a.balance;
        if(name.includes('receivable')) ar += a.balance;
    });
    
    // 2. Calculate Revenue from Projects
    if(projectList.length === 0) await loadProjects();
    projectList.forEach(p => {
        totalRevenue += (p.contractValue || 0);
        totalExpenses += (p.totalExpenses || 0);
    });

    // 3. Add Office Expenses (from Journals where projectId is null)
    // Note: For a real app, we'd query this. Here we estimate or fetch recent.
    // For simplicity in this prototype, we'll rely on the 'totalExpenses' accumulated in projects 
    // plus a separate query for office expenses if needed. 
    // Let's just sum all Journal Entries with category 'Salary' or 'Office' for the dashboard card.
    const qExp = query(collection(db, "journal_entries")); // In prod, limit this
    const snapExp = await getDocs(qExp);
    let officeExp = 0;
    snapExp.forEach(d => {
        const t = d.data();
        if(!t.projectId) officeExp += (t.totalAmount || 0);
    });

    const grandTotalExp = totalExpenses + officeExp;
    const netProfit = totalRevenue - grandTotalExp;

    if(document.getElementById('dashCash')) document.getElementById('dashCash').innerText = cash.toLocaleString() + " MMK";
    if(document.getElementById('dashNetProfit')) document.getElementById('dashNetProfit').innerText = netProfit.toLocaleString() + " MMK";
    if(document.getElementById('dashAR')) document.getElementById('dashAR').innerText = ar.toLocaleString() + " MMK";
    if(document.getElementById('dashTotalExp')) document.getElementById('dashTotalExp').innerText = grandTotalExp.toLocaleString() + " MMK";
}

function generateReports() {
    // Simple P&L Generation
    let income = 0, expense = 0;
    let html = '<table class="table table-sm"><tbody>';
    
    html += '<tr class="table-light fw-bold"><td colspan="2">INCOME</td></tr>';
    accounts.filter(a => a.type === 'Income').forEach(a => {
        income += a.balance;
        html += `<tr><td>${a.name}</td><td class="text-end">${a.balance.toLocaleString()}</td></tr>`;
    });
    html += `<tr class="fw-bold"><td>TOTAL INCOME</td><td class="text-end">${income.toLocaleString()}</td></tr>`;
    
    html += '<tr class="table-light fw-bold"><td colspan="2">EXPENSES</td></tr>';
    accounts.filter(a => a.type === 'Expense').forEach(a => {
        expense += a.balance;
        html += `<tr><td>${a.name}</td><td class="text-end">${a.balance.toLocaleString()}</td></tr>`;
    });
    html += `<tr class="fw-bold"><td>TOTAL EXPENSES</td><td class="text-end">${expense.toLocaleString()}</td></tr>`;
    
    const net = income - expense;
    const color = net >= 0 ? 'text-success' : 'text-danger';
    html += `<tr class="table-dark fw-bold"><td>NET PROFIT/LOSS</td><td class="text-end ${color}">${net.toLocaleString()}</td></tr>`;
    
    html += '</tbody></table>';
    document.getElementById('plContent').innerHTML = html;
}

initApp();