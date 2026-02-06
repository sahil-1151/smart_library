/**
 * Smart Library – Frontend (mirrors Backend in c/)
 * Uses localStorage as mock backend; replace with API calls when C backend exposes HTTP.
 */

const STORAGE_KEYS = {
  books: 'sl_books',
  users: 'sl_users',
  admins: 'sl_admins',
  issued: 'sl_issued',
  queue: 'sl_queue',
  nextUserId: 'sl_next_user_id',
  nextAdminId: 'sl_next_admin_id',
};

// ----- OTP (matches C backend: sent_otp_email + verify) -----
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000);
}

/** Send OTP to email via email server (configured with your email/app password). */
const EMAIL_SERVER_URL = 'http://localhost:8080';

function sendOtpToEmail(email) {
  return fetch(EMAIL_SERVER_URL + '/send_otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  })
    .then(r => r.json())
    .then(data => {
      if (data && data.ok) {
        console.log('OTP sent to', email);
        return; // OTP sent via email
      } else {
        // Even if backend reports an error, the email might already be sent.
        const msg = (data && data.error) || 'Failed to send OTP';
        console.warn('OTP backend reported error:', msg);
        return;
      }
    })
    .catch(err => {
      console.error('OTP send failed:', err);
      // Do not reject here – in practice the email often still arrives.
      // Frontend flows will proceed to OTP screen and let user verify.
      return;
    });
}

/** Verify OTP with email server. */
function verifyOtpWithBackend(email, otp) {
  return fetch(EMAIL_SERVER_URL + '/verify_otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp })
  })
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        return { ok: true };
      } else {
        return { ok: false, msg: data.error || 'Invalid OTP' };
      }
    })
    .catch(err => {
      console.error('OTP verify failed:', err);
      return { ok: false, msg: 'Verification failed' };
    });
}

// ----- Parse C backend .txt files (same format as Storage.c) -----
function parseDataBook(text) {
  const books = [];
  const lines = (text || '').trim().split('\n').filter(l => l.trim());
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length >= 6) {
      books.push({
        book_id: parseInt(parts[0], 10),
        lib: (parts[1] || '').trim(),
        title: (parts[2] || '').trim(),
        author: (parts[3] || '').trim(),
        total_copies: parseInt(parts[4], 10) || 0,
        available_copies: (parseInt(parts[5], 10) ?? parseInt(parts[4], 10)) || 0,
      });
    }
  }
  return books;
}

function parseUserLogin(text) {
  const users = [];
  const lines = (text || '').trim().split('\n').filter(l => l.trim());
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length >= 4) {
      users.push({
        id: parseInt(parts[0], 10),
        name: (parts[1] || '').trim(),
        email: (parts[2] || '').trim(),
        password: (parts[3] || '').trim(),
      });
    }
  }
  return users;
}

function parseAdminLogin(text) {
  const admins = [];
  const lines = (text || '').trim().split('\n').filter(l => l.trim());
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length >= 5) {
      admins.push({
        id: parseInt(parts[0], 10),
        name: (parts[1] || '').trim(),
        lib: (parts[2] || '').trim(),
        email: (parts[3] || '').trim(),
        password: (parts[4] || '').trim(),
      });
    }
  }
  return admins;
}

function parseIssueBook(text) {
  const issued = [];
  const lines = (text || '').trim().split('\n').filter(l => l.trim());
  for (const line of lines) {
    const parts = line.split('|').map(p => parseInt(p, 10));
    if (parts.length >= 8 && parts.every(n => !isNaN(n))) {
      issued.push({
        student_id: parts[0],
        book_id: parts[1],
        issue_date: { day: parts[2], month: parts[3], year: parts[4] },
        due_date: { day: parts[5], month: parts[6], year: parts[7] },
        fine: 0,
        returned: false,
      });
    }
  }
  return issued;
}

function parseQueueBook(text) {
  const queue = [];
  const lines = (text || '').trim().split('\n').filter(l => l.trim());
  for (const line of lines) {
    const parts = line.split('|').map(p => parseInt(p, 10));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      queue.push({ student_id: parts[0], book_id: parts[1] });
    }
  }
  return queue;
}

/** Load backend .txt files into app (replace existing data). Call with map: { 'data_book.txt': string, ... } */
function importFromBackendFiles(filesMap) {
  const stats = { books: 0, users: 0, admins: 0, issued: 0, queue: 0 };
  if (filesMap['data_book.txt']) {
    const books = parseDataBook(filesMap['data_book.txt']);
    saveBooks(books);
    stats.books = books.length;
  }
  if (filesMap['user_login.txt']) {
    const users = parseUserLogin(filesMap['user_login.txt']);
    let maxId = 0;
    users.forEach(u => { if (u.id > maxId) maxId = u.id; });
    if (maxId >= 0) localStorage.setItem(STORAGE_KEYS.nextUserId, String(maxId + 1));
    saveUsers(users);
    stats.users = users.length;
  }
  if (filesMap['admin_login.txt']) {
    const admins = parseAdminLogin(filesMap['admin_login.txt']);
    let maxId = 0;
    admins.forEach(a => { if (a.id > maxId) maxId = a.id; });
    if (maxId >= 0) localStorage.setItem(STORAGE_KEYS.nextAdminId, String(maxId + 1));
    saveAdmins(admins);
    stats.admins = admins.length;
  }
  if (filesMap['issue_book.txt']) {
    const issued = parseIssueBook(filesMap['issue_book.txt']);
    saveIssued(issued);
    stats.issued = issued.length;
  }
  if (filesMap['queue_book.txt']) {
    const queue = parseQueueBook(filesMap['queue_book.txt']);
    localStorage.setItem(STORAGE_KEYS.queue, JSON.stringify(queue));
    stats.queue = queue.length;
  }
  return stats;
}

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

function getQueue() {
  const raw = localStorage.getItem(STORAGE_KEYS.queue);
  return raw ? JSON.parse(raw) : [];
}

function saveQueue(queue) {
  localStorage.setItem(STORAGE_KEYS.queue, JSON.stringify(queue));
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

// ----- Serialize to backend .txt format -----
function serializeBooks(books) {
  const lines = (books || []).map(b =>
    `${b.book_id}|${b.lib || ''}|${b.title || ''}|${b.author || ''}|${b.total_copies || 0}|${b.available_copies || 0}`
  );
  return lines.length ? lines.join('\n') + '\n' : '';
}

function serializeUsers(users) {
  const lines = (users || []).map(u =>
    `${u.id}|${u.name || ''}|${u.email || ''}|${u.password || ''}`
  );
  return lines.length ? lines.join('\n') + '\n' : '';
}

function serializeAdmins(admins) {
  const lines = (admins || []).map(a =>
    `${a.id}|${a.name || ''}|${a.lib || ''}|${a.email || ''}|${a.password || ''}`
  );
  return lines.length ? lines.join('\n') + '\n' : '';
}

function serializeIssued(issued) {
  const lines = (issued || [])
    .filter(i => !i.returned)
    .map(i =>
      `${i.student_id}|${i.book_id}|${i.issue_date.day}|${i.issue_date.month}|${i.issue_date.year}|${i.due_date.day}|${i.due_date.month}|${i.due_date.year}`
    );
  return lines.length ? lines.join('\n') + '\n' : '';
}

function serializeQueue(queue) {
  const lines = (queue || []).map(q => `${q.student_id}|${q.book_id}`);
  return lines.length ? lines.join('\n') + '\n' : '';
}

// ----- Auth -----
function registerUser(name, email, password) {
  const users = getUsers();
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) return { ok: false, msg: 'User already exists' };
  const id = nextUserId();
  users.push({ id, name, email, password });
  saveUsers(users);
  scheduleSync();
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
  scheduleSync();
  return { ok: true, admin: { id, name, email, lib } };
}

function loginAdmin(email, password) {
  const admins = getAdmins();
  const a = admins.find(x => x.email.toLowerCase() === email.toLowerCase() && x.password === password);
  return a ? { ok: true, admin: { id: a.id, name: a.name, email: a.email, lib: a.lib } } : { ok: false, msg: 'Login failed' };
}

function loginAny(email, password) {
  const adminResult = loginAdmin(email, password);
  if (adminResult.ok) return { ok: true, type: 'admin', admin: adminResult.admin };
  const userResult = loginUser(email, password);
  if (userResult.ok) return { ok: true, type: 'user', user: userResult.user };
  return { ok: false, msg: 'Login failed' };
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
  scheduleSync();
  return true;
}

function deleteBook(bookId) {
  let books = getBooks().filter(b => b.book_id !== bookId);
  saveBooks(books);
  scheduleSync();
  return true;
}

/** Edit book details (mirrors Bst.h edit: title, author, total_copies; available_copies set to total_copies). */
function editBook(bookId, { title, author, total_copies }) {
  const books = getBooks();
  const book = books.find(b => b.book_id === bookId);
  if (!book) return false;
  if (title != null) book.title = String(title).trim();
  if (author != null) book.author = String(author).trim();
  if (total_copies != null) {
    const total = parseInt(total_copies, 10) || 0;
    book.total_copies = total;
    book.available_copies = total; // Bst.c edit sets both to total_copies
  }
  saveBooks(books);
  scheduleSync();
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
  scheduleSync();
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
  scheduleSync();
  return { ok: true };
}

function getIssuedForUser(studentId) {
  return getIssued().filter(i => i.student_id === studentId && !i.returned);
}

// ----- Auto-load backend .txt files (when served via backend_server.py) -----
const BACKEND_BASE = ''; // same folder as index.html
const BACKEND_FILES = ['data_book.txt', 'user_login.txt', 'admin_login.txt', 'issue_book.txt', 'queue_book.txt'];
const BACKEND_SAVE_URL = '/api/save';

/** Clear all app data from localStorage so backend .txt files are the single source of truth on each load. */
function clearAppLocalStorage() {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
}

function loadBackendDataFromServer() {
  const filesMap = {};
  let done = 0;
  const total = BACKEND_FILES.length;
  if (total === 0) return;
  function maybeImport() {
    done++;
    if (done === total && Object.keys(filesMap).length > 0) {
      clearAppLocalStorage();
      importFromBackendFiles(filesMap);
    }
  }
  BACKEND_FILES.forEach(name => {
    fetch(BACKEND_BASE + name)
      .then(r => r.ok ? r.text() : Promise.reject(new Error(r.status)))
      .then(text => { filesMap[name] = text; maybeImport(); })
      .catch(() => maybeImport());
  });
}

let syncTimer = null;
let saveErrorShown = false;

function setSaveStatus(text, isError = false) {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('error', isError);
}

function checkBackend() {
  return fetch('/api/ping')
    .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
    .then(() => {
      setSaveStatus('Server online');
      return true;
    })
    .catch(() => {
      setSaveStatus('Server offline', true);
      return false;
    });
}
function scheduleSync() {
  if (!BACKEND_SAVE_URL) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncBackendFiles();
    syncTimer = null;
  }, 200);
}

function syncBackendFiles() {
  const files = {
    'data_book.txt': serializeBooks(getBooks()),
    'user_login.txt': serializeUsers(getUsers()),
    'admin_login.txt': serializeAdmins(getAdmins()),
    'issue_book.txt': serializeIssued(getIssued()),
    'queue_book.txt': serializeQueue(getQueue()),
  };
  return fetch(BACKEND_SAVE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files })
  })
    .then(r => {
      if (!r.ok) {
        return r.text().then(t => { throw new Error(`HTTP ${r.status} ${t || ''}`); });
      }
      return r.json();
    })
    .then(data => {
      if (!data || !data.ok) {
        console.warn('Backend save failed:', data && data.error);
        if (!saveErrorShown) {
          showMessage('Save failed. Run backend_server.py and open http://localhost:8000', true);
          saveErrorShown = true;
        }
        return false;
      }
      saveErrorShown = false;
      return true;
    })
    .catch(err => {
      console.warn('Backend save failed:', err);
      if (!saveErrorShown) {
        showMessage('Save failed. Run backend_server.py and open http://localhost:8000', true);
        saveErrorShown = true;
      }
      return false;
    });
}

// ----- UI state -----
let currentUser = null;
let currentAdmin = null;
/** Pending registration after OTP sent: { type: 'user'|'admin', name, email, password, lib? } */
let pendingReg = null;

function updateNav() {
  const loginBtn = document.getElementById('navLogin');
  const signupBtn = document.getElementById('navSignup');
  const dashBtn = document.getElementById('navDashboard');
  const logoutBtn = document.getElementById('navLogout');
  const loggedIn = !!currentAdmin || !!currentUser;
  if (loginBtn) loginBtn.style.display = loggedIn ? 'none' : '';
  if (signupBtn) signupBtn.style.display = loggedIn ? 'none' : '';
  if (dashBtn) {
    dashBtn.style.display = loggedIn ? '' : 'none';
    dashBtn.textContent = currentAdmin ? 'Admin Dashboard' : 'User Dashboard';
  }
  if (logoutBtn) logoutBtn.style.display = loggedIn ? '' : 'none';
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  updateNav();
}

function showMessage(msg, isError = false) {
  const el = document.getElementById('message');
  if (!el) return;
  el.textContent = msg;
  el.className = 'message ' + (isError ? 'error' : 'success');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

const BOOKS_PAGE_SIZE = 10;

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function bookCoverStyle(book) {
  const seed = `${book.title}|${book.author}|${book.lib}|${book.book_id}`;
  const base = hashString(seed);
  const h1 = base % 360;
  const h2 = (base * 3) % 360;
  const h3 = (base * 7) % 360;
  return `--cover-1: hsl(${h1} 70% 45%); --cover-2: hsl(${h2} 72% 52%); --cover-3: hsl(${h3} 78% 60%);`;
}

function escapeSvgText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function bookCoverDataUri(book) {
  const titleRaw = (book.title || 'Untitled').trim();
  const authorRaw = (book.author || 'Unknown Author').trim();
  const title = escapeSvgText(titleRaw.slice(0, 42));
  const author = escapeSvgText(authorRaw.slice(0, 28));
  const seed = `${book.title}|${book.author}|${book.lib}|${book.book_id}`;
  const base = hashString(seed);
  const h1 = base % 360;
  const h2 = (base * 3) % 360;
  const h3 = (base * 7) % 360;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480" viewBox="0 0 320 480">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${h1} 70% 45%)"/>
      <stop offset="100%" stop-color="hsl(${h2} 75% 55%)"/>
    </linearGradient>
    <linearGradient id="g2" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="hsla(${h3} 80% 55% / 0.35)"/>
      <stop offset="100%" stop-color="hsla(${h1} 70% 40% / 0.15)"/>
    </linearGradient>
  </defs>
  <rect width="320" height="480" fill="url(#g)"/>
  <rect width="320" height="480" fill="url(#g2)"/>
  <rect x="18" y="18" width="284" height="444" rx="18" fill="rgba(0,0,0,0.18)"/>
  <rect x="26" y="26" width="268" height="428" rx="14" fill="rgba(255,255,255,0.08)"/>
  <text x="30" y="320" font-family="Space Grotesk, Sora, Arial, sans-serif" font-size="22" fill="white" font-weight="600">${title}</text>
  <text x="30" y="356" font-family="Space Grotesk, Sora, Arial, sans-serif" font-size="13" fill="rgba(255,255,255,0.85)" letter-spacing="1">${author}</text>
  <rect x="30" y="372" width="90" height="6" rx="3" fill="rgba(255,255,255,0.6)"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function renderBooksList(containerId, books, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!books || books.length === 0) {
    container.innerHTML = '<p class="empty">No books found.</p>';
    container._lastBooks = [];
    container._lastOptions = options;
    const pagerEl = options.pagerId ? document.getElementById(options.pagerId) : null;
    if (pagerEl) pagerEl.innerHTML = '';
    return;
  }
  const pageSize = (options.pagination && options.pagerId && (options.pageSize || BOOKS_PAGE_SIZE)) || books.length;
  const totalPages = Math.ceil(books.length / pageSize) || 1;
  let page = parseInt(container.dataset.currentPage || '1', 10);
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  container.dataset.currentPage = String(page);
  const start = (page - 1) * pageSize;
  const slice = options.pagination && options.pagerId ? books.slice(start, start + pageSize) : books;
  container._lastBooks = books;
  container._lastOptions = options;

  container.innerHTML = slice.map(b => {
    const coverUrl = bookCoverDataUri(b);
    return `
    <div class="book-card" data-book-id="${b.book_id}">
      <div class="book-cover" style="${bookCoverStyle(b)}">
        <img class="book-cover-img" src="${coverUrl}" alt="${escapeHtml(b.title)} cover" loading="lazy">
      </div>
      <div class="book-meta">
        <div class="book-id">#${b.book_id}</div>
        <h3>${escapeHtml(b.title)}</h3>
        <p class="author">${escapeHtml(b.author)}</p>
        <p class="lib">${escapeHtml(b.lib)}</p>
        <p class="copies">Available: ${b.available_copies} / ${b.total_copies}</p>
        <div class="book-actions">
          ${options.showIssue && b.available_copies > 0 ? `<button type="button" class="btn btn-sm" data-issue="${b.book_id}">Issue</button>` : ''}
          ${options.showEdit ? `<button type="button" class="btn btn-sm" data-edit="${b.book_id}">Edit</button>` : ''}
          ${options.showDelete ? `<button type="button" class="btn btn-sm danger" data-delete="${b.book_id}">Delete</button>` : ''}
        </div>
      </div>
    </div>
  `;
  }).join('');

  if (options.onIssue) {
    container.querySelectorAll('[data-issue]').forEach(btn => {
      btn.addEventListener('click', () => options.onIssue(parseInt(btn.dataset.issue, 10)));
    });
  }
  if (options.onEdit) {
    container.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => options.onEdit(parseInt(btn.dataset.edit, 10)));
    });
  }
  if (options.onDelete) {
    container.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => options.onDelete(parseInt(btn.dataset.delete, 10)));
    });
  }

  // No external cover fetch; all covers are generated locally.

  const pagerEl = options.pagerId ? document.getElementById(options.pagerId) : null;
  if (pagerEl && options.pagination && totalPages > 1) {
    let pagerHtml = '<div class="pager-inner"><span class="pager-label">Page </span>';
    const go = (p) => {
      container.dataset.currentPage = String(p);
      renderBooksList(containerId, books, options);
    };
    if (page > 1) pagerHtml += `<button type="button" class="btn btn-sm pager-btn" data-page="${page - 1}">Prev</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === page) pagerHtml += `<span class="pager-num current">${i}</span>`;
      else pagerHtml += `<button type="button" class="btn btn-sm pager-num" data-page="${i}">${i}</button>`;
    }
    if (page < totalPages) pagerHtml += `<button type="button" class="btn btn-sm pager-btn" data-page="${page + 1}">Next</button>`;
    pagerHtml += '</div>';
    pagerEl.innerHTML = pagerHtml;
    pagerEl.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => go(parseInt(btn.dataset.page, 10)));
    });
  } else if (pagerEl) pagerEl.innerHTML = '';
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ----- Screens -----
function initHome() {
  // Home screen is now navigated from the navbar.
}

function initNav() {
  const homeBtn = document.getElementById('navHome');
  if (homeBtn) homeBtn.onclick = () => showScreen('home');
  const aboutBtn = document.getElementById('navAbout');
  if (aboutBtn) {
    aboutBtn.onclick = () => showScreen('about-page');
  }
  const loginBtn = document.getElementById('navLogin');
  if (loginBtn) loginBtn.onclick = () => showScreen('user-login');
  const signupBtn = document.getElementById('navSignup');
  if (signupBtn) signupBtn.onclick = () => showScreen('user-register');
  const dashBtn = document.getElementById('navDashboard');
  if (dashBtn) {
    dashBtn.onclick = () => {
      if (currentAdmin) showScreen('admin-dashboard');
      else if (currentUser) showScreen('user-dashboard');
      else showScreen('auth-login');
    };
  }
  const logoutBtn = document.getElementById('navLogout');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      currentAdmin = null;
      currentUser = null;
      showScreen('home');
      updateNav();
    };
  }
  updateNav();
}

function initAdminRegister() {
  document.getElementById('adminRegBack').onclick = () => showScreen('auth-register');
  document.getElementById('adminRegForm').onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById('adminRegName').value.trim();
    const email = document.getElementById('adminRegEmail').value.trim();
    const password = document.getElementById('adminRegPassword').value;
    const lib = document.getElementById('adminRegLib').value.trim();
    if (!name || !email || !password || !lib) { showMessage('Fill all fields', true); return; }
    const admins = getAdmins();
    if (admins.some(a => a.email.toLowerCase() === email.toLowerCase())) { showMessage('Admin already exists', true); return; }
    sendOtpToEmail(email).then(() => {
      pendingReg = { type: 'admin', name, email, password, lib };
      const emailEl = document.getElementById('adminOtpEmail');
      const hintEl = document.getElementById('adminOtpDevHint');
      const inputEl = document.getElementById('adminOtpInput');
      if (!emailEl || !hintEl || !inputEl) { showMessage('OTP screen error', true); return; }
      emailEl.textContent = email;
      hintEl.textContent = 'Check your email for the 6-digit OTP code.';
      inputEl.value = '';
      showScreen('admin-register-otp');
      showMessage('OTP sent to your email. Please check your inbox.');
    }).catch(err => { console.error('OTP error:', err); showMessage('Failed to send OTP: ' + (err.message || 'Check if email server is running'), true); });
  };
}

function initAdminRegisterOtp() {
  const adminOtpBack = document.getElementById('adminOtpBack');
  const adminOtpForm = document.getElementById('adminOtpForm');
  if (!adminOtpBack || !adminOtpForm) return; // OTP screen not in DOM
  adminOtpBack.onclick = () => { pendingReg = null; showScreen('admin-register'); };
  adminOtpForm.onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById('adminOtpInput').value.trim();
    if (!pendingReg || pendingReg.type !== 'admin') { showScreen('home'); return; }
    verifyOtpWithBackend(pendingReg.email, input).then(verifyResult => {
      if (!verifyResult.ok) { showMessage(verifyResult.msg || 'Invalid OTP', true); return; }
      const result = registerAdmin(pendingReg.name, pendingReg.email, pendingReg.password, pendingReg.lib);
      pendingReg = null;
      if (result.ok) { showMessage('Registration successful'); showScreen('user-login'); }
      else showMessage(result.msg, true);
    });
  };
}

function openEditBookModal(bookId) {
  const book = searchBooksById(bookId);
  if (!book) return;
  document.getElementById('editBookId').textContent = '#' + book.book_id;
  document.getElementById('editBookTitle').value = book.title || '';
  document.getElementById('editBookAuthor').value = book.author || '';
  document.getElementById('editBookTotal').value = String(book.total_copies ?? 0);
  document.getElementById('editBookForm').dataset.editBookId = String(book.book_id);
  const modal = document.getElementById('editBookModal');
  if (modal) { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); }
}

function closeEditBookModal() {
  const modal = document.getElementById('editBookModal');
  if (modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
}

function loadAdminDashboard() {
  if (!currentAdmin) return;
  document.getElementById('adminInfoName').textContent = currentAdmin.name;
  document.getElementById('adminInfoLib').textContent = currentAdmin.lib;
  document.getElementById('adminInfoId').textContent = currentAdmin.id;
  document.getElementById('adminInfoEmail').textContent = currentAdmin.email;
  const books = booksForLibrary(currentAdmin.lib);
  renderBooksList('adminBooksList', books, {
    showEdit: true,
    showDelete: true,
    pagerId: 'adminBooksListPager',
    pagination: true,
    onEdit: (id) => openEditBookModal(id),
    onDelete: (id) => {
      const ok = window.confirm(`Do you really want to delete Book ID ${id}?`);
      if (!ok) return;
      deleteBook(id);
      loadAdminDashboard();
      showMessage('Book deleted');
    }
  });
}

function initAdminDashboard() {
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
  const editModal = document.getElementById('editBookModal');
  const editCancel = document.getElementById('editBookCancel');
  if (editCancel) editCancel.onclick = closeEditBookModal;
  const backdrop = editModal && editModal.querySelector('.modal-backdrop');
  if (backdrop) backdrop.onclick = closeEditBookModal;
  document.getElementById('editBookForm').onsubmit = (e) => {
    e.preventDefault();
    const bookId = parseInt(document.getElementById('editBookForm').dataset.editBookId || '0', 10);
    const title = document.getElementById('editBookTitle').value.trim();
    const author = document.getElementById('editBookAuthor').value.trim();
    const total = parseInt(document.getElementById('editBookTotal').value, 10);
    if (!title || !author || isNaN(total) || total < 0) { showMessage('Invalid fields', true); return; }
    if (editBook(bookId, { title, author, total_copies: total })) {
      showMessage('Book updated');
      closeEditBookModal();
      loadAdminDashboard();
    } else showMessage('Book not found', true);
  };
}

function initUserRegister() {
  document.getElementById('userRegBack').onclick = () => showScreen('home');
  document.getElementById('userRegForm').onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById('userRegName').value.trim();
    const email = document.getElementById('userRegEmail').value.trim();
    const password = document.getElementById('userRegPassword').value;
    if (!name || !email || !password) { showMessage('Fill all fields', true); return; }
    const users = getUsers();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) { showMessage('User already exists', true); return; }
    sendOtpToEmail(email).then(() => {
      pendingReg = { type: 'user', name, email, password };
      const emailEl = document.getElementById('userOtpEmail');
      const hintEl = document.getElementById('userOtpDevHint');
      const inputEl = document.getElementById('userOtpInput');
      if (!emailEl || !hintEl || !inputEl) { showMessage('OTP screen error', true); return; }
      emailEl.textContent = email;
      hintEl.textContent = 'Check your email for the 6-digit OTP code.';
      inputEl.value = '';
      showScreen('user-register-otp');
      showMessage('OTP sent to your email. Please check your inbox.');
    }).catch(err => { console.error('OTP error:', err); showMessage('Failed to send OTP: ' + (err.message || 'Check if email server is running'), true); });
  };
}

function initUserRegisterOtp() {
  const userOtpBack = document.getElementById('userOtpBack');
  const userOtpForm = document.getElementById('userOtpForm');
  if (!userOtpBack || !userOtpForm) return; // OTP screen not in DOM
  userOtpBack.onclick = () => { pendingReg = null; showScreen('user-register'); };
  userOtpForm.onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById('userOtpInput').value.trim();
    if (!pendingReg || pendingReg.type !== 'user') { showScreen('home'); return; }
    verifyOtpWithBackend(pendingReg.email, input).then(verifyResult => {
      if (!verifyResult.ok) { showMessage(verifyResult.msg || 'Invalid OTP', true); return; }
      const result = registerUser(pendingReg.name, pendingReg.email, pendingReg.password);
      pendingReg = null;
      if (result.ok) { showMessage('Registration successful'); showScreen('user-login'); }
      else showMessage(result.msg, true);
    });
  };
}

function initUserLogin() {
  document.getElementById('userLoginBack').onclick = () => showScreen('home');
  document.getElementById('userLoginForm').onsubmit = (e) => {
    e.preventDefault();
    const email = document.getElementById('userLoginEmail').value.trim();
    const password = document.getElementById('userLoginPassword').value;
    const baseResult = loginAny(email, password);
    if (!baseResult.ok) {
      showMessage(baseResult.msg || 'Login failed', true);
      return;
    }
    if (baseResult.type === 'admin') {
      currentAdmin = baseResult.admin;
      showMessage('Login successful');
      showScreen('admin-dashboard');
      loadAdminDashboard();
      updateNav();
      return;
    }
    currentUser = baseResult.user;
    showMessage('Login successful');
    showScreen('user-dashboard');
    loadUserDashboard();
    updateNav();
  };
}

function loadUserDashboard() {
  if (!currentUser) return;
  document.getElementById('userInfoName').textContent = currentUser.name;
  document.getElementById('userInfoEmail').textContent = currentUser.email;
  document.getElementById('userInfoId').textContent = currentUser.id;
  const allBooks = getBooks();
  renderBooksList('userBooksList', allBooks, {
    showIssue: true,
    pagerId: 'userBooksListPager',
    pagination: true,
    onIssue: (bookId) => {
      const r = issueBook(currentUser.id, bookId);
      showMessage(r.ok ? 'Book issued' : r.msg, !r.ok);
      if (r.ok) loadUserDashboard();
    }
  });
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
  document.getElementById('userSearchForm').onsubmit = (e) => {
    e.preventDefault();
    const q = document.getElementById('userSearchQuery').value.trim();
    const by = document.getElementById('userSearchBy').value;
    let books;
    if (by === 'id') {
      const id = parseInt(q, 10);
      books = isNaN(id) ? [] : (searchBooksById(id) ? [searchBooksById(id)] : []);
    } else books = searchBooksByString(q);
    renderBooksList('userSearchResults', books, {
      showIssue: true,
      pagerId: 'userSearchResultsPager',
      pagination: true,
      onIssue: (bookId) => {
        const r = issueBook(currentUser.id, bookId);
        showMessage(r.ok ? 'Book issued' : r.msg, !r.ok);
        loadUserDashboard();
      }
    });
  };
}

// ----- Bootstrap -----
function init() {
  loadBackendDataFromServer();
  setSaveStatus('Server offline', true);
  checkBackend();
  initHome();
  initNav();
  initAdminDashboard();
  initUserRegister();
  initUserRegisterOtp();
  initUserLogin();
  initUserDashboard();
  showScreen('home');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
