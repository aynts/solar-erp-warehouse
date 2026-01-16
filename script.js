import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, addDoc, deleteDoc, query, orderBy, serverTimestamp, limit, where, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- HARDCODED CONFIGURATION ---
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
let currentUserRole = 'staff'; // default
let inventory = [];
let parties = [];
let systemUsers = [];
let currentCategoryFilter = 'All';
let isInventoryLoaded = false; // CACHE FLAG
let currentCalendarDate = new Date(); // For Calendar
let isTransactionProcessing = false; // Prevent double entry

// --- DYNAMIC FIELD CONFIGURATION ---
const categoryFieldConfig = {
    'Solar': [
        { id: 'spec_watt', label: 'Wattage', placeholder: 'e.g. 590W' },
        { id: 'spec_type', label: 'Type', placeholder: 'e.g. Monofacial' }
    ],
    'Battery': [
        { id: 'spec_volt', label: 'Voltage', placeholder: 'e.g. 51.2V' },
        { id: 'spec_amp', label: 'Capacity', placeholder: 'e.g. 304AH' },
        { id: 'spec_chem', label: 'Type', placeholder: 'e.g. Lithium/Gel' }
    ],
    'Inverter': [
        { id: 'spec_power', label: 'Power', placeholder: 'e.g. 6kw' },
        { id: 'spec_phase', label: 'Phase', placeholder: 'e.g. Single Phase' },
        { id: 'spec_type', label: 'Type', placeholder: 'e.g. Hybrid' }
    ],
    'Solar Pumps': [
        { id: 'spec_power', label: 'Power/HP', placeholder: 'e.g. 2HP' },
        { id: 'spec_head', label: 'Max Head', placeholder: 'e.g. 100m' },
        { id: 'spec_flow', label: 'Flow Rate', placeholder: 'e.g. 5 m3/h' }
    ],
    'Solar Controllers': [
        { id: 'spec_amp', label: 'Amps', placeholder: 'e.g. 60A' },
        { id: 'spec_volt', label: 'System Voltage', placeholder: 'e.g. 12/24/48V' },
        { id: 'spec_type', label: 'Type', placeholder: 'e.g. MPPT' }
    ],
    'All-in-One': [
        { id: 'spec_inv', label: 'Inverter Output', placeholder: 'e.g. 3KW' },
        { id: 'spec_batt', label: 'Battery Capacity', placeholder: 'e.g. 2.5kWh' }
    ],
    'Powerstations': [
        { id: 'spec_cap', label: 'Capacity', placeholder: 'e.g. 1024Wh' },
        { id: 'spec_out', label: 'AC Output', placeholder: 'e.g. 1200W' }
    ],
    'Audio Systems': [
        { id: 'spec_watt', label: 'Output Power', placeholder: 'e.g. 100W' },
        { id: 'spec_type', label: 'Type', placeholder: 'e.g. Solar Speaker' }
    ],
    'AC Accessories': [
        { id: 'spec_amp', label: 'Amps', placeholder: 'e.g. 32A' },
        { id: 'spec_type', label: 'Type', placeholder: 'e.g. AC Breaker' }
    ],
    'DC Accessories': [
        { id: 'spec_amp', label: 'Amps', placeholder: 'e.g. 63A' },
        { id: 'spec_type', label: 'Type', placeholder: 'e.g. DC Fuse' }
    ],
    'Breaker Box': [
        { id: 'spec_way', label: 'Ways', placeholder: 'e.g. 12 Way' },
        { id: 'spec_type', label: 'Type', placeholder: 'e.g. Combiner Box' }
    ],
    'Cables and Wiring Accessories': [
        { id: 'spec_size', label: 'Size', placeholder: 'e.g. 4mm' },
        { id: 'spec_core', label: 'Core', placeholder: 'e.g. 1 Core' },
        { id: 'spec_color', label: 'Color', placeholder: 'e.g. Red' }
    ],
    'Earthing System Kit': [
        { id: 'spec_mat', label: 'Material', placeholder: 'e.g. Copper' },
        { id: 'spec_dim', label: 'Dimension', placeholder: 'e.g. 1.5m Rod' }
    ],
    'Rack Accessories': [
        { id: 'spec_mat', label: 'Material', placeholder: 'e.g. Aluminum' },
        { id: 'spec_type', label: 'Type', placeholder: 'e.g. Rail/Clamp' }
    ],
    'Generic Items': [
        { id: 'spec_type', label: 'Type', placeholder: 'e.g. General' },
        { id: 'spec_desc', label: 'Description', placeholder: 'e.g. Consumable' }
    ],
    // Default fallback
    'default': [
        { id: 'spec_detail', label: 'Specification', placeholder: 'General Spec' }
    ]
};

async function initApp() {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    } catch (e) {
        console.error("Firebase Initialization Error:", e);
        alert("Error connecting to database. See console.");
        return;
    }
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            toggleLoading(true);
            currentUser = user;
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    currentUserRole = userDoc.data().role;
                } else {
                    // Auto-create doc for existing auth user if missing in DB (e.g. after DB reset)
                    let role = 'staff';
                    if(user.email === 'thetswe.it@gmail.com') role = 'superadmin';
                    else if(user.email === 'motherhomesolar@gmail.com') role = 'admin';
                    
                    await setDoc(doc(db, "users", user.uid), {
                        email: user.email,
                        role: role,
                        createdAt: serverTimestamp()
                    });
                    currentUserRole = role;
                }
            } catch(err) {
                console.error("Role fetch error", err);
                currentUserRole = 'staff';
            }
            
            setupUIForUser(user.email, currentUserRole);
            document.getElementById('authContainer').classList.add('hidden');
            document.getElementById('appContainer').classList.remove('hidden');
            
            // Initialize global functions
            window.loadInventory = loadInventory;
            window.loadFlow = loadFlow;
            window.loadDashboard = loadDashboard;
            window.changeCalendarMonth = changeCalendarMonth;
            window.loadProjectUsage = loadProjectUsage;
            window.generateNextCode = generateNextCode; 
            window.fetchSystemUsers = fetchSystemUsers;
            window.exportPartiesCSV = exportPartiesCSV;
            window.exportInventoryPDF = exportInventoryPDF;
            window.openMovementReportModal = openMovementReportModal;
            window.generateStockMovementReport = generateStockMovementReport;
            window.openJobCostReport = openJobCostReport;
            window.openStaffReport = openStaffReport;
            window.backupDatabase = backupDatabase;
            window.printVoucherLabels = printVoucherLabels;
            window.autoFillJobDetails = autoFillJobDetails;
            window.toggleJobView = toggleJobView;
            window.printProjectSignOff = printProjectSignOff;
            window.printProjectCompletionReport = printProjectCompletionReport;
            window.openJobFromUsage = openJobFromUsage;
            window.loadProjectDashboard = loadProjectDashboard;
            window.exportProjectDashboardCSV = exportProjectDashboardCSV;
            

            // --- QR INTEGRATION ---
            window.generateQR = generateQR;
            window.printSingleQRCode = printSingleQRCode;
            window.startQRScanner = startQRScanner;
            window.handleScannedData = handleScannedData;

            // Load Data - ONE TIME ONLY
            await loadParties();
            await fetchSystemUsers();
            await loadInventory(false); // Do not force, just load
            
            // Dashboard will now load from memory via loadInventory logic

            // URL Param Check
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            const voucherId = urlParams.get('voucher');
            const projectId = urlParams.get('project');

            if (code) {
                document.getElementById('searchInput').value = code;
                filterInventory();
                const item = inventory.find(i => i.itemCode === code);
                if(item) openItemModal(item.id);
            } else if (voucherId) {
                printVoucher(voucherId);
            } else if (projectId) {
                viewPartyHistory(projectId);
            }
            
            toggleLoading(false);
        } else {
            document.getElementById('authContainer').classList.remove('hidden');
            document.getElementById('appContainer').classList.add('hidden');
            currentUser = null;
            currentUserRole = null;
        }
    });
}

// --- AUTH UI LOGIC ---
window.toggleAuthMode = (mode) => {
    document.getElementById('loginForm').classList.toggle('hidden', mode !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', mode !== 'register');
}

window.handleLogin = async () => {
    const e = document.getElementById('loginEmail').value;
    const p = document.getElementById('loginPass').value;
    try { await signInWithEmailAndPassword(auth, e, p); } 
    catch(err) { 
        console.error(err);
        if(err.code === 'auth/operation-not-allowed') {
            alert("CONFIGURATION ERROR:\n\nEmail/Password sign-in is disabled.\n\n1. Go to Firebase Console > Authentication > Sign-in method.\n2. Enable 'Email/Password'.");
        } else {
            alert("Login Error: " + err.message); 
        }
    }
}

window.handleRegister = async () => {
    const e = document.getElementById('regEmail').value;
    const p = document.getElementById('regPass').value;
    try {
        const cred = await createUserWithEmailAndPassword(auth, e, p);
        
        // Hardcoded Role Assignment on Registration
        let role = 'staff';
        if(e === 'thetswe.it@gmail.com') role = 'superadmin';
        else if(e === 'motherhomesolar@gmail.com') role = 'admin';
        else {
            const q = query(collection(db, "users"), limit(1));
            const snap = await getDocs(q);
            if(snap.empty) role = 'admin';
        }
        
        await setDoc(doc(db, "users", cred.user.uid), {
            email: e,
            role: role,
            createdAt: serverTimestamp()
        });
        alert(`Account created! Role: ${role.toUpperCase()}`);
    } catch(err) { 
        console.error(err);
        if(err.code === 'auth/operation-not-allowed') {
            alert("CONFIGURATION ERROR:\n\nEmail/Password sign-in is disabled.\n\n1. Go to Firebase Console > Authentication > Sign-in method.\n2. Enable 'Email/Password'.");
        } else {
            alert("Registration Error: " + err.message); 
        }
    }
}

window.handleLogout = () => signOut(auth);

function setupUIForUser(email, role) {
    document.getElementById('userEmailDisplay').innerText = email;
    document.getElementById('userRoleDisplay').innerText = role.toUpperCase();
    
    const isSuperAdmin = role === 'superadmin'; // NEW Check
    const isAdmin = role === 'admin' || isSuperAdmin; // Admin or Super
    
    const isProcurement = role === 'procurement' || isAdmin;
    const isWarehouse = role === 'warehouse' || isAdmin;
    const isFinance = role === 'finance' || isAdmin;
    const isAccountant = role === 'accountant' || isAdmin; // Legacy
    
    // Hide all special navs first
    document.querySelectorAll('.auth-admin-only, .auth-finance-access, .auth-procurement-access, .auth-warehouse-access, .auth-restricted-flow, .auth-create-only, .auth-price-only, .auth-superadmin-only, .auth-supplier-access, .auth-customer-access').forEach(el => el.classList.add('hidden'));

    // SuperAdmin Access
    if (isSuperAdmin) {
        document.querySelectorAll('.auth-superadmin-only').forEach(el => el.classList.remove('hidden'));
    }

    // Admin Access
    if (isAdmin) {
        document.querySelectorAll('.auth-admin-only').forEach(el => el.classList.remove('hidden'));
        document.querySelectorAll('.auth-create-only').forEach(el => el.classList.remove('hidden'));
    }

    // Procurement Access
    if (isProcurement) {
        document.querySelectorAll('.auth-procurement-access').forEach(el => el.classList.remove('hidden'));
    }

    // Warehouse Access
    if (isWarehouse) {
        document.querySelectorAll('.auth-warehouse-access').forEach(el => el.classList.remove('hidden'));
    }

    // Flow Access (Warehouse + Admin + Accountant + Finance)
    if (isWarehouse || isFinance || isAccountant) {
        document.querySelectorAll('.auth-restricted-flow').forEach(el => el.classList.remove('hidden'));
    }

    // Price & Finance Access
    if (isFinance || isAccountant) {
        document.querySelectorAll('.auth-price-only').forEach(el => el.classList.remove('hidden'));
        document.querySelectorAll('.auth-finance-access').forEach(el => el.classList.remove('hidden'));
        document.querySelectorAll('.auth-price-only-field').forEach(el => el.style.display = 'block'); 
    } else {
        document.querySelectorAll('.auth-price-only-field').forEach(el => el.style.display = 'none');
    }

    // Supplier Access (Procurement, Warehouse, Finance)
    if (isProcurement || isWarehouse || isFinance) {
        document.querySelectorAll('.auth-supplier-access').forEach(el => el.classList.remove('hidden'));
    }

    // Customer Access (Warehouse, Finance)
    if (isWarehouse || isFinance) {
        document.querySelectorAll('.auth-customer-access').forEach(el => el.classList.remove('hidden'));
    }
}

// --- VIEW LOGIC ---
window.showView = (viewId) => {
    ['inventoryView', 'financeView', 'flowView', 'usersView', 'procurementView', 'warehouseView', 'dashboardView', 'projectUsageView', 'suppliersView', 'customersView', 'jobOrderView', 'projectDashboardView'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    
    document.getElementById(viewId).classList.remove('hidden');
    
    // Map view to nav ID for active state
    if(viewId === 'dashboardView') document.getElementById('nav-dashboard').classList.add('active');
    if(viewId === 'financeView') document.getElementById('nav-finance').classList.add('active');
    if(viewId === 'inventoryView') document.getElementById('nav-inventory').classList.add('active');
    if(viewId === 'procurementView') document.getElementById('nav-procure').classList.add('active');
    if(viewId === 'warehouseView') document.getElementById('nav-warehouse').classList.add('active');
    if(viewId === 'flowView') document.getElementById('nav-flow').classList.add('active');
    if(viewId === 'projectUsageView') document.getElementById('nav-usage').classList.add('active');
    if(viewId === 'usersView') document.getElementById('nav-users').classList.add('active');
    if(viewId === 'suppliersView') document.getElementById('nav-suppliers').classList.add('active');
    if(viewId === 'customersView') document.getElementById('nav-customers').classList.add('active');
    if(viewId === 'jobOrderView') document.getElementById('nav-jobs').classList.add('active');
    if(viewId === 'projectDashboardView') document.getElementById('nav-proj-dash').classList.add('active');

    if (viewId === 'dashboardView') loadDashboard();
    if (viewId === 'financeView') loadFinanceView();
    // Pass FALSE to prevent re-fetching if data exists
    if (viewId === 'inventoryView') loadInventory(false);
    if (viewId === 'procurementView' || viewId === 'warehouseView') loadVouchers();
    if (viewId === 'flowView') loadFlow();
    if (viewId === 'projectUsageView') loadProjectUsage();
    if (viewId === 'usersView') loadUsers();
    if (viewId === 'suppliersView') loadPartiesView('supplier');
    if (viewId === 'customersView') loadPartiesView('project');
    if (viewId === 'jobOrderView') loadJobOrders();
    if (viewId === 'projectDashboardView') loadProjectDashboard();
}

// --- FINANCE LOGIC (New) ---
window.loadFinanceView = () => {
    let totalAsset = 0;
    let potentialSales = 0;
    let damagedValue = 0;
    let sortedStock = [...inventory];

    sortedStock.forEach(i => {
        const cost = Math.round(i.costPrice || 0);
        const price = Math.round(i.sellingPrice || 0);
        totalAsset += (i.balance * cost);
        potentialSales += (i.balance * price);
        damagedValue += ((i.damagedBalance || 0) * cost);
    });

    const formatMoney = (num) => Math.round(num).toLocaleString();

    document.getElementById('finTotalValue').innerText = `${formatMoney(totalAsset)} MMK`;
    document.getElementById('finPotentialSales').innerText = `${formatMoney(potentialSales)} MMK`;
    document.getElementById('finDamagedValue').innerText = `${formatMoney(damagedValue)} MMK`;

    // Top 10 High Value Items
    sortedStock.sort((a,b) => ((b.balance * (b.costPrice||0)) - (a.balance * (a.costPrice||0))));
    const tbody = document.getElementById('finHighValueTable');
    tbody.innerHTML = '';
    sortedStock.slice(0,10).forEach(i => {
        const cost = Math.round(i.costPrice || 0);
        const total = Math.round(i.balance * cost);
        tbody.innerHTML += `<tr><td>${i.brand} ${i.model}</td><td>${i.balance}</td><td>${formatMoney(cost)}</td><td class="fw-bold">${formatMoney(total)} MMK</td></tr>`;
    });
}

// --- PARTY MANAGEMENT (Suppliers & Projects) ---
async function loadParties() {
    parties = [];
    const q = query(collection(db, "parties"));
    const snap = await getDocs(q);
    
    const supList = document.getElementById('supplierList');
    const projList = document.getElementById('projectList');
    if(supList) supList.innerHTML = ''; 
    if(projList) projList.innerHTML = '';
    
    snap.forEach(d => {
        const p = d.data();
        parties.push({ id: d.id, ...p });
        const opt = document.createElement('option');
        opt.value = p.name;
        if(p.type === 'supplier') {
            if(supList) supList.appendChild(opt);
        }
        else {
            if(projList) projList.appendChild(opt);
        }
    });
}

// Load Specific View for Parties
window.loadPartiesView = (type) => {
    const tbodyId = type === 'supplier' ? 'suppliersTableBody' : 'customersTableBody';
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = '';
    
    const filtered = parties.filter(p => p.type === type);
    
    filtered.forEach(p => {
        const date = p.createdAt ? new Date(p.createdAt.seconds * 1000).toLocaleDateString() : '-';
        const contact = p.contact || '-'; 
        const address = p.address || '-';

        const actions = `
            <button class="btn btn-sm btn-outline-primary me-1" onclick="openPartyModal('${p.type}', '${p.id}')">Edit</button>
            <button class="btn btn-sm btn-outline-info" onclick="viewPartyHistory('${p.name}')">View</button>
        `;

        tbody.innerHTML += `
            <tr>
                <td class="fw-bold">${p.name}</td>
                <td>${contact}</td>
                <td class="small text-muted">${address}</td>
                <td>${date}</td>
                <td class="text-end">${actions}</td>
            </tr>
        `;
    });
}

window.exportPartiesCSV = (type) => {
    const filtered = parties.filter(p => p.type === type);
    if(filtered.length === 0) return alert("No data to export.");
    
    let csv = ["Name,Contact,Address,Added Date"];
    filtered.forEach(p => {
        const date = p.createdAt ? new Date(p.createdAt.seconds * 1000).toLocaleDateString() : '-';
        const name = `"${(p.name || '').replace(/"/g, '""')}"`;
        const contact = `"${(p.contact || '').replace(/"/g, '""')}"`;
        const address = `"${(p.address || '').replace(/"/g, '""')}"`;
        csv.push([name, contact, address, date].join(","));
    });
    
    const blob = new Blob([csv.join("\n")], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `_list_audit.csv`;
    link.click();
}

// --- SYSTEM USERS DROPDOWN ---
async function fetchSystemUsers() {
    const staffList = [
        "U Phyo", "U Kyaw Myo Thant", "Ma Zar Zar Naing", "Ma Win Lae Sandar",
        "Ma Phyo Nandar Min", "Ma Khin Nyein Chan", "Ma Khin Myo Thu",
        "Ko Ye Thu Min", "Ko Win Htet Paing", "Ko Tun Tun Naing",
        "Ko Tin Ko Ko Myint", "Ko Thet Paing Tun", "Ko Thant Zin Htwe",
        "Ko Soe Thiha", "Ko Sai Myat Min Khant", "Ko Phyo Thet Naung",
        "Ko Phyo Kyaw Kyaw", "Ko Kyaw Zaw Wai", "Ko Bo Hein",
        "Ko Aung Myo Oo", "Ko Aung Khant Zaw"
    ];

    const q = query(collection(db, "users"));
    const snap = await getDocs(q);
    const dbUsers = [];
    snap.forEach(d => dbUsers.push(d.data().email));
    
    systemUsers = [...new Set([...staffList, ...dbUsers])].sort();
    populateUserDropdowns();
}

function populateUserDropdowns() {
    const req = document.getElementById('voucherReqBy');
    const app = document.getElementById('voucherAppBy');
    const ret = document.getElementById('voucherRetBy');
    const rec = document.getElementById('voucherRecBy');
    if(!req || !app) return;
    
    let html = '<option value="">Select Staff...</option>';
    systemUsers.forEach(u => html += `<option value="${u}">${u}</option>`);
    
    req.innerHTML = html;
    app.innerHTML = html;
    if(ret) ret.innerHTML = html;
    if(rec) rec.innerHTML = html;
}

// Add New Party from View (Replaced by Modal Trigger)
window.addNewParty = (type) => {
    const req = document.getElementById('voucherReqBy');
    const app = document.getElementById('voucherAppBy');
    const ret = document.getElementById('voucherRetBy');
    const rec = document.getElementById('voucherRecBy');
    let html = '<option value="">Select Staff...</option>';
    systemUsers.forEach(u => html += `<option value="${u}">${u}</option>`);
    if(req) req.innerHTML = html;
    if(app) app.innerHTML = html;
    if(ret) ret.innerHTML = html;
    if(rec) rec.innerHTML = html;

    openPartyModal(type);
}

window.openPartyModal = (type, id = null) => {
    if (type === 'supplier') {
        const modal = new bootstrap.Modal(document.getElementById('supplierModal'));
        document.getElementById('supId').value = id || '';
        
        if(id) {
            const p = parties.find(x => x.id === id);
            document.getElementById('supName').value = p.name;
            document.getElementById('supContact').value = p.contact || '';
            document.getElementById('supAddress').value = p.address || '';
            document.getElementById('supplierModalTitle').innerText = 'Edit Supplier';
        } else {
            document.getElementById('supName').value = '';
            document.getElementById('supContact').value = '';
            document.getElementById('supAddress').value = '';
            document.getElementById('supplierModalTitle').innerText = 'Add New Supplier';
        }
        modal.show();
    } else {
        // Project / Customer
        const modal = new bootstrap.Modal(document.getElementById('customerModal'));
        document.getElementById('custId').value = id || '';
        
        if(id) {
            const p = parties.find(x => x.id === id);
            document.getElementById('custName').value = p.name;
            document.getElementById('custContact').value = p.contact || '';
            document.getElementById('custAddress').value = p.address || '';
            document.getElementById('customerModalTitle').innerText = 'Edit Customer/Project';
        } else {
            document.getElementById('custName').value = '';
            document.getElementById('custContact').value = '';
            document.getElementById('custAddress').value = '';
            document.getElementById('customerModalTitle').innerText = 'Add New Customer/Project';
        }
        modal.show();
    }
}

window.saveSupplier = async () => {
    const id = document.getElementById('supId').value;
    const name = document.getElementById('supName').value.trim();
    const contact = document.getElementById('supContact').value.trim();
    const address = document.getElementById('supAddress').value.trim();
    await processPartySave(id, name, contact, address, 'supplier', 'supplierModal');
}

window.saveCustomer = async () => {
    const id = document.getElementById('custId').value;
    const name = document.getElementById('custName').value.trim();
    const contact = document.getElementById('custContact').value.trim();
    const address = document.getElementById('custAddress').value.trim();
    await processPartySave(id, name, contact, address, 'project', 'customerModal');
}

async function processPartySave(id, name, contact, address, type, modalId) {
    if(isTransactionProcessing) return;
    isTransactionProcessing = true;
    toggleLoading(true);
    try {
    if(!name) throw new Error("Name is required");

    // Check for duplicates (Case-insensitive, excluding current ID if editing)
    const duplicate = parties.find(p => p.name.toLowerCase() === name.toLowerCase() && p.id !== id);
    if (duplicate) {
        throw new Error(`Error: A ${duplicate.type} named "${duplicate.name}" already exists.`);
    }

    const data = { name, contact, address, type };

    if(id) {
        await updateDoc(doc(db, "parties", id), data);
    } else {
        if(parties.some(p => p.name.toLowerCase() === name.toLowerCase())) return alert("Name already exists");
        await addDoc(collection(db, "parties"), { ...data, createdAt: serverTimestamp() });
    }
    
    const partyModalEl = document.getElementById('partyModal');
    if(partyModalEl) { try { bootstrap.Modal.getInstance(partyModalEl).hide(); } catch(e){} }
    
    try { bootstrap.Modal.getInstance(document.getElementById(modalId)).hide(); } catch(e){}
    await loadParties();
    loadPartiesView(type);

    // Auto-fill Voucher if open
    const voucherModal = document.getElementById('voucherModal');
    if(voucherModal && voucherModal.classList.contains('show')) {
        document.getElementById('voucherParty').value = name;
        handleVoucherPartyChange();
    }
    } catch(e) {
        console.error(e);
        alert(e.message);
    } finally {
        isTransactionProcessing = false;
    toggleLoading(false);
    }
}

window.viewPartyHistory = (name) => {

    showView('flowView');

    const flowSearchInput = document.getElementById('flowSearchInput');
    if (flowSearchInput) {
        flowSearchInput.value = name;
        filterFlow();
    }
}

window.quickAddParty = async () => {
    const type = document.getElementById('voucherType').value;
    // Determine type based on voucher context
    let partyType = 'project'; // default
    if(type === 'receipt' || type === 'purchase_order') partyType = 'supplier';
    
    openPartyModal(partyType);
}

// --- UNIQUE CODE GENERATOR & DYNAMIC FIELDS ---
function generateNextCode() {
    const cat = document.getElementById('itemCategory').value;
    const brandInput = document.getElementById('itemBrand').value;
    
    let prefix = 'GEN'; 
    if(cat === 'Solar') prefix = 'SOL';
    else if(cat === 'Battery') prefix = 'BAT';
    else if(cat === 'Inverter') prefix = 'INV';
    else if(cat === 'Solar Pumps') prefix = 'PMP';
    else if(cat === 'Solar Controllers') prefix = 'CTR';
    else if(cat === 'All-in-One') prefix = 'AIO';
    else if(cat === 'Powerstations') prefix = 'PWR';
    else if(cat === 'Audio Systems') prefix = 'AUD';
    else if(cat === 'AC Accessories') prefix = 'ACC';
    else if(cat === 'DC Accessories') prefix = 'DCC';
    else if(cat === 'Breaker Box') prefix = 'BOX';
    else if(cat === 'Cables and Wiring Accessories') prefix = 'CAB';
    else if(cat === 'Earthing System Kit') prefix = 'EAR';
    else if(cat === 'Rack Accessories') prefix = 'RAK';
    else if(cat === 'Generic Items') prefix = 'GEN';
    else if(cat === 'Package') prefix = 'PKG';
    else if(cat === 'Fixed Assets') prefix = 'FIX';
    
    // MODIFIED: Include Brand Code for better filtering (e.g. SOL-JIN-001)
    let baseCode = prefix;
    if(brandInput && brandInput.trim()) {
        const brandCode = brandInput.trim().replace(/[^a-zA-Z0-9]/g, '').substring(0,3).toUpperCase();
        if(brandCode) baseCode += '-' + brandCode;
    }
    baseCode += '-';

    let maxNum = 0;
    inventory.forEach(i => {
        if(i.itemCode && i.itemCode.startsWith(baseCode)) {
            const parts = i.itemCode.split('-');
            if(parts.length >= 2) {
                const numStr = parts[parts.length - 1];
                const num = parseInt(numStr);
                if(!isNaN(num) && num > maxNum) maxNum = num;
            }
        }
    });
    
    const nextNum = String(maxNum + 1).padStart(3, '0');
    const finalCode = baseCode + nextNum;
    document.getElementById('itemCode').value = finalCode;
    
    // Auto-generate QR for preview
    generateQR(finalCode);
}

window.handleCategoryChange = () => {
    generateNextCode();
    renderSpecFields();
}

function renderSpecFields(existingSpecs = null) {
    const cat = document.getElementById('itemCategory').value;
    const container = document.getElementById('dynamicSpecs');
    container.innerHTML = '';

    const fields = categoryFieldConfig[cat] || categoryFieldConfig['default'];

    fields.forEach(field => {
        const col = document.createElement('div');
        col.className = 'col-md-6';
        
        const val = existingSpecs ? (existingSpecs[field.id] || '') : '';

        col.innerHTML = `
            <label class="form-label small text-secondary">${field.label}</label>
            <input type="text" class="form-control spec-input" id="${field.id}" placeholder="${field.placeholder}" value="">
        `;
        container.appendChild(col);
    });
}

// --- DASHBOARD LOGIC (OPTIMIZED) ---
async function loadDashboard() {
    // Step 1: Ensure we have inventory data without re-fetching if possible
    if (!isInventoryLoaded) await loadInventory(false);

    // Date Display
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateEl = document.getElementById('dashDateDisplay');
    if(dateEl) dateEl.innerText = new Date().toLocaleDateString('en-US', dateOptions);

    // Step 2: Calculate stats from MEMORY
    let totalItems = 0;
    let lowStockItems = [];

    inventory.forEach(data => {
        totalItems++;
        if(data.balance < 5) lowStockItems.push(data);
    });

    document.getElementById('dashTotalItems').innerText = totalItems;
    document.getElementById('dashLowStock').innerText = lowStockItems.length;

    // Populate Low Stock List (Top 5)
    const lowStockListEl = document.getElementById('dashLowStockList');
    if(lowStockListEl) {
        lowStockListEl.innerHTML = '';
        if(lowStockItems.length === 0) {
            lowStockListEl.innerHTML = '<li class="list-group-item text-muted text-center py-3">No low stock items</li>';
        } else {
            lowStockItems.slice(0, 5).forEach(i => {
                lowStockListEl.innerHTML += `
                    <li class="list-group-item d-flex justify-content-between align-items-center px-3 py-2">
                        <div>
                            <div class="fw-bold text-dark" style="font-size: 0.85rem;">${i.itemCode}</div>
                            <div class="text-muted" style="font-size: 0.75rem;">${i.brand} ${i.model}</div>
                        </div>
                        <span class="badge bg-danger bg-opacity-10 text-danger rounded-pill">${i.balance}</span>
                    </li>
                `;
            });
        }
    }

    // Pending Counts (Consolidated)
    const qVoucher = query(collection(db, "vouchers"), where("status", "in", ["draft", "pending", "ordered"]));
    const snapVoucher = await getDocs(qVoucher);
    let pendingCount = 0;
    snapVoucher.forEach(d => {
        pendingCount++;
    });
    document.getElementById('dashPendingTotal').innerText = pendingCount;

    // Active Jobs Count
    const qJobs = query(collection(db, "job_orders"), where("status", "not-in", ["Completed", "Cancelled"]));
    const snapJobs = await getDocs(qJobs);
    document.getElementById('dashActiveJobs').innerText = snapJobs.size;

    // Recent Transactions (New)
    const qTrans = query(collection(db, "transactions"), orderBy("date", "desc"), limit(5));
    const snapTrans = await getDocs(qTrans);
    const transListEl = document.getElementById('dashRecentTrans');
    if(transListEl) {
        transListEl.innerHTML = '';
        if(snapTrans.empty) {
            transListEl.innerHTML = '<div class="text-center text-muted py-3">No recent activity</div>';
        } else {
            snapTrans.forEach(d => {
                const t = d.data();
                const date = t.date ? new Date(t.date.seconds * 1000).toLocaleDateString() : '-';
                const icon = t.type === 'in' ? '<i class="fas fa-arrow-down text-success"></i>' : '<i class="fas fa-arrow-up text-danger"></i>';
                const bgClass = t.type === 'in' ? 'bg-success' : 'bg-danger';
                
                transListEl.innerHTML += `
                    <div class="list-group-item list-group-item-action d-flex align-items-center px-3 py-3 border-bottom">
                        <div class="rounded-circle ${bgClass} bg-opacity-10 d-flex align-items-center justify-content-center me-3" style="width: 36px; height: 36px; min-width: 36px;">
                            ${icon}
                        </div>
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between">
                                <span class="fw-bold text-dark" style="font-size: 0.9rem;">${t.itemName}</span>
                                <span class="small text-muted">${date}</span>
                            </div>
                            <div class="d-flex justify-content-between align-items-center mt-1">
                                <span class="small text-muted">${t.party}</span>
                                <span class="badge ${bgClass} rounded-pill">${t.type === 'in' ? '+' : '-'}${t.qty}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
    }

    loadOperationsDashboard();
    renderCalendar();
}

// --- INVENTORY LOGIC (OPTIMIZED) ---
async function loadInventory(force = false) {
    // CRITICAL OPTIMIZATION: Return if already loaded and not forced
    if (!force && isInventoryLoaded && inventory.length > 0) {
        console.log("Using cached inventory data");
        filterInventory(); // Just re-render UI
        return;
    }

    console.log("Fetching inventory from Firestore...");
    toggleLoading(true);
    inventory = [];
    const q = query(collection(db, "inventory"), orderBy("category"));
    const snap = await getDocs(q);
    
    const datalist = document.getElementById('inventoryList'); // For modal search
    if(datalist) datalist.innerHTML = '';

    snap.forEach(d => {
        const data = d.data();
        inventory.push({ id: d.id, ...data });
        
        if(datalist) {
            const opt = document.createElement('option');
            opt.value = data.itemCode;
            opt.innerText = `${data.brand} ${data.model} [${data.balance}]`;
            datalist.appendChild(opt);
        }
    });
    
    isInventoryLoaded = true; // Mark as loaded
    document.getElementById('cacheStatus').innerText = "Data Loaded: " + new Date().toLocaleTimeString();
    
    filterInventory();
    toggleLoading(false);
}

window.filterInvByCat = (cat, el) => {
    currentCategoryFilter = cat;
    document.querySelectorAll('#invTabs .nav-link').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    filterInventory();
}

window.setCategoryTab = (cat, el) => {
    currentCategoryFilter = cat;
    // Update UI
    document.querySelectorAll('.cat-tab-item').forEach(element => element.classList.remove('active'));
    el.classList.add('active');
    filterInventory();
}

window.filterInventory = () => {
    const s = document.getElementById('searchInput').value.toLowerCase().trim();
    
    // --- QR SCAN LOGIC (Exact Match) ---
    const exactMatch = inventory.find(i => i.itemCode && i.itemCode.toLowerCase() === s);
    
    const filtered = inventory.filter(i => {
        // Construct a comprehensive search string including specs
        let specStr = "";
        if (i.specs) specStr = Object.values(i.specs).join(" ");
        else if (i.spec) specStr = i.spec;
        
        // Combine Code, Brand, Model, Category, and Specs for searching
        const matchText = `${i.itemCode} ${i.brand} ${i.model} ${i.category} `.toLowerCase();
        
        const matchSearch = matchText.includes(s);
        const matchCat = currentCategoryFilter === 'All' || i.category === currentCategoryFilter;
        return matchSearch && matchCat;
    });

    const isAccountant = (currentUserRole === 'admin' || currentUserRole === 'accountant' || currentUserRole === 'superadmin' || currentUserRole === 'finance');
    const tbody = document.getElementById('inventoryTableBody');

    let totalVal = 0;
    let totalQty = 0;
    let rowsHtml = '';

    // Currency Formatting Helper
    const formatMoney = (num) => Math.round(num).toLocaleString();

    filtered.forEach(item => {
        const cost = isAccountant ? (item.costPrice || 0) : 0;
        const price = isAccountant ? (item.sellingPrice || 0) : 0;
        // No $ symbol, No decimals, With comma
        const priceCells = isAccountant ? `<td>${formatMoney(cost)}</td><td>${formatMoney(price)}</td>` : '<td class="hidden"></td><td class="hidden"></td>';
        const bal = item.balance || 0;

        // Aggregate totals for the filtered view
        totalQty += bal;
        totalVal += (bal * cost);

        // Show specs as key-value pairs
        let details = `<div class="fw-bold text-dark">${item.brand}</div><small class="text-muted">${item.model}</small>`;
        if(item.specs) {
            details += '<div class="mt-1" style="font-size:0.75rem;">';
            for (const [key, value] of Object.entries(item.specs)) {
                let label = key.replace('spec_', '').toUpperCase(); 
                details += `<span class="badge bg-light text-secondary border me-1">: </span>`;
            }
            details += '</div>';
        } else if(item.spec) {
            details += `<br><span class="badge bg-secondary bg-opacity-25 text-secondary text-wrap text-start" style="font-weight:normal;">${item.spec}</span>`;
        }

        let actions = `<button class="btn btn-sm btn-outline-primary" onclick="openItemModal('${item.id}')">Edit</button>`;
        
        // Highlight row if exact match
        const highlightClass = (exactMatch && exactMatch.id === item.id) ? 'table-info border-start border-5 border-info' : '';
        
        rowsHtml += `
            <tr class="">
                <td class="fw-bold text-primary">${item.itemCode || '-'}</td>
                <td><span class="badge bg-light text-secondary border">${item.category}</span></td>
                <td>${details}</td>
                <td class="text-center">
                    <span class="badge bg-indigo text-white" style="background-color: #6610f2;">${item.balance} ${item.unit || ''}</span>
                </td>
                <td class="text-center text-danger small">${item.damagedBalance || 0}</td>
                ${priceCells}
                <td class="text-end">${actions}</td>
            </tr>
        `;
    });

    tbody.innerHTML = rowsHtml;

    // Update Total Value Display based on filtered items
    // No $, Add MMK, No decimals, Comma separated
    const valDisplay = document.getElementById('totalValueDisplay');
    if(valDisplay) valDisplay.innerText = `${formatMoney(totalVal)} MMK`;

    // Show "Found X items" help text
    const helpEl = document.getElementById('searchResultHelp');
    if(helpEl) {
        if(s.length > 0) {
            helpEl.classList.remove('hidden');
            helpEl.innerHTML = `<i class="fas fa-filter me-1"></i> Found <strong>${filtered.length}</strong> distinct items matching "" | Total Stock Qty: <span class="badge bg-warning text-dark"></span>`;
        } else {
            helpEl.classList.add('hidden');
        }
    }
}

// --- QR CODE GENERATION (SINGLE) ---
function generateQR(code) {
    const container = document.getElementById('qrCodeContainer');
    if (!container) return; // Guard clause
    
    container.innerHTML = ''; // Clear previous
    if(code) {
        new QRCode(container, {
            text: window.location.origin + window.location.pathname + '?code=' + code,
            width: 100,
            height: 100,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    } else {
        container.innerHTML = '<span class="text-muted small">No Code</span>';
    }
}

function printSingleQRCode() {
    const itemCode = document.getElementById('itemCode').value;
    const itemBrand = document.getElementById('itemBrand').value;
    const itemModel = document.getElementById('itemModel').value;
    const qrContent = document.getElementById('qrCodeContainer').innerHTML;
    
    const container = document.getElementById('qrCodeContainer');
    let qrSrc = '';
    const img = container.querySelector('img');
    const canvas = container.querySelector('canvas');
    if (img && img.src) qrSrc = img.src;
    else if (canvas) qrSrc = canvas.toDataURL();

    if(!itemCode || !qrContent) return alert("Please save item to generate code first.");
    if(!itemCode || !qrSrc) return alert("Please save item to generate code first.");

    const printWindow = window.open('', '', 'height=500,width=500');
    printWindow.document.write('<html><head><title>Print Label</title>');
    printWindow.document.write('<style>');
    printWindow.document.write('@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap");');
    printWindow.document.write('body{font-family: "Inter", sans-serif; text-align: center; padding: 20px;}');
    printWindow.document.write('.label{border: 2px solid #000; padding: 15px; display: inline-block; width: 300px; border-radius: 10px;}');
    printWindow.document.write('h2{margin: 10px 0 5px 0; font-size: 24px;}');
    printWindow.document.write('p{margin: 0; font-size: 14px; color: #555;}');
    printWindow.document.write('</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write('<div class="label">');
    // Removed duplicate qrContent write
    printWindow.document.write(`<img src="${qrSrc}" style="width:100px;height:100px;"/>`);
    printWindow.document.write(`<h2></h2>`);
    printWindow.document.write(`<p> - </p>`);
    printWindow.document.write('</div>');
    printWindow.document.write('<script>window.onload = function() { window.print(); window.close(); }<\/script>');
    printWindow.document.write('</body></html>');
    printWindow.document.close();
}

// --- QR SCANNER LOGIC ---
window.startQRScanner = () => {
    const modalEl = document.getElementById('qrScannerModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // Delay to ensure modal is rendered
    setTimeout(() => {
        const html5QrCode = new Html5Qrcode("qr-reader");
        const qrCodeSuccessCallback = (decodedText, decodedResult) => {
            // Stop scanning
            html5QrCode.stop().then(() => {
                modal.hide();
                handleScannedData(decodedText);
            }).catch(err => console.error("Failed to stop scanning", err));
        };
        
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        
        // Start scanning
        html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
        .catch(err => {
            console.error("Error starting scanner", err);
            alert("Camera access failed or denied. Please ensure you are on HTTPS or localhost.");
            modal.hide();
        });

        // Cleanup on modal close (if user cancels)
        modalEl.addEventListener('hidden.bs.modal', () => {
            try {
                if (html5QrCode.isScanning) {
                    html5QrCode.stop().catch(e => console.log("Stop failed", e));
                }
                html5QrCode.clear();
            } catch(e) { /* ignore */ }
        }, { once: true });

    }, 300);
}

window.handleScannedData = (text) => {
    let code = text;
    let voucherId = null;

    // Check if URL and extract params
    try {
        const url = new URL(text);
        if (url.searchParams.has('code')) code = url.searchParams.get('code');
        if (url.searchParams.has('voucher')) voucherId = url.searchParams.get('voucher');
    } catch (e) { /* Not a URL, assume raw code */ }

    if (voucherId) {
        printVoucher(voucherId);
    } else {
        const item = inventory.find(i => i.itemCode === code);
        if (item) openItemModal(item.id);
        else alert("Item not found in inventory: " + code);
    }
}

window.openItemModal = (id=null) => {
    const voucherModalEl = document.getElementById('voucherModal');
    if(voucherModalEl && voucherModalEl.classList.contains('show')) {
            bootstrap.Modal.getInstance(voucherModalEl).hide();
    }

    const modal = new bootstrap.Modal(document.getElementById('itemModal'));
    
    const balanceInput = document.getElementById('itemBalance');
    const balanceHelp = document.getElementById('itemBalanceHelp');
    
    if (currentUserRole !== 'admin' && currentUserRole !== 'superadmin') {
        balanceInput.setAttribute('disabled', 'true');
        balanceHelp.innerText = "(Admin Only)";
    } else {
        balanceInput.removeAttribute('disabled');
        balanceHelp.innerText = "";
    }

    if(id) {
        const item = inventory.find(i => i.id === id);
        document.getElementById('itemId').value = id;
        document.getElementById('itemCode').value = item.itemCode;
        document.getElementById('itemCategory').value = item.category;
        document.getElementById('itemBrand').value = item.brand;
        document.getElementById('itemModel').value = item.model;
        document.getElementById('itemUnit').value = item.unit || 'Pcs';
        document.getElementById('itemBalance').value = item.balance;
        document.getElementById('itemRemark').value = item.remark || '';
        document.getElementById('itemCost').value = item.costPrice || 0;
        document.getElementById('itemPrice').value = item.sellingPrice || 0;
        
        renderSpecFields(item.specs || {}); 
        generateQR(item.itemCode); // Generate QR for existing item
    } else {
        document.getElementById('itemId').value = '';
        document.getElementById('itemCode').value = '';
        document.getElementById('itemBalance').value = 0;
        document.getElementById('itemBrand').value = '';
        document.getElementById('itemModel').value = '';
        document.getElementById('qrCodeContainer').innerHTML = ''; // Clear QR
        handleCategoryChange(); 
    }

    // Staff Read-Only Logic
    const saveBtn = document.querySelector('#itemModal .modal-footer .btn-primary');
    const allInputs = document.querySelectorAll('#itemModal input, #itemModal select, #itemModal textarea');
    
    if (currentUserRole === 'staff') {
        allInputs.forEach(el => el.setAttribute('disabled', 'true'));
        if(saveBtn) saveBtn.classList.add('hidden');
        document.getElementById('itemModalTitle').innerText = "Item Details";
    } else {
        allInputs.forEach(el => {
            if (el.id === 'itemBalance' && currentUserRole !== 'admin' && currentUserRole !== 'superadmin') return;
            el.removeAttribute('disabled');
        });
        if(saveBtn) saveBtn.classList.remove('hidden');
        document.getElementById('itemModalTitle').innerText = id ? "Edit Item" : "New Item";
    }

    modal.show();
}

window.saveItem = async () => {
    if(isTransactionProcessing) return;
    isTransactionProcessing = true;
    toggleLoading(true);
    try {
    const id = document.getElementById('itemId').value;
    const itemCode = document.getElementById('itemCode').value.trim();
    
    if (!itemCode) throw new Error("Item Code is required");

    // Unique Check
    const duplicate = inventory.find(i => i.itemCode === itemCode && i.id !== id);
    if(duplicate) {
        throw new Error(`Duplicate Item Code detected!\nCode: ${itemCode}\nExisting Item: ${duplicate.brand} ${duplicate.model}`);
    }

    const category = document.getElementById('itemCategory').value;
    
    // Harvest Dynamic Specs
    const specs = {};
    const specInputs = document.querySelectorAll('.spec-input');
    let specStringParts = [];
    
    specInputs.forEach(input => {
        if(input.value.trim()) {
            specs[input.id] = input.value.trim();
            specStringParts.push(input.value.trim());
        }
    });
    const specString = specStringParts.join(', ');

    const data = {
        itemCode: itemCode,
        category: category,
        brand: document.getElementById('itemBrand').value,
        model: document.getElementById('itemModel').value,
        spec: specString, 
        specs: specs,
        unit: document.getElementById('itemUnit').value,
        balance: parseFloat(document.getElementById('itemBalance').value) || 0,
        remark: document.getElementById('itemRemark').value,
        // Ensure integer storage for money values
        costPrice: Math.round(parseFloat(document.getElementById('itemCost').value)) || 0,
        sellingPrice: Math.round(parseFloat(document.getElementById('itemPrice').value)) || 0,
        updatedBy: currentUser.email
    };

    if(id) {
        await updateDoc(doc(db, "inventory", id), data);
        // Local Update to save Read Quota
        const index = inventory.findIndex(i => i.id === id);
        if(index !== -1) inventory[index] = { id, ...data, damagedBalance: inventory[index].damagedBalance || 0 };
    } else {
        const docRef = await addDoc(collection(db, "inventory"), { ...data, createdAt: serverTimestamp(), damagedBalance: 0 });
        // Local Update
        inventory.push({ id: docRef.id, ...data, damagedBalance: 0 });
    }
    
    // Update QR
    generateQR(data.itemCode);

    bootstrap.Modal.getInstance(document.getElementById('itemModal')).hide();
    // Do NOT call loadInventory() here, just filter
    filterInventory();
    } catch(e) {
        console.error(e);
        alert(e.message);
    } finally {
        isTransactionProcessing = false;
    toggleLoading(false);
    }
}

// --- SEED DUMMY DATA ---
window.seedDatabase = async () => {
    if(!confirm("Create comprehensive dummy items for ALL categories?")) return;
    toggleLoading(true);
    
    const standardItems = [
        // 1. Solar
        { 
            cat: "Solar", brand: "Jinko", model: "Tiger Pro", code: "SOL-JIN-001", 
            specStr: "590W, Monofacial", 
            specs: {spec_watt: "590W", spec_type: "Monofacial"} 
        },
        // 2. Battery
        { 
            cat: "Battery", brand: "Sharktopsun", model: "Rack Battery", code: "BAT-SHA-001", 
            specStr: "51.2V, 304AH", 
            specs: {spec_volt: "51.2V", spec_amp: "304AH", spec_chem: "LFP"} 
        },
        // 3. Inverter
        { 
            cat: "Inverter", brand: "Growatt", model: "SPF 5000", code: "INV-GRO-001", 
            specStr: "5KW, Single Phase", 
            specs: {spec_power: "5KW", spec_phase: "Single Phase", spec_type: "Off-grid"} 
        },
        // 4. Solar Pumps
        { 
            cat: "Solar Pumps", brand: "Handuro", model: "HD-Surface", code: "PMP-HAN-001", 
            specStr: "2HP, 100m Head", 
            specs: {spec_power: "2HP", spec_head: "100m", spec_flow: "5 m3/h"} 
        },
        // 5. Solar Controllers
        { 
            cat: "Solar Controllers", brand: "PowMr", model: "MPPT-60", code: "CTR-POW-001", 
            specStr: "60A, 12/24/48V", 
            specs: {spec_amp: "60A", spec_volt: "12/24/48V", spec_type: "MPPT"} 
        },
        // 6. All-in-One
        { 
            cat: "All-in-One", brand: "Deye", model: "Sun-ESS", code: "AIO-DEY-001", 
            specStr: "5KW Inv, 10kWh Batt", 
            specs: {spec_inv: "5KW", spec_batt: "10kWh"} 
        },
        // 7. Powerstations
        { 
            cat: "Powerstations", brand: "EcoFlow", model: "Delta 2", code: "PWR-ECO-001", 
            specStr: "1024Wh, 1800W Out", 
            specs: {spec_cap: "1024Wh", spec_out: "1800W"} 
        },
        // 8. Audio Systems
        { 
            cat: "Audio Systems", brand: "SolarSound", model: "Garden Speaker", code: "AUD-SOL-001", 
            specStr: "50W, Bluetooth", 
            specs: {spec_watt: "50W", spec_type: "Outdoor Wireless"} 
        },
        // 9. AC Accessories
        { 
            cat: "AC Accessories", brand: "Schneider", model: "Acti9", code: "ACC-SCH-001", 
            specStr: "32A, 2 Pole MCB", 
            specs: {spec_amp: "32A", spec_type: "MCB 2P"} 
        },
        // 10. DC Accessories
        { 
            cat: "DC Accessories", brand: "Suntree", model: "SR-63", code: "DCC-SUN-001", 
            specStr: "63A, DC Breaker", 
            specs: {spec_amp: "63A", spec_type: "DC Fuse"} 
        },
        // 11. Breaker Box
        { 
            cat: "Breaker Box", brand: "Suntree", model: "Combiner 12", code: "BOX-SUN-001", 
            specStr: "12 Way, Waterproof", 
            specs: {spec_way: "12 Way", spec_type: "Combiner Box"} 
        },
        // 12. Cables
        { 
            cat: "Cables and Wiring Accessories", brand: "PNN", model: "Solar Cable", code: "CAB-PNN-001", 
            specStr: "4mm, Red, 1 Core", 
            specs: {spec_size: "4mm", spec_core: "1 Core", spec_color: "Red"} 
        },
        // 13. Earthing
        { 
            cat: "Earthing System Kit", brand: "Generic", model: "Copper Rod", code: "EAR-GEN-001", 
            specStr: "Copper, 1.5m", 
            specs: {spec_mat: "Copper", spec_dim: "1.5m x 16mm"} 
        },
        // 14. Packages
        { 
            cat: "Package", brand: "MH Solar", model: "Home Starter", code: "PKG-MH-001", 
            specStr: "3KW System Kit", 
            specs: {spec_detail: "3KW Inv + 5kWh Batt + 6 Panels"} 
        },
        // 15. Fixed Assets
        { 
            cat: "Fixed Assets", brand: "Toyota", model: "Forklift", code: "FIX-TOY-001", 
            specStr: "Warehouse Lifter", 
            specs: {spec_detail: "3 Ton Capacity"} 
        }
    ];

    let count = 0;
    for(const item of standardItems) {
        const exists = inventory.find(i => i.itemCode === item.code);
        if(!exists) {
            await addDoc(collection(db, "inventory"), {
                itemCode: item.code,
                category: item.cat,
                brand: item.brand,
                model: item.model,
                spec: item.specStr,
                specs: item.specs,
                unit: "Pcs",
                balance: 10, 
                damagedBalance: 0,
                costPrice: 100, // Int
                sellingPrice: 120, // Int
                remark: "Example Item",
                createdAt: serverTimestamp()
            });
            count++;
        }
    }

    toggleLoading(false);
    alert(`Database seeded with  new example items for all categories.`);
    bootstrap.Modal.getInstance(document.getElementById('groundStockModal')).hide();
    loadInventory(true);
}

// --- FULL DEMO DATA GENERATION ---
window.generateDemoData = async () => {
    if(!confirm("Warning: This will populate the system with dummy Suppliers, Customers, Inventory, Vouchers and Transactions. Continue?")) return;
    toggleLoading(true);

    try {
        // 1. Create Parties
        const suppliers = ["Jinko Solar Official", "Growatt Distributor", "Schneider Electric MM"];
        const customers = ["Mandalay Project A", "Yangon Factory B", "Naypyitaw Ministry"];
        
        for(const s of suppliers) {
            if(!parties.some(p => p.name === s)) await addDoc(collection(db, "parties"), { name: s, type: 'supplier', createdAt: serverTimestamp() });
        }
        for(const c of customers) {
            if(!parties.some(p => p.name === c)) await addDoc(collection(db, "parties"), { name: c, type: 'project', createdAt: serverTimestamp() });
        }
        await loadParties(); // Refresh local list

        // 2. Ensure Inventory Exists (Run Seed)
        const standardItems = [
            { cat: "Solar", brand: "Jinko", model: "Tiger Pro", code: "SOL-JIN-001", spec: "590W, Monofacial", specs: {spec_watt: "590W"} },
            { cat: "Inverter", brand: "Growatt", model: "SPF 5000", code: "INV-GRO-001", spec: "5KW, Single Phase", specs: {spec_power: "5KW"} }
        ];
        
        // Check and add if missing (Simplified seed)
        for(const item of standardItems) {
            if(!inventory.some(i => i.itemCode === item.code)) {
                await addDoc(collection(db, "inventory"), {
                    itemCode: item.code, category: item.cat, brand: item.brand, model: item.model,
                    spec: item.spec, specs: item.specs, unit: "Pcs", balance: 50, damagedBalance: 0,
                    costPrice: 100, sellingPrice: 120, remark: "Demo Item", createdAt: serverTimestamp()
                });
            }
        }
        await loadInventory(true); // Refresh inventory

        // 2.5 Create Job Orders (NEW)
        const today = new Date();
        const jobs = [
            { cust: customers[0], start: 0, dur: 10, status: 'MRF Issued', staff: ['U Phyo'] },
            { cust: customers[1], start: 5, dur: 15, status: 'New', staff: ['Ko Mg Mg'] },
            { cust: customers[2], start: -5, dur: 12, status: 'Completed', staff: ['Ma Zar Zar Naing'] }
        ];

        for(const j of jobs) {
            const sDate = new Date(today); sDate.setDate(today.getDate() + j.start);
            const eDate = new Date(sDate); eDate.setDate(sDate.getDate() + j.dur);
            
            await addDoc(collection(db, "job_orders"), {
                customer: j.cust, date: sDate.toISOString().split('T')[0], endDate: eDate.toISOString().split('T')[0],
                status: j.status, assignedStaff: j.staff, desc: "Demo Project Installation",
                phone: "0912345678", address: "Demo Site Address",
                createdAt: serverTimestamp(), updatedBy: currentUser.email
            });
        }

        // 3. Create Vouchers & Transactions
        // PO
        await addDoc(collection(db, "vouchers"), {
            type: 'purchase_order', party: 'Jinko Solar Official', date: new Date().toISOString().slice(0,10),
            ref: 'PO-DEMO-001', status: 'ordered', items: [{itemId: inventory[0]?.id, itemCode: 'SOL-JIN-001', itemName: 'Jinko Tiger Pro', qty: 100}],
            createdAt: serverTimestamp(), createdBy: currentUser.email
        });

        // Receipt (GRN) - Updates Stock
        const grnRef = await addDoc(collection(db, "vouchers"), {
            type: 'receipt', party: 'Jinko Solar Official', date: new Date().toISOString().slice(0,10),
            ref: 'GRN-DEMO-001', status: 'approved', items: [{itemId: inventory[0]?.id, itemCode: 'SOL-JIN-001', itemName: 'Jinko Tiger Pro', qty: 50}],
            createdAt: serverTimestamp(), createdBy: currentUser.email
        });
        // Update Stock for GRN
        if(inventory[0]) {
            const newBal = (inventory[0].balance || 0) + 50;
            await updateDoc(doc(db, "inventory", inventory[0].id), { balance: newBal });
            await addDoc(collection(db, "transactions"), {
                date: serverTimestamp(), type: 'in', subType: 'receipt', itemId: inventory[0].id,
                itemName: 'Jinko Tiger Pro', qty: 50, party: 'Jinko Solar Official', ref: 'GRN-DEMO-001', user: currentUser.email
            });
        }

        // Request (Out)
        const reqRef = await addDoc(collection(db, "vouchers"), {
            type: 'request', party: 'Mandalay Project A', date: new Date().toISOString().slice(0,10),
            ref: 'REQ-DEMO-001', status: 'approved', items: [{itemId: inventory[0]?.id, itemCode: 'SOL-JIN-001', itemName: 'Jinko Tiger Pro', qty: 10}],
            reqBy: 'Ko Mg Mg', appBy: 'U Ba', createdAt: serverTimestamp(), createdBy: currentUser.email
        });
        // Update Stock for Request
        if(inventory[0]) {
            const currentBal = (inventory[0].balance || 0) + 50; // Previous +50
            await updateDoc(doc(db, "inventory", inventory[0].id), { balance: currentBal - 10 });
            await addDoc(collection(db, "transactions"), {
                date: serverTimestamp(), type: 'out', subType: 'request', itemId: inventory[0].id,
                itemName: 'Jinko Tiger Pro', qty: 10, party: 'Mandalay Project A', ref: 'REQ-DEMO-001', user: currentUser.email
            });
        }

        alert("Demo Data Generated Successfully!");
        loadDashboard(); // Refresh UI
        loadVouchers();
        loadFlow();

    } catch(e) {
        console.error(e);
        alert("Error generating demo data: " + e.message);
    }
    toggleLoading(false);
}

// --- PACKAGE BUILDER LOGIC ---
window.openPackageBuilder = () => {
    document.getElementById('pkgBrand').value = '';
    document.getElementById('pkgModel').value = '';
    document.getElementById('pkgCode').value = 'PKG-' + Math.floor(1000 + Math.random() * 9000);
    document.getElementById('pkgQty').value = 1;
    document.getElementById('pkgCost').value = '0';
    document.getElementById('packageItemsBody').innerHTML = '';
    addPackageRow();
    new bootstrap.Modal(document.getElementById('packageModal')).show();
}

window.addPackageRow = () => {
    const row = `
        <tr>
            <td><input type="text" class="form-control form-control-sm pkg-item-search" list="inventoryList" placeholder="Search Component..." onchange="calcPkgCost(this)"></td>
            <td><input type="number" class="form-control form-control-sm pkg-qty" value="1" min="1" onchange="calcPkgCost(this)"></td>
            <td><button class="btn btn-sm text-danger" onclick="this.closest('tr').remove(); calcPkgCost();"><i class="fas fa-times"></i></button></td>
        </tr>
    `;
    document.getElementById('packageItemsBody').insertAdjacentHTML('beforeend', row);
}

window.calcPkgCost = () => {
    let total = 0;
    document.querySelectorAll('#packageItemsBody tr').forEach(tr => {
        const code = tr.querySelector('.pkg-item-search').value;
        const qty = parseFloat(tr.querySelector('.pkg-qty').value) || 0;
        const item = inventory.find(i => i.itemCode === code);
        if(item) total += (item.costPrice || 0) * qty;
    });
    document.getElementById('pkgCost').value = Math.round(total);
}

window.assemblePackage = async () => {
    const buildQty = parseInt(document.getElementById('pkgQty').value) || 0;
    if(buildQty <= 0) return alert("Quantity must be > 0");

    const components = [];
    const rows = document.querySelectorAll('#packageItemsBody tr');
    for(let row of rows) {
        const code = row.querySelector('.pkg-item-search').value;
        const qtyPer = parseFloat(row.querySelector('.pkg-qty').value) || 0;
        const item = inventory.find(i => i.itemCode === code);
        if(!item) return alert(`Invalid component: `);
        if(item.balance < (qtyPer * buildQty)) return alert(`Insufficient stock for . Need ${qtyPer * buildQty}, Have ${item.balance}`);
        components.push({ item, totalQty: qtyPer * buildQty });
    }

    if(components.length === 0) return alert("Add components first.");
    if(!confirm(`Assemble  units? This will deduct components from stock.`)) return;

    toggleLoading(true);
    try {
        // 1. Deduct Components
        for(let c of components) {
            const newBal = c.item.balance - c.totalQty;
            await updateDoc(doc(db, "inventory", c.item.id), { balance: newBal });
            // Update Local
            const idx = inventory.findIndex(i => i.id === c.item.id);
            if(idx !== -1) inventory[idx].balance = newBal;
        }

        // 2. Create/Update Output Item
        const pkgCode = document.getElementById('pkgCode').value;
        const pkgData = {
            itemCode: pkgCode,
            category: document.getElementById('pkgCategory').value,
            brand: document.getElementById('pkgBrand').value,
            model: document.getElementById('pkgModel').value,
            costPrice: parseFloat(document.getElementById('pkgCost').value),
            sellingPrice: 0, // User can set later
            unit: 'Set',
            remark: 'Assembled via Builder'
        };

        let pkgItem = inventory.find(i => i.itemCode === pkgCode);
        if(pkgItem) {
            const newBal = (pkgItem.balance || 0) + buildQty;
            await updateDoc(doc(db, "inventory", pkgItem.id), { balance: newBal, costPrice: pkgData.costPrice });
            // Local
            const idx = inventory.findIndex(i => i.id === pkgItem.id);
            inventory[idx].balance = newBal;
        } else {
            const ref = await addDoc(collection(db, "inventory"), { ...pkgData, balance: buildQty, damagedBalance: 0, createdAt: serverTimestamp() });
            inventory.push({ id: ref.id, ...pkgData, balance: buildQty });
        }

        // 3. Log Transaction
        await addDoc(collection(db, "transactions"), {
            date: serverTimestamp(), type: 'in', subType: 'assembly', 
            itemName: pkgData.brand + " " + pkgData.model, qty: buildQty, 
            party: 'Assembly', user: currentUser.email
        });

        alert("Assembly Complete!");
        bootstrap.Modal.getInstance(document.getElementById('packageModal')).hide();
        filterInventory();
    } catch(e) {
        console.error(e);
        alert("Error during assembly: " + e.message);
    }
    toggleLoading(false);
}

// --- VOUCHER SYSTEM ---
window.openVoucherModal = (type) => {
    document.getElementById('voucherType').value = type;
    document.getElementById('relatedPoId').value = ''; 
    document.getElementById('relatedPrId').value = '';
    
    const titleEl = document.getElementById('voucherModalTitle');
    const partyLabel = document.getElementById('voucherPartyLabel');
    const actionDiv = document.getElementById('voucherActions');
    const partyInput = document.getElementById('voucherParty');
    partyInput.onchange = handleVoucherPartyChange;
    
    actionDiv.innerHTML = `<button type="button" class="btn btn-primary px-4" onclick="saveVoucher(false)">Save Draft</button>`;
    
    if (type === 'receipt' || type === 'purchase_order') {
        partyInput.setAttribute('list', 'supplierList');
    } else if (type === 'request' || type === 'return' || type === 'damage_return') {
        partyInput.setAttribute('list', 'projectList');
    }

    if (type === 'receipt') {
        titleEl.innerText = "Goods Receipt Note (GRN)";
        partyLabel.innerText = "Supplier";
        if (currentUserRole === 'warehouse' || currentUserRole === 'admin' || currentUserRole === 'superadmin') {
            actionDiv.innerHTML += `<button type="button" class="btn btn-success ms-2 px-4" onclick="saveVoucher(true)">Save & Process (Stock In)</button>`;
        }
    } else if (type === 'request') {
        titleEl.innerText = "Stock Issue Note (Request)";
        partyLabel.innerText = "Project / Customer";
        if (currentUserRole === 'warehouse' || currentUserRole === 'admin' || currentUserRole === 'superadmin') {
            actionDiv.innerHTML += `<button type="button" class="btn btn-warning text-white ms-2 px-4" onclick="saveVoucher(true)">Save & Process (Stock Out)</button>`;
        }
    } else if (type === 'return') {
        titleEl.innerText = "Material Return Note (Good)";
        partyLabel.innerText = "Project Name";
        if (currentUserRole === 'warehouse' || currentUserRole === 'admin' || currentUserRole === 'superadmin') {
            actionDiv.innerHTML += `<button type="button" class="btn btn-success ms-2 px-4" onclick="saveVoucher(true)">Save & Process (Stock In)</button>`;
        }
    } else if (type === 'damage_return') {
        titleEl.innerText = "Material Return Note (Damage)";
        partyLabel.innerText = "Project Name";
        if (currentUserRole === 'warehouse' || currentUserRole === 'admin' || currentUserRole === 'superadmin') {
            actionDiv.innerHTML += `<button type="button" class="btn btn-danger ms-2 px-4" onclick="saveVoucher(true)">Save & Process (Damage In)</button>`;
        }
    } else if (type === 'purchase_order') {
        titleEl.innerText = "Purchase Order (PO)";
        partyLabel.innerText = "Supplier";
    } else if (type === 'purchase_request') {
        titleEl.innerText = "Purchase Request (Internal)";
        partyLabel.innerText = "Suggested Supplier (Optional)";
    }
    
    const reqFields = document.getElementById('requestFields');
    const returnFields = document.getElementById('returnFields');
    
    reqFields.classList.add('hidden');
    returnFields.classList.add('hidden');
    
    if(type === 'request' || type === 'purchase_order' || type === 'purchase_request') {
        reqFields.classList.remove('hidden');
    } else if (type === 'return' || type === 'damage_return') {
        returnFields.classList.remove('hidden');
    }
    
    document.getElementById('voucherItemsBody').innerHTML = '';
    addVoucherItemRow();
    new bootstrap.Modal(document.getElementById('voucherModal')).show();
}

window.addVoucherItemRow = (prefillData = null) => {
    const type = document.getElementById('voucherType').value;
    const listId = (type === 'return' || type === 'damage_return') ? 'returnableItemList' : 'inventoryList';

    const itemVal = prefillData ? prefillData.itemCode : '';
    const qtyVal = prefillData ? prefillData.qty : 1;
    const serialVal = prefillData ? (prefillData.serials || '') : '';
    const priceVal = prefillData ? (prefillData.estPrice || '') : '';
    
    const row = `
        <tr>
            <td><input type="text" class="form-control form-control-sm item-search bg-white" list="${listId}" placeholder="Search Item Code" value="${itemVal}"></td>
            <td><input type="number" min="1" class="form-control form-control-sm qty-input bg-white" value="${qtyVal}" oninput="this.value = Math.abs(this.value)"></td>
            <td><input type="number" class="form-control form-control-sm price-input bg-white" placeholder="Est. Price" value="${priceVal}"></td>
            <td><input type="text" class="form-control form-control-sm serial-input bg-white" placeholder="S/N (Optional)" value="${serialVal}"></td>
            <td><button class="btn btn-sm btn-outline-danger border-0" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button></td>
        </tr>
    `;
    document.getElementById('voucherItemsBody').insertAdjacentHTML('beforeend', row);
}

window.handleVoucherPartyChange = async () => {
    const type = document.getElementById('voucherType').value;
    const party = document.getElementById('voucherParty').value;
    
    if ((type === 'return' || type === 'damage_return') && party) {
        toggleLoading(true);
        const list = document.getElementById('returnableItemList');
        list.innerHTML = '';
        
        // Fetch transactions for this party to determine returnable items
        const q = query(collection(db, "transactions"), where("party", "==", party));
        const snap = await getDocs(q);
        
        const usageMap = {};
        snap.forEach(d => {
            const t = d.data();
            if (!t.itemId) return;
            const invItem = inventory.find(i => i.id === t.itemId);
            const code = invItem ? invItem.itemCode : 'UNKNOWN';
            
            if (!usageMap[code]) usageMap[code] = { qty: 0, name: t.itemName };
            
            if (t.type === 'out') usageMap[code].qty += t.qty;
            if (t.type === 'in') usageMap[code].qty -= t.qty;
        });
        
        Object.keys(usageMap).forEach(code => {
            if (usageMap[code].qty > 0) {
                const opt = document.createElement('option');
                opt.value = code;
                opt.innerText = `${usageMap[code].name} (Site Bal: ${usageMap[code].qty})`;
                list.appendChild(opt);
            }
        });
        toggleLoading(false);
    }
}

window.saveVoucher = async (autoProcess = false) => {
    if(isTransactionProcessing) return;
    isTransactionProcessing = true;
    toggleLoading(true);
    try {
    const type = document.getElementById('voucherType').value;
    const party = document.getElementById('voucherParty').value;
    const date = document.getElementById('voucherDate').value;
    const ref = document.getElementById('voucherLetterRef')?.value || '';
    const relatedPoId = document.getElementById('relatedPoId').value;
    const relatedPrId = document.getElementById('relatedPrId').value;
    
    // --- PROJECT VALIDATION: Check if Project is Completed (for Requests) ---
    if (type === 'request') {
        const qJob = query(collection(db, "job_orders"), where("customer", "==", party), where("status", "==", "Completed"));
        const jobSnap = await getDocs(qJob);
        if (!jobSnap.empty) {
            if(!confirm(`PROJECT WARNING:\n\nThe project "${party}" is marked as COMPLETED.\n\nDo you really want to issue more stock?`)) { return; }
        }
    }

    const rows = document.querySelectorAll('#voucherItemsBody tr');
    let items = [];
    for(let row of rows) {
        const code = row.querySelector('.item-search').value;
        const qtyInput = row.querySelector('.qty-input');
        const serialInput = row.querySelector('.serial-input');
        const priceInput = row.querySelector('.price-input');
        const qty = parseInt(qtyInput.value);
        
        // Negative Check
        if(qty <= 0 || isNaN(qty)) {
            qtyInput.style.border = "1px solid red";
            throw new Error("Quantity must be a positive number.");
        }

        const item = inventory.find(i => i.itemCode === code);
        
        if(item && qty > 0) {
            items.push({ 
                itemId: item.id, 
                itemCode: item.itemCode, 
                itemName: `${item.brand} ${item.model}`,
                qty: qty, 
                serials: serialInput ? serialInput.value.trim() : '',
                estPrice: priceInput ? parseFloat(priceInput.value) : 0
            });
        } else if (type === 'purchase_request' && code && qty > 0) {
            // Allow Non-Inventory Items for PR
            items.push({
                itemId: null,
                itemCode: code,
                itemName: code + " (Non-Inventory)",
                qty: qty,
                serials: '',
                estPrice: priceInput ? parseFloat(priceInput.value) : 0
            });
        }
    }

    if(items.length === 0) { throw new Error("No valid items selected"); }

    // --- PO VALIDATION LOGIC ---
    const retBy = document.getElementById('voucherRetBy')?.value;
    const recBy = document.getElementById('voucherRecBy')?.value;
    if ((type === 'return' || type === 'damage_return') && retBy && recBy && retBy === recBy) {
        throw new Error("Returned By and Received By cannot be the same person.");
    }
    
    // --- RETURN VALIDATION: Check if project actually has these items ---
    if (type === 'return' || type === 'damage_return') {
        const q = query(collection(db, "transactions"), where("party", "==", party));
        const snap = await getDocs(q);
        const usageMap = {};
        snap.forEach(d => {
            const t = d.data();
            if (!t.itemId) return;
            const invItem = inventory.find(i => i.id === t.itemId);
            const code = invItem ? invItem.itemCode : 'UNKNOWN';
            if (!usageMap[code]) usageMap[code] = 0;
            if (t.type === 'out') usageMap[code] += t.qty;
            if (t.type === 'in') usageMap[code] -= t.qty;
        });
        
        for(let item of items) {
            const siteBal = usageMap[item.itemCode] || 0;
            if (item.qty > siteBal) {
                throw new Error(`Invalid Return! Project '${party}' only has ${siteBal} of ${item.itemCode}. You tried to return ${item.qty}.`);
            }
        }
    }

    if(relatedPoId && type === 'receipt') {
            const poDoc = await getDoc(doc(db, "vouchers", relatedPoId));
            const po = poDoc.data();
            
            // Get history
            const q = query(collection(db, "vouchers"), where("relatedPoId", "==", relatedPoId), where("type", "==", "receipt"));
            const snap = await getDocs(q);
            let receivedMap = {};
            snap.forEach(d => {
                d.data().items.forEach(i => { receivedMap[i.itemCode] = (receivedMap[i.itemCode] || 0) + i.qty; });
            });

            // Check Limits
            for(let newItem of items) {
                const orderedItem = po.items.find(pi => pi.itemCode === newItem.itemCode);
                if(orderedItem) {
                    const alreadyReceived = receivedMap[newItem.itemCode] || 0;
                    const allowed = orderedItem.qty - alreadyReceived;
                    
                    if(newItem.qty > allowed) {
                        throw new Error(`Cannot Receive! Item: ${newItem.itemCode}\nOrdered: ${orderedItem.qty}\nRemaining Allowed: ${allowed}\nYou tried to add: ${newItem.qty}`);
                    }
                }
            }
    }
    // ---------------------------

    let status = 'draft';
    if (type === 'purchase_order') status = 'ordered'; 
    if (type === 'purchase_request') status = 'pending';
    if (autoProcess) status = 'approved';

    const data = {
        type, party, date, ref, items, 
        status: status,
        relatedPoId: relatedPoId || null,
        reqBy: document.getElementById('voucherReqBy')?.value || '',
        appBy: document.getElementById('voucherAppBy')?.value || '',
        retBy: document.getElementById('voucherRetBy')?.value || '', 
        recBy: document.getElementById('voucherRecBy')?.value || '', 
        createdBy: currentUser.email,
        createdAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, "vouchers"), data);
    
    // Update PR Status if this PO was created from a PR
    if (relatedPrId && type === 'purchase_order') {
        await updateDoc(doc(db, "vouchers", relatedPrId), { status: 'completed' });
    }

    // Immediate Stock Update + Local Memory Update
    if(autoProcess) {
        for(let item of items) {
            const invRef = doc(db, "inventory", item.itemId);
            const invIndex = inventory.findIndex(i => i.id === item.itemId);
            const localItem = inventory[invIndex];
            
            if(localItem) {
                const cur = localItem.balance || 0;
                const curDamage = localItem.damagedBalance || 0;
                
                let updateData = {};
                
                if (type === 'damage_return') {
                    updateData = { damagedBalance: curDamage + item.qty };
                    // Update Memory
                    inventory[invIndex].damagedBalance = curDamage + item.qty;
                } else if (type === 'return' || type === 'receipt') {
                    updateData = { balance: cur + item.qty };
                    // Update Memory
                    inventory[invIndex].balance = cur + item.qty;
                } else if (type === 'request') {
                    updateData = { balance: cur - item.qty };
                    // Update Memory
                    inventory[invIndex].balance = cur - item.qty;
                }
                
                await updateDoc(invRef, updateData);
                
                // Log
                 await addDoc(collection(db, "transactions"), {
                    date: serverTimestamp(),
                    type: (type === 'receipt' || type === 'return' || type === 'damage_return') ? 'in' : 'out',
                    subType: type, 
                    itemId: item.itemId,
                    itemName: item.itemName,
                    qty: item.qty,
                    party: party,
                    ref: ref,
                    user: currentUser.email
                });
            }
        }

        // Auto-update PO status if fully received
        if (type === 'receipt' && relatedPoId) {
            try {
                const poRef = doc(db, "vouchers", relatedPoId);
                const poSnap = await getDoc(poRef);
                if(poSnap.exists()) {
                    const poData = poSnap.data();
                    const totalOrdered = poData.items.reduce((sum, i) => sum + (i.qty || 0), 0);
                    
                    const qRec = query(collection(db, "vouchers"), where("relatedPoId", "==", relatedPoId), where("type", "==", "receipt"));
                    const recSnaps = await getDocs(qRec);
                    let totalReceived = 0;
                    recSnaps.forEach(r => { totalReceived += r.data().items.reduce((sum, i) => sum + (i.qty || 0), 0); });

                    if (totalReceived >= totalOrdered) {
                        await updateDoc(poRef, { status: 'received' });
                    } else if (totalReceived > 0) {
                        await updateDoc(poRef, { status: 'partially_received' });
                    }
                }
            } catch(e) { console.error("PO Status Update Error", e); }
        }
    }

    bootstrap.Modal.getInstance(document.getElementById('voucherModal')).hide();
    loadVouchers();
    // Don't call loadInventory/loadDashboard. We updated memory locally.
    filterInventory(); // Refresh table view from memory
    
    alert(autoProcess ? "Transaction Processed Successfully!" : "Voucher Saved (Draft)");
    } catch(e) {
        console.error(e);
        alert("Error: " + e.message);
    } finally {
        isTransactionProcessing = false;
        toggleLoading(false);
    }
}

// New Function: Receive PO (Convert to Receipt)
window.receivePO = async (poId) => {
    try {
        toggleLoading(true);
        const poDoc = await getDoc(doc(db, "vouchers", poId));
        if(!poDoc.exists()) { toggleLoading(false); return; }
        const po = poDoc.data();

        // Fetch previous receipts for this PO to calculate remaining balance
        const q = query(collection(db, "vouchers"), where("relatedPoId", "==", poId), where("type", "==", "receipt"));
        const snap = await getDocs(q);
        let receivedMap = {};
        snap.forEach(d => {
            d.data().items.forEach(i => {
                receivedMap[i.itemCode] = (receivedMap[i.itemCode] || 0) + i.qty;
            });
        });

        const itemsToReceive = [];
        let allFullyReceived = true;

        // Only add items that have remaining balance
        po.items.forEach(item => {
            const alreadyReceived = receivedMap[item.itemCode] || 0;
            const balance = item.qty - alreadyReceived;
            if(balance > 0) {
                itemsToReceive.push({ ...item, qty: balance }); // Suggest balance qty
                allFullyReceived = false;
            }
        });

        if(allFullyReceived) {
            if (po.status === 'ordered' || po.status === 'shipped' || po.status === 'partially_received') {
                if(confirm("Items fully received. Mark PO as 'Received' on Kanban board?")) {
                    await updateDoc(doc(db, "vouchers", poId), { status: 'received' });
                    loadVouchers();
                }
            } else {
                alert("This PO is already fully received! (ဤ PO အတွက် ပစ္စည်းများအားလုံး လက်ခံရရှိပြီးဖြစ်ပါသည်)");
            }
            toggleLoading(false);
            return;
        }
        
        openVoucherModal('receipt'); 
        
        document.getElementById('voucherParty').value = po.party;
        document.getElementById('voucherLetterRef').value = "PO: " + (po.ref || poId.slice(0,6));
        document.getElementById('relatedPoId').value = poId; 
        
        document.getElementById('voucherItemsBody').innerHTML = ''; 
        itemsToReceive.forEach(item => {
            addVoucherItemRow(item);
        });
        toggleLoading(false);
        
    } catch(e) { 
        console.error(e); 
        toggleLoading(false);
    }
}

// New Function: Compare PO vs Receipts
window.comparePO = async (poId) => {
    toggleLoading(true);
    try {
        const poDoc = await getDoc(doc(db, "vouchers", poId));
        const po = poDoc.data();
        
        const q = query(collection(db, "vouchers"), where("relatedPoId", "==", poId), where("type", "==", "receipt"));
        const snap = await getDocs(q);
        
        let receivedMap = {}; 
        snap.forEach(doc => {
            const rec = doc.data();
            rec.items.forEach(i => {
                receivedMap[i.itemCode] = (receivedMap[i.itemCode] || 0) + i.qty;
            });
        });
        
        const tbody = document.getElementById('reconcileBody');
        tbody.innerHTML = '';
        
        po.items.forEach(item => {
            const ordered = item.qty;
            const received = receivedMap[item.itemCode] || 0;
            const balance = ordered - received;
            const color = balance > 0 ? 'text-danger fw-bold' : 'text-success';
            
            tbody.innerHTML += `
                <tr>
                    <td>${item.itemCode}</td>
                    <td>${item.itemName}</td>
                    <td class="text-center">${ordered}</td>
                    <td class="text-center">${received}</td>
                    <td class="text-center ${color}">${balance}</td>
                </tr>
            `;
        });
        
        new bootstrap.Modal(document.getElementById('reconcileModal')).show();
        
    } catch(e) { console.error(e); }
    toggleLoading(false);
}

window.loadVouchers = async () => {
    const q = query(collection(db, "vouchers"), orderBy("date", "desc"), limit(50));
    const snap = await getDocs(q);
    
    const rBody = document.getElementById('receiptTableBody');
    const reqBody = document.getElementById('requestTableBody');
    const retBody = document.getElementById('returnTableBody');
    const poBody = document.getElementById('poTableBody');
    const whPOBody = document.getElementById('warehousePOTableBody');
    const prBody = document.getElementById('prTableBody'); // New
    
    rBody.innerHTML = ''; reqBody.innerHTML = ''; retBody.innerHTML = ''; poBody.innerHTML = ''; whPOBody.innerHTML = '';
    if(prBody) prBody.innerHTML = '';
    
    // Stats Counters
    let stats = { pr: 0, poActive: 0, transit: 0, completed: 0 };
    const currentMonth = new Date().getMonth();

    let prCount = 0;
    snap.forEach(d => {
        const v = d.data();
        const vDate = v.date ? new Date(v.date) : new Date();
        
        if(v.type === 'purchase_order') {
            // Stats
            if(v.status === 'ordered' || v.status === 'partially_received') stats.poActive++;
            if(v.status === 'shipped') stats.transit++;
            if(v.status === 'completed' || v.status === 'received') {
                if(vDate.getMonth() === currentMonth) stats.completed++;
            }

            // Progress Logic
            let progress = 0;
            let progressColor = 'bg-secondary';
            let statusLabel = v.status.toUpperCase();
            
            if(v.status === 'ordered') { progress = 25; progressColor = 'bg-info'; }
            else if(v.status === 'shipped') { progress = 50; progressColor = 'bg-primary'; }
            else if(v.status === 'partially_received') { progress = 75; progressColor = 'bg-warning'; }
            else if(v.status === 'received' || v.status === 'completed') { progress = 100; progressColor = 'bg-success'; }

            // Add Ship Button for Ordered status (since Kanban is gone)
            let shipBtn = '';
            if(v.status === 'ordered') {
                shipBtn = `<button class="btn btn-sm btn-outline-indigo border shadow-sm me-1" style="color: #6610f2; border-color: #e2e8f0;" onclick="updatePOStatus('${d.id}', 'shipped')" title="Mark as Shipped"><i class="fas fa-shipping-fast"></i></button>`;
            }

            const row = `
            <tr>
                <td class="ps-4">
                    <div class="fw-bold text-dark text-uppercase">${v.ref || d.id.slice(0,6)}</div>
                    <div class="small text-muted">${v.date}</div>
                </td>
                <td>
                    <div class="fw-bold text-dark">${v.party}</div>
                    <div class="small text-muted"><i class="fas fa-box me-1"></i>${v.items.length} Items</div>
                </td>
                <td>
                    <div class="small text-muted mb-1">
                        ${v.items.slice(0,2).map(i => i.itemName).join(', ')} ${v.items.length > 2 ? '...' : ''}
                    </div>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="flex-grow-1 me-2">
                            <div class="d-flex justify-content-between small mb-1">
                                <span class="fw-bold ${progressColor.replace('bg-', 'text-')}">${statusLabel}</span>
                                <span class="text-muted">${progress}%</span>
                            </div>
                            <div class="progress" style="height: 6px;">
                                <div class="progress-bar ${progressColor}" role="progressbar" style="width: ${progress}%"></div>
                            </div>
                        </div>
                    </div>
                </td>
                <td class="text-end pe-4">
                    ${shipBtn}
                    <button class="btn btn-sm btn-light border shadow-sm me-1" onclick="printVoucher('${d.id}')" title="Print PO"><i class="fas fa-print"></i></button>
                    <button class="btn btn-sm btn-outline-primary border shadow-sm" onclick="comparePO('${d.id}')" title="Track/Check"><i class="fas fa-search"></i></button>
                </td>
            </tr>`;
            poBody.innerHTML += row;

            const whRow = `
            <tr>
                <td>${v.date}</td>
                <td>${v.party}</td>
                <td>${v.items.length} Items</td>
                <td><span class="badge bg-info text-dark">${v.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-success shadow-sm px-3" onclick="receivePO('${d.id}')">
                        <i class="fas fa-box-open me-1"></i> Receive
                    </button>
                </td>
            </tr>`;
            whPOBody.innerHTML += whRow;
        }
        else if(v.type === 'purchase_request') {
            if(v.status === 'pending') {
                prCount++;
                stats.pr++;
            }
            
            let badgeClass = 'bg-warning text-dark';
            if(v.status === 'completed') badgeClass = 'bg-success';
            else if(v.status === 'rejected') badgeClass = 'bg-danger';

            let actions = ``;
            if(v.status === 'pending') {
                actions = `
                    <button class="btn btn-sm btn-primary shadow-sm" onclick="convertPRtoPO('${d.id}')"><i class="fas fa-file-invoice me-1"></i>Create PO</button>
                    <button class="btn btn-sm btn-outline-danger border-0 ms-1" onclick="rejectVoucher('${d.id}')" title="Reject"><i class="fas fa-times"></i></button>
                `;
            } else if(v.status === 'completed') {
                actions = `<span class="text-success small fw-bold"><i class="fas fa-check-circle me-1"></i>PO Created</span>`;
            }
            
            // Add Print to all
            actions = `<button class="btn btn-sm btn-light border shadow-sm me-2" onclick="printVoucher('${d.id}')" title="Print Request"><i class="fas fa-print"></i></button>` + actions;

            const row = `
            <tr>
                <td class="ps-4">
                    <div class="fw-bold text-dark text-uppercase">${v.ref || 'PR-'+d.id.slice(0,4)}</div>
                    <div class="small text-muted">${v.date}</div>
                </td>
                <td>
                    <div class="fw-bold">${v.reqBy || 'Warehouse'}</div>
                    <div class="small text-muted">Requested By</div>
                </td>
                <td>
                    <div class="small text-dark">${v.items.length} Items</div>
                    <div class="small text-muted text-truncate" style="max-width: 200px;">${v.items.map(i=>i.itemName).join(', ')}</div>
                </td>
                <td><span class="badge ${badgeClass}">${v.status.toUpperCase()}</span></td>
                <td class="text-end pe-4">${actions}</td>
            </tr>`;
            if(prBody) prBody.innerHTML += row;
        }
        else if(v.type === 'receipt') {
            const poRef = v.relatedPoId ? `<span class="badge bg-light text-dark border">PO Linked</span>` : '-';
            const row = `
            <tr>
                <td>${v.date}</td>
                <td>${v.party}</td>
                <td>${poRef}</td>
                <td>${v.items.length} Items</td>
                <td><span class="badge ${v.status=='draft'?'bg-warning text-dark':'bg-success'}">${v.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-light border" onclick="printVoucher('${d.id}')"><i class="fas fa-print"></i></button>
                    <button class="btn btn-sm btn-outline-dark ms-1" onclick="printVoucherLabels('${d.id}')" title="Print Labels"><i class="fas fa-tags"></i></button>
                    ${v.status === 'draft' ? `<button class="btn btn-sm btn-success ms-1" onclick="approveVoucher('${d.id}', '${v.type}')">Confirm</button>` : ''}
                </td>
            </tr>`;
            rBody.innerHTML += row;
        } 
        else if (v.type === 'request') {
            // Added Job Link for Warehouse to Check Job Order before Issuing
            const jobLink = v.jobId ? `<button class="btn btn-sm btn-outline-info ms-1" onclick="openJobOrderModal('${v.jobId}')" title="Check Job Order Details"><i class="fas fa-hard-hat"></i></button>` : '';
            const row = `
            <tr>
                <td>${v.date}</td>
                <td>${v.party}</td>
                <td>${v.reqBy || 'System'}</td>
                <td>${v.items.length} Items</td>
                <td><span class="badge ${v.status=='draft'?'bg-warning text-dark':'bg-success'}">${v.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-light border" onclick="printVoucher('${d.id}')"><i class="fas fa-print"></i></button>
                    ${jobLink}
                    ${(v.status === 'draft' || v.status === 'pending') ? `<button class="btn btn-sm btn-success ms-1" onclick="approveVoucher('${d.id}', '${v.type}')">Issue Stock</button>` : ''}
                </td>
            </tr>`;
            reqBody.innerHTML += row;
        } 
        else if (v.type === 'return' || v.type === 'damage_return') {
            const typeLabel = v.type === 'damage_return' 
                ? '<span class="badge bg-danger">Damage</span>' 
                : '<span class="badge bg-success">Good</span>';
            
            const returnRow = `
            <tr>
                <td>${v.date}</td>
                <td>${v.party}</td>
                <td>${typeLabel}</td>
                <td>${v.items.length} Items</td>
                <td><span class="badge ${v.status=='draft'?'bg-warning text-dark':'bg-success'}">${v.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-light border" onclick="printVoucher('${d.id}')"><i class="fas fa-print"></i></button>
                    ${v.status === 'draft' ? `<button class="btn btn-sm btn-success ms-1" onclick="approveVoucher('${d.id}', '${v.type}')">Confirm</button>` : ''}
                </td>
            </tr>`;
            retBody.innerHTML += returnRow;
        }
    });
    
    const prBadge = document.getElementById('prBadge');
    if(prBadge) prBadge.innerText = prCount;
    const prBadgeInner = document.getElementById('prBadgeInner');
    if(prBadgeInner) prBadgeInner.innerText = prCount;

    // Update Dashboard Stats
    const elPR = document.getElementById('procStatsPR'); if(elPR) elPR.innerText = stats.pr;
    const elPO = document.getElementById('procStatsPO'); if(elPO) elPO.innerText = stats.poActive;
    const elTr = document.getElementById('procStatsTransit'); if(elTr) elTr.innerText = stats.transit;
    const elCm = document.getElementById('procStatsCompleted'); if(elCm) elCm.innerText = stats.completed;
}

window.filterPOTableSmart = () => {
    const search = document.getElementById('poSearchInput').value.toLowerCase();
    const statusFilter = document.getElementById('poStatusFilterSmart').value.toLowerCase();
    const rows = document.querySelectorAll('#poTableBody tr');
    
    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        const statusText = row.querySelector('.fw-bold') ? row.querySelector('.fw-bold').innerText.toLowerCase() : ''; // Status is in the progress bar label
        
        const matchesSearch = text.includes(search);
        const matchesStatus = statusFilter === 'all' || text.includes(statusFilter);
        
        row.style.display = (matchesSearch && matchesStatus) ? '' : 'none';
    });
}

window.convertPRtoPO = async (prId) => {
    toggleLoading(true);
    const docSnap = await getDoc(doc(db, "vouchers", prId));
    if(!docSnap.exists()) { toggleLoading(false); return; }
    const pr = docSnap.data();
    
    if(pr.status === 'completed') {
        toggleLoading(false);
        alert("This Purchase Request is already completed (PO Created).");
        return;
    }
    
    openVoucherModal('purchase_order');
    document.getElementById('voucherParty').value = pr.party || ''; // Supplier if suggested
    document.getElementById('voucherLetterRef').value = "Ref: PR-" + prId.slice(0,6);
    document.getElementById('relatedPrId').value = prId;
    document.getElementById('voucherItemsBody').innerHTML = '';
    
    pr.items.forEach(i => addVoucherItemRow(i));
    toggleLoading(false);
}

// --- SUPPLIER STATS LOGIC ---
window.loadSupplierStats = async () => {
    const q = query(collection(db, "vouchers"), where("type", "==", "purchase_order"));
    const snap = await getDocs(q);
    const stats = {};

    snap.forEach(d => {
        const v = d.data();
        const name = v.party || 'Unknown';
        if(!stats[name]) stats[name] = { total: 0, active: 0, completed: 0, lastDate: '' };
        
        stats[name].total++;
        if(['ordered', 'shipped', 'partially_received'].includes(v.status)) stats[name].active++;
        if(['received', 'completed'].includes(v.status)) stats[name].completed++;
        
        if(v.date > stats[name].lastDate) stats[name].lastDate = v.date;
    });

    const tbody = document.getElementById('supplierStatsBody');
    if(tbody) {
        tbody.innerHTML = '';
        // Sort by Total POs desc
        Object.keys(stats).sort((a,b) => stats[b].total - stats[a].total).forEach(name => {
            const s = stats[name];
            tbody.innerHTML += `
                <tr>
                    <td class="ps-4 fw-bold text-dark">${name}</td>
                    <td class="text-center">${s.total}</td>
                    <td class="text-center text-primary fw-bold">${s.active}</td>
                    <td class="text-center text-success">${s.completed}</td>
                    <td class="text-end pe-4 small text-muted">${s.lastDate}</td>
                </tr>
            `;
        });
    }
}

window.updatePOStatus = async (id, status) => {
    if(!confirm(`Update status to ${status.toUpperCase()}?`)) return;
    await updateDoc(doc(db, "vouchers", id), { status: status });
    loadVouchers(); // Refresh list
}



window.updatePOStatus = async (id, status) => {
    if(!confirm(`Update status to ${status.toUpperCase()}?`)) return;
    await updateDoc(doc(db, "vouchers", id), { status: status });
    loadKanban();
}

window.rejectVoucher = async (id) => {
    if(!confirm("Are you sure you want to reject this request?")) return;
    toggleLoading(true);
    try {
        await updateDoc(doc(db, "vouchers", id), { status: 'rejected' });
        loadVouchers();
    } catch(e) {
        console.error(e);
        alert("Error rejecting voucher: " + e.message);
    }
    toggleLoading(false);
}

window.approveVoucher = async (id, type) => {
    if(isTransactionProcessing) return;
    if(!confirm("Confirm and process stock update?")) return;
    
    isTransactionProcessing = true;
    toggleLoading(true);
    try {
    const vRef = doc(db, "vouchers", id);
    const vSnap = await getDoc(vRef);
    const v = vSnap.data();

    // Update Stock (DB + Local Memory)
    for(let item of v.items) {
        const invRef = doc(db, "inventory", item.itemId);
        const invIndex = inventory.findIndex(i => i.id === item.itemId);
        const localItem = inventory[invIndex];

        if(localItem) {
            const cur = localItem.balance || 0;
            const curDamage = localItem.damagedBalance || 0;
            let updateData = {};
            
            if (v.type === 'damage_return') {
                updateData = { damagedBalance: curDamage + item.qty };
                inventory[invIndex].damagedBalance = curDamage + item.qty;
            } else if (v.type === 'return' || v.type === 'receipt') {
                updateData = { balance: cur + item.qty };
                inventory[invIndex].balance = cur + item.qty;
            } else {
                updateData = { balance: cur - item.qty };
                inventory[invIndex].balance = cur - item.qty;
            }

            await updateDoc(invRef, updateData);
            
            // Log Transaction
            await addDoc(collection(db, "transactions"), {
                date: serverTimestamp(),
                type: (v.type === 'receipt' || v.type === 'return' || v.type === 'damage_return') ? 'in' : 'out',
                subType: v.type, 
                itemId: item.itemId,
                itemName: item.itemName,
                qty: item.qty,
                party: v.party,
                ref: v.ref,
                user: currentUser.email
            });
        }
    }
    
    await updateDoc(vRef, { status: 'approved' });

    // AUTOMATIC JOB STATUS UPDATE (Warehouse -> Job Order)
    if (v.jobId) {
        await updateDoc(doc(db, "job_orders", v.jobId), { status: 'Work in Progress' });
    }

    loadVouchers();
    filterInventory(); // Update UI
    // loadProjectUsage(); // We can reload this lazily when view is clicked
    } catch(e) {
        console.error(e);
        alert("Error approving voucher: " + e.message);
    } finally {
        isTransactionProcessing = false;
        toggleLoading(false);
    }
}

window.printVoucher = async (id) => {
    const snap = await getDoc(doc(db, "vouchers", id));
    if (!snap.exists()) {
        alert("Voucher not found!");
        return;
    }
    const v = snap.data();
    
    let title = "VOUCHER";
    if (v.type === 'receipt') title = "GOODS RECEIPT NOTE (GRN)";
    else if (v.type === 'request') {
        // Detect MRF or Standard DO
        if (v.status === 'approved') title = "STOCK ISSUE NOTE";
        else if (v.ref && v.ref.includes('MRF')) title = "MATERIAL REQUISITION FORM (MRF)";
        else title = "DELIVERY ORDER (DO)";
    }
    else if (v.type === 'return') title = "MATERIAL RETURN NOTE";
    else if (v.type === 'damage_return') title = "DAMAGE RETURN NOTE";
    else if (v.type === 'purchase_order') title = "PURCHASE ORDER";
    else if (v.type === 'purchase_request') title = "PURCHASE REQUEST";

    document.getElementById('printTitle').innerText = title;
    document.getElementById('printParty').innerText = v.party;
    document.getElementById('printDate').innerText = v.date;
    document.getElementById('printRef').innerText = "Ref: " + (v.ref || '-');
    document.getElementById('printId').innerText = id.slice(0, 8).toUpperCase();
    
    // Hide Description Box for standard vouchers (unless we add remarks later)
    const descEl = document.getElementById('printDesc');
    if(descEl) descEl.classList.add('hidden');
    
    // Generate QR Code
    const qrContainer = document.getElementById('printQRCode');
    qrContainer.innerHTML = '';
    
    const tempDiv = document.createElement('div');
    new QRCode(tempDiv, {
        text: window.location.origin + window.location.pathname + '?voucher=' + id,
        width: 80,
        height: 80
    });
    
    setTimeout(() => {
        let src = '';
        const img = tempDiv.querySelector('img');
        const canvas = tempDiv.querySelector('canvas');
        if(img && img.src) src = img.src;
        else if(canvas) src = canvas.toDataURL();

        if(src) {
            const newImg = document.createElement('img');
            newImg.src = src;
            newImg.style.width = '80px';
            newImg.style.height = '80px';
            qrContainer.appendChild(newImg);
        }
    }, 50);

    if (v.type === 'return' || v.type === 'damage_return') {
        document.getElementById('label1').innerText = "Returned By";
        document.getElementById('printReqBy').innerText = v.retBy || '';
        document.getElementById('label2').innerText = "Checked By";
        document.getElementById('printAppBy').innerText = "________________";
        document.getElementById('label3').innerText = "Received By";
        document.getElementById('printRecBy').innerText = v.recBy || '';
    } else {
        document.getElementById('label1').innerText = "Prepared/Requested By";
        document.getElementById('printReqBy').innerText = v.reqBy || '';
        document.getElementById('label2').innerText = "Approved By";
        document.getElementById('printAppBy').innerText = v.appBy || '';
        document.getElementById('label3').innerText = "Received By";
        document.getElementById('printRecBy').innerText = ''; 
    }
    
    const tbody = document.getElementById('printTableBody');
    tbody.innerHTML = '';
    let count = 1;
    
    v.items.forEach(i => {
        const invItem = inventory.find(inv => inv.id === i.itemId);
        const unit = invItem ? (invItem.unit || 'Pcs') : 'Pcs';
        const desc = invItem ? (invItem.brand + " " + invItem.model) : i.itemName;
        const serialDisplay = i.serials ? `<div class="small text-muted mt-1" style="font-size:0.75rem;"><i class="fas fa-barcode me-1"></i>S/N: ${i.serials}</div>` : '';

        tbody.innerHTML += `
            <tr>
                <td>${count++}</td>
                <td>${i.itemCode}</td>
                <td>${desc} ${serialDisplay}</td>
                <td class="text-center">${i.qty}</td>
                <td class="text-center">${unit}</td>
            </tr>
        `;
    });
    
    new bootstrap.Modal(document.getElementById('printModal')).show();
}

// --- JOB ORDER & BOM MODULE ---
window.toggleJobView = (view) => {
    const listBtn = document.getElementById('btnJobListView');
    const ganttBtn = document.getElementById('btnJobGanttView');
    const listCont = document.getElementById('jobListContainer');
    const ganttCont = document.getElementById('jobGanttContainer');

    if(view === 'list') {
        listBtn.classList.add('active'); ganttBtn.classList.remove('active');
        listCont.classList.remove('hidden'); ganttCont.classList.add('hidden');
    } else {
        listBtn.classList.remove('active'); ganttBtn.classList.add('active');
        listCont.classList.add('hidden'); ganttCont.classList.remove('hidden');
        renderGanttChart();
    }
}

window.loadJobOrders = async (filterProject = null) => {
    const tbody = document.getElementById('jobOrderTableBody');
    tbody.innerHTML = '';
    
    let q;
    if (filterProject) {
        q = query(collection(db, "job_orders"), where("customer", "==", filterProject));
    } else {
        q = query(collection(db, "job_orders"), orderBy("date", "desc"));
    }

    const snap = await getDocs(q);
    let jobs = [];
    snap.forEach(d => jobs.push({id: d.id, ...d.data()}));
    
    // Client-side sort to ensure order (handles filtered results without composite index)
    jobs.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Update Header
    const titleEl = document.querySelector('#jobOrderView h3');
    if(titleEl) {
        if(filterProject) {
            titleEl.innerHTML = `Job Orders: <span class="text-primary">${filterProject}</span> <button class="btn btn-sm btn-outline-dark ms-3" style="font-size: 0.8rem;" onclick="loadJobOrders()">Show All</button>`;
        } else {
            titleEl.innerHTML = `Job Order Management`;
        }
    }
    
    jobs.forEach(job => {
        const id = job.id;

        const staffList = Array.isArray(job.assignedStaff) ? job.assignedStaff.join(', ') : (job.assignedStaff || '');
        const staffDisplay = staffList ? `<div class="small text-info"><i class="fas fa-user-hard-hat me-1"></i>${staffList}</div>` : '';

        // MRF Column Logic
        let mrfBtn = '';
        if (job.status === 'Completed' || job.status === 'Cancelled') {
            mrfBtn = '<span class="text-muted small">-</span>';
        } else {
            mrfBtn = `<button class="btn btn-sm btn-warning text-dark shadow-sm" onclick="createMRF('${id}')" title="Generate Material Requisition"><i class="fas fa-file-export me-1"></i>Generate</button>`;
        }

        tbody.innerHTML += `
            <tr>
                <td class="fw-bold text-primary">${id.slice(0,6).toUpperCase()}</td>
                <td>
                    <div class="fw-bold">${job.customer}</div>
                    ${staffDisplay}
                    <div class="small text-muted text-truncate" style="max-width: 200px;">${job.desc || ''}</div>
                </td>
                <td>${job.date}</td>
                <td>${mrfBtn}</td>
                <td>
                    <select onchange="updateJobStatus('${id}', this.value)" class="form-select form-select-sm" style="width:auto; min-width:130px; font-size:0.85rem;">
                        <option value="New" ${job.status==='New'?'selected':''}>New</option>
                        <option value="MRF Issued" ${job.status==='MRF Issued'?'selected':''}>MRF Issued</option>
                        <option value="Work in Progress" ${job.status==='Work in Progress'?'selected':''}>Work in Progress</option>
                        <option value="Partially Completed" ${job.status==='Partially Completed'?'selected':''}>Partially Completed</option>
                        <option value="Completed" ${job.status==='Completed'?'selected':''}>Completed</option>
                        <option value="Cancelled" ${job.status==='Cancelled'?'selected':''}>Cancelled</option>
                    </select>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-dark" onclick="openJobOrderModal('${id}')" title="Edit Job"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-primary" onclick="openBOMModal('${id}')" title="Manage BOM"><i class="fas fa-list-alt"></i> BOM</button>
                    <button class="btn btn-sm btn-secondary" onclick="printJobOrder('${id}')" title="Print Job Order"><i class="fas fa-print"></i></button>
                    ${job.status !== 'Completed' ? `<button class="btn btn-sm btn-success ms-1" onclick="updateJobStatus('${id}', 'Completed')" title="Signoff / Complete Project"><i class="fas fa-check"></i></button>` : ''}
                    ${(job.status === 'Work in Progress' || job.status === 'MRF Issued') ? `<button class="btn btn-sm btn-info text-white ms-1" onclick="updateJobStatus('${id}', 'Partially Completed')" title="Mark Partial Completion"><i class="fas fa-hourglass-half"></i></button>` : ''}
                    ${job.status === 'Completed' ? `<button class="btn btn-sm btn-outline-dark ms-1" onclick="printProjectSignOff('${id}')" title="Print Sign-off Document"><i class="fas fa-file-signature"></i></button>` : ''}
                    ${job.status === 'Completed' ? `<button class="btn btn-sm btn-dark ms-1" onclick="printProjectCompletionReport('${id}')" title="Full Project Report"><i class="fas fa-book"></i></button>` : ''}
                </td>
            </tr>
        `;
    });
    
    // If Gantt is active, refresh it too
    if(!document.getElementById('jobGanttContainer').classList.contains('hidden')) {
        renderGanttChart();
    }
}

async function renderGanttChart() {
    const container = document.getElementById('ganttChartArea');
    container.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';

    const q = query(collection(db, "job_orders"), orderBy("date", "asc"));
    const snap = await getDocs(q);
    const jobs = [];
    snap.forEach(d => jobs.push({id: d.id, ...d.data()}));

    if(jobs.length === 0) {
        container.innerHTML = '<div class="text-center p-5 text-muted">No jobs found.</div>';
        return;
    }

    // 1. Determine Date Range
    let minDate = new Date();
    let maxDate = new Date();
    
    jobs.forEach(j => {
        const s = new Date(j.date);
        const e = j.endDate ? new Date(j.endDate) : new Date(s);
        if(s < minDate) minDate = s;
        if(e > maxDate) maxDate = e;
    });
    
    // Add buffer (5 days before, 10 days after)
    minDate.setDate(minDate.getDate() - 5);
    maxDate.setDate(maxDate.getDate() + 15);

    const dayWidth = 40; // px
    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));
    
    // 2. Build Header
    let headerHtml = '<div class="gantt-wrapper"><div class="gantt-header">';
    for(let i=0; i<=totalDays; i++) {
        const d = new Date(minDate); d.setDate(minDate.getDate() + i);
        const dayNum = d.getDate();
        const dayName = d.toLocaleDateString('en-US', {weekday: 'narrow'});
        headerHtml += `<div class="gantt-header-cell">${dayNum}<br><span style="font-weight:normal;opacity:0.7">${dayName}</span></div>`;
    }
    headerHtml += '</div><div class="gantt-body">';

    // 3. Build Rows
    const today = new Date();
    const todayOffset = Math.ceil((today - minDate) / (1000 * 60 * 60 * 24)) * dayWidth;

    jobs.forEach(job => {
        const start = new Date(job.date);
        const end = job.endDate ? new Date(job.endDate) : new Date(start);
        
        const offsetDays = (start - minDate) / (1000 * 60 * 60 * 24);
        const durationDays = Math.max(1, (end - start) / (1000 * 60 * 60 * 24) + 1); // +1 to include end day
        
        const left = offsetDays * dayWidth;
        const width = durationDays * dayWidth;
        
        const colorClass = job.status === 'Completed' ? '#198754' : (job.status === 'Partially Completed' ? '#0dcaf0' : (job.status === 'New' ? '#0d6efd' : '#ffc107'));
        const textColor = job.status === 'MRF Issued' ? '#000' : '#fff';

        headerHtml += `
            <div class="gantt-row">
                <div class="gantt-grid-lines">${Array(totalDays+1).fill(`<div class="gantt-grid-line"></div>`).join('')}</div>
                <div class="gantt-bar" style="left: ${left}px; width: ${width}px; background-color: ${colorClass}; color: ${textColor};" onclick="openJobOrderModal('${job.id}')" title="${job.customer} (${job.status})">
                    ${job.customer}
                </div>
            </div>`;
    });

    // Today Line
    if(todayOffset >= 0 && todayOffset <= (totalDays * dayWidth)) {
        headerHtml += `<div class="gantt-today-line" style="left: ${todayOffset + (dayWidth/2)}px;"></div>`;
    }

    headerHtml += '</div></div>';
    container.innerHTML = headerHtml;
}

window.printJobOrder = async (id) => {
    toggleLoading(true);
    try {
        const docSnap = await getDoc(doc(db, "job_orders", id));
        if(!docSnap.exists()) { toggleLoading(false); return; }
        const job = docSnap.data();

        document.getElementById('printTitle').innerText = "JOB ORDER";
        document.getElementById('printSubtitle').innerText = "Project / Service Order";
        
        let partyInfo = `<strong>${job.customer}</strong>`;
        if(job.address) partyInfo += `<br><span class="small text-muted fw-normal">${job.address}</span>`;
        if(job.phone) partyInfo += `<br><span class="small text-muted fw-normal">Tel: ${job.phone}</span>`;
        document.getElementById('printParty').innerHTML = partyInfo;
        
        document.getElementById('printDate').innerText = job.date;
        document.getElementById('printRef').innerText = "Ref: " + id.slice(0, 8).toUpperCase();
        document.getElementById('printId').innerText = id.slice(0, 8).toUpperCase();
        
        // Show Description
        const descEl = document.getElementById('printDesc');
        if(descEl) {
            descEl.classList.remove('hidden');
            let descHtml = `<strong>Scope / Description:</strong><br>${job.desc || 'No description provided.'}`;
            if(job.assignedStaff) {
                descHtml += `<div class="mt-2 pt-2 border-top"><strong>Assigned Staff:</strong> ${job.assignedStaff}</div>`;
            }
            descEl.innerHTML = descHtml;
        }

        // Generate QR
        const qrContainer = document.getElementById('printQRCode');
        qrContainer.innerHTML = '';
        const tempDiv = document.createElement('div');
        new QRCode(tempDiv, { text: window.location.origin + window.location.pathname + '?job=' + id, width: 80, height: 80 });
        setTimeout(() => {
            const img = tempDiv.querySelector('img');
            if(img) qrContainer.appendChild(img);
        }, 50);

        // Signatures
        document.getElementById('label1').innerText = "Prepared By";
        document.getElementById('printReqBy').innerText = job.updatedBy || 'Admin';
        document.getElementById('label2').innerText = "Approved By";
        document.getElementById('printAppBy').innerText = "________________";
        document.getElementById('label3').innerText = "Staff Signature";
        document.getElementById('printRecBy').innerText = (Array.isArray(job.assignedStaff) ? job.assignedStaff.join(', ') : job.assignedStaff) || "________________";

        // Table (BOM)
        const tbody = document.getElementById('printTableBody');
        tbody.innerHTML = '';
        let count = 1;
        
        if(job.bom && job.bom.length > 0) {
            job.bom.forEach(i => {
                const invItem = inventory.find(inv => inv.itemCode === i.itemCode);
                const desc = invItem ? (invItem.brand + " " + invItem.model) : i.itemCode;
                const unit = invItem ? (invItem.unit || 'Pcs') : 'Pcs';
                tbody.innerHTML += `<tr><td>${count++}</td><td>${i.itemCode}</td><td>${desc}</td><td class="text-center">${i.qty}</td><td class="text-center">${unit}</td></tr>`;
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No BOM Items Defined</td></tr>';
        }

        new bootstrap.Modal(document.getElementById('printModal')).show();
    } catch(e) { console.error(e); alert("Error printing job order"); }
    toggleLoading(false);
}

window.openJobOrderModal = async (id = null, prefillCustomer = null) => {
    const modal = new bootstrap.Modal(document.getElementById('jobOrderModal'));
    document.getElementById('jobId').value = id || '';

    // Cleanup previous dynamic buttons
    const existingReopen = document.getElementById('btnReopenJob');
    if(existingReopen) existingReopen.remove();

    // Prepare Staff Checkboxes
    let currentStaff = [];
    
    if(id) {
        const docSnap = await getDoc(doc(db, "job_orders", id));
        const job = docSnap.data();
        document.getElementById('jobCustomer').value = job.customer;
        document.getElementById('jobDate').value = job.date;
        document.getElementById('jobStatus').value = job.status || 'New';
        document.getElementById('jobEndDate').value = job.endDate || '';
        
        // Handle Staff (Array or String)
        if(Array.isArray(job.assignedStaff)) currentStaff = job.assignedStaff;
        else if(job.assignedStaff) currentStaff = [job.assignedStaff];
        
        document.getElementById('jobPhone').value = job.phone || '';
        document.getElementById('jobAddress').value = job.address || '';
        document.getElementById('jobDesc').value = job.desc || '';
        document.getElementById('jobModalTitle').innerText = "Edit Job Order";

        // Disable Save if Completed
        const saveBtn = document.querySelector('#jobOrderModal .modal-footer .btn-primary');
        if (job.status === 'Completed') {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-lock me-1"></i> Completed';
            
            // Add Re-open Button for Admins
            if (currentUserRole === 'admin' || currentUserRole === 'superadmin') {
                const reopenBtn = document.createElement('button');
                reopenBtn.id = 'btnReopenJob';
                reopenBtn.type = 'button';
                reopenBtn.className = 'btn btn-outline-danger me-2';
                reopenBtn.innerHTML = '<i class="fas fa-unlock-alt me-1"></i> Re-open';
                reopenBtn.onclick = async () => {
                    if(!confirm("Re-open this job? Status will change to 'Work in Progress'.")) return;
                    await updateDoc(doc(db, "job_orders", id), { status: 'Work in Progress' });
                    await setDoc(doc(db, "project_status", job.customer), { status: 'active' }, { merge: true });
                    bootstrap.Modal.getInstance(document.getElementById('jobOrderModal')).hide();
                    loadJobOrders();
                };
                saveBtn.parentNode.insertBefore(reopenBtn, saveBtn);
            }
        } else {
            saveBtn.disabled = false;
            saveBtn.innerText = 'Save Job';
        }
    } else {
        document.getElementById('jobCustomer').value = prefillCustomer || '';
        document.getElementById('jobDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('jobStatus').value = 'New';
        document.getElementById('jobEndDate').value = '';
        document.getElementById('jobPhone').value = '';
        document.getElementById('jobAddress').value = '';
        document.getElementById('jobDesc').value = '';
        document.getElementById('jobModalTitle').innerText = "New Job Order";
        
        const saveBtn = document.querySelector('#jobOrderModal .modal-footer .btn-primary');
        saveBtn.disabled = false;
        saveBtn.innerText = 'Save Job';

        if(prefillCustomer) {
            autoFillJobDetails();
        }
    }

    // Render Checkboxes
    const staffContainer = document.getElementById('jobStaffContainer');
    staffContainer.innerHTML = '';
    systemUsers.forEach(u => {
        const isChecked = currentStaff.includes(u) ? 'checked' : '';
        staffContainer.innerHTML += `
            <div class="form-check">
                <input class="form-check-input staff-checkbox" type="checkbox" value="${u}" id="staff_${u.replace(/\s/g, '')}" ${isChecked}>
                <label class="form-check-label small" for="staff_${u.replace(/\s/g, '')}">${u}</label>
            </div>
        `;
    });

    modal.show();
}

window.autoFillJobDetails = () => {
    const name = document.getElementById('jobCustomer').value;
    const party = parties.find(p => p.name === name);
    if(party) {
        if(!document.getElementById('jobPhone').value) document.getElementById('jobPhone').value = party.contact || '';
        if(!document.getElementById('jobAddress').value) document.getElementById('jobAddress').value = party.address || '';
    }
}

window.saveJobOrder = async () => {
    if(isTransactionProcessing) return;
    isTransactionProcessing = true;
    toggleLoading(true);
    try {
    const id = document.getElementById('jobId').value;
    const customer = document.getElementById('jobCustomer').value;
    if(!customer) throw new Error("Customer is required");

    // Collect Staff
    const selectedStaff = [];
    document.querySelectorAll('.staff-checkbox:checked').forEach(cb => selectedStaff.push(cb.value));

    const data = {
        customer: customer,
        date: document.getElementById('jobDate').value,
        status: document.getElementById('jobStatus').value,
        endDate: document.getElementById('jobEndDate').value,
        assignedStaff: selectedStaff,
        phone: document.getElementById('jobPhone').value,
        address: document.getElementById('jobAddress').value,
        desc: document.getElementById('jobDesc').value,
        updatedBy: currentUser.email,
        updatedAt: serverTimestamp()
    };

    if(id) {
        // Validation: Prevent editing if Completed (unless re-opening)
        const currentDoc = await getDoc(doc(db, "job_orders", id));
        if (currentDoc.exists()) {
            const currentJob = currentDoc.data();
            if (currentJob.status === 'Completed' && data.status === 'Completed') {
                throw new Error("This Job Order is Completed and locked. Please Re-open it first to make changes.");
            }
        }
        await updateDoc(doc(db, "job_orders", id), data);
    } else {
        await addDoc(collection(db, "job_orders"), { ...data, createdAt: serverTimestamp() });
    }
    
    bootstrap.Modal.getInstance(document.getElementById('jobOrderModal')).hide();
    loadJobOrders();
    renderCalendar(); // Refresh calendar
    } catch(e) {
        console.error(e);
        alert(e.message);
    } finally {
        isTransactionProcessing = false;
    toggleLoading(false);
    }
}

window.updateJobStatus = async (id, status) => {
    if (status === 'Completed') {
        const docSnap = await getDoc(doc(db, "job_orders", id));
        const job = docSnap.data();

        // Check for pending vouchers
        const qV = query(collection(db, "vouchers"), where("party", "==", job.customer), where("status", "==", "pending"));
        const vSnap = await getDocs(qV);
        if (!vSnap.empty) {
            return alert(`Cannot Complete: There are ${vSnap.size} pending MRF/Vouchers for this project. Please process or reject them first.`);
        }

        if(!confirm(`Mark project "${job.customer}" as COMPLETED?\n\nThis will lock the project and update status in Project Usage view.`)) return;
        
        // Sync to project_status collection
        await setDoc(doc(db, "project_status", job.customer), { status: 'completed' }, { merge: true });
    } else if (status === 'Partially Completed') {
        if(!confirm(`Mark project as PARTIALLY COMPLETED?\n\nThis indicates some tasks are done but the project is still active.`)) return;
        
        // Ensure project_status is active
        const docSnap = await getDoc(doc(db, "job_orders", id));
        const job = docSnap.data();
        await setDoc(doc(db, "project_status", job.customer), { status: 'active' }, { merge: true });
    } else {
        if(!confirm(`Mark this project as ${status}?`)) return;
    }

    await updateDoc(doc(db, "job_orders", id), { status: status });
    loadJobOrders();
}

window.openBOMModal = async (jobId) => {
    document.getElementById('bomJobId').value = jobId;
    const tbody = document.getElementById('bomItemsBody');
    tbody.innerHTML = '';
    
    const docSnap = await getDoc(doc(db, "job_orders", jobId));
    const job = docSnap.data();
    const bom = job.bom || [];

    // Disable buttons if Completed
    const saveBtn = document.querySelector('#bomModal .modal-footer .btn-success');
    const prBtn = document.querySelector('#bomModal .modal-footer .btn-warning');
    const addBtn = document.querySelector('#bomModal .modal-body .btn-outline-dark');

    const isCompleted = job.status === 'Completed';
    if(saveBtn) saveBtn.disabled = isCompleted;
    if(prBtn) prBtn.disabled = isCompleted;
    if(addBtn) isCompleted ? addBtn.classList.add('hidden') : addBtn.classList.remove('hidden');
    
    if(bom.length > 0) {
        bom.forEach(item => addBOMRow(item));
    } else if (!isCompleted) {
        addBOMRow();
    }
    
    new bootstrap.Modal(document.getElementById('bomModal')).show();
}

window.addBOMRow = (data = null) => {
    const item = data ? inventory.find(i => i.itemCode === data.itemCode) : null;
    const balance = item ? item.balance : '-';
    // Highlight if requested qty is greater than balance
    const balanceClass = (item && item.balance < (data ? data.qty : 0)) ? 'text-danger fw-bold' : 'text-success';
    
    const row = `
        <tr>
            <td><input type="text" class="form-control form-control-sm bom-item-search" list="inventoryList" placeholder="Search Item..." value="${data ? data.itemCode : ''}" onchange="updateBOMStock(this)"></td>
            <td><input type="number" class="form-control form-control-sm bom-qty" value="${data ? data.qty : 1}" min="1" onchange="updateBOMStock(this)"></td>
            <td><span class="bom-stock small ${balanceClass}">${balance}</span></td>
            <td><button class="btn btn-sm text-danger" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button></td>
        </tr>
    `;
    document.getElementById('bomItemsBody').insertAdjacentHTML('beforeend', row);
}

window.updateBOMStock = (el) => {
    const tr = el.closest('tr');
    const codeInput = tr.querySelector('.bom-item-search');
    const qtyInput = tr.querySelector('.bom-qty');
    const stockSpan = tr.querySelector('.bom-stock');
    
    const code = codeInput.value;
    const qty = parseFloat(qtyInput.value) || 0;
    const item = inventory.find(i => i.itemCode === code);
    
    if(item) {
        stockSpan.innerText = item.balance;
        if(item.balance < qty) {
            stockSpan.className = 'bom-stock small text-danger fw-bold';
            stockSpan.innerText += " (Low)";
        } else {
            stockSpan.className = 'bom-stock small text-success';
        }
    } else {
        stockSpan.innerText = 'N/A';
        stockSpan.className = 'bom-stock small text-muted';
    }
}

window.createPRFromBOM = () => {
    const rows = document.querySelectorAll('#bomItemsBody tr');
    const shortageItems = [];
    
    rows.forEach(tr => {
        const code = tr.querySelector('.bom-item-search').value;
        const qty = parseFloat(tr.querySelector('.bom-qty').value) || 0;
        if(!code || qty <= 0) return;
        
        const item = inventory.find(i => i.itemCode === code);
        const balance = item ? (item.balance || 0) : 0;
        
        // If item doesn't exist (N/A) or balance is less than required
        if(!item || balance < qty) {
            const needed = !item ? qty : (qty - balance);
            shortageItems.push({ itemCode: code, qty: needed, estPrice: 0 });
        }
    });

    if(shortageItems.length === 0) return alert("No shortages detected based on current stock.");
    
    // Close BOM Modal and Open Voucher Modal
    bootstrap.Modal.getInstance(document.getElementById('bomModal')).hide();
    openVoucherModal('purchase_request');
    
    // Pre-fill PR
    document.getElementById('voucherLetterRef').value = "PR-BOM-SHORTAGE";
    document.getElementById('voucherItemsBody').innerHTML = '';
    shortageItems.forEach(i => addVoucherItemRow(i));
    
    alert(`Generated PR for ${shortageItems.length} missing/low-stock items.`);
}

window.saveBOM = async () => {
    const jobId = document.getElementById('bomJobId').value;
    
    // Validation: Prevent editing BOM if Job is Completed
    const jobDoc = await getDoc(doc(db, "job_orders", jobId));
    if (jobDoc.exists() && jobDoc.data().status === 'Completed') {
        return alert("Cannot edit BOM for a Completed Job Order.");
    }

    const rows = document.querySelectorAll('#bomItemsBody tr');
    const bom = [];
    
    rows.forEach(tr => {
        const code = tr.querySelector('.bom-item-search').value;
        const qty = parseFloat(tr.querySelector('.bom-qty').value) || 0;
        if(code && qty > 0) bom.push({ itemCode: code, qty: qty });
    });

    await updateDoc(doc(db, "job_orders", jobId), { bom: bom, status: 'BOM Created' });
    bootstrap.Modal.getInstance(document.getElementById('bomModal')).hide();
    loadJobOrders();
    alert("BOM Saved Successfully!");
}

window.createMRF = async (jobId) => {
    const docSnap = await getDoc(doc(db, "job_orders", jobId));
    const job = docSnap.data();
    
    if(job.status === 'Completed' || job.status === 'Cancelled') {
        if(!confirm("This project is marked as " + job.status + ". Create MRF anyway?")) return;
    }

    if(!job.bom || job.bom.length === 0) return alert("Please create a BOM first.");
    if(!confirm(`Generate Material Requisition Form (Request Voucher) for ${job.customer}?`)) return;

    toggleLoading(true);
    try {
        const items = job.bom.map(i => {
            const invItem = inventory.find(inv => inv.itemCode === i.itemCode);
            return {
                itemId: invItem ? invItem.id : null,
                itemCode: i.itemCode,
                itemName: invItem ? `${invItem.brand} ${invItem.model}` : i.itemCode,
                qty: i.qty,
                estPrice: 0,
                serials: ''
            };
        });

        await addDoc(collection(db, "vouchers"), {
            type: 'request',
            party: job.customer,
            ref: "MRF-" + jobId.slice(0,6).toUpperCase(),
            jobId: jobId, // Link back to Job Order
            date: new Date().toISOString().split('T')[0],
            status: 'pending', // Send directly to Warehouse as Pending
            items: items,
            reqBy: currentUser.email,
            createdAt: serverTimestamp()
        });
        
        alert("MRF Sent to Warehouse Operations (Pending Issue).");
    } catch(e) {
        console.error(e);
        alert("Error creating MRF: " + e.message);
    }
    toggleLoading(false);
    
    await updateDoc(doc(db, "job_orders", jobId), { status: 'MRF Issued' });
    loadJobOrders(); // Refresh status
}

window.openJobCostReport = async () => {
    toggleLoading(true);
    try {
        // 1. Fetch Data
        const jobsSnap = await getDocs(query(collection(db, "job_orders"), orderBy("date", "desc")));
        const transSnap = await getDocs(collection(db, "transactions"));
        
        // 2. Process Transactions into Map: Party -> Cost
        const actualCosts = {};
        transSnap.forEach(d => {
            const t = d.data();
            if(!t.party || !t.itemId) return;
            
            if(!actualCosts[t.party]) actualCosts[t.party] = 0;
            
            const item = inventory.find(i => i.id === t.itemId);
            const cost = item ? (item.costPrice || 0) : 0;
            
            // Actual Usage Cost = (Sent - Good Returns) * Cost
            // Damaged returns are NOT subtracted because the project consumed/destroyed them (Cost incurred)
            if(t.type === 'out') {
                actualCosts[t.party] += (t.qty * cost);
            } else if (t.type === 'in' && t.subType === 'return') {
                actualCosts[t.party] -= (t.qty * cost);
            }
        });

        // 3. Process Jobs
        const tbody = document.getElementById('jobCostReportBody');
        tbody.innerHTML = '';
        
        jobsSnap.forEach(d => {
            const job = d.data();
            if (job.status !== 'Completed') return; // Only Closed/Completed Jobs

            // Calculate BOM Cost
            let bomCost = 0;
            if(job.bom) {
                job.bom.forEach(b => {
                    const item = inventory.find(i => i.itemCode === b.itemCode);
                    const cost = item ? (item.costPrice || 0) : 0;
                    bomCost += (b.qty * cost);
                });
            }

            const actualCost = actualCosts[job.customer] || 0;
            const variance = actualCost - bomCost;
            const pct = bomCost > 0 ? ((variance / bomCost) * 100).toFixed(1) : 0;
            const varianceClass = variance > 0 ? 'text-danger' : 'text-success';
            
            tbody.innerHTML += `<tr><td>${d.id.slice(0,8).toUpperCase()}</td><td>${job.customer}</td><td class="text-end">${Math.round(bomCost).toLocaleString()}</td><td class="text-end">${Math.round(actualCost).toLocaleString()}</td><td class="text-end fw-bold ${varianceClass}">${Math.round(variance).toLocaleString()}</td><td class="text-center ${varianceClass}">${pct}%</td></tr>`;
        });
        
        new bootstrap.Modal(document.getElementById('jobCostReportModal')).show();
    } catch(e) { console.error(e); alert("Error generating report"); }
    toggleLoading(false);
}

window.printProjectSignOff = async (id) => {
    toggleLoading(true);
    try {
        const docSnap = await getDoc(doc(db, "job_orders", id));
        if(!docSnap.exists()) { toggleLoading(false); return; }
        const job = docSnap.data();

        const printWindow = window.open('', '', 'height=800,width=900');
        printWindow.document.write('<html><head><title>Project Sign-off</title>');
        printWindow.document.write('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">');
        printWindow.document.write('<style>body{padding:40px; font-family: "Times New Roman", serif;} .header{border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px;} .sign-line{border-top: 1px solid #000; width: 80%; margin: 0 auto; padding-top: 5px;}</style>');
        printWindow.document.write('</head><body>');
        
        printWindow.document.write(`
            <div class="container">
                <div class="header text-center">
                    <img src="MHLogo.png" alt="Logo" style="height: 60px; margin-bottom: 10px;">
                    <h2 class="fw-bold text-uppercase">Project Completion & Acceptance Certificate</h2>
                    <h5 class="text-muted">Mother Home Solar Co., Ltd.</h5>
                </div>
                
                <div class="row mb-4">
                    <div class="col-6">
                        <p><strong>Customer / Project:</strong><br>${job.customer}</p>
                        <p><strong>Site Address:</strong><br>${job.address || 'N/A'}</p>
                    </div>
                    <div class="col-6 text-end">
                        <p><strong>Job Order Ref:</strong> ${id.slice(0,8).toUpperCase()}</p>
                        <p><strong>Completion Date:</strong> ${new Date().toLocaleDateString()}</p>
                    </div>
                </div>

                <div class="mb-5">
                    <h5 class="fw-bold border-bottom pb-2">Project Scope / Description</h5>
                    <p class="p-3 bg-light border rounded">${job.desc || 'No description provided.'}</p>
                </div>

                <div class="mb-5">
                    <h5 class="fw-bold border-bottom pb-2">Declaration of Acceptance</h5>
                    <p>
                        This document certifies that the solar energy system/installation described above has been 
                        completed, tested, and commissioned in accordance with the agreed specifications.
                    </p>
                    <p>
                        The client acknowledges that the system is fully operational and free from visible defects 
                        at the time of handover. Training on basic operation and safety has been provided.
                    </p>
                </div>

                <div class="row mt-5 pt-5">
                    <div class="col-6 text-center">
                        <div class="mb-5"></div>
                        <div class="sign-line">
                            <strong>Authorized Signature</strong><br>
                            Mother Home Solar Co., Ltd.<br>
                            <small>(Project Manager / Engineer)</small>
                        </div>
                    </div>
                    <div class="col-6 text-center">
                        <div class="mb-5"></div>
                        <div class="sign-line">
                            <strong>Customer Acceptance</strong><br>
                            ${job.customer}<br>
                            <small>(Signature & Stamp)</small>
                        </div>
                    </div>
                </div>
            </div>
        `);
        
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); }, 1000);
    } catch(e) { console.error(e); alert("Error generating sign-off document"); }
    toggleLoading(false);
}

window.printProjectCompletionReport = async (id) => {
    toggleLoading(true);
    try {
        const docSnap = await getDoc(doc(db, "job_orders", id));
        if(!docSnap.exists()) { toggleLoading(false); return; }
        const job = docSnap.data();

        // Fetch Vouchers
        const qV = query(collection(db, "vouchers"), where("party", "==", job.customer));
        const vSnap = await getDocs(qV);
        let vouchersHtml = '';
        vSnap.forEach(d => {
            const v = d.data();
            vouchersHtml += `<tr><td>${v.date}</td><td>${v.type.toUpperCase()}</td><td>${v.ref || '-'}</td><td>${v.status}</td><td>${v.items.length} Items</td></tr>`;
        });

        // Fetch Transactions (Usage)
        const qT = query(collection(db, "transactions"), where("party", "==", job.customer));
        const tSnap = await getDocs(qT);
        const usageMap = {};
        tSnap.forEach(d => {
            const t = d.data();
            if(!t.itemId) return;
            if(!usageMap[t.itemId]) usageMap[t.itemId] = { name: t.itemName, sent: 0, ret: 0 };
            if(t.type === 'out') usageMap[t.itemId].sent += t.qty;
            if(t.type === 'in') usageMap[t.itemId].ret += t.qty;
        });

        let usageHtml = '';
        for(const [itemId, data] of Object.entries(usageMap)) {
            const net = data.sent - data.ret;
            if(net !== 0 || data.sent > 0) {
                usageHtml += `<tr><td>${data.name}</td><td class="text-center">${data.sent}</td><td class="text-center">${data.ret}</td><td class="text-center fw-bold">${net}</td></tr>`;
            }
        }

        const printWindow = window.open('', '', 'height=900,width=1000');
        printWindow.document.write('<html><head><title>Project Completion Report</title>');
        printWindow.document.write('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">');
        printWindow.document.write('<style>body{padding:30px; font-family: sans-serif;} .section-title{background:#f8f9fa; padding:8px; border-left:4px solid #0d6efd; margin-top:20px; font-weight:bold;}</style>');
        printWindow.document.write('</head><body>');
        
        printWindow.document.write(`
            <div class="container">
                <div class="text-center mb-4 border-bottom pb-3">
                    <img src="MHLogo.png" alt="Logo" style="height: 60px; margin-bottom: 10px;">
                    <h2 class="fw-bold">PROJECT COMPLETION REPORT</h2>
                    <h5 class="text-muted">Mother Home Solar Co., Ltd.</h5>
                </div>
                
                <div class="row mb-4">
                    <div class="col-6">
                        <strong>Project:</strong> ${job.customer}<br>
                        <strong>Address:</strong> ${job.address || '-'}<br>
                        <strong>Staff:</strong> ${Array.isArray(job.assignedStaff) ? job.assignedStaff.join(', ') : job.assignedStaff}
                    </div>
                    <div class="col-6 text-end">
                        <strong>Job Ref:</strong> ${id.slice(0,8).toUpperCase()}<br>
                        <strong>Start Date:</strong> ${job.date}<br>
                        <strong>Completion:</strong> ${job.endDate || new Date().toLocaleDateString()}<br>
                        <span class="badge bg-success fs-6">COMPLETED</span>
                    </div>
                </div>

                <div class="section-title">1. Scope of Work</div>
                <p class="p-2">${job.desc || 'No description.'}</p>

                <div class="section-title">2. Material Usage Summary (Net Consumed)</div>
                <table class="table table-sm table-bordered table-striped">
                    <thead class="table-light"><tr><th>Item</th><th class="text-center">Sent</th><th class="text-center">Returned</th><th class="text-center">Net Used</th></tr></thead>
                    <tbody>${usageHtml || '<tr><td colspan="4" class="text-center text-muted">No material usage recorded.</td></tr>'}</tbody>
                </table>

                <div class="section-title">3. Related Vouchers</div>
                <table class="table table-sm table-bordered">
                    <thead class="table-light"><tr><th>Date</th><th>Type</th><th>Ref</th><th>Status</th><th>Details</th></tr></thead>
                    <tbody>${vouchersHtml || '<tr><td colspan="5" class="text-center text-muted">No vouchers found.</td></tr>'}</tbody>
                </table>

                <div class="row mt-5">
                    <div class="col-12 text-center">
                        <p class="text-muted small">This report is automatically generated by Solar ERP System.</p>
                    </div>
                </div>
            </div>
        `);
        
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); }, 1000);

    } catch(e) {
        console.error(e);
        alert("Error generating report: " + e.message);
    }
    toggleLoading(false);
}

window.openStaffReport = async () => {
    toggleLoading(true);
    try {
        const q = query(collection(db, "job_orders"));
        const snap = await getDocs(q);
        
        const stats = {};
        
        snap.forEach(d => {
            const job = d.data();
            let staffArr = Array.isArray(job.assignedStaff) ? job.assignedStaff : (job.assignedStaff ? [job.assignedStaff] : ['Unassigned']);
            
            staffArr.forEach(staff => {
                if(!stats[staff]) stats[staff] = { total: 0, completed: 0 };
                stats[staff].total++;
                if(job.status === 'Completed') stats[staff].completed++;
            });
        });
        
        const tbody = document.getElementById('staffReportBody');
        tbody.innerHTML = '';
        
        const sortedStaff = Object.keys(stats).sort((a,b) => stats[b].total - stats[a].total);
        
        sortedStaff.forEach(name => {
            const s = stats[name];
            const pending = s.total - s.completed;
            const rate = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
            
            let rateClass = rate >= 80 ? 'text-success fw-bold' : (rate < 50 ? 'text-warning fw-bold' : 'text-muted');
            
            tbody.innerHTML += `<tr><td class="fw-bold">${name}</td><td class="text-center">${s.total}</td><td class="text-center text-success">${s.completed}</td><td class="text-center text-secondary">${pending}</td><td class="text-center ${rateClass}">${rate}%</td></tr>`;
        });
        
        new bootstrap.Modal(document.getElementById('staffReportModal')).show();
    } catch(e) { console.error(e); alert("Error generating report"); }
    toggleLoading(false);
}

// NEW: Print Project Usage Voucher for Finance
window.printProjectVoucher = async (projectName) => {
    toggleLoading(true);
    try {
        const q = query(collection(db, "transactions"), where("party", "==", projectName));
        const snap = await getDocs(q);
        
        const usageMap = {}; // itemCode -> { name, sent, returned, damaged }
        
        snap.forEach(d => {
            const t = d.data();
            if(!t.itemId) return;
            
            if(!usageMap[t.itemId]) {
                usageMap[t.itemId] = { 
                    code: t.itemId, // temp, will fetch real code if needed or use local inventory
                    name: t.itemName || 'Unknown Item',
                    sent: 0,
                    returned: 0,
                    damaged: 0
                };
            }
            
            if(t.type === 'out') usageMap[t.itemId].sent += t.qty;
            if(t.type === 'in' && t.subType === 'return') usageMap[t.itemId].returned += t.qty;
            if(t.type === 'in' && t.subType === 'damage_return') usageMap[t.itemId].damaged += t.qty;
        });
        
        // Enrich with Inventory Code if possible (from local cache)
        const rows = [];
        for (const [id, data] of Object.entries(usageMap)) {
            const invItem = inventory.find(i => i.id === id);
            const code = invItem ? invItem.itemCode : 'N/A';
            const unit = invItem ? (invItem.unit || 'Pcs') : 'Pcs';
            const netUsed = data.sent - data.returned; // Standard Net Usage Calculation
            
            if (data.sent > 0 || data.returned > 0 || data.damaged > 0) {
                rows.push({ ...data, code, unit, netUsed });
            }
        }
        
        // Generate QR Code for Project Voucher
        const qrDataUrl = await new Promise((resolve) => {
            const div = document.createElement('div');
            new QRCode(div, { 
                text: window.location.origin + window.location.pathname + '?project=' + encodeURIComponent(projectName),
                width: 100, 
                height: 100 
            });
            setTimeout(() => {
                const img = div.querySelector('img');
                if (img && img.src) resolve(img.src);
                else {
                    const canvas = div.querySelector('canvas');
                    resolve(canvas ? canvas.toDataURL() : '');
                }
            }, 100);
        });

        // Generate HTML
        const printWindow = window.open('', '', 'height=600,width=800');
        printWindow.document.write('<html><head><title>Project Usage Invoice</title>');
        printWindow.document.write('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">');
        printWindow.document.write('<style>body{padding: 20px; font-family: sans-serif;} .header{border-bottom: 2px solid #333; margin-bottom: 20px; padding-bottom: 10px;}</style>');
        printWindow.document.write('</head><body>');
        
        printWindow.document.write(`
            <div class="container">
                <div class="header d-flex justify-content-between align-items-center">
                    <div>
                        <h4 class="fw-bold text-primary mb-0">Mother Home Solar Co., Ltd.</h4>
                        <img src="MHLogo.png" alt="MH Logo" style="height: 80px; margin-top: 5px;">
                    </div>
                    <div class="text-end">
                        <h3 class="fw-bold mb-0">PROJECT VOUCHER</h3>
                        <p class="mb-0">Date: ${new Date().toLocaleDateString()}</p>
                        <div class="mt-2 d-flex justify-content-end">
                            <img src="${qrDataUrl}" width="80" height="80">
                        </div>
                    </div>
                </div>
                
                <div class="mb-4 p-3 bg-light rounded border">
                    <h5 class="mb-1">Project Name: <strong>${projectName}</strong></h5>
                    <p class="mb-0 text-muted small">This document lists total items sent, returned, and net consumed quantity for billing.</p>
                </div>

                <table class="table table-bordered table-striped align-middle">
                    <thead class="table-dark">
                        <tr>
                            <th>Item Code</th>
                            <th>Description</th>
                            <th class="text-center">Total Sent</th>
                            <th class="text-center">Returned (Good)</th>
                            <th class="text-center bg-primary bg-opacity-25 text-dark fw-bold">Net Usage (Billable)</th>
                            <th class="text-center text-danger">Damaged</th>
                            <th class="text-center">Unit</th>
                        </tr>
                    </thead>
                    <tbody>
        `);
        
        rows.forEach(r => {
            printWindow.document.write(`
                <tr>
                    <td>${r.code}</td>
                    <td>${r.name}</td>
                    <td class="text-center">${r.sent}</td>
                    <td class="text-center">${r.returned}</td>
                    <td class="text-center fw-bold bg-primary bg-opacity-10">${r.netUsed}</td>
                    <td class="text-center text-danger">${r.damaged > 0 ? r.damaged : '-'}</td>
                    <td class="text-center small text-muted">${r.unit}</td>
                </tr>
            `);
        });
        
        printWindow.document.write(`
                    </tbody>
                </table>
                
                <div class="row mt-5 pt-4">
                    <div class="col-6 text-center">
                        <div class="border-top border-dark pt-2 w-75 mx-auto">
                            <strong>Warehouse Manager</strong><br>
                            <small class="text-muted">Verified By</small>
                        </div>
                    </div>
                    <div class="col-6 text-center">
                        <div class="border-top border-dark pt-2 w-75 mx-auto">
                            <strong>Project Manager / Finance</strong><br>
                            <small class="text-muted">Approved By</small>
                        </div>
                    </div>
                </div>
            </div>
        `);
        
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        // Wait for styles to load then print
        setTimeout(() => { printWindow.print(); }, 1000);
        
    } catch(e) {
        console.error(e);
        alert("Error generating project voucher.");
    }
    toggleLoading(false);
}

window.printDiv = (divId) => {
    var printContents = document.getElementById(divId).innerHTML;
    var originalContents = document.body.innerHTML;
    document.body.innerHTML = printContents;
    window.print();
    document.body.innerHTML = originalContents;
    location.reload(); 
}

// --- GROUND STOCK & IMPORT LOGIC ---
window.openGroundStockModal = (tab = 'sheet') => {
    const modal = new bootstrap.Modal(document.getElementById('groundStockModal'));
    modal.show();
    
    // Activate correct tab
    const triggerEl = document.querySelector(tab === 'import' ? '#tab-import' : (tab === 'qr' ? '#tab-qr' : '#tab-sheet'));
    bootstrap.Tab.getInstance(triggerEl) || new bootstrap.Tab(triggerEl).show();
}

window.printCountSheet = () => {
    let html = `
        <html><head><title>Ground Stock Count Sheet</title>
        <style>
            body { font-family: sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            th { background-color: #f0f0f0; }
            .check-box { width: 100px; }
        </style>
        </head><body>
        <h2 style="text-align:center;">Ground Stock Count Sheet (လက်ကျန်စာရင်းကောက် ပုံစံ)</h2>
        <p>Date: _________________ &nbsp;&nbsp; Counter Name: _________________</p>
        <table>
            <thead>
                <tr>
                    <th>Code</th>
                    <th>Brand / Model</th>
                    <th>Category</th>
                    <th>System Qty</th>
                    <th class="check-box">ACTUAL QTY</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    const sortedInv = [...inventory].sort((a,b) => (a.category > b.category) ? 1 : -1);
    
    sortedInv.forEach(i => {
        html += `
            <tr>
                <td>${i.itemCode}</td>
                <td>${i.brand} - ${i.model}</td>
                <td>${i.category}</td>
                <td>${i.balance}</td>
                <td></td>
            </tr>
        `;
    });

    html += `</tbody></table></body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
}

// --- SMART QR PRINT LOGIC (BULK) ---
async function printQRLabels() {
    if(inventory.length === 0) return alert("No items to print.");
    toggleLoading(true);
    
    const printPerUnit = document.getElementById('printAllUnits').checked;
    const baseUrl = "https://erp-inv.ayntscfdev.workers.dev/"; // Optional scanning URL base

    const generateQR = (text) => {
        return new Promise((resolve) => {
            const div = document.createElement('div');
            const qr = new QRCode(div, { text: text, width: 128, height: 128 });
            setTimeout(() => {
                const img = div.querySelector('img');
                if (img && img.src) resolve(img.src);
                else {
                    const canvas = div.querySelector('canvas');
                    resolve(canvas ? canvas.toDataURL() : '');
                }
            }, 150); // Increased timeout for stability
        });
    };

    let html = `
        <html><head><title>Inventory Smart Labels</title>
        <style>
            body { font-family: sans-serif; }
            .label-grid { display: flex; flex-wrap: wrap; gap: 5px; justify-content: flex-start; }
            .label-item { 
                width: 50mm; height: 30mm; 
                border: 1px dashed #ddd; 
                padding: 2mm; 
                box-sizing: border-box;
                text-align: left; 
                display: flex; flex-direction: row; align-items: center; justify-content: space-between;
                page-break-inside: avoid;
            }
            .qr-container { width: 18mm; text-align: center; }
            .qr-img { width: 18mm; height: 18mm; }
            .info-container { flex: 1; padding-left: 3mm; overflow: hidden; }
            .code { font-weight: bold; font-size: 10pt; margin-bottom: 1mm; white-space: nowrap; }
            .meta { font-size: 7pt; color: #333; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .cat { font-size: 6pt; color: #666; margin-top: 1mm; text-transform: uppercase; }
            @media print { body { margin: 0; } .label-item { border: none; outline: 1px dotted #eee; } }
        </style>
        </head><body>
        <div class="label-grid">
    `;

    for(const item of inventory) {
        if(!item.itemCode) continue;
        const qty = (printPerUnit && item.balance > 0) ? item.balance : 1;
        // Scan Value is full URL for direct access
        const qrSrc = await generateQR(item.itemCode); // Use Code only for cleaner physical scan, or URL if preferred. Keeping URL for app compatibility.
        // Actually for physical labels, simpler QR is often better for distance scanning. 
        // But let's stick to URL for app integration as per existing logic, just resized.
        const qrUrl = window.location.origin + window.location.pathname + '?code=' + item.itemCode;
        const qrImgSrc = await generateQR(qrUrl);

        for(let i=1; i<=qty; i++) {
            html += `
                <div class="label-item">
                    <div class="qr-container">
                        <img src="${qrImgSrc}" class="qr-img">
                    </div>
                    <div class="info-container">
                        <div class="code">${item.itemCode}</div>
                        <div class="meta"><b>${item.brand}</b></div>
                        <div class="meta">${item.model}</div>
                        <div class="cat">${item.category}</div>
                    </div>
                </div>
            `;
        }
    }

    html += `</div></body></html>`;
    toggleLoading(false);
    
    let iframe = document.createElement('iframe');
    iframe.style.position = 'absolute'; iframe.style.width = '0px'; iframe.style.height = '0px'; iframe.style.border = 'none';
    document.body.appendChild(iframe);
    const printDoc = iframe.contentWindow.document;
    printDoc.open(); printDoc.write(html); printDoc.close();
    setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 500);
}

// --- MOVEMENT REPORT LOGIC ---
window.openMovementReportModal = () => {
    // Set default dates (First day of month to Today)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    document.getElementById('reportStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('reportEndDate').value = today.toISOString().split('T')[0];
    
    new bootstrap.Modal(document.getElementById('movementReportModal')).show();
}

window.generateStockMovementReport = async () => {
    const startStr = document.getElementById('reportStartDate').value;
    const endStr = document.getElementById('reportEndDate').value;
    
    if(!startStr || !endStr) return alert("Select date range");
    
    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    endDate.setHours(23, 59, 59, 999); // End of day

    toggleLoading(true);
    
    try {
        // Query transactions
        const q = query(collection(db, "transactions"), 
            where("date", ">=", startDate), 
            where("date", "<=", endDate)
        );
        
        const snap = await getDocs(q);
        const reportData = {}; // Category -> { in: 0, out: 0, count: 0 }

        snap.forEach(d => {
            const t = d.data();
            if(!t.itemId) return;
            
            // Find item in local inventory to get Category
            const item = inventory.find(i => i.id === t.itemId);
            const category = item ? item.category : 'Uncategorized';
            
            if(!reportData[category]) {
                reportData[category] = { in: 0, out: 0, count: 0 };
            }
            
            if(t.type === 'in') reportData[category].in += (t.qty || 0);
            else if(t.type === 'out') reportData[category].out += (t.qty || 0);
            
            reportData[category].count++;
        });

        // Generate HTML
        let html = `
            <html><head><title>Stock Movement Report</title>
            <style>
                body { font-family: sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f8f9fa; }
                .text-end { text-align: right; }
                .header { margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            </style>
            </head><body>
            <div class="header">
                <h2>Stock Movement by Category</h2>
                <p>Period: ${startStr} to ${endStr}</p>
            </div>
            <table>
                <thead>
                    <tr><th>Category</th><th class="text-end">Total In (Qty)</th><th class="text-end">Total Out (Qty)</th><th class="text-end">Net Change</th><th class="text-end">Transactions</th></tr>
                </thead>
                <tbody>
        `;
        
        Object.keys(reportData).sort().forEach(cat => {
            const d = reportData[cat];
            const net = d.in - d.out;
            const netClass = net >= 0 ? 'text-success' : 'text-danger';
            html += `<tr><td><strong>${cat}</strong></td><td class="text-end text-success">${d.in}</td><td class="text-end text-danger">${d.out}</td><td class="text-end ${netClass}"><strong>${net > 0 ? '+' : ''}${net}</strong></td><td class="text-end">${d.count}</td></tr>`;
        });
        
        html += `</tbody></table></body></html>`;
        
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        
        bootstrap.Modal.getInstance(document.getElementById('movementReportModal')).hide();

    } catch(e) {
        console.error(e);
        alert("Error generating report: " + e.message);
    }
    toggleLoading(false);
}

// --- FINANCE EXPORT LOGIC ---
window.exportFinanceData = () => {
    if(inventory.length === 0) return alert("No data to export");
    let csv = ["Item Code,Category,Brand,Model,Specifications,Qty,Unit Cost,Total Asset Value"];
    inventory.forEach(item => {
        const specs = item.specs ? Object.values(item.specs).join("; ") : (item.spec || "");
        const cost = Math.round(item.costPrice || 0);
        const qty = item.balance || 0;
        const total = Math.round(cost * qty);
        csv.push([`"${item.itemCode}"`,`"${item.category}"`,`"${item.brand}"`,`"${item.model}"`,`""`,qty,cost,total].join(","));
    });
    const csvFile = new Blob([csv.join("\n")], { type: "text/csv" });
    const downloadLink = document.createElement("a");
    downloadLink.download = `finance_stock_value_${new Date().toISOString().slice(0,10)}.csv`;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

// --- IMPORT / EXPORT LOGIC ---

window.exportInventoryCSV = () => {
    if(inventory.length === 0) return alert("No data to export.");
    
    // Define Columns
    const cols = ['itemCode', 'category', 'brand', 'model', 'spec', 'unit', 'balance', 'costPrice', 'sellingPrice', 'remark'];
    let csvContent = cols.join(",") + "\n";

    inventory.forEach(item => {
        const row = cols.map(col => {
            let val = item[col] === undefined || item[col] === null ? '' : item[col];
            // Escape quotes and handle commas
            val = String(val).replace(/"/g, '""');
            if (val.includes(',')) val = `""`;
            return val;
        });
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `inventory_full_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.processCSVImport = async () => {
    const input = document.getElementById('csvImportInput').value.trim();
    if (!input) return alert("Please paste CSV data first.");

    const lines = input.split('\n');
    if (lines.length < 2) return alert("Invalid CSV format or empty data.");

    const headers = lines[0].split(',').map(h => h.trim());
    if(!headers.includes('itemCode')) return alert("Error: CSV must have an 'itemCode' column.");

    if(!confirm(`Ready to import ${lines.length - 1} rows? Existing items with matching codes will be UPDATED.`)) return;

    toggleLoading(true);
    const batch = writeBatch(db);
    let count = 0;
    let batchCount = 0;

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        // Basic CSV parsing
        const values = lines[i].split(',').map(v => v.trim());
        const data = {};
        
        headers.forEach((h, index) => {
            let val = values[index];
            if (h === 'balance' || h === 'costPrice' || h === 'sellingPrice') {
                val = parseFloat(val);
                if (isNaN(val)) val = 0;
            }
            if (val !== undefined) data[h] = val;
        });

        if (data.itemCode) {
            const existing = inventory.find(inv => inv.itemCode === data.itemCode);
            const ref = existing ? doc(db, "inventory", existing.id) : doc(collection(db, "inventory"));
            
            if (!existing) data.createdAt = serverTimestamp();
            data.updatedAt = serverTimestamp();
            data.updatedBy = currentUser.email;

            batch.set(ref, data, { merge: true });
            count++;
            batchCount++;
            
            // Firestore batch limit is 500
            if (batchCount >= 450) {
                await batch.commit();
                batchCount = 0;
            }
        }
    }

    if (batchCount > 0) await batch.commit();
    
    toggleLoading(false);
    alert(`Import Complete! Processed  items.`);
    bootstrap.Modal.getInstance(document.getElementById('groundStockModal')).hide();
    loadInventory(true); // Reload data
}

window.downloadCsvTemplate = () => {
    const headers = "itemCode,category,brand,model,balance,unit,costPrice,sellingPrice,remark";
    const example = "SOL-ABC-001,Solar,Jinko,Tiger Pro,100,Pcs,150.00,180.00,Initial Import";
    const csvContent = headers + "\n" + example;
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "inventory_import_template.csv";
    link.click();
}

// --- PROJECT USAGE & STATUS LOGIC ---
async function loadProjectUsage() {
    const qAll = query(collection(db, "transactions")); 
    const snapAll = await getDocs(qAll);
    
    const qStatus = query(collection(db, "project_status"));
    const snapStatus = await getDocs(qStatus);
    const projectStatusMap = {}; 
    snapStatus.forEach(d => { projectStatusMap[d.id] = d.data().status; });

    const projectData = {}; 

    snapAll.forEach(d => {
        const t = d.data();
        if(t.party && t.party !== "Supplier" && t.party !== "Initial Stock") {
            if(!projectData[t.party]) {
                projectData[t.party] = { sent: 0, returned: 0, damaged: 0, net: 0, status: projectStatusMap[t.party] || 'active' };
            }
            
            if(t.type === 'out') projectData[t.party].sent += t.qty;
            if(t.type === 'in' && t.subType === 'return') projectData[t.party].returned += t.qty;
            if(t.type === 'in' && t.subType === 'damage_return') projectData[t.party].damaged += t.qty;
        }
    });

    const tbody = document.getElementById('usageTableBody');
    tbody.innerHTML = '';
    
    for(let proj in projectData) {
        const d = projectData[proj];
        const net = d.sent - d.returned - d.damaged; 
        
        const statusBadge = d.status === 'completed' 
            ? '<span class="badge bg-success">Completed</span>' 
            : '<span class="badge bg-primary">Active</span>';
        
        const actionBtn = d.status === 'completed'
            ? `
                <button class="btn btn-sm btn-outline-secondary" onclick="toggleProjectStatus('${proj}', 'active')">Re-open</button>
                <button class="btn btn-sm btn-outline-dark ms-1" onclick="openJobFromUsage('${proj}')" title="View Job Order"><i class="fas fa-hard-hat"></i></button>
                <button class="btn btn-sm btn-outline-primary ms-1" onclick="printProjectVoucher('${proj}')" title="Print Usage Voucher"><i class="fas fa-file-invoice"></i></button>
              `
            : `<button class="btn btn-sm btn-outline-success" onclick="toggleProjectStatus('${proj}', 'completed')">Mark Complete</button>`;

        tbody.innerHTML += `
            <tr>
                <td class="fw-bold">${proj}</td>
                <td><button class="btn btn-sm btn-link text-decoration-none p-0" onclick="openJobFromUsage('${proj}')"><i class="fas fa-external-link-alt small me-1"></i>View Job</button></td>
                <td>${statusBadge}</td>
                <td>${d.sent}</td>
                <td>${d.returned}</td>
                <td class="text-danger fw-bold">${d.damaged}</td>
                <td class="fw-bold">${net}</td>
                <td>${actionBtn}</td>
            </tr>
        `;
    }
}

window.openJobFromUsage = (customerName) => {
    // Switch to Job Order View manually to avoid default load
    ['inventoryView', 'financeView', 'flowView', 'usersView', 'procurementView', 'warehouseView', 'dashboardView', 'projectUsageView', 'suppliersView', 'customersView', 'jobOrderView', 'projectDashboardView'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    
    document.getElementById('jobOrderView').classList.remove('hidden');
    document.getElementById('nav-jobs').classList.add('active');

    // Load with Filter
    loadJobOrders(customerName);
}

window.toggleProjectStatus = async (projectName, newStatus) => {
    if(!confirm(`Change status of "" to ${newStatus.toUpperCase()}?`)) return;
    await setDoc(doc(db, "project_status", projectName), { status: newStatus }, { merge: true });
    
    // Sync with Job Orders
    const q = query(collection(db, "job_orders"), where("customer", "==", projectName));
    const snap = await getDocs(q);
    const jobStatus = newStatus === 'completed' ? 'Completed' : 'Work in Progress';
    
    const batch = writeBatch(db);
    snap.forEach(d => {
        batch.update(d.ref, { status: jobStatus });
    });
    if(!snap.empty) await batch.commit();

    loadProjectUsage();
}

// --- FLOW LOGIC ---
async function loadFlow() {
    const tbody = document.getElementById('flowTableBody');
    const q = query(collection(db, "transactions"), orderBy("date", "desc"), limit(50));
    const snap = await getDocs(q);
    tbody.innerHTML = '';
    snap.forEach(d => {
        const t = d.data();
        const date = t.date ? new Date(t.date.seconds * 1000).toLocaleDateString() : '-';
        const item = inventory.find(i => i.id === t.itemId);
        const category = item ? item.category : '-';
        const price = item ? (item.sellingPrice || '-') : '-';
        tbody.innerHTML += `<tr><td>${date}</td><td>${t.type} (${t.subType||'-'})</td><td>${category}</td><td>${t.itemName}</td><td>${t.qty}</td><td>${t.party}</td><td>${price}</td><td>${t.user}</td></tr>`;
    });

    // Re-apply filter if exists (e.g. from URL param or viewPartyHistory)
    const filterVal = document.getElementById('flowSearchInput').value;
    if(filterVal) filterFlow();
}

window.filterFlow = () => {
    const input = document.getElementById('flowSearchInput');
    const filter = input.value.toLowerCase();
    const tbody = document.getElementById('flowTableBody');
    const tr = tbody.getElementsByTagName('tr');
    for (let i = 0; i < tr.length; i++) {
        const text = tr[i].textContent || tr[i].innerText;
        tr[i].style.display = text.toLowerCase().indexOf(filter) > -1 ? "" : "none";
    }
}

// --- USERS ---
async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    const snap = await getDocs(collection(db, "users"));
    tbody.innerHTML = '';
    snap.forEach(d => {
        const u = d.data();
        const roleOptions = ['staff', 'admin', 'procurement', 'warehouse', 'finance', 'superadmin'].map(r => 
            `<option value="" ${u.role === r ? 'selected' : ''}>${r.toUpperCase()}</option>`
        ).join('');

        tbody.innerHTML += `
            <tr>
                <td>${u.email}</td>
                <td><span class="badge bg-secondary">${u.role.toUpperCase()}</span></td>
                <td>
                    <select onchange="changeUserRole('${d.id}', this.value)" class="form-select form-select-sm" style="width:150px">
                        ${roleOptions}
                    </select>
                </td>
            </tr>`;
    });
}

window.changeUserRole = async (uid, newRole) => {
    if(!confirm("Change role?")) return loadUsers(); 
    await updateDoc(doc(db, "users", uid), { role: newRole });
    alert("Role Updated!");
    loadUsers();
}

// --- BACKUP DATABASE ---
window.backupDatabase = async () => {
    if(currentUserRole !== 'superadmin' && currentUserRole !== 'admin') return alert("Access Denied: Admin privileges required.");
    
    toggleLoading(true);
    try {
        const collectionsToBackup = ["inventory", "users", "parties", "vouchers", "transactions", "job_orders", "project_status"];
        const backupData = {};

        for (const colName of collectionsToBackup) {
            const q = query(collection(db, colName));
            const snap = await getDocs(q);
            backupData[colName] = [];
            snap.forEach(doc => {
                // Convert Firestore Timestamps to ISO strings for better JSON readability if needed, 
                // but keeping raw data is safer for potential restore scripts.
                backupData[colName].push({ id: doc.id, ...doc.data() });
            });
        }

        const jsonString = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `solar_erp_backup_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert("Backup downloaded successfully!");
    } catch(e) {
        console.error(e);
        alert("Backup failed: " + e.message);
    }
    toggleLoading(false);
}

// --- CLEAR DATABASE (SUPER ADMIN ONLY) ---
window.clearDatabase = async () => {
    if(currentUserRole !== 'superadmin') return alert("Access Denied: SuperAdmin privileges required.");
    
    const confirmCode = Math.floor(1000 + Math.random() * 9000);
    const input = prompt(`⚠ WARNING: SYSTEM RESET ⚠\n\nThis will permanently DELETE ALL:\n- Inventory Items\n- Vouchers & Receipts\n- Transactions\n- Parties & Projects\n- Job Orders\n\n(User Accounts will NOT be deleted)\n\nTo confirm, type this code: ${confirmCode}`);
    
    if(input !== String(confirmCode)) return alert("Incorrect code. Operation cancelled.");
    
    toggleLoading(true);
    try {
        // Helper to delete all docs in a collection
        const deleteAll = async (colName) => {
            const q = query(collection(db, colName));
            const snap = await getDocs(q);
            
            let batch = writeBatch(db);
            let count = 0;
            
            for(const doc of snap.docs) {
                batch.delete(doc.ref);
                count++;
                if(count >= 450) {
                    await batch.commit();
                    batch = writeBatch(db);
                    count = 0;
                }
            }
            if(count > 0) await batch.commit();
            console.log(`Deleted from ${colName}`);
        };

        await deleteAll("inventory");
        await deleteAll("vouchers");
        await deleteAll("transactions");
        await deleteAll("parties");
        await deleteAll("project_status");
        await deleteAll("job_orders");
        
        alert("System has been reset successfully. Page will reload.");
        location.reload();
    } catch(e) {
        console.error(e);
        alert("Error during reset: " + e.message);
    }
    toggleLoading(false);
}

// --- DOWNLOAD CSV (Generic for tables) ---
window.downloadCSV = (tableId, filename) => {
    const table = document.getElementById(tableId);
    if(!table) return;
    
    let csv = [];
    const rows = document.querySelectorAll(`# tr`); // Select rows from body
    
    // Add header if needed, but tableId usually points to tbody. 
    // Let's stick to the specific exportInventoryCSV for the main list.
    // This function is for other tables (Logs, History)
    
    for (let i = 0; i < rows.length; i++) {
        let row = [], cols = rows[i].querySelectorAll("td, th");
        for (let j = 0; j < cols.length; j++) {
            let txt = cols[j].innerText.replace(/,/g, " ").replace(/\n/g, " "); // Clean text
            row.push(txt);
        }
        csv.push(row.join(","));
    }

    const csvFile = new Blob([csv.join("\n")], { type: "text/csv" });
    const downloadLink = document.createElement("a");
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

// --- EXPORT INVENTORY PDF WITH QR ---
window.exportInventoryPDF = async () => {
    if(inventory.length === 0) return alert("No data to export.");
    toggleLoading(true);
    
    const generateQR = (text) => {
        return new Promise((resolve) => {
            const div = document.createElement('div');
            new QRCode(div, { text: text, width: 64, height: 64, correctLevel: QRCode.CorrectLevel.L });
            setTimeout(() => {
                const img = div.querySelector('img');
                if (img && img.src) resolve(img.src);
                else {
                    const canvas = div.querySelector('canvas');
                    resolve(canvas ? canvas.toDataURL() : '');
                }
            }, 50); 
        });
    };

    let html = `
        <html><head><title>Inventory List</title>
        <style>
            body { font-family: sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; vertical-align: middle; }
            th { background-color: #f0f0f0; font-weight: bold; }
            .qr-cell { text-align: center; width: 70px; }
            .qr-img { width: 50px; height: 50px; }
            .text-end { text-align: right; }
            h2 { margin-bottom: 5px; }
            .meta { font-size: 10px; color: #666; margin-bottom: 20px; }
        </style>
        </head><body>
        <h2>Inventory Report</h2>
        <div class="meta">Generated: ${new Date().toLocaleString()} | Total Items: ${inventory.length}</div>
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th class="qr-cell">QR</th>
                    <th>Item Code</th>
                    <th>Category</th>
                    <th>Brand / Model</th>
                    <th>Specs</th>
                    <th class="text-end">Stock</th>
                </tr>
            </thead>
            <tbody>
    `;

    let count = 1;
    for(const item of inventory) {
        const qrSrc = await generateQR(window.location.origin + window.location.pathname + '?code=' + item.itemCode);
        const specs = item.specs ? Object.values(item.specs).join(", ") : (item.spec || '');
        
        html += `
            <tr>
                <td>${count++}</td>
                <td class="qr-cell"><img src="${qrSrc}" class="qr-img"></td>
                <td><strong>${item.itemCode}</strong></td>
                <td>${item.category}</td>
                <td>${item.brand}<br>${item.model}</td>
                <td>${specs}</td>
                <td class="text-end"><strong>${item.balance}</strong> ${item.unit || ''}</td>
            </tr>
        `;
    }

    html += `</tbody></table></body></html>`;
    
    toggleLoading(false);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); }, 1000);
}

// --- PRINT LABELS FOR RECEIVED ITEMS ---
window.printVoucherLabels = async (id) => {
    toggleLoading(true);
    try {
        const docSnap = await getDoc(doc(db, "vouchers", id));
        if(!docSnap.exists()) { toggleLoading(false); return; }
        const v = docSnap.data();
        
        const generateQR = (text) => {
            return new Promise((resolve) => {
                const div = document.createElement('div');
                new QRCode(div, { text: text, width: 128, height: 128 });
                setTimeout(() => {
                    const img = div.querySelector('img');
                    if (img && img.src) resolve(img.src);
                    else {
                        const canvas = div.querySelector('canvas');
                        resolve(canvas ? canvas.toDataURL() : '');
                    }
                }, 50); 
            });
        };

        let html = `<html><head><title>Received Items Labels</title><style>body{font-family:sans-serif}.label-grid{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}.label-item{width:200px;height:280px;border:1px dotted #ccc;padding:10px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;page-break-inside:avoid}.qr-img{width:120px;height:120px;margin:10px 0}.code{font-weight:bold;font-size:16px;margin-bottom:5px}.meta{font-size:12px;color:#555}.seq{font-size:10px;color:#999;margin-top:5px}@media print{body{margin:0}.label-item{border:1px solid #eee}}</style></head><body><div class="label-grid">`;

        for(const item of v.items) {
            const invItem = inventory.find(i => i.itemCode === item.itemCode);
            const brand = invItem ? invItem.brand : '';
            const model = invItem ? invItem.model : item.itemName;
            
            const qrSrc = await generateQR(window.location.origin + window.location.pathname + '?code=' + item.itemCode);
            const qty = item.qty || 1;
            
            for(let i=1; i<=qty; i++) {
                html += `<div class="label-item"><div class="code">${item.itemCode}</div><img src="${qrSrc}" class="qr-img"><div class="meta">${brand}</div><div class="meta">${model}</div><div class="seq">Rec: ${v.date} (${i}/${qty})</div></div>`;
            }
        }
        html += `</div></body></html>`;
        
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute'; iframe.style.width = '0px'; iframe.style.height = '0px'; iframe.style.border = 'none';
        document.body.appendChild(iframe);
        const printDoc = iframe.contentWindow.document;
        printDoc.open(); printDoc.write(html); printDoc.close();
        setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 500);

    } catch(e) { console.error(e); alert("Error: " + e.message); }
    toggleLoading(false);
}

// --- OPERATIONS DASHBOARD ---
async function loadOperationsDashboard() {
    const container = document.getElementById('opsDashboardBody');
    if(!container) return;
    
    // Fetch active jobs (Client-side filter to avoid index issues)
    const q = query(collection(db, "job_orders"), orderBy("date", "desc"), limit(50));
    const snap = await getDocs(q);
    
    container.innerHTML = '';
    let activeCount = 0;
    
    snap.forEach(d => {
        const job = d.data();
        if(job.status !== 'Completed' && job.status !== 'Cancelled') {
            activeCount++;
            let staff = Array.isArray(job.assignedStaff) ? job.assignedStaff.join(', ') : (job.assignedStaff || '');
            if(!staff) staff = '<span class="text-muted fst-italic">Unassigned</span>';
            const badgeClass = job.status === 'New' ? 'bg-primary' : (job.status === 'MRF Issued' ? 'bg-warning text-dark' : 'bg-info');
            
            container.innerHTML += `
                <tr>
                    <td>
                        <div class="d-flex align-items-center">
                            <div class="bg-light rounded-circle d-flex align-items-center justify-content-center me-2" style="width:32px;height:32px;">
                                <i class="fas fa-user-hard-hat text-secondary small"></i>
                            </div>
                            <div class="fw-bold text-dark">${staff}</div>
                        </div>
                    </td>
                    <td>
                        <div class="fw-bold text-primary" style="font-size: 0.9rem;">${job.customer}</div>
                        <div class="small text-muted text-truncate" style="max-width: 150px;">${job.address || 'No Address'}</div>
                    </td>
                    <td><span class="badge ${badgeClass}">${job.status}</span></td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-light border" onclick="openJobOrderModal('${d.id}')"><i class="fas fa-edit"></i></button>
                    </td>
                </tr>
            `;
        }
    });
    
    const countEl = document.getElementById('opsActiveCount');
    if(countEl) countEl.innerText = activeCount;
}

// --- CALENDAR LOGIC ---
window.changeCalendarMonth = (delta) => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
}

async function renderCalendar() {
    const container = document.getElementById('calendarContainer');
    const monthDisplay = document.getElementById('calendarMonthDisplay');
    if(!container || !monthDisplay) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    monthDisplay.innerText = currentCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Fetch Jobs for Calendar (Ideally filter by date range, but fetching all active for now)
    const q = query(collection(db, "job_orders"), orderBy("date", "desc"), limit(100));
    const snap = await getDocs(q);
    const jobs = [];
    snap.forEach(d => jobs.push({id: d.id, ...d.data()}));

    // Calendar Grid Generation
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay(); // 0 = Sun

    let html = `
        <div class="calendar-header">Sun</div><div class="calendar-header">Mon</div><div class="calendar-header">Tue</div>
        <div class="calendar-header">Wed</div><div class="calendar-header">Thu</div><div class="calendar-header">Fri</div><div class="calendar-header">Sat</div>
    `;

    // Empty cells for previous month
    for (let i = 0; i < startingDay; i++) {
        html += `<div class="calendar-day other-month"></div>`;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = dateStr === todayStr ? 'today' : '';
        
        // Find jobs active on this day
        let dayEvents = '';
        jobs.forEach(job => {
            if(job.status === 'Cancelled' || job.status === 'Completed') return;
            
            const start = job.date;
            const end = job.endDate || job.date; // Default to single day if no end date
            
            if (dateStr >= start && dateStr <= end) {
                const staffName = Array.isArray(job.assignedStaff) ? (job.assignedStaff.length > 0 ? job.assignedStaff[0].split(' ')[0] : 'Unassigned') : (job.assignedStaff ? job.assignedStaff.split(' ')[0] : 'Unassigned');
                const statusColor = job.status === 'Completed' ? '#198754' : (job.status === 'Partially Completed' ? '#0dcaf0' : (job.status === 'Work in Progress' ? '#0d6efd' : '#ffc107'));
                const statusDot = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:${statusColor};margin-right:4px;"></span>`;
                
                dayEvents += `<div class="cal-event" onclick="openJobOrderModal('${job.id}')" title="${job.customer} - ${job.status}">
                    ${statusDot} <strong>${staffName}</strong>: ${job.customer.substring(0, 12)}..
                </div>`;
            }
        });

        html += `
            <div class="calendar-day ${isToday}">
                <div class="calendar-day-number">${day}</div>
                ${dayEvents}
            </div>
        `;
    }

    // Fill remaining cells
    const totalCells = startingDay + daysInMonth;
    const remaining = 7 - (totalCells % 7);
    if (remaining < 7) {
        for (let i = 0; i < remaining; i++) {
            html += `<div class="calendar-day other-month"></div>`;
        }
    }

    container.innerHTML = html;
}


function toggleLoading(show) {
    document.getElementById('loadingOverlay').classList.toggle('hidden', !show);
}

initApp();

// --- PROJECT DASHBOARD LOGIC ---
window.loadProjectDashboard = async () => {
    const tbody = document.getElementById('projectDashboardBody');
    const chartContainer = document.getElementById('resourceAllocationBody');
    const filterEl = document.getElementById('projDashFilter');
    const filter = filterEl ? filterEl.value : 'active';

    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';
    if(chartContainer) chartContainer.innerHTML = '<div class="text-center text-muted py-3">Loading allocation data...</div>';

    const q = query(collection(db, "job_orders"));
    const snap = await getDocs(q);
    
    const projects = {};
    let totalActiveJobs = 0;
    
    snap.forEach(d => {
        const job = d.data();
        const name = job.customer || 'Unknown';
        
        if(!projects[name]) projects[name] = { total: 0, completed: 0, active: 0, staff: new Set() };
        if(!projects[name]) projects[name] = { total: 0, completed: 0, active: 0, staff: new Set(), minDate: null, maxDate: null };
        
        projects[name].total++;
        if(job.status === 'Completed') projects[name].completed++;
        else if(job.status !== 'Cancelled') {
            projects[name].active++;
            totalActiveJobs++;
        }

        // Track Staff for Active/Ongoing Jobs
        if(job.status !== 'Completed' && job.status !== 'Cancelled') {
            if(job.assignedStaff) {
                if(Array.isArray(job.assignedStaff)) {
                    job.assignedStaff.forEach(s => projects[name].staff.add(s));
                } else {
                    projects[name].staff.add(job.assignedStaff);
                }
            }
        }

        // Track Dates
        const jStart = job.date;
        const jEnd = job.endDate || job.date;
        if (!projects[name].minDate || jStart < projects[name].minDate) projects[name].minDate = jStart;
        if (!projects[name].maxDate || jEnd > projects[name].maxDate) projects[name].maxDate = jEnd;
    });
    
    tbody.innerHTML = '';
    if(chartContainer) chartContainer.innerHTML = '';
    
    // Filter Logic
    let sortedKeys = Object.keys(projects);
    if(filter === 'active') {
        sortedKeys = sortedKeys.filter(k => projects[k].active > 0);
    } else if (filter === 'completed') {
        sortedKeys = sortedKeys.filter(k => projects[k].active === 0 && projects[k].completed > 0);
    }
    
    // Sort by active count desc
    sortedKeys.sort((a,b) => projects[b].active - projects[a].active);
    
    sortedKeys.forEach(name => {
        const p = projects[name];
        const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
        let progressColor = 'bg-primary';
        if(pct >= 100) progressColor = 'bg-success';
        else if(pct >= 50) progressColor = 'bg-info';
        else if(pct < 20) progressColor = 'bg-warning';

        tbody.innerHTML += `
            <tr>
                <td class="fw-bold">${name}</td>
                <td class="text-center"><span class="badge bg-primary bg-opacity-10 text-primary">${p.active}</span></td>
                <td class="text-center"><span class="badge bg-success bg-opacity-10 text-success">${p.completed}</span></td>
                <td class="text-center fw-bold">${p.total}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="progress flex-grow-1" style="height: 8px;">
                            <div class="progress-bar ${progressColor}" role="progressbar" style="width: ${pct}%"></div>
                        </div>
                        <span class="ms-2 small fw-bold text-muted">${pct}%</span>
                    </div>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary" onclick="openJobOrderModal(null, '${name}')" title="Quick Add Job"><i class="fas fa-plus"></i> Job</button>
                    <button class="btn btn-sm btn-outline-dark ms-1" onclick="openJobFromUsage('${name}')" title="View Details"><i class="fas fa-list"></i></button>
                </td>
            </tr>
        `;
    });
    
    if(sortedKeys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No active projects found.</td></tr>';
    }

    // Render Resource Allocation Chart
    if(chartContainer) {
        // Calculate max staff for scaling
        let maxStaff = 0;
        sortedKeys.forEach(k => {
            if(projects[k].staff.size > maxStaff) maxStaff = projects[k].staff.size;
        });

        if(maxStaff === 0) {
            chartContainer.innerHTML = '<div class="text-center text-muted py-4 small">No active staff assignments found for these projects.</div>';
        } else {
            sortedKeys.forEach(name => {
                const p = projects[name];
                const staffCount = p.staff.size;
                if(staffCount === 0) return;

                const widthPct = (staffCount / maxStaff) * 100;
                
                chartContainer.innerHTML += `
                    <div class="mb-3">
                        <div class="d-flex justify-content-between small mb-1">
                            <span class="fw-bold text-dark">${name}</span>
                            <span class="badge bg-light text-dark border">${staffCount} Staff</span>
                        </div>
                        <div class="progress" style="height: 12px;">
                            <div class="progress-bar bg-indigo" role="progressbar" style="width: ${widthPct}%; background-color: #6610f2;"></div>
                        </div>
                    </div>
                `;
            });
        }
    }

    // Update Stats
    const totalEl = document.getElementById('projDashActiveTotal');
    if(totalEl) totalEl.innerText = totalActiveJobs;

    // Render Timeline
    renderProjectTimeline(projects, filter);
}

function renderProjectTimeline(projectsData, filter) {
    const container = document.getElementById('projectTimelineContainer');
    if(!container) return;
    
    // Filter projects based on dropdown
    let projectNames = Object.keys(projectsData);
    if(filter === 'active') projectNames = projectNames.filter(n => projectsData[n].active > 0);
    else if(filter === 'completed') projectNames = projectNames.filter(n => projectsData[n].active === 0 && projectsData[n].completed > 0);
    
    if(projectNames.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-4">No projects to display</div>';
        return;
    }

    // Calculate global min/max dates
    let minDate = new Date();
    let maxDate = new Date();
    let hasDates = false;

    projectNames.forEach(name => {
        const p = projectsData[name];
        if(p.minDate && p.maxDate) {
            const s = new Date(p.minDate);
            const e = new Date(p.maxDate);
            if(!hasDates || s < minDate) minDate = s;
            if(!hasDates || e > maxDate) maxDate = e;
            hasDates = true;
        }
    });

    if(!hasDates) {
         container.innerHTML = '<div class="text-center text-muted p-4">No date data available</div>';
         return;
    }

    // Buffer
    minDate.setDate(minDate.getDate() - 5);
    maxDate.setDate(maxDate.getDate() + 15);

    const dayWidth = 40; // px
    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));
    
    // Build Header
    let headerHtml = '<div class="gantt-wrapper"><div class="gantt-header">';
    for(let i=0; i<=totalDays; i++) {
        const d = new Date(minDate); d.setDate(minDate.getDate() + i);
        const dayNum = d.getDate();
        const dayName = d.toLocaleDateString('en-US', {weekday: 'narrow'});
        headerHtml += `<div class="gantt-header-cell">${dayNum}<br><span style="font-weight:normal;opacity:0.7">${dayName}</span></div>`;
    }
    headerHtml += '</div><div class="gantt-body">';

    // Build Rows
    projectNames.forEach(name => {
        const p = projectsData[name];
        if(!p.minDate || !p.maxDate) return;

        const start = new Date(p.minDate);
        const end = new Date(p.maxDate);
        
        const offsetDays = (start - minDate) / (1000 * 60 * 60 * 24);
        const durationDays = Math.max(1, (end - start) / (1000 * 60 * 60 * 24) + 1);
        
        const left = offsetDays * dayWidth;
        const width = durationDays * dayWidth;
        
        const colorClass = p.active > 0 ? '#0d6efd' : '#198754'; // Blue for active, Green for completed

        headerHtml += `
            <div class="gantt-row">
                <div class="gantt-grid-lines">${Array(totalDays+1).fill(`<div class="gantt-grid-line"></div>`).join('')}</div>
                <div class="gantt-bar" style="left: ${left}px; width: ${width}px; background-color: ${colorClass};" title="${name}: ${p.minDate} to ${p.maxDate}">
                    ${name} (${p.active} Active Jobs)
                </div>
            </div>`;
    });

    headerHtml += '</div></div>';
    container.innerHTML = headerHtml;
}

window.exportProjectDashboardCSV = async () => {
    toggleLoading(true);
    // Re-fetch to ensure fresh data for export
    const q = query(collection(db, "job_orders"));
    const snap = await getDocs(q);
    const projects = {};
    snap.forEach(d => {
        const job = d.data();
        const name = job.customer || 'Unknown';
        if(!projects[name]) projects[name] = { total: 0, completed: 0, active: 0, staff: new Set(), minDate: job.date, maxDate: job.endDate||job.date };
        projects[name].total++;
        if(job.status === 'Completed') projects[name].completed++;
        else if(job.status !== 'Cancelled') projects[name].active++;
        if(job.assignedStaff) (Array.isArray(job.assignedStaff) ? job.assignedStaff : [job.assignedStaff]).forEach(s => projects[name].staff.add(s));
        if(job.date < projects[name].minDate) projects[name].minDate = job.date;
        if((job.endDate||job.date) > projects[name].maxDate) projects[name].maxDate = (job.endDate||job.date);
    });

    let csv = ["Project Name,Active Jobs,Completed Jobs,Total Jobs,Progress %,Staff Count,Start Date,End Date"];
    Object.keys(projects).forEach(name => {
        const p = projects[name];
        const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
        csv.push(`"${name}",${p.active},${p.completed},${p.total},${pct}%,${p.staff.size},${p.minDate},${p.maxDate}`);
    });

    const blob = new Blob([csv.join("\n")], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `project_dashboard_export_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    toggleLoading(false);
}
