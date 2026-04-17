import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const authSection = document.getElementById('auth-section');

// Render Login Form
function renderLoginForm() {
    authSection.innerHTML = `
        <div class="card shadow-sm">
            <div class="card-body p-4">
                <h3 class="card-title mb-4">Login</h3>
                <form id="login-form">
                    <div class="mb-3 text-start">
                        <label for="email" class="form-label">Email address</label>
                        <input type="email" class="form-control" id="email" required>
                    </div>
                    <div class="mb-3 text-start">
                        <label for="password" class="form-label">Password</label>
                        <input type="password" class="form-control" id="password" required>
                    </div>
                    <div id="login-error" class="text-danger mb-3 d-none"></div>
                    <button id="login-submit-btn" type="submit" class="btn btn-primary w-100">Sign In</button>
                </form>
                
                <hr class="my-4">
                <h6 class="text-muted mb-3">Quick Demo Access</h6>
                <div class="d-grid gap-2 d-md-flex justify-content-md-center">
                    <button type="button" id="demo-student" class="btn btn-sm btn-outline-primary">🎓 Student</button>
                    <button type="button" id="demo-teacher" class="btn btn-sm btn-outline-success">📝 Teacher</button>
                    <button type="button" id="demo-admin" class="btn btn-sm btn-outline-dark">🛡️ Admin</button>
                </div>
            </div>
        </div>
    `;

    // Normal Login Submit
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('login-error');
        const submitBtn = document.getElementById('login-submit-btn');
        
        try {
            errorDiv.classList.add('d-none');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Signing In...';
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
            errorDiv.textContent = 'Login failed. ' + error.message;
            errorDiv.classList.remove('d-none');
            console.error("Login Error:", error.message);
        }
    });

    // Demo Button Handlers
    const setDemoLogin = (email) => {
        document.getElementById('email').value = email;
        document.getElementById('password').value = 'password123';
        document.getElementById('login-submit-btn').click(); // Auto-submit
    };

    document.getElementById('demo-student').addEventListener('click', () => setDemoLogin('student@demo.com'));
    document.getElementById('demo-teacher').addEventListener('click', () => setDemoLogin('teacher@demo.com'));
    document.getElementById('demo-admin').addEventListener('click', () => setDemoLogin('admin@demo.com'));
}

// Handle Routing Details on Login
async function routeUserBasedOnRole(user) {
    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const role = userData.role || 'unassigned';

            let dashboardHTML = `
                <div class="card shadow-sm mt-4">
                    <div class="card-body p-4">
                        <h2>Welcome back, ${userData.name || user.email}!</h2>
                        <p class="lead text-muted">Role: <span class="badge bg-info text-dark">${role.toUpperCase()}</span></p>
                        <hr>
                        <div id="dashboard-content"></div>
                        <button id="logout-btn" class="btn btn-outline-danger mt-3">Log Out</button>
                    </div>
                </div>
            `;
            authSection.innerHTML = dashboardHTML;

            // Simple routing
            const dashboardContent = document.getElementById('dashboard-content');
            if (role === 'student') {
                dashboardContent.innerHTML = `<a href="student-dashboard.html" class="btn btn-success">Go to Student Dashboard</a>`;
            } else if (role === 'teacher') {
                dashboardContent.innerHTML = `<a href="teacher-dashboard.html" class="btn btn-success">Go to Teacher Dashboard</a>`;
            } else if (role === 'admin') {
                dashboardContent.innerHTML = `<a href="admin-dashboard.html" class="btn btn-success">Go to Admin Dashboard</a>`;
            } else {
                 dashboardContent.innerHTML = `<p class="text-danger">Role is unassigned or misspelled in the database.</p>`;
            }

            document.getElementById('logout-btn').addEventListener('click', () => {
                signOut(auth);
            });
            
        } else {
            console.log("No such user document!");
            authSection.innerHTML = `<p class="text-danger">User role not found. Please contact an admin.</p>
             <button id="logout-btn" class="btn btn-outline-danger mt-3">Log Out</button>`;
             document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
        }
    } catch (error) {
         console.error("Error fetching user role:", error);
         authSection.innerHTML = `<p class="text-danger">Error loading dashboard.</p>`;
    }
}

// Authentication State Observer
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in.
        authSection.innerHTML = `<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><p>Verifying role...</p>`;
        routeUserBasedOnRole(user);
    } else {
        // User is signed out.
        renderLoginForm();
    }
});