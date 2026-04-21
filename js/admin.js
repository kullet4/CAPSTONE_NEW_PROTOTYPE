import { auth, db } from './firebase-config.js';
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth as getSecondaryAuth, createUserWithEmailAndPassword, signOut as secondarySignOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { onAuthStateChanged, signOut as primarySignOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, deleteDoc, onSnapshot, query, orderBy, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Initialize a secondary Firebase instance purely for creating users, securely bypassing the main Auth state switch
const secondaryApp = initializeApp(firebaseConfig, "SecondaryAppForAdminCreates");
const secondaryAuth = getSecondaryAuth(secondaryApp);

// DOM Elements
const userGreeting = document.getElementById('user-greeting');
const logoutBtn = document.getElementById('logout-btn');

// Edit User Modal Elements
const editUserModal = new bootstrap.Modal(document.getElementById('editUserModal'));
const editUserForm = document.getElementById('edit-user-form');
const editUserId = document.getElementById('edit-user-id');
const editUserGrade = document.getElementById('edit-user-grade');
const editUserSection = document.getElementById('edit-user-section');
const saveUserBtn = document.getElementById('save-user-btn');

// KPI Elements
const kpiUsers = document.getElementById('kpi-users');
const kpiStudents = document.getElementById('kpi-students');
const kpiTeachers = document.getElementById('kpi-teachers');
const kpiModules = document.getElementById('kpi-modules');

// Table Bodys
const usersList = document.getElementById('users-list');
const modulesList = document.getElementById('modules-list');

// Create User Modal Elements
const createUserForm = document.getElementById('create-user-form');
const newRoleSelect = document.getElementById('new-user-role');
const studentOnlyFields = document.getElementById('student-only-fields');

// Handle displaying extra fields in modal based on role
newRoleSelect.addEventListener('change', (e) => {
    if (e.target.value === 'student') {
        studentOnlyFields.classList.remove('d-none');
    } else {
        studentOnlyFields.classList.add('d-none');
    }
});

// Form Submit: Create New User without logging Admin out
createUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('new-user-email').value;
    const pwd = document.getElementById('new-user-pwd').value;
    const name = document.getElementById('new-user-name').value;
    const role = document.getElementById('new-user-role').value;
    
    const errorDiv = document.getElementById('create-user-error');
    const successDiv = document.getElementById('create-user-success');
    const submitBtn = document.getElementById('submit-new-user-btn');

    try {
        errorDiv.classList.add('d-none');
        successDiv.classList.add('d-none');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Creating...';

        // 1. Create Auth entity in SECONDARY app to bypass Auth State Change on the primary app
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pwd);
        const newUid = userCredential.user.uid;

        // 2. Clear Secondary session immediately so it doesn't stay cached
        await secondarySignOut(secondaryAuth);
        
        // 3. Inject new user into Firestore via primary Admin permissions
        const userData = {
            email: email,
            name: name,
            role: role,
            createdAt: new Date().toISOString()
        };
        
        if(role === 'student') {
            userData.xp = 0;
            userData.completedModules = [];
            userData.gradeLevel = document.getElementById('new-user-grade').value || 'Grade 1';
            userData.section = document.getElementById('new-user-section').value || 'All';
        }
        
        // Write it!
        await setDoc(doc(db, "users", newUid), userData);
        
        // Let Admin know
        successDiv.classList.remove('d-none');
        createUserForm.reset();
        
        // Reset student-field blocker
        newRoleSelect.value = 'student';
        studentOnlyFields.classList.remove('d-none');

        setTimeout(() => successDiv.classList.add('d-none'), 3000);

    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('d-none');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Create User Account';
    }
});

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
                window.location.href = 'login-dashboard.html';
            }
        } catch (error) {
            console.error("Error fetching admin data:", error);
            alert("Error validating admin role. Connection problem?");
        }
    } else {
        window.location.href = 'login-dashboard.html';
    }
});

// Logout Handler
logoutBtn.addEventListener('click', () => {
    primarySignOut(auth).then(() => {
        window.location.href = 'login-dashboard.html';
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
            let stats = '';
            let actionBtn = `<button class="btn btn-sm btn-outline-secondary" disabled title="No Action Available"><i class="bi bi-slash-circle"></i></button>`;

            if(userData.role === 'admin') {
                roleBadge = `<span class="badge bg-dark">Admin</span>`;
                stats = 'N/A';
            } else if(userData.role === 'teacher') {
                roleBadge = `<span class="badge bg-info text-dark">Teacher</span>`;
                stats = 'Content Creator';
            } else {
                roleBadge = `<span class="badge bg-primary">Student</span>`;
                const gLvl = userData.gradeLevel || 'Grade 1';
                const sec = userData.section || 'All';
                stats = `${userData.xp || 0} XP | ${gLvl}-${sec}`;
                
                // Admin can edit grade/section for student
                actionBtn = `<button class="btn btn-sm btn-outline-primary edit-student-btn" 
                                data-id="${id}" 
                                data-grade="${gLvl}" 
                                data-section="${sec}"
                                title="Edit Grade/Section">
                                <i class="bi bi-pencil-square"></i> Edit
                             </button>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="ps-4 fw-medium">${userData.name || userData.email || 'Unknown'}</td>
                <td>${roleBadge}</td>
                <td class="text-muted"><small>${stats}</small></td>
                <td class="text-end pe-4">
                    ${actionBtn}
                </td>
            `;
            usersList.appendChild(tr);
        });

        // Add event listeners for edit buttons
        document.querySelectorAll('.edit-student-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const button = e.currentTarget;
                const userId = button.getAttribute('data-id');
                const grade = button.getAttribute('data-grade');
                const section = button.getAttribute('data-section');
                
                editUserId.value = userId;
                editUserGrade.value = grade;
                editUserSection.value = section === 'All' ? '' : section;
                
                editUserModal.show();
            });
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

// Handle Saving Edited Student Info
editUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = editUserId.value;
    const gradeLevel = editUserGrade.value;
    const section = editUserSection.value || 'All';
    
    try {
        saveUserBtn.disabled = true;
        saveUserBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        
        await updateDoc(doc(db, "users", userId), {
            gradeLevel: gradeLevel,
            section: section
        });
        
        editUserModal.hide();
    } catch (error) {
        console.error("Error updating user:", error);
        alert('Failed to update student info.');
    } finally {
        saveUserBtn.disabled = false;
        saveUserBtn.innerHTML = 'Save Changes';
    }
});
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
