import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, getDoc, collection, query, orderBy, limit, getDocs, updateDoc, increment, arrayUnion } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// DOM Elements
const userGreeting = document.getElementById('user-greeting');
const logoutBtn = document.getElementById('logout-btn');
const xpPoints = document.getElementById('xp-points');
const leaderboardList = document.getElementById('leaderboard-list');
const learningModules = document.getElementById('learning-modules');

let currentXP = 0;
let userDocRef = null;
let completedModulesList = [];

// Gamification Modal Variables
let currentLessonChunks = [];
let currentChunkIndex = 0;
let currentLessonXP = 0;
let currentLessonCard = null;
let currentModId = null;
let isReviewMode = false;

// DOM Modal Elements
const lessonModal = new bootstrap.Modal(document.getElementById('lessonModal'));
const lessonModalTitle = document.getElementById('lessonModalTitle');
const lessonChunkText = document.getElementById('lesson-chunk-text');
const lessonProgress = document.getElementById('lesson-progress');
const lessonNextBtn = document.getElementById('lesson-next-btn');
const lessonBackBtn = document.getElementById('lesson-back-btn');
const lessonFinishBtn = document.getElementById('lesson-finish-btn');
const closeLessonBtn = document.getElementById('close-lesson-btn');

// Enforce authentication & role
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists() && userDoc.data().role === 'student') {
                const userData = userDoc.data();
                userGreeting.textContent = `Hello, ${userData.name || 'Student'}`;
                
                const studentGrade = userData.gradeLevel || 'Grade 1'; // Default
                const studentSection = userData.section || 'All';

                // Setup Badges
                const gradeBadge = document.getElementById('student-grade-badge');
                if(gradeBadge) gradeBadge.textContent = studentGrade;
                const sectionBadge = document.getElementById('student-section-badge');
                if(sectionBadge) {
                    sectionBadge.textContent = studentSection.toLowerCase() === 'all' 
                        ? "All Sections" 
                        : (studentSection.toLowerCase().includes('section') ? studentSection : "Section " + studentSection);
                }

                // --- Gamification: Competence (Points & Progress)
                currentXP = userData.xp || 0;
                completedModulesList = userData.completedModules || [];
                xpPoints.textContent = '0';
                
                // Animate XP
                animateValue(xpPoints, 0, currentXP, 1000);

                // Load Leaderboard and Modules
                loadLeaderboard();
                loadModules(studentGrade, studentSection);

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

// Load the Learning Modules from Firestore
async function loadModules(studentGrade, studentSection) {
    try {
        const modulesRef = collection(db, "modules");
        const q = query(modulesRef, orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        
        learningModules.innerHTML = '';
        
        let modulesAdded = 0;

        if(querySnapshot.empty) {
            learningModules.innerHTML = `<div class="col-12"><p class="text-muted">No learning modules available right now. Check back later!</p></div>`;
            return;
        }
        
        querySnapshot.forEach((docSnap) => {
            const modData = docSnap.data();
            
            // Filter by Grade and Section (Client-side for prototype to avoid complex index requirements)
            const targetGrade = modData.targetGrade || 'All Grades';
            const targetSection = modData.targetSection ? modData.targetSection.toLowerCase() : 'all';
            
            const isMatchGrade = targetGrade === 'All Grades' || targetGrade === studentGrade;
            const isMatchSection = targetSection === 'all' || targetSection === (studentSection ? studentSection.toLowerCase() : '');
            
            if (!isMatchGrade || !isMatchSection) return; // Skip if not meant for this student

            modulesAdded++;
            const modId = docSnap.id;
            
            // Calculate progress percentage if they have started
            const savedProgress = parseInt(localStorage.getItem('elms_progress_' + modId)) || 0;
            let progressPercent = 0;
            if (savedProgress > 0) {
                const rawContent = modData.content || "Oops! The teacher forgot to write the lesson.";
                const tempChunks = rawContent.split(/(?<=[.!?])\s+|[\n]+/).filter(text => text.trim().length > 0);
                const totalChunks = tempChunks.length === 0 ? 1 : tempChunks.length;
                // Cap it at 99% so they don't see 100% until they actually finish it
                progressPercent = Math.min(99, Math.floor((savedProgress / totalChunks) * 100));
            }

            // Randomize a pastel color block for the module banner to make it playful
            const colors = ['#ffdac1', '#a1c4fd', '#fbc2eb', '#fdcbf1', '#e0c3fc'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];

            const col = document.createElement('div');
            col.className = 'col-md-6';
            col.innerHTML = `
                <div class="card shadow-sm border-0 h-100 module-card overflow-hidden">
                    <div style="height: 10px; background: ${randomColor};"></div>
                    <div class="card-body d-flex flex-column">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h6 class="mb-0 fw-bold">${modData.title || 'Untitled Module'}</h6>
                            <span class="badge bg-warning text-dark"><i class="bi bi-star-fill"></i> ${modData.xpReward || 0} XP</span>
                        </div>
                        <p class="text-muted small flex-grow-1">${modData.description || 'No description provided.'}</p>
                        ${savedProgress > 0 && !completedModulesList.includes(modId) ? `
                        <div class="progress mb-2 rounded-pill" style="height: 8px;">
                            <div class="progress-bar bg-info progress-bar-striped progress-bar-animated" role="progressbar" style="width: ${progressPercent}%;"></div>
                        </div>
                        ` : ''}
                        ${completedModulesList.includes(modId) ? `
                        <button class="btn btn-sm btn-success text-white w-100 mt-3 complete-mod-btn fw-bold" 
                            data-xp="${modData.xpReward || 0}" 
                            data-id="${modId}" 
                            data-title="${modData.title}" 
                            data-content="${encodeURIComponent(modData.content || "Oops! The teacher forgot to write the lesson.")}">
                            <i class="bi bi-check2-circle fs-5"></i> Review Lesson
                        </button>
                        ` : (savedProgress > 0 ? `
                        <button class="btn btn-sm btn-info text-white w-100 mt-2 complete-mod-btn fw-bold" 
                            data-xp="${modData.xpReward || 0}" 
                            data-id="${modId}" 
                            data-title="${modData.title}" 
                            data-content="${encodeURIComponent(modData.content || "Oops! The teacher forgot to write the lesson.")}">
                            <i class="bi bi-play-circle-fill fs-5"></i> Continue (${progressPercent}%)
                        </button>
                        ` : `
                        <button class="btn btn-sm btn-outline-primary w-100 mt-3 complete-mod-btn fw-bold" 
                            data-xp="${modData.xpReward || 0}" 
                            data-id="${modId}" 
                            data-title="${modData.title}" 
                            data-content="${encodeURIComponent(modData.content || "Oops! The teacher forgot to write the lesson.")}">
                            <i class="bi bi-play-circle-fill fs-5"></i> Start Learning
                        </button>
                        `)}
                    </div>
                </div>
            `;
            learningModules.appendChild(col);
        });

        if (modulesAdded === 0) {
            learningModules.innerHTML = `<div class="col-12"><p class="text-muted">No learning modules assigned to your Grade/Section yet. Choose an 'All Grades' module or ask your teacher.</p></div>`;
        }

        // Add click events to start lesson buttons
        document.querySelectorAll('.complete-mod-btn').forEach(btn => {
            btn.addEventListener('click', startInteractiveLesson);
        });

    } catch (error) {
        console.error("Error fetching modules:", error);
        learningModules.innerHTML = `<div class="col-12"><p class="text-danger">Failed to load modules securely.</p></div>`;
    }
}

// Start Gamified Interactive Lesson (Duolingo-style micro-learning)
function startInteractiveLesson(e) {
    const btn = e.currentTarget;
    if(btn.disabled) return; 
    
    currentModId = btn.getAttribute('data-id');
    const title = btn.getAttribute('data-title');
    const encodedContent = btn.getAttribute('data-content');
    const rawContent = decodeURIComponent(encodedContent);
    currentLessonXP = parseInt(btn.getAttribute('data-xp'), 10);
    currentLessonCard = btn; // Save reference to update button state later
    
    isReviewMode = completedModulesList.includes(currentModId);

    // Split content into chunks by periods (.) or newlines (\n)
    // This forces kids to read bite-sized pieces and click "next" (Autonomy)
    currentLessonChunks = rawContent.split(/(?<=[.!?])\s+|[\n]+/).filter(text => text.trim().length > 0);
    
    // Failsafe for very short lessons
    if(currentLessonChunks.length === 0) currentLessonChunks = ["Let's learn something new!"];

    // Load saved progress if not reviewing
    if (isReviewMode) {
        currentChunkIndex = 0;
    } else {
        currentChunkIndex = parseInt(localStorage.getItem('elms_progress_' + currentModId)) || 0;
        if (currentChunkIndex >= currentLessonChunks.length) currentChunkIndex = 0;
    }
    
    // Prep Modal UI
    lessonModalTitle.textContent = title;
    lessonNextBtn.parentElement.classList.remove('d-none');
    lessonFinishBtn.classList.add('d-none');
    updateLessonChunk();
    
    // Open Modal
    lessonModal.show();
}

// Update the chunk text and progress bar
function updateLessonChunk() {
    lessonChunkText.textContent = currentLessonChunks[currentChunkIndex];
    
    // Toggle Back button
    if(currentChunkIndex > 0) {
        lessonBackBtn.classList.remove('d-none');
    } else {
        lessonBackBtn.classList.add('d-none');
    }

    // Calculate progress (Competence)
    const progressPercent = Math.floor((currentChunkIndex / currentLessonChunks.length) * 100);
    lessonProgress.style.width = `${progressPercent}%`;

    // Swap buttons if on last chunk
    if(currentChunkIndex === currentLessonChunks.length - 1) {
        lessonNextBtn.parentElement.classList.add('d-none');
        lessonFinishBtn.classList.remove('d-none');
        lessonProgress.style.width = `100%`;
        lessonProgress.classList.replace('bg-warning', 'bg-success');
        
        if (isReviewMode) {
            lessonFinishBtn.innerHTML = `Great Job Reviewing! 👍`;
        } else {
            lessonFinishBtn.innerHTML = `🌟 Complete & Earn ${currentLessonXP} XP!`;
        }
    } else {
        lessonNextBtn.parentElement.classList.remove('d-none');
        lessonFinishBtn.classList.add('d-none');
        lessonProgress.classList.replace('bg-success', 'bg-warning');
        
        if (!isReviewMode) {
            localStorage.setItem('elms_progress_' + currentModId, currentChunkIndex);
        }
    }
}

// Next Button Handler
lessonNextBtn.addEventListener('click', () => {
    if(currentChunkIndex < currentLessonChunks.length - 1) {
        currentChunkIndex++;
        animateChunkChange();
    }
});

// Back Button Handler
lessonBackBtn.addEventListener('click', () => {
    if(currentChunkIndex > 0) {
        currentChunkIndex--;
        animateChunkChange();
    }
});

function animateChunkChange() {
    // Add a fun bounce animation to text for engagement
    lessonChunkText.style.transform = 'scale(0.95)';
    setTimeout(() => {
        updateLessonChunk();
        lessonChunkText.style.transform = 'scale(1)';
        lessonChunkText.style.transition = 'transform 0.2s ease';
    }, 150);
}

// Final Finish Button Handler / Gain XP (Mastery Achieved)
lessonFinishBtn.addEventListener('click', async () => {
    if (isReviewMode) {
        lessonModal.hide();
        return;
    }

    lessonFinishBtn.disabled = true;
    lessonFinishBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Verifying...`;
    
    try {
        // Safe database update
        await updateDoc(userDocRef, {
            xp: increment(currentLessonXP),
            completedModules: arrayUnion(currentModId)
        });
        
        // Remove locally saved progress
        localStorage.removeItem('elms_progress_' + currentModId);
        
        // Update Local Arrays & UI
        completedModulesList.push(currentModId);
        let oldXP = currentXP;
        currentXP += currentLessonXP;
        animateValue(xpPoints, oldXP, currentXP, 1200);
        loadLeaderboard();

        // Update the card button for Review Mode
        currentLessonCard.disabled = false;
        currentLessonCard.classList.remove('btn-outline-primary');
        currentLessonCard.classList.add('btn-success', 'text-white');
        currentLessonCard.innerHTML = `<i class="bi bi-check2-circle fs-5"></i> Review Lesson`;

        // Close Modal
        lessonModal.hide();
        
    } catch (error) {
        console.error("Failed to sync XP:", error);
        lessonFinishBtn.innerHTML = `Error. Try again.`;
    } finally {
        lessonFinishBtn.disabled = false;
        lessonFinishBtn.innerHTML = `🌟 Complete & Earn XP!`;
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