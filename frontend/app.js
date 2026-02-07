function handleLogin() {
    const role = document.getElementById('role').value;
    const email = document.getElementById('email').value;
    
    if(!email) { alert("Please enter email"); return; }
    
    // Save session data
    localStorage.setItem('userEmail', email);
    localStorage.setItem('userRole', role);

    // Redirect logic
    const routes = {
        'student': 'student_dashboard.html',
        'instructor': 'instructor_dashboard.html',
        'admin': 'admin_dashboard.html',
        'analyst': 'analytics.html'
    };

    window.location.href = routes[role];
}

function checkAccess(role) {
    const savedRole = localStorage.getItem('userRole');
    if (savedRole !== role) {
        alert("Unauthorized Access!");
        window.location.href = 'login.html';
    }
}