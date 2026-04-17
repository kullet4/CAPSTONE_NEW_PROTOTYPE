import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, getDoc, collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// DOM Elements
const userGreeting = document.getElementById('user-greeting');
const logoutBtn = document.getElementById('logout-btn');
const xpPoints = document.getElementById('xp-points');
const leaderboardList = document.getElementById('leaderboard-list');

// Enforce authentication & role
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists() && userDoc.data().role === 'student') {
                const userData = userDoc.data();
                userGreeting.textContent = `Hello, ${userData.name || 'Student'}`;
                
                // --- Gamification: Competence (Points & Progress)
                // If user doesn't have XP field yet, default to 0
                const currentXP = userData.xp || 0;
                xpPoints.textContent = currentXP;
                
                // Animate XP
                animateValue(xpPoints, 0, currentXP, 1000);

                // Load Leaderboard
                loadLeaderboard();

            } else {
                // Not a student, boot them out
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error("Error fetching student data:", error);
            alert("Error loading dashboard data. You might be offline, using cached mode.");
        }
    } else {
        window.location.href = 'index.html'; // Redirect to login
    }
});

// Logout Handler
logoutBtn.addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = 'index.html';
    });
});

// --- Gamification: Relatedness (Leaderboard) ---
// Queries Firestore for top 5 students based on XP
async function loadLeaderboard() {
    try {
        const usersRef = collection(db, "users");
        // Query users collection where role is 'student', ordered by XP descending
        // NOTE: Firebase might require a composite index for this query the first time it runs.
        // If it fails, check the console for a Firebase link to build the index.
        const q = query(usersRef, orderBy("xp", "desc"), limit(5));
        
        const querySnapshot = await getDocs(q);
        
        leaderboardList.innerHTML = ''; // Clear loading state
        
        let rank = 1;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Only show students in leaderboard
            if(data.role === 'student') {
                const isCurrentUser = data.name === (auth.currentUser ? document.getElementById('user-greeting').textContent.replace('Hello, ', '') : '');
                
                const li = document.createElement('li');
                li.className = `list-group-item d-flex justify-content-between align-items-center ${isCurrentUser ? 'bg-light fw-bold' : ''}`;
                
                // Medal coloring logic
                let rankBadge = rank;
                if(rank === 1) rankBadge = `<i class="bi bi-award-fill text-warning fs-5"></i>`;
                else if(rank === 2) rankBadge = `<i class="bi bi-award-fill text-secondary fs-5"></i>`;
                else if(rank === 3) rankBadge = `<i class="bi bi-award-fill text-danger fs-5" style="color: #cd7f32 !important;"></i>`;

                li.innerHTML = `
                    <div class="d-flex align-items-center">
                        <span class="me-3 text-muted" style="width: 24px; text-align: center;">${rankBadge}</span>
                        <span>${data.name || 'Anonymous Learner'}</span>
                    </div>
                    <span class="badge bg-primary rounded-pill">${data.xp || 0} XP</span>
                `;
                leaderboardList.appendChild(li);
                rank++;
            }
        });

        if(leaderboardList.innerHTML === '') {
             leaderboardList.innerHTML = `<li class="list-group-item text-center text-muted">No ranking data yet.</li>`;
        }

    } catch (error) {
        console.error("Error loading leaderboard:", error);
        leaderboardList.innerHTML = `
            <li class="list-group-item text-center text-danger border-0">
                <i class="bi bi-exclamation-triangle"></i> Cannot load leaderboard offline.
            </li>`;
    }
}

// Simple counter animation function
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}