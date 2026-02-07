function handleLogin() {
  const email = document.getElementById('email')?.value.trim();
  const role = document.getElementById('role')?.value || 'student';
  if (!email) return alert("Enter email");

  localStorage.setItem('userEmail', email);
  localStorage.setItem('userRole', role);
  localStorage.setItem('userName', email.split('@')[0].replace(/[.-]/g, ' '));

  const routes = {
    student: 'student-dashboard.html',
    instructor: 'instructor-dashboard.html',
    admin: 'admin-dashboard.html',
    analyst: 'analytics.html'
  };
  window.location.href = routes[role] || 'student-dashboard.html';
}

function logout() {
  localStorage.clear();
  window.location.href = 'index.html';
}

function checkAuth() {
  if (!localStorage.getItem('userRole')) {
    alert("Please login");
    window.location.href = 'login.html';
  }
}