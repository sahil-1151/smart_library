/**
 * Smart Library – Frontend (mirrors Backend in c/)
 * Uses localStorage as mock backend; replace with API calls when C backend exposes HTTP.
 */

const STORAGE_KEYS = {
  books: 'sl_books',
  users: 'sl_users',
  admins: 'sl_admins',
  issued: 'sl_issued',
  nextUserId: 'sl_next_user_id',
  nextAdminId: 'sl_next_admin_id',
};

// ----- Mock storage (mirrors C file storage) -----
function getBooks() {
  const raw = localStorage.getItem(STORAGE_KEYS.books);
  return raw ? JSON.parse(raw) : [];
}

function saveBooks(books) {
  localStorage.setItem(STORAGE_KEYS.books, JSON.stringify(books));
}

function getUsers() {
  const raw = localStorage.getItem(STORAGE_KEYS.users);
  return raw ? JSON.parse(raw) : [];
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
}

function getAdmins() {
  const raw = localStorage.getItem(STORAGE_KEYS.admins);
  return raw ? JSON.parse(raw) : [];
}

function saveAdmins(admins) {
  localStorage.setItem(STORAGE_KEYS.admins, JSON.stringify(admins));
}

function getIssued() {
  const raw = localStorage.getItem(STORAGE_KEYS.issued);
  return raw ? JSON.parse(raw) : [];
}

function saveIssued(issued) {
  localStorage.setItem(STORAGE_KEYS.issued, JSON.stringify(issued));
}

function nextUserId() {
  let n = parseInt(localStorage.getItem(STORAGE_KEYS.nextUserId) || '1', 10);
  localStorage.setItem(STORAGE_KEYS.nextUserId, String(n + 1));
  return n;
}

function nextAdminId() {
  let n = parseInt(localStorage.getItem(STORAGE_KEYS.nextAdminId) || '1', 10);
  localStorage.setItem(STORAGE_KEYS.nextAdminId, String(n + 1));
  return n;
}

// ----- Helpers -----
function today() {
  const d = new Date();
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

function addDays(d, days) {
  const date = new Date(d.year, d.month - 1, d.day);
  date.setDate(date.getDate() + days);
  return { day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear() };
}

function formatDate(d) {
  return `${d.day}/${d.month}/${d.year}`;
}

function caseInsensitiveMatch(a, b) {
  return (a || '').toLowerCase().includes((b || '').toLowerCase());
}

// ----- Auth -----
function registerUser(name, email, password) {
  const users = getUsers();
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) return { ok: false, msg: 'User already exists' };
  const id = nextUserId();
  users.push({ id, name, email, password });
  saveUsers(users);
  return { ok: true, user: { id, name, email } };
}

function loginUser(email, password) {
  const users = getUsers();
  const u = users.find(x => x.email.toLowerCase() === email.toLowerCase() && x.password === password);
  return u ? { ok: true, user: { id: u.id, name: u.name, email: u.email } } : { ok: false, msg: 'Login failed' };
}

function registerAdmin(name, email, password, lib) {
  const admins = getAdmins();
  if (admins.some(a => a.email.toLowerCase() === email.toLowerCase())) return { ok: false, msg: 'Admin already exists' };
  const id = nextAdminId();
  admins.push({ id, name, email, password, lib });
  saveAdmins(admins);
  return { ok: true, admin: { id, name, email, lib } };
}

function loginAdmin(email, password) {
  const admins = getAdmins();
  const a = admins.find(x => x.email.toLowerCase() === email.toLowerCase() && x.password === password);
  return a ? { ok: true, admin: { id: a.id, name: a.name, email: a.email, lib: a.lib } } : { ok: false, msg: 'Login failed' };
}

// ----- Books -----
function addBook(bookId, lib, title, author, totalCopies) {
  const books = getBooks();
  if (books.some(b => b.book_id === bookId)) return false;
  books.push({
    book_id: bookId,
    title: title || '',
    author: author || '',
    lib: lib || '',
    total_copies: totalCopies || 0,
    available_copies: totalCopies || 0,
  });
  saveBooks(books);
  return true;
}

function deleteBook(bookId) {
  let books = getBooks().filter(b => b.book_id !== bookId);
  saveBooks(books);
  return true;
}

function searchBooksById(bookId) {
  return getBooks().find(b => b.book_id === bookId) || null;
}

function searchBooksByString(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return getBooks();
  return getBooks().filter(b =>
    (b.title && b.title.toLowerCase().includes(q)) ||
    (b.author && b.author.toLowerCase().includes(q))
  );
}

function booksForLibrary(lib) {
  return getBooks().filter(b => b.lib === lib);
}

// ----- Issue / Return -----
function issueBook(studentId, bookId) {
  const books = getBooks();
  const book = books.find(b => b.book_id === bookId);
  if (!book) return { ok: false, msg: 'Book not found' };
  if (book.available_copies < 1) return { ok: false, msg: 'No copies available' };
  const issued = getIssued();
  if (issued.some(i => i.student_id === studentId && i.book_id === bookId && !i.returned)) return { ok: false, msg: 'Already issued' };
  const issueDate = today();
  const dueDate = addDays(issueDate, 14);
  issued.push({
    student_id: studentId,
    book_id: bookId,
    issue_date: issueDate,
    due_date: dueDate,
    fine: 0,
    returned: false,
  });
  book.available_copies--;
  saveBooks(books);
  saveIssued(issued);
  return { ok: true };
}

function returnBook(studentId, bookId) {
  const issued = getIssued();
  const rec = issued.find(i => i.student_id === studentId && i.book_id === bookId && !i.returned);
  if (!rec) return { ok: false, msg: 'Issue record not found' };
  rec.returned = true;
  const books = getBooks();
  const book = books.find(b => b.book_id === bookId);
  if (book) book.available_copies++;
  saveBooks(books);
  saveIssued(issued);
  return { ok: true };
}

function getIssuedForUser(studentId) {
  return getIssued().filter(i => i.student_id === studentId && !i.returned);
}

// ----- UI state -----
let currentUser = null;
let currentAdmin = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function showMessage(msg, isError = false) {
  const el = document.getElementById('message');
  if (!el) return;
  el.textContent = msg;
  el.className = 'message ' + (isError ? 'error' : 'success');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function renderBooksList(containerId, books, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!books || books.length === 0) {
    container.innerHTML = '<p class="empty">No books found.</p>';
    return;
  }
  container.innerHTML = books.map(b => `
    <div class="book-card">
      <div class="book-id">#${b.book_id}</div>
      <h3>${escapeHtml(b.title)}</h3>
      <p class="author">${escapeHtml(b.author)}</p>
      <p class="lib">${escapeHtml(b.lib)}</p>
      <p class="copies">Available: ${b.available_copies} / ${b.total_copies}</p>
      ${options.showIssue && b.available_copies > 0 ? `<button type="button" class="btn btn-sm" data-issue="${b.book_id}">Issue</button>` : ''}
      ${options.showDelete ? `<button type="button" class="btn btn-sm danger" data-delete="${b.book_id}">Delete</button>` : ''}
    </div>
  `).join('');
  if (options.onIssue) {
    container.querySelectorAll('[data-issue]').forEach(btn => {
      btn.addEventListener('click', () => options.onIssue(parseInt(btn.dataset.issue, 10)));
    });
  }
  if (options.onDelete) {
    container.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => options.onDelete(parseInt(btn.dataset.delete, 10)));
    });
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ----- Screens -----
function initHome() {
  document.getElementById('goAdmin').onclick = () => showScreen('admin-entry');
  document.getElementById('goUser').onclick = () => showScreen('user-entry');
}

function initAdminEntry() {
  document.getElementById('adminBack').onclick = () => showScreen('home');
  document.getElementById('adminRegisterBtn').onclick = () => showScreen('admin-register');
  document.getElementById('adminLoginBtn').onclick = () => showScreen('admin-login');
}

function initAdminRegister() {
  document.getElementById('adminRegBack').onclick = () => showScreen('admin-entry');
  document.getElementById('adminRegForm').onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById('adminRegName').value.trim();
    const email = document.getElementById('adminRegEmail').value.trim();
    const password = document.getElementById('adminRegPassword').value;
    const lib = document.getElementById('adminRegLib').value.trim();
    if (!name || !email || !password || !lib) { showMessage('Fill all fields', true); return; }
    const result = registerAdmin(name, email, password, lib);
    if (result.ok) { showMessage('Registration successful'); showScreen('admin-entry'); }
    else showMessage(result.msg, true);
  };
}

function initAdminLogin() {
  document.getElementById('adminLoginBack').onclick = () => showScreen('admin-entry');
  document.getElementById('adminLoginForm').onsubmit = (e) => {
    e.preventDefault();
    const email = document.getElementById('adminLoginEmail').value.trim();
    const password = document.getElementById('adminLoginPassword').value;
    const result = loginAdmin(email, password);
    if (result.ok) {
      currentAdmin = result.admin;
      showMessage('Login successful');
      showScreen('admin-dashboard');
      loadAdminDashboard();
    } else showMessage(result.msg, true);
  };
}

function loadAdminDashboard() {
  if (!currentAdmin) return;
  document.getElementById('adminInfoName').textContent = currentAdmin.name;
  document.getElementById('adminInfoLib').textContent = currentAdmin.lib;
  document.getElementById('adminInfoId').textContent = currentAdmin.id;
  document.getElementById('adminInfoEmail').textContent = currentAdmin.email;
  const books = booksForLibrary(currentAdmin.lib);
  renderBooksList('adminBooksList', books, { showDelete: true, onDelete: (id) => { deleteBook(id); loadAdminDashboard(); showMessage('Book deleted'); } });
}

function initAdminDashboard() {
  document.getElementById('adminLogout').onclick = () => { currentAdmin = null; showScreen('admin-entry'); };
  document.getElementById('adminAddBookForm').onsubmit = (e) => {
    e.preventDefault();
    const bookId = parseInt(document.getElementById('addBookId').value, 10);
    const title = document.getElementById('addBookTitle').value.trim();
    const author = document.getElementById('addBookAuthor').value.trim();
    const total = parseInt(document.getElementById('addBookTotal').value, 10);
    if (isNaN(bookId) || !title || isNaN(total)) { showMessage('Invalid fields', true); return; }
    if (addBook(bookId, currentAdmin.lib, title, author, total)) { showMessage('Book added'); loadAdminDashboard(); e.target.reset(); }
    else showMessage('Book ID already exists', true);
  };
}

function initUserEntry() {
  document.getElementById('userBack').onclick = () => showScreen('home');
  document.getElementById('userRegisterBtn').onclick = () => showScreen('user-register');
  document.getElementById('userLoginBtn').onclick = () => showScreen('user-login');
}

function initUserRegister() {
  document.getElementById('userRegBack').onclick = () => showScreen('user-entry');
  document.getElementById('userRegForm').onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById('userRegName').value.trim();
    const email = document.getElementById('userRegEmail').value.trim();
    const password = document.getElementById('userRegPassword').value;
    if (!name || !email || !password) { showMessage('Fill all fields', true); return; }
    const result = registerUser(name, email, password);
    if (result.ok) { showMessage('Registration successful'); showScreen('user-entry'); }
    else showMessage(result.msg, true);
  };
}

function initUserLogin() {
  document.getElementById('userLoginBack').onclick = () => showScreen('user-entry');
  document.getElementById('userLoginForm').onsubmit = (e) => {
    e.preventDefault();
    const email = document.getElementById('userLoginEmail').value.trim();
    const password = document.getElementById('userLoginPassword').value;
    const result = loginUser(email, password);
    if (result.ok) {
      currentUser = result.user;
      showMessage('Login successful');
      showScreen('user-dashboard');
      loadUserDashboard();
    } else showMessage(result.msg, true);
  };
}

function loadUserDashboard() {
  if (!currentUser) return;
  document.getElementById('userInfoName').textContent = currentUser.name;
  document.getElementById('userInfoEmail').textContent = currentUser.email;
  document.getElementById('userInfoId').textContent = currentUser.id;
  const allBooks = getBooks();
  renderBooksList('userBooksList', allBooks, { showIssue: true, onIssue: (bookId) => {
    const r = issueBook(currentUser.id, bookId);
    showMessage(r.ok ? 'Book issued' : r.msg, !r.ok);
    if (r.ok) loadUserDashboard();
  } });
  const issued = getIssuedForUser(currentUser.id);
  const issuedEl = document.getElementById('userIssuedList');
  if (issuedEl) {
    if (issued.length === 0) issuedEl.innerHTML = '<p class="empty">No books issued.</p>';
    else issuedEl.innerHTML = issued.map(i => {
      const book = searchBooksById(i.book_id);
      const title = book ? book.title : 'Book #' + i.book_id;
      return `<div class="issued-card"><strong>${escapeHtml(title)}</strong> (ID: ${i.book_id}) — Due: ${formatDate(i.due_date)} <button type="button" class="btn btn-sm" data-return="${i.book_id}">Return</button></div>`;
    }).join('');
    issuedEl.querySelectorAll('[data-return]').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = returnBook(currentUser.id, parseInt(btn.dataset.return, 10));
        showMessage(r.ok ? 'Book returned' : r.msg, !r.ok);
        if (r.ok) loadUserDashboard();
      });
    });
  }
}

function initUserDashboard() {
  document.getElementById('userLogout').onclick = () => { currentUser = null; showScreen('user-entry'); };
  document.getElementById('userSearchForm').onsubmit = (e) => {
    e.preventDefault();
    const q = document.getElementById('userSearchQuery').value.trim();
    const by = document.getElementById('userSearchBy').value;
    let books;
    if (by === 'id') {
      const id = parseInt(q, 10);
      books = isNaN(id) ? [] : (searchBooksById(id) ? [searchBooksById(id)] : []);
    } else books = searchBooksByString(q);
    renderBooksList('userSearchResults', books, { showIssue: true, onIssue: (bookId) => {
      const r = issueBook(currentUser.id, bookId);
      showMessage(r.ok ? 'Book issued' : r.msg, !r.ok);
      loadUserDashboard();
    } });
  };
}

// ----- Bootstrap -----
function init() {
  initHome();
  initAdminEntry();
  initAdminRegister();
  initAdminLogin();
  initAdminDashboard();
  initUserEntry();
  initUserRegister();
  initUserLogin();
  initUserDashboard();
  showScreen('home');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
