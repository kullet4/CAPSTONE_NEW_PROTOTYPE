import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, getDoc, collection, addDoc, serverTimestamp, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// DOM Elements
const userGreeting = document.getElementById('user-greeting');
const logoutBtn = document.getElementById('logout-btn');
const createModuleForm = document.getElementById('create-module-form');
const moduleAlert = document.getElementById('module-alert');
const studentListId = document.getElementById('student-monitoring-list');
const studentCountBadge = document.getElementById('student-count');

let currentUserDoc = null;

// Enforce authentication & role
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists() && userDoc.data().role === 'teacher') {
                currentUserDoc = userDoc.data();
                const teacherName = currentUserDoc.name || 'User';
                userGreeting.textContent = teacherName; // Simple top right name
                
                const mainGreetingName = document.getElementById('main-greeting-name');
                if(mainGreetingName) mainGreetingName.textContent = teacherName.split(' ')[0]; // Big Gemini style "Hi [Name]"
                
                // Initialize Real-Time Tracking
                monitorStudentsRealTime();
            } else {
                // Not a teacher
                window.location.href = 'login-dashboard.html';
            }
        } catch (error) {
            console.error("Error fetching teacher data:", error);
            alert("Error loading dashboard data.");
        }
    } else {
        window.location.href = 'login-dashboard.html';
    }
});

// Create Instructional Material
createModuleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('module-title').value;
    const desc = document.getElementById('module-desc').value;
    const contentText = document.getElementById('module-content').value;
    const gradeLevel = document.getElementById('module-grade').value;
    const section = document.getElementById('module-section').value || 'All';
    const xp = parseInt(document.getElementById('module-xp').value, 10);
    const submitBtn = createModuleForm.querySelector('button[type="submit"]');

    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Publishing...`;

        await addDoc(collection(db, "modules"), {
            title: title,
            description: desc,
            content: contentText,
            targetGrade: gradeLevel,
            targetSection: section,
            xpReward: xp,
            teacherId: auth.currentUser.uid,
            teacherName: currentUserDoc.name || 'Instructor',
            createdAt: serverTimestamp(),
            status: 'active'
        });

        // Show Success Alert
        moduleAlert.classList.remove('d-none');
        createModuleForm.reset();
        
        setTimeout(() => {
            moduleAlert.classList.add('d-none');
        }, 4000);

    } catch (error) {
        console.error("Error adding module: ", error);
        alert("Failed to publish material. You may be offline, changes will sync when reconnected.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Publish Material`;
    }
});

// Monitor Student Progress in Real-Time (onSnapshot)
function monitorStudentsRealTime() {
    // Query users collection strictly for role = 'student'
    const q = query(collection(db, "users"), where("role", "==", "student"));
    
    // onSnapshot creates a real-time listener to Firestore data updates
    onSnapshot(q, (snapshot) => {
        studentListId.innerHTML = ''; // Clear loading state or old data
        studentCountBadge.textContent = snapshot.size;

        if (snapshot.empty) {
            studentListId.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No students enrolled yet.</td></tr>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const student = docSnap.data();
            const studentId = docSnap.id;
            const xp = student.xp || 0;
            const gLvl = student.gradeLevel || 'Unknown';
            const sec = student.section || 'N/A';
            
            // Determine status based loosely on XP progression logic
            let statusBadge = '';
            if (xp === 0) {
                statusBadge = `<span class="badge bg-secondary">Not Started</span>`;
            } else if (xp > 0 && xp < 500) {
                statusBadge = `<span class="badge bg-warning text-dark">In Progress</span>`;
            } else {
                statusBadge = `<span class="badge bg-success">Excelling</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="ps-4 fw-medium">${student.name || student.email || 'Anonymous Student'}</td>
                <td class="text-muted"><small>${gLvl} - ${sec}</small></td>
                <td><i class="bi bi-star-fill text-warning"></i> ${xp}</td>
                <td>${statusBadge}</td>
                <td class="text-end pe-4">
                    <button class="btn btn-sm btn-outline-primary" aria-label="View Details">
                        <i class="bi bi-search"></i>
                    </button>
                </td>
            `;
            studentListId.appendChild(tr);
        });
    }, (error) => {
        console.error("Error setting up real-time listener: ", error);
        studentListId.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Failed to load live data (Offline fallback).</td></tr>`;
    });
}

// Logout Handler
logoutBtn.addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = 'login-dashboard.html';
    });
});
