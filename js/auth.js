import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    sendPasswordResetEmail,
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
                <form id="auth-form">
                    <div class="mb-3 text-start">
                        <label for="email" class="form-label">Email address</label>
                        <input type="email" class="form-control" id="email" required>
                    </div>
                    <div class="mb-3 text-start">
                        <label for="password" class="form-label">Password</label>
                        <input type="password" class="form-control" id="password" required>
                    </div>
                    <div id="login-error" class="text-danger mb-3 d-none"></div>
                    <div id="reset-success" class="text-success small mb-3 d-none">Password reset email sent! Check your inbox.</div>
                    
                    <button id="login-submit-btn" type="submit" class="btn btn-primary w-100 mb-2">Sign In</button>
                    <button type="button" id="forgot-password-btn" class="btn btn-link text-decoration-none small text-muted w-100" data-bs-toggle="modal" data-bs-target="#forgotPasswordModal">Forgot Password?</button>
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

    // Form Submit (Login)
    document.getElementById('auth-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('login-error');
        const submitBtn = document.getElementById('login-submit-btn');
        
        try {
            errorDiv.classList.add('d-none');
            const successDiv = document.getElementById('reset-success');
            if(successDiv) successDiv.classList.add('d-none');
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Signing In...';
            
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
            
            let displayError = error.message;
            if (error.code === 'auth/invalid-credential') displayError = "Incorrect email or password.";
            errorDiv.textContent = displayError;
            errorDiv.classList.remove('d-none');
        }
    });

    // Password Reset
    const resetForm = document.getElementById('reset-password-form');
    if (resetForm) {
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const resetEmail = document.getElementById('reset-email').value;
            const resetMsg = document.getElementById('reset-msg');
            const submitResetBtn = document.getElementById('submit-reset-btn');

            submitResetBtn.disabled = true;
            submitResetBtn.textContent = 'Sending...';

            try {
                await sendPasswordResetEmail(auth, resetEmail);
                resetMsg.className = 'small mb-3 text-success';
                resetMsg.textContent = 'Success! A password reset link has been sent to your email inbox.';
                resetForm.reset();
            } catch (error) {
                resetMsg.className = 'small mb-3 text-danger';
                resetMsg.textContent = error.message;
            } finally {
                submitResetBtn.disabled = false;
                submitResetBtn.textContent = 'Send Reset Link';
            }
        });
    }

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
async function routeUserBasedOnRole(user, retryCount = 0) {
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
            if (retryCount < 3) {
                console.log(`Document missing, retrying... (${retryCount + 1})`);
                setTimeout(() => routeUserBasedOnRole(user, retryCount + 1), 1000);
            } else {
                console.log("No such user document!");
                authSection.innerHTML = `<p class="text-danger mt-3">User role not found. Please contact an admin.</p>
                 <button id="logout-btn" class="btn btn-danger mt-2">Log Out</button>`;
                 document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
            }
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