import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, getDoc, collection, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// DOM Elements
const userGreeting = document.getElementById('user-greeting');
const logoutBtn = document.getElementById('logout-btn');

// KPI Elements
const kpiUsers = document.getElementById('kpi-users');
const kpiStudents = document.getElementById('kpi-students');
const kpiTeachers = document.getElementById('kpi-teachers');
const kpiModules = document.getElementById('kpi-modules');

// Table Bodys
const usersList = document.getElementById('users-list');
const modulesList = document.getElementById('modules-list');

// Enforce authentication & role
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists() && userDoc.data().role === 'admin') {
                const userData = userDoc.data();
                userGreeting.textContent = `Admin User: ${userData.name || user.email}`;
                
                // Initialize Admin Dashboards
                loadSystemData();
            } else {
                // Not an admin
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error("Error fetching admin data:", error);
            alert("Error validating admin role. Connection problem?");
        }
    } else {
        window.location.href = 'index.html';
    }
});

// Logout Handler
logoutBtn.addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = 'index.html';
    });
});

// Initialize Data Streams (Real-Time Observers)
function loadSystemData() {
    // 1. Observe Users Collection
    const usersQuery = query(collection(db, "users"));
    onSnapshot(usersQuery, (snapshot) => {
        let totalUsers = snapshot.size;
        let totalStudents = 0;
        let totalTeachers = 0;
        
        usersList.innerHTML = '';
        
        if(snapshot.empty) {
            usersList.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No users found.</td></tr>`;
        }

        snapshot.forEach((docSnap) => {
            const userData = docSnap.data();
            const id = docSnap.id;
            
            // Tally KPIs
            if(userData.role === 'student') totalStudents++;
            if(userData.role === 'teacher') totalTeachers++;

            // Render Table Row
            let roleBadge = '';
            if(userData.role === 'admin') roleBadge = `<span class="badge bg-dark">Admin</span>`;
            else if(userData.role === 'teacher') roleBadge = `<span class="badge bg-info text-dark">Teacher</span>`;
            else roleBadge = `<span class="badge bg-primary">Student</span>`;
            
            let stats = userData.role === 'student' ? `${userData.xp || 0} XP` : 'N/A';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="ps-4 fw-medium">${userData.name || userData.email || 'Unknown'}</td>
                <td>${roleBadge}</td>
                <td class="text-muted"><small>${stats}</small></td>
                <td class="text-end pe-4">
                    <button class="btn btn-sm btn-outline-secondary" title="View/Edit" disabled>
                        <i class="bi bi-pencil"></i>
                    </button>
                </td>
            `;
            usersList.appendChild(tr);
        });

        // Update User KPIs
        kpiUsers.textContent = totalUsers;
        kpiStudents.textContent = totalStudents;
        kpiTeachers.textContent = totalTeachers;
    }, (error) => {
         console.error("Error loading users stream:", error);
         usersList.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Local cache mode. Live updates failing.</td></tr>`;
    });

    // 2. Observe Modules Collection (Content Moderation)
    const modulesQuery = query(collection(db, "modules"));
    onSnapshot(modulesQuery, (snapshot) => {
        kpiModules.textContent = snapshot.size;
        modulesList.innerHTML = '';
        
        if(snapshot.empty) {
            modulesList.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No modules published yet.</td></tr>`;
        }

        snapshot.forEach((docSnap) => {
            const modData = docSnap.data();
            const id = docSnap.id;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="ps-4 fw-medium text-truncate" style="max-width: 150px;">${modData.title || 'Untitled'}</td>
                <td class="text-muted"><small>${modData.teacherName || 'Unknown Teacher'}</small></td>
                <td><span class="badge bg-success bg-opacity-75">${modData.xpReward || 0} XP</span></td>
                <td class="text-end pe-4">
                    <button class="btn btn-sm btn-outline-danger delete-module-btn" data-id="${id}" title="Delete Module">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            modulesList.appendChild(tr);
        });

        // Attach event listeners to dynamically generated delete buttons
        document.querySelectorAll('.delete-module-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const moduleId = e.currentTarget.getAttribute('data-id');
                await deleteModule(moduleId);
            });
        });

    }, (error) => {
         console.error("Error loading modules stream:", error);
         modulesList.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Local cache mode. Live updates failing.</td></tr>`;
    });
}

// Delete Module Function
async function deleteModule(moduleId) {
    if(confirm("Are you sure you want to permanently delete this instructional material? This cannot be undone.")) {
        try {
            await deleteDoc(doc(db, "modules", moduleId));
            // Real-time listener will automatically remove the row and update the KPI!
        } catch (error) {
            console.error("Failed to delete module: ", error);
            alert("Error deleting module. You may be offline.");
        }
    }
}