/**
 * Smart Library frontend.
 * Uses the PostgreSQL API as the source of truth and keeps a small in-memory UI cache.
 */

const STORAGE_KEYS = {
  books: 'sl_books',
  users: 'sl_users',
  admins: 'sl_admins',
  issued: 'sl_issued',
  issueRequests: 'sl_issue_requests',
  issueHistory: 'sl_issue_history',
  slotBookings: 'sl_slot_bookings',
  queue: 'sl_queue',
  nextUserId: 'sl_next_user_id',
  nextAdminId: 'sl_next_admin_id',
};

const runtimeConfig = window.SMART_LIBRARY_CONFIG || {};
const AUDIT_SESSION_STORAGE_KEY = 'sl_audit_session_id';
const BRAND_LOADER_STORAGE_KEY = 'sl_brand_loader_seen_v1';
const BRAND_LOADER_MIN_DURATION_MS = 1450;
const RUNTIME_HOST = String(window.location.hostname || '').trim().toLowerCase();
const IS_LOCAL_RUNTIME_HOST = RUNTIME_HOST === 'localhost' || RUNTIME_HOST === '127.0.0.1';

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

function joinBaseUrl(base, path) {
  const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

function sanitizeExternalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/')) {
    return raw.startsWith('//') ? '' : raw;
  }
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) return '';
    return parsed.toString();
  } catch (_error) {
    return '';
  }
}

function normalizeBookReadOnlineInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return { ok: true, value: '' };
  const normalized = sanitizeExternalUrl(raw);
  if (!normalized) {
    return { ok: false, value: '', msg: 'Read online URL must start with http://, https://, or /local-path.' };
  }
  return { ok: true, value: normalized };
}

function buildReadOnlineFallbackUrl(book = {}) {
  const queryParts = [];
  const normalizedIsbn = String(book.isbn || '').replace(/[^0-9A-Za-z]/g, '').trim();
  if (normalizedIsbn) queryParts.push(normalizedIsbn);
  if (book.title) queryParts.push(String(book.title).trim());
  if (book.author) queryParts.push(String(book.author).trim());
  const query = queryParts.join(' ').trim();
  if (!query) return 'https://openlibrary.org/';
  return `https://openlibrary.org/search?${new URLSearchParams({ q: query }).toString()}`;
}

function getBookReadOnlineUrl(book) {
  if (!book) return '';
  return sanitizeExternalUrl(book.read_online_url) || buildReadOnlineFallbackUrl(book);
}

function isLocalOriginalReadUrl(url) {
  return String(url || '').startsWith('/original_books/');
}

function renderReadOnlineAction(book, label = '') {
  const url = getBookReadOnlineUrl(book);
  if (!url) return '';
  const resolvedLabel = label || (isLocalOriginalReadUrl(url) ? 'Read Original' : 'Read Online');
  return `<a class="btn btn-sm btn-ghost" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(resolvedLabel)}</a>`;
}

const apiState = {
  libraries: [],
  books: [],
  users: [],
  admins: [],
  developers: [],
  issued: [],
  issueRequests: [],
  purchaseRequests: [],
  issueHistory: [],
  slotBookings: [],
  favorites: [],
  waitlistEntries: [],
  notifications: [],
  queue: [],
  visitSlots: [],
  developerUsers: [],
  developerLogs: [],
  developerMetrics: {},
  userMetrics: {},
  adminMetrics: {},
  adminTopBooks: [],
  adminRecentReviews: [],
};

function generateAuditSessionId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `sl-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function startAuditSession() {
  const sessionId = generateAuditSessionId();
  try {
    window.sessionStorage.setItem(AUDIT_SESSION_STORAGE_KEY, sessionId);
  } catch (_error) {
    return sessionId;
  }
  return sessionId;
}

function getAuditSessionId() {
  try {
    const existing = window.sessionStorage.getItem(AUDIT_SESSION_STORAGE_KEY);
    if (existing) return existing;
  } catch (_error) {
    return generateAuditSessionId();
  }
  return startAuditSession();
}

function getAuditHeaders() {
  const actor = currentDeveloper || currentAdmin || currentUser;
  const headers = {
    'X-Smart-Library-Session': getAuditSessionId(),
  };
  if (actor && actor.id) headers['X-Smart-Library-Actor-Id'] = String(actor.id);
  if (actor && actor.role) headers['X-Smart-Library-Actor-Role'] = String(actor.role);
  if (actor && actor.email) headers['X-Smart-Library-Actor-Email'] = String(actor.email);
  return headers;
}

function setStateCollection(name, items) {
  apiState[name] = Array.isArray(items) ? items : [];
  return apiState[name];
}

function createApiError(message, status = 0) {
  const error = new Error(message || 'Request failed');
  error.status = status;
  return error;
}

function getErrorMessage(error, fallback = 'Something went wrong.') {
  return error && error.message ? error.message : fallback;
}

function toDateParts(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { day: 1, month: 1, year: 1970 };
  }
  return {
    day: parsed.getUTCDate(),
    month: parsed.getUTCMonth() + 1,
    year: parsed.getUTCFullYear(),
  };
}

function toIsoDate(dateParts) {
  if (!dateParts) return '';
  const year = String(dateParts.year || '').padStart(4, '0');
  const month = String(dateParts.month || '').padStart(2, '0');
  const day = String(dateParts.day || '').padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function apiFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = {
    Accept: 'application/json',
    ...getAuditHeaders(),
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const requestOptions = {
    method,
    headers,
    credentials: 'same-origin',
  };
  if (options.body != null && !['GET', 'HEAD'].includes(method)) {
    requestOptions.body = options.body;
  }

  let response;
  try {
    response = await fetch(joinBaseUrl(APP_SERVER_URL, path), requestOptions);
  } catch (_error) {
    throw createApiError(`Unable to reach API at ${APP_SERVER_URL}. Start api_server.py first.`, 0);
  }

  const rawText = await response.text();
  let payload = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch (_error) {
      payload = {};
    }
  }

  if (!response.ok || (payload && payload.ok === false)) {
    throw createApiError(
      (payload && payload.error) || `Request failed with status ${response.status}.`,
      response.status
    );
  }

  if (payload && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload.data;
  }
  return payload;
}

function toPositiveIntegerOrNull(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toUserModel(user) {
  const source = user || {};
  return {
    id: toPositiveIntegerOrNull(source.user_id ?? source.id),
    name: String(source.full_name || source.name || '').trim(),
    email: String(source.email || '').trim(),
    role: String(source.role || '').trim().toLowerCase() || 'member',
    lib: String(source.managed_library_name || source.lib || '').trim(),
    managed_library_id: toPositiveIntegerOrNull(source.managed_library_id),
    managed_library_code: String(source.managed_library_code || source.library_code || '').trim(),
  };
}

function getCurrentAdminReviewerId() {
  return toPositiveIntegerOrNull(currentAdmin && currentAdmin.id);
}

function clearAuthenticatedIdentity() {
  currentDeveloper = null;
  currentAdmin = null;
  currentUser = null;
}

function getAuthenticatedScope() {
  if (currentDeveloper) return 'developer';
  if (currentAdmin) return 'admin';
  if (currentUser) return 'user';
  return '';
}

function getDashboardScreenId(scope) {
  if (scope === 'developer') return 'developer-dashboard';
  if (scope === 'admin') return 'admin-dashboard';
  return 'user-dashboard';
}

async function loadAuthenticatedDashboard(scope) {
  if (scope === 'developer') {
    await loadDeveloperDashboard();
    return;
  }
  if (scope === 'admin') {
    await loadAdminDashboard();
    return;
  }
  await loadUserDashboard();
}

async function syncScreenFromHistoryState(state) {
  const requestedScreenId = String((state && state[SCREEN_HISTORY_STATE_KEY]) || '').trim() || getDefaultScreenId();
  const nextScreenId = normalizeScreenIdForAccess(requestedScreenId);
  showScreen(nextScreenId, { historyMode: 'skip' });

  if (currentDeveloper && DEVELOPER_SCREEN_IDS.has(nextScreenId)) {
    await loadDeveloperDashboard({ showSkeleton: false });
    return;
  }
  if (currentAdmin && ADMIN_SCREEN_IDS.has(nextScreenId)) {
    await loadAdminDashboard({ showSkeleton: false });
    return;
  }
  if (currentUser && USER_SCREEN_IDS.has(nextScreenId)) {
    await loadUserDashboard({ showSkeleton: false });
  }
}

async function applyAuthenticatedIdentity(rawUser, options = {}) {
  const user = toUserModel(rawUser);
  rememberKnownUser(user);
  clearAuthenticatedIdentity();

  if (user.role === 'developer') currentDeveloper = user;
  else if (user.role === 'admin') currentAdmin = user;
  else currentUser = user;

  const scope = getAuthenticatedScope();
  if (scope) {
    resetDashboardRenderState(scope);
  }
  updateNav();

  if (options.openDashboard !== false && scope) {
    const targetScreenId = options.screenId || getDashboardScreenId(scope);
    showScreen(targetScreenId, { historyMode: options.historyMode || 'push' });
    await loadAuthenticatedDashboard(scope);
  }

  return { scope, user };
}

async function restoreAuthSession() {
  try {
    const user = await apiFetch('/api/auth/session');
    await applyAuthenticatedIdentity(user, {
      openDashboard: true,
      historyMode: 'replace',
      screenId: getCurrentHistoryScreenId() || undefined,
    });
    return true;
  } catch (error) {
    if (error && (error.status === 401 || error.status === 403)) {
      clearAuthenticatedIdentity();
      updateNav();
      return false;
    }
    throw error;
  }
}

function toBookModel(book) {
  return {
    book_id: book.book_id,
    library_id: book.library_id,
    lib: book.library_name || '',
    library_code: book.library_code || '',
    title: book.title || '',
    author: book.author || '',
    isbn: book.isbn || '',
    read_online_url: book.read_online_url || '',
    purchase_price: Number(book.purchase_price) || 0,
    total_copies: Number(book.total_copies) || 0,
    issue_total_copies: Number(book.issue_total_copies ?? book.total_copies) || 0,
    available_copies: Number(book.available_copies) || 0,
    slot_booking_copies: Number(book.slot_booking_copies ?? book.total_copies) || 0,
    average_rating: Number(book.average_rating) || 0,
    review_count: Number(book.review_count) || 0,
    waitlist_count: Number(book.waitlist_count) || 0,
    favorite_count: Number(book.favorite_count) || 0,
  };
}

function toBorrowRequestModel(request) {
  return {
    borrow_request_id: request.borrow_request_id,
    student_id: request.member_id,
    book_id: request.book_id,
    request_date: toDateParts(request.requested_at),
    status: request.status || 'pending',
    user_name: request.member_name || '',
    user_email: request.member_email || '',
    lib: request.library_name || '',
  };
}

function toPurchaseRequestModel(request) {
  return {
    purchase_request_id: request.purchase_request_id,
    student_id: request.member_id,
    book_id: request.book_id,
    request_date: toDateParts(request.requested_at),
    requested_price: Number(request.requested_price) || 0,
    status: request.status || 'pending',
    user_name: request.member_name || '',
    user_email: request.member_email || '',
    lib: request.library_name || '',
  };
}

function toLoanModel(loan) {
  return {
    loan_id: loan.loan_id,
    borrow_request_id: loan.borrow_request_id,
    student_id: loan.member_id,
    book_id: loan.book_id,
    issue_date: toDateParts(loan.issued_at),
    due_date: toDateParts(loan.due_at),
    fine: Number(loan.fine_amount) || 0,
    returned: !!loan.returned_at,
    user_name: loan.member_name || '',
    user_email: loan.member_email || '',
    lib: loan.library_name || '',
  };
}

function toSlotBookingModel(booking) {
  return {
    slot_booking_id: booking.slot_booking_id,
    student_id: booking.member_id,
    book_id: booking.book_id,
    request_date: toDateParts(booking.created_at),
    slot_date: toDateParts(booking.slot_date),
    slot_id: booking.slot_id,
    status: booking.status || 'pending',
    rejection_reason: booking.rejection_reason || '',
    user_name: booking.member_name || '',
    user_email: booking.member_email || '',
    lib: booking.library_name || '',
  };
}

function toFavoriteModel(favorite) {
  return {
    favorite_id: favorite.favorite_id,
    student_id: favorite.member_id,
    book_id: favorite.book_id,
    created_at: favorite.created_at || '',
    lib: favorite.library_name || '',
  };
}

function toWaitlistEntryModel(entry) {
  return {
    waitlist_entry_id: entry.waitlist_entry_id,
    student_id: entry.member_id,
    book_id: entry.book_id,
    status: entry.status || 'waiting',
    position: Number(entry.position) || 0,
    notified_at: entry.notified_at || '',
    fulfilled_at: entry.fulfilled_at || '',
    cancelled_at: entry.cancelled_at || '',
    created_at: entry.created_at || '',
    updated_at: entry.updated_at || '',
    lib: entry.library_name || '',
  };
}

function toNotificationModel(notification) {
  return {
    notification_id: notification.notification_id,
    user_id: notification.user_id,
    category: notification.category || 'general',
    title: notification.title || '',
    message: notification.message || '',
    link_path: notification.link_path || '',
    book_id: notification.book_id || null,
    is_read: !!notification.is_read,
    read_at: notification.read_at || '',
    created_at: notification.created_at || '',
    updated_at: notification.updated_at || '',
    book_title: notification.book_title || '',
    lib: notification.library_name || '',
  };
}

function toBookReviewModel(review) {
  return {
    review_id: review.review_id,
    student_id: review.member_id,
    book_id: review.book_id,
    rating: Number(review.rating) || 0,
    review_text: review.review_text || '',
    created_at: review.created_at || '',
    updated_at: review.updated_at || '',
    user_name: review.member_name || '',
    user_email: review.member_email || '',
    book_title: review.book_title || '',
    book_author: review.book_author || '',
  };
}

function saveLibraries(libraries) {
  return setStateCollection('libraries', libraries);
}

function getLibraries() {
  return apiState.libraries;
}

function saveVisitSlots(visitSlots) {
  return setStateCollection('visitSlots', visitSlots);
}

function getVisitSlots() {
  return apiState.visitSlots;
}

function rememberKnownUser(user) {
  if (!user || !user.id) return;
  const key = user.role === 'admin'
    ? 'admins'
    : (user.role === 'developer' ? 'developers' : 'users');
  const collection = apiState[key];
  const nextUser = { ...user };
  const index = collection.findIndex(entry => entry.id === nextUser.id);
  if (index >= 0) collection[index] = { ...collection[index], ...nextUser };
  else collection.push(nextUser);
}

function rememberMember(userId, name, email) {
  if (!userId) return;
  rememberKnownUser({
    id: userId,
    name: name || `User #${userId}`,
    email: email || '',
    role: 'member',
  });
}

function resolveLibrary(input) {
  const query = String(input || '').trim();
  if (!query) return null;
  const normalizedQuery = query.toLowerCase();
  return getLibraries().find(library =>
    normalizedQuery === String(library.code || '').trim().toLowerCase() ||
    libraryMatches(library.name, query) ||
    (Array.isArray(library.aliases) && library.aliases.some(alias =>
      String(alias || '').trim().toLowerCase() === normalizedQuery || libraryMatches(alias, query)
    ))
  ) || null;
}

async function fetchAllBooks() {
  const pageSize = 200;
  const allBooks = [];
  for (let offset = 0; ; offset += pageSize) {
    const chunk = await apiFetch(`/api/books?limit=${pageSize}&offset=${offset}`);
    allBooks.push(...chunk);
    if (!Array.isArray(chunk) || chunk.length < pageSize) break;
  }
  return allBooks;
}

function applyCatalogSnapshot(snapshot) {
  const payload = snapshot && typeof snapshot === 'object' ? snapshot : {};
  saveLibraries(Array.isArray(payload.libraries) ? payload.libraries : []);
  saveBooks(Array.isArray(payload.books) ? payload.books.map(toBookModel) : []);
  saveVisitSlots(Array.isArray(payload.visit_slots) ? payload.visit_slots : []);
  catalogLoadedAt = Date.now();
}

function markCatalogDirty() {
  catalogLoadedAt = 0;
}

async function refreshCatalogData(force = false) {
  const isFresh = catalogLoadedAt > 0 && (Date.now() - catalogLoadedAt) < CATALOG_REFRESH_INTERVAL_MS;
  if (!force && isFresh) {
    return false;
  }

  const snapshot = await apiFetch('/api/catalog');
  applyCatalogSnapshot(snapshot);
  return true;
}

async function refreshUserDashboardData(userId) {
  const snapshot = await apiFetch(`/api/users/${userId}/dashboard`);
  const borrowRequests = Array.isArray(snapshot.borrow_requests) ? snapshot.borrow_requests : [];
  const purchaseRequests = Array.isArray(snapshot.purchase_requests) ? snapshot.purchase_requests : [];
  const loans = Array.isArray(snapshot.loans) ? snapshot.loans : [];
  const slotBookings = Array.isArray(snapshot.slot_bookings) ? snapshot.slot_bookings : [];
  const favorites = Array.isArray(snapshot.favorites) ? snapshot.favorites : [];
  const waitlistEntries = Array.isArray(snapshot.waitlist_entries) ? snapshot.waitlist_entries : [];
  const notifications = Array.isArray(snapshot.notifications) ? snapshot.notifications : [];

  const mappedRequests = borrowRequests.map(toBorrowRequestModel);
  const mappedPurchaseRequests = purchaseRequests.map(toPurchaseRequestModel);
  const mappedLoans = loans.map(toLoanModel);
  const mappedSlotBookings = slotBookings.map(toSlotBookingModel);
  const mappedFavorites = favorites.map(toFavoriteModel);
  const mappedWaitlistEntries = waitlistEntries.map(toWaitlistEntryModel);
  const mappedNotifications = notifications.map(toNotificationModel);

  saveIssueRequests(mappedRequests.filter(request => String(request.status).toLowerCase() === 'pending'));
  saveIssueHistory(mappedRequests);
  savePurchaseRequests(mappedPurchaseRequests);
  saveIssued(mappedLoans);
  saveSlotBookings(mappedSlotBookings);
  saveFavorites(mappedFavorites);
  saveWaitlistEntries(mappedWaitlistEntries);
  saveNotifications(mappedNotifications);
  apiState.userMetrics = snapshot.metrics || {};
}

async function refreshAdminDashboardData(admin) {
  if (!admin || !admin.managed_library_id) {
    saveIssueRequests([]);
    saveIssueHistory([]);
    saveIssued([]);
    saveSlotBookings([]);
    apiState.adminMetrics = {};
    saveAdminTopBooks([]);
    saveAdminRecentReviews([]);
    return;
  }

  const libraryId = admin.managed_library_id;
  const snapshot = await apiFetch(`/api/admin/libraries/${libraryId}/dashboard`);
  const borrowRequests = Array.isArray(snapshot.borrow_requests) ? snapshot.borrow_requests : [];
  const purchaseRequests = Array.isArray(snapshot.purchase_requests) ? snapshot.purchase_requests : [];
  const loans = Array.isArray(snapshot.loans) ? snapshot.loans : [];
  const slotBookings = Array.isArray(snapshot.slot_bookings) ? snapshot.slot_bookings : [];
  const topBooks = Array.isArray(snapshot.top_books) ? snapshot.top_books : [];
  const recentReviews = Array.isArray(snapshot.recent_reviews) ? snapshot.recent_reviews : [];

  const mappedRequests = borrowRequests.map(toBorrowRequestModel);
  const mappedPurchaseRequests = purchaseRequests.map(toPurchaseRequestModel);
  const mappedLoans = loans.map(toLoanModel);
  const mappedSlotBookings = slotBookings.map(toSlotBookingModel);
  const mappedRecentReviews = recentReviews.map(toBookReviewModel);

  mappedRequests.forEach(request => rememberMember(request.student_id, request.user_name, request.user_email));
  mappedPurchaseRequests.forEach(request => rememberMember(request.student_id, request.user_name, request.user_email));
  mappedLoans.forEach(loan => rememberMember(loan.student_id, loan.user_name, loan.user_email));
  mappedSlotBookings.forEach(booking => rememberMember(booking.student_id, booking.user_name, booking.user_email));
  mappedRecentReviews.forEach(review => rememberMember(review.student_id, review.user_name, review.user_email));

  saveIssueRequests(mappedRequests);
  savePurchaseRequests(mappedPurchaseRequests);
  saveIssueHistory([]);
  saveIssued(mappedLoans);
  saveSlotBookings(mappedSlotBookings);
  apiState.adminMetrics = snapshot.analytics || {};
  saveAdminTopBooks(topBooks);
  saveAdminRecentReviews(mappedRecentReviews);
}

async function refreshDeveloperDashboardData() {
  const snapshot = await apiFetch('/api/developer/dashboard?limit=250');
  saveDeveloperUsers(Array.isArray(snapshot.users) ? snapshot.users : []);
  saveDeveloperLogs(Array.isArray(snapshot.logs) ? snapshot.logs : []);
  apiState.developerMetrics = snapshot.metrics || {};
}

// ----- OTP (matches C backend: sent_otp_email + verify) -----
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000);
}

const SAME_ORIGIN_BASE = window.location.protocol === 'file:' ? '' : normalizeBaseUrl(window.location.origin);
const DEFAULT_APP_SERVER_URL = IS_LOCAL_RUNTIME_HOST
  ? (SAME_ORIGIN_BASE || 'http://127.0.0.1:5050')
  : (SAME_ORIGIN_BASE || 'http://localhost:5050');
const DEFAULT_EMAIL_SERVER_URL = window.location.protocol === 'file:'
  ? 'http://localhost:8081'
  : (IS_LOCAL_RUNTIME_HOST
      ? (SAME_ORIGIN_BASE || 'http://127.0.0.1:8081')
      : `${window.location.protocol}//${window.location.hostname || 'localhost'}:8081`);
const APP_SERVER_URL = normalizeBaseUrl(
  runtimeConfig.apiBaseUrl || window.SMART_LIBRARY_API_URL || DEFAULT_APP_SERVER_URL
);
const EMAIL_SERVER_URL = normalizeBaseUrl(
  runtimeConfig.emailBaseUrl || window.SMART_LIBRARY_EMAIL_URL || DEFAULT_EMAIL_SERVER_URL
);
const otpFallbackStore = {};

function sendOtpToEmail(email, options = {}) {
  const purpose = String(options.purpose || 'email_verification').trim() || 'email_verification';
  return fetch(EMAIL_SERVER_URL + '/send_otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, purpose })
  })
    .then(async r => {
      const data = await r.json().catch(() => ({}));
      return {
        sent: !!(r.ok && data && data.ok),
        message: (data && (data.message || data.error)) || 'OTP sent to your email.',
        fallbackOtp: data && data.fallback_otp ? String(data.fallback_otp) : null
      };
    })
    .catch(err => {
      console.error('OTP send failed:', err);
      const fallbackOtp = String(generateOtp());
      otpFallbackStore[String(email || '').trim().toLowerCase()] = fallbackOtp;
      return {
        sent: false,
        message: 'Email server is unavailable, so a demo OTP is shown below.',
        fallbackOtp
      };
    });
}

function verifyOtpWithBackend(email, otp) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedOtp = String(otp || '').trim();
  if (otpFallbackStore[normalizedEmail] && otpFallbackStore[normalizedEmail] === normalizedOtp) {
    delete otpFallbackStore[normalizedEmail];
    return Promise.resolve({ ok: true });
  }

  return fetch(EMAIL_SERVER_URL + '/verify_otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp })
  })
    .then(async r => {
      const data = await r.json().catch(() => ({}));
      if (r.ok && data && data.ok) {
        return { ok: true };
      }
      return { ok: false, msg: (data && data.error) || 'Invalid OTP' };
    })
    .catch(err => {
      console.error('OTP verify failed:', err);
      return { ok: false, msg: 'Verification failed. Start email_server.py or use the fallback OTP if shown.' };
    });
}

function sendContactMessage(payload) {
  return fetch(EMAIL_SERVER_URL + '/send_contact_message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(async r => {
      const data = await r.json().catch(() => ({}));
      if (r.ok && data && data.ok) {
        return { ok: true, msg: data.message || 'Your message has been sent successfully.' };
      }
      return { ok: false, msg: (data && data.error) || 'Your message could not be sent.' };
    })
    .catch(err => {
      console.error('Contact message failed:', err);
      return { ok: false, msg: 'Message could not be sent. Start email_server.py to enable contact support.' };
    });
}

function isAllowedContactEmail(email) {
  return /^[a-z0-9._%+-]+@gmail\.com$/i.test(String(email || '').trim());
}

// ----- Parse C backend .txt files (same format as Storage.c) -----
function parseDataBook(text) {
  const books = [];
  const lines = (text || '').trim().split('\n').filter(l => l.trim());
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length >= 6) {
      const totalCopies = parseInt(parts[4], 10) || 0;
      const parsedIssueTotal = parts.length >= 8 ? parseInt(parts[5], 10) : totalCopies;
      const parsedAvailable = parts.length >= 8 ? parseInt(parts[6], 10) : parseInt(parts[5], 10);
      const parsedSlotBooking = parts.length >= 8 ? parseInt(parts[7], 10) : totalCopies;
      const issueTotalCopies = parts.length >= 8
        ? (Number.isNaN(parsedIssueTotal) ? totalCopies : parsedIssueTotal)
        : totalCopies;
      const availableCopies = Number.isNaN(parsedAvailable) ? issueTotalCopies : parsedAvailable;
      const slotBookingCopies = Number.isNaN(parsedSlotBooking) ? totalCopies : parsedSlotBooking;
      books.push({
        book_id: parseInt(parts[0], 10),
        lib: (parts[1] || '').trim(),
        title: (parts[2] || '').trim(),
        author: (parts[3] || '').trim(),
        total_copies: totalCopies,
        issue_total_copies: issueTotalCopies,
        available_copies: availableCopies,
        slot_booking_copies: slotBookingCopies,
        read_online_url: (parts[8] || '').trim(),
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

function looksLikeLibraryLabel(value) {
  const raw = String(value || '').trim();
  const label = raw.toLowerCase();
  return label.includes('lib') ||
    label.includes('library') ||
    label.includes('centre') ||
    label.includes('center') ||
    label.includes('knowledge') ||
    /^(iit|nit|iiit|jnu|geu|du|bits)[\s_-]/i.test(raw);
}

function parseAdminLogin(text) {
  const admins = [];
  const lines = (text || '').trim().split('\n').filter(l => l.trim());
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length >= 5) {
      const first = (parts[1] || '').trim();
      const second = (parts[2] || '').trim();
      const swapped = looksLikeLibraryLabel(first) && !looksLikeLibraryLabel(second);
      admins.push({
        id: parseInt(parts[0], 10),
        name: swapped ? second : first,
        lib: swapped ? first : second,
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

function parseIssueRequests(text) {
  const requests = [];
  const lines = (text || '').trim().split('\n').filter(l => l.trim());
  for (const line of lines) {
    const parts = line.split('|').map(p => parseInt(p, 10));
    if (parts.length >= 5 && parts.slice(0, 5).every(n => !isNaN(n))) {
      requests.push({
        student_id: parts[0],
        book_id: parts[1],
        request_date: { day: parts[2], month: parts[3], year: parts[4] },
      });
    }
  }
  return requests;
}

function parseIssueHistory(text) {
  const history = [];
  const lines = (text || '').trim().split('\n').filter(l => l.trim());
  for (const line of lines) {
    const parts = line.split('|');
    const studentId = parseInt(parts[0], 10);
    const bookId = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const month = parseInt(parts[3], 10);
    const year = parseInt(parts[4], 10);
    if (
      parts.length >= 6 &&
      !isNaN(studentId) &&
      !isNaN(bookId) &&
      !isNaN(day) &&
      !isNaN(month) &&
      !isNaN(year)
    ) {
      history.push({
        student_id: studentId,
        book_id: bookId,
        request_date: { day, month, year },
        status: (parts[5] || 'Pending').trim() || 'Pending',
      });
    }
  }
  return history;
}

function parseSlotBookings(text) {
  const slotBookings = [];
  const lines = (text || '').trim().split('\n').filter(l => l.trim());
  for (const line of lines) {
    const parts = line.split('|').map(p => parseInt(p, 10));
    if (parts.length >= 6 && parts.every(n => !isNaN(n))) {
      slotBookings.push({
        student_id: parts[0],
        book_id: parts[1],
        slot_date: { day: parts[2], month: parts[3], year: parts[4] },
        slot_id: parts[5],
      });
    }
  }
  return slotBookings;
}

/** Load backend .txt files into app (replace existing data). Call with map: { 'data_book.txt': string, ... } */
function importFromBackendFiles(filesMap) {
  const stats = {
    books: 0,
    users: 0,
    admins: 0,
    issued: 0,
    issueRequests: 0,
    issueHistory: 0,
    slotBookings: 0,
    queue: 0
  };
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
  if (filesMap['issue_request.txt']) {
    const requests = parseIssueRequests(filesMap['issue_request.txt']);
    saveIssueRequests(requests);
    stats.issueRequests = requests.length;
    if (!filesMap['issue_history.txt']) {
      const pendingHistory = requests.map(request => ({
        student_id: request.student_id,
        book_id: request.book_id,
        request_date: request.request_date,
        status: 'Pending',
      }));
      saveIssueHistory(pendingHistory);
      stats.issueHistory = pendingHistory.length;
    }
  }
  if (filesMap['issue_history.txt']) {
    const history = parseIssueHistory(filesMap['issue_history.txt']);
    saveIssueHistory(history);
    stats.issueHistory = history.length;
  }
  if (filesMap['slot_booking.txt']) {
    const slotBookings = parseSlotBookings(filesMap['slot_booking.txt']);
    saveSlotBookings(slotBookings);
    stats.slotBookings = slotBookings.length;
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
  return apiState.books;
}

function saveBooks(books) {
  return setStateCollection('books', books);
}

function getUsers() {
  return apiState.users;
}

function saveUsers(users) {
  return setStateCollection('users', users);
}

function getAdmins() {
  return apiState.admins;
}

function saveAdmins(admins) {
  return setStateCollection('admins', admins);
}

function getDevelopers() {
  return apiState.developers;
}

function saveDevelopers(developers) {
  return setStateCollection('developers', developers);
}

function getIssued() {
  return apiState.issued;
}

function saveIssued(issued) {
  return setStateCollection('issued', issued);
}

function getIssueRequests() {
  return apiState.issueRequests;
}

function saveIssueRequests(requests) {
  return setStateCollection('issueRequests', requests);
}

function getPurchaseRequests() {
  return apiState.purchaseRequests;
}

function savePurchaseRequests(requests) {
  return setStateCollection('purchaseRequests', requests);
}

function getIssueHistory() {
  return apiState.issueHistory;
}

function saveIssueHistory(history) {
  return setStateCollection('issueHistory', history);
}

function getSlotBookings() {
  return apiState.slotBookings;
}

function saveSlotBookings(slotBookings) {
  return setStateCollection('slotBookings', slotBookings);
}

function getFavorites() {
  return apiState.favorites;
}

function saveFavorites(favorites) {
  return setStateCollection('favorites', favorites);
}

function getWaitlistEntries() {
  return apiState.waitlistEntries;
}

function saveWaitlistEntries(entries) {
  return setStateCollection('waitlistEntries', entries);
}

function getNotifications() {
  return apiState.notifications;
}

function saveNotifications(items) {
  return setStateCollection('notifications', items);
}

function getAdminTopBooks() {
  return apiState.adminTopBooks;
}

function saveAdminTopBooks(items) {
  return setStateCollection('adminTopBooks', items);
}

function getAdminRecentReviews() {
  return apiState.adminRecentReviews;
}

function saveAdminRecentReviews(items) {
  return setStateCollection('adminRecentReviews', items);
}

function getDeveloperUsers() {
  return apiState.developerUsers;
}

function saveDeveloperUsers(users) {
  return setStateCollection('developerUsers', users);
}

function getDeveloperLogs() {
  return apiState.developerLogs;
}

function saveDeveloperLogs(logs) {
  return setStateCollection('developerLogs', logs);
}

function getQueue() {
  return apiState.queue;
}

function saveQueue(queue) {
  return setStateCollection('queue', queue);
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

function compareDateParts(first, second) {
  const firstDate = new Date(first.year, first.month - 1, first.day);
  const secondDate = new Date(second.year, second.month - 1, second.day);
  if (firstDate < secondDate) return -1;
  if (firstDate > secondDate) return 1;
  return 0;
}

function timeStringToMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function currentMinutesOfDay() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function hasSlotStartedForDate(slot, slotDate) {
  if (!slot || !slotDate) return false;
  const dateOrder = compareDateParts(slotDate, today());
  if (dateOrder < 0) return true;
  if (dateOrder > 0) return false;
  const startMinutes = timeStringToMinutes(slot.start_time);
  if (startMinutes == null) return false;
  return currentMinutesOfDay() >= startMinutes;
}

function hasUpcomingSlotForDate(slotDate) {
  return getVisitSlots().some(slot => !hasSlotStartedForDate(slot, slotDate));
}

function sameDate(first, second) {
  return first.day === second.day &&
    first.month === second.month &&
    first.year === second.year;
}

function formatDate(d) {
  return `${d.day}/${d.month}/${d.year}`;
}

function parseDateInput(value) {
  if (!value) return null;
  const parts = value.split('-').map(part => parseInt(part, 10));
  if (parts.length !== 3 || parts.some(n => isNaN(n))) return null;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return { day, month, year };
}

function libraryMatches(first, second) {
  const normalizeLibrary = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[_-]+/g, ' ')
    .replace(/\bbombay\b/g, 'mumbai')
    .replace(/\bcentre\b/g, 'center')
    .replace(/\blib\b/g, 'library')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokenizeLibrary = (value) => normalizeLibrary(value)
    .split(' ')
    .filter(Boolean)
    .filter(token => !['library', 'center', 'knowledge', 'central'].includes(token));

  const firstNormalized = normalizeLibrary(first);
  const secondNormalized = normalizeLibrary(second);
  if (!firstNormalized || !secondNormalized) return false;
  if (firstNormalized === secondNormalized) return true;

  const firstTokens = tokenizeLibrary(first);
  const secondTokens = tokenizeLibrary(second);
  if (firstTokens.length === 0 || secondTokens.length === 0) return false;

  const smaller = firstTokens.length <= secondTokens.length ? firstTokens : secondTokens;
  const larger = smaller === firstTokens ? secondTokens : firstTokens;
  return smaller.every(token => larger.includes(token));
}

function getSlotLabel(slotId) {
  const slot = getVisitSlots().find(entry => Number(entry.slot_id) === Number(slotId));
  return slot && slot.label ? slot.label : 'Unknown Slot';
}

function getVisitSlotById(slotId) {
  return getVisitSlots().find(entry => Number(entry.slot_id) === Number(slotId)) || null;
}

function normalizeSearchText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function caseInsensitiveMatch(a, b) {
  const source = normalizeSearchText(a);
  const query = normalizeSearchText(b);
  if (!query) return true;
  return source.includes(query);
}

// ----- Serialize to backend .txt format -----
function serializeBooks(books) {
  const lines = (books || []).map(b =>
    `${b.book_id}|${b.lib || ''}|${b.title || ''}|${b.author || ''}|${b.total_copies || 0}|${b.issue_total_copies || 0}|${b.available_copies || 0}|${b.slot_booking_copies || 0}`
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

function serializeIssueRequests(requests) {
  const lines = (requests || []).map(request =>
    `${request.student_id}|${request.book_id}|${request.request_date.day}|${request.request_date.month}|${request.request_date.year}`
  );
  return lines.length ? lines.join('\n') + '\n' : '';
}

function serializeIssueHistory(history) {
  const lines = (history || []).map(request =>
    `${request.student_id}|${request.book_id}|${request.request_date.day}|${request.request_date.month}|${request.request_date.year}|${request.status || 'Pending'}`
  );
  return lines.length ? lines.join('\n') + '\n' : '';
}

function serializeSlotBookings(slotBookings) {
  const lines = (slotBookings || []).map(booking =>
    `${booking.student_id}|${booking.book_id}|${booking.slot_date.day}|${booking.slot_date.month}|${booking.slot_date.year}|${booking.slot_id}`
  );
  return lines.length ? lines.join('\n') + '\n' : '';
}

function serializeQueue(queue) {
  const lines = (queue || []).map(q => `${q.student_id}|${q.book_id}`);
  return lines.length ? lines.join('\n') + '\n' : '';
}

// ----- Auth -----
async function registerUser(name, email, password) {
  try {
    const user = toUserModel(await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        role: 'member',
        full_name: name,
        email,
        password,
        email_verified: true,
      })
    }));
    rememberKnownUser(user);
    return { ok: true, user };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'User registration failed.') };
  }
}

async function loginAny(email, password) {
  try {
    const user = toUserModel(await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }));
    rememberKnownUser(user);
    if (user.role === 'developer') return { ok: true, type: 'developer', developer: user };
    if (user.role === 'admin') return { ok: true, type: 'admin', admin: user };
    return { ok: true, type: 'user', user };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Login failed.') };
  }
}

async function registerAdmin(name, email, password, lib) {
  try {
    if (getLibraries().length === 0) {
      await refreshCatalogData();
    }
    const library = resolveLibrary(lib);
    if (!library) {
      return { ok: false, msg: 'Library not found. Use the exact library name or code from the database.' };
    }
    const admin = toUserModel(await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        role: 'admin',
        full_name: name,
        email,
        password,
        managed_library_id: library.library_id,
        email_verified: true,
      })
    }));
    rememberKnownUser(admin);
    return { ok: true, admin };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Admin registration failed.') };
  }
}

async function resetUserPassword(email, newPassword) {
  try {
    await apiFetch('/api/auth/password-reset', {
      method: 'POST',
      body: JSON.stringify({
        email,
        new_password: newPassword,
      })
    });
    return { ok: true, msg: 'Password updated successfully.' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Password reset failed.') };
  }
}

// ----- Books -----
async function addBook(
  bookId,
  lib,
  title,
  author,
  totalCopies,
  issueTotalCopies,
  slotBookingCopies,
  purchasePrice = null,
  readOnlineUrl = ''
) {
  try {
    const library = resolveLibrary(lib);
    if (!library) {
      return false;
    }
    const created = toBookModel(await apiFetch('/api/books', {
      method: 'POST',
      body: JSON.stringify({
        book_id: bookId,
        library_id: library.library_id,
        title,
        author,
        read_online_url: readOnlineUrl || null,
        purchase_price: purchasePrice,
        total_copies: totalCopies,
        issue_total_copies: issueTotalCopies,
        available_copies: issueTotalCopies,
        slot_booking_copies: slotBookingCopies,
      })
    }));
    saveBooks([...getBooks(), created].sort((first, second) => first.book_id - second.book_id));
    markCatalogDirty();
    return true;
  } catch (_error) {
    return false;
  }
}

async function deleteBook(bookId) {
  try {
    await apiFetch(`/api/books/${bookId}`, { method: 'DELETE' });
    saveBooks(getBooks().filter(book => book.book_id !== bookId));
    markCatalogDirty();
    return true;
  } catch (_error) {
    return false;
  }
}

async function editBook(
  bookId,
  { title, author, available_copies, issue_total_copies, slot_booking_copies, total_copies, purchase_price, read_online_url }
) {
  try {
    const updated = toBookModel(await apiFetch(`/api/books/${bookId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title,
        author,
        read_online_url,
        available_copies,
        issue_total_copies,
        slot_booking_copies,
        total_copies,
        purchase_price,
      })
    }));
    saveBooks(getBooks().map(book => book.book_id === bookId ? updated : book));
    markCatalogDirty();
    return true;
  } catch (_error) {
    return false;
  }
}

function searchBooksById(bookId) {
  const targetId = String(bookId ?? '').trim();
  if (!targetId) return null;
  const numericTarget = Number(targetId);
  return getBooks().find(book => {
    const candidateId = String(book.book_id ?? '').trim();
    if (candidateId === targetId) return true;
    return !Number.isNaN(numericTarget) && Number(candidateId) === numericTarget;
  }) || null;
}

function searchBooksByString(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return getBooks();
  return getBooks().filter(b =>
    (b.title && b.title.toLowerCase().includes(q)) ||
    (b.author && b.author.toLowerCase().includes(q)) ||
    (b.lib && b.lib.toLowerCase().includes(q))
  );
}

function filterBooksByLibrary(books, libraryQuery) {
  const query = String(libraryQuery || '').trim();
  if (!query) return Array.isArray(books) ? books : [];
  return (Array.isArray(books) ? books : []).filter(book =>
    libraryMatches(book.lib, query) || libraryMatches(book.library_code, query)
  );
}

function searchBooks(searchType, query, libraryQuery = '') {
  const q = String(query || '').trim();
  let baseBooks = filterBooksByLibrary(getBooks(), libraryQuery);
  if (!q) return baseBooks;
  if (searchType === 'id') {
    const id = parseInt(q, 10);
    if (isNaN(id)) throw new Error('Book ID must be a number.');
    const book = searchBooksById(id);
    return book && (!libraryQuery || libraryMatches(book.lib, libraryQuery) || libraryMatches(book.library_code, libraryQuery))
      ? [book]
      : [];
  }
  if (searchType === 'author') {
    return baseBooks.filter(book => caseInsensitiveMatch(book.author, q));
  }
  if (searchType === 'library') {
    return baseBooks.filter(book => caseInsensitiveMatch(book.lib, q) || caseInsensitiveMatch(book.library_code, q));
  }
  return baseBooks.filter(book => caseInsensitiveMatch(book.title, q));
}

function nextBookId() {
  return getBooks().reduce((maxId, book) => Math.max(maxId, Number(book.book_id) || 0), 0) + 1;
}

function booksForLibrary(lib) {
  return getBooks().filter(b => libraryMatches(b.lib, lib));
}

function getUserById(studentId) {
  return getUsers().find(user => user.id === studentId) ||
    getAdmins().find(user => user.id === studentId) ||
    getDevelopers().find(user => user.id === studentId) ||
    null;
}

function updateIssueHistoryStatus(studentId, bookId, status) {
  saveIssueHistory(
    getIssueHistory().map(entry =>
      entry.student_id === studentId && entry.book_id === bookId
        ? { ...entry, status }
        : entry
    )
  );
}

// ----- Issue requests / Issue / Return / Slots -----
async function requestIssueBook(studentId, bookId) {
  try {
    await apiFetch('/api/borrow-requests', {
      method: 'POST',
      body: JSON.stringify({
        member_id: studentId,
        book_id: bookId,
      })
    });
    return { ok: true, msg: 'Issue request sent. Check "Books applied for issue" in your dashboard.' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Issue request failed.') };
  }
}

async function requestPurchaseBook(studentId, bookId) {
  try {
    await apiFetch('/api/purchase-requests', {
      method: 'POST',
      body: JSON.stringify({
        member_id: studentId,
        book_id: bookId,
      })
    });
    return { ok: true, msg: 'Purchase request sent to the library admin.' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Purchase request failed.') };
  }
}

async function cancelPurchaseRequest(request) {
  if (!request || !request.purchase_request_id) {
    return { ok: false, msg: 'No matching purchase request found.' };
  }

  try {
    await apiFetch(`/api/purchase-requests/${request.purchase_request_id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({
        member_id: request.student_id,
      })
    });
    return { ok: true, msg: 'Purchase request cancelled successfully' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Purchase request cancellation failed.') };
  }
}

async function approvePurchaseRequest(request) {
  const reviewerUserId = getCurrentAdminReviewerId();
  if (!reviewerUserId) {
    return { ok: false, msg: 'Admin session is missing your user ID. Refresh once and sign in again.' };
  }
  if (!request || !request.purchase_request_id) {
    return { ok: false, msg: 'No matching pending purchase request found.' };
  }

  try {
    await apiFetch(`/api/purchase-requests/${request.purchase_request_id}/review`, {
      method: 'POST',
      body: JSON.stringify({
        reviewer_user_id: reviewerUserId,
        action: 'approved',
      })
    });
    return { ok: true, msg: 'Purchase request approved successfully' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Purchase approval failed.') };
  }
}

async function rejectPurchaseRequest(request) {
  const reviewerUserId = getCurrentAdminReviewerId();
  if (!reviewerUserId) {
    return { ok: false, msg: 'Admin session is missing your user ID. Refresh once and sign in again.' };
  }
  if (!request || !request.purchase_request_id) {
    return { ok: false, msg: 'No matching pending purchase request found.' };
  }

  try {
    await apiFetch(`/api/purchase-requests/${request.purchase_request_id}/review`, {
      method: 'POST',
      body: JSON.stringify({
        reviewer_user_id: reviewerUserId,
        action: 'rejected',
        rejection_reason: 'Rejected by library admin.',
      })
    });
    return { ok: true, msg: 'Purchase request rejected successfully' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Purchase rejection failed.') };
  }
}

async function approveIssueRequest(request) {
  const reviewerUserId = getCurrentAdminReviewerId();
  if (!reviewerUserId) {
    return { ok: false, msg: 'Admin session is missing your user ID. Refresh once and sign in again.' };
  }
  if (!request || !request.borrow_request_id) {
    return { ok: false, msg: 'No matching pending request found.' };
  }

  try {
    const result = await apiFetch(`/api/borrow-requests/${request.borrow_request_id}/review`, {
      method: 'POST',
      body: JSON.stringify({
        reviewer_user_id: reviewerUserId,
        action: 'approved',
      })
    });
    markCatalogDirty();
    return {
      ok: true,
      msg: 'Request approved and book issued successfully',
      approvalEmailSent: !!(result && result.approval_email_sent),
      approvalEmailError: String(result && result.approval_email_error ? result.approval_email_error : '').trim(),
    };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Approval failed.') };
  }
}

async function rejectIssueRequest(request) {
  const reviewerUserId = getCurrentAdminReviewerId();
  if (!reviewerUserId) {
    return { ok: false, msg: 'Admin session is missing your user ID. Refresh once and sign in again.' };
  }
  if (!request || !request.borrow_request_id) {
    return { ok: false, msg: 'No matching pending request found.' };
  }

  try {
    await apiFetch(`/api/borrow-requests/${request.borrow_request_id}/review`, {
      method: 'POST',
      body: JSON.stringify({
        reviewer_user_id: reviewerUserId,
        action: 'rejected',
        rejection_reason: 'Rejected by library admin.',
      })
    });
    return { ok: true, msg: 'Request rejected successfully' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Request rejection failed.') };
  }
}

async function cancelIssueRequest(request) {
  if (!request || !request.borrow_request_id) {
    return { ok: false, msg: 'No matching pending request found.' };
  }

  try {
    await apiFetch(`/api/borrow-requests/${request.borrow_request_id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({
        member_id: request.student_id,
      })
    });
    return { ok: true, msg: 'Issue request cancelled successfully' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Issue request cancellation failed.') };
  }
}

async function returnBook(studentId, bookId) {
  const activeLoan = getIssued().find(issue =>
    issue.student_id === studentId &&
    issue.book_id === bookId &&
    !issue.returned
  );
  if (!activeLoan || !activeLoan.loan_id) {
    return { ok: false, msg: 'Issue record not found' };
  }

  try {
    await apiFetch(`/api/loans/${activeLoan.loan_id}/return`, {
      method: 'POST',
      body: JSON.stringify({ fine_amount: 0 })
    });
    markCatalogDirty();
    return { ok: true };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Return failed.') };
  }
}

function getIssuedForUser(studentId) {
  return getIssued().filter(i => i.student_id === studentId && !i.returned);
}

function issueRequestSortDescending(first, second) {
  const dateCompare = compareDateParts(second.request_date, first.request_date);
  if (dateCompare !== 0) return dateCompare;
  if (first.book_id !== second.book_id) return second.book_id - first.book_id;
  return second.student_id - first.student_id;
}

function getIssueRequestsForUser(studentId) {
  return getIssueHistory()
    .filter(request => request.student_id === studentId)
    .sort(issueRequestSortDescending);
}

function getIssueRequestsForAdmin(adminLib) {
  return getIssueRequests()
    .filter(request => !adminLib || libraryMatches(request.lib, adminLib))
    .sort(issueRequestSortDescending);
}

function getPurchaseRequestsForUser(studentId) {
  return getPurchaseRequests()
    .filter(request => request.student_id === studentId)
    .sort(issueRequestSortDescending);
}

function getPurchaseRequestsForAdmin(adminLib) {
  return getPurchaseRequests()
    .filter(request => !adminLib || libraryMatches(request.lib, adminLib))
    .sort(issueRequestSortDescending);
}

function formatDateTime(value) {
  if (!value) return 'Unknown time';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
}

function getFavoritesForUser(studentId) {
  return getFavorites().filter(favorite => Number(favorite.student_id) === Number(studentId));
}

function findFavoriteByBookId(studentId, bookId) {
  return getFavorites().find(favorite =>
    Number(favorite.student_id) === Number(studentId) &&
    Number(favorite.book_id) === Number(bookId)
  ) || null;
}

function isActiveWaitlistStatus(status) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'waiting' || normalized === 'notified';
}

function getWaitlistEntriesForUser(studentId) {
  return getWaitlistEntries().filter(entry => Number(entry.student_id) === Number(studentId));
}

function getActiveWaitlistEntryForBook(studentId, bookId) {
  return getWaitlistEntries().find(entry =>
    Number(entry.student_id) === Number(studentId) &&
    Number(entry.book_id) === Number(bookId) &&
    isActiveWaitlistStatus(entry.status)
  ) || null;
}

function getNotificationsForUser(userId) {
  return getNotifications().filter(item => Number(item.user_id) === Number(userId));
}

function getUnreadNotificationsCount(userId) {
  return getNotificationsForUser(userId).filter(item => !item.is_read).length;
}

async function addBookToFavorites(studentId, bookId) {
  try {
    await apiFetch('/api/favorites', {
      method: 'POST',
      body: JSON.stringify({
        member_id: studentId,
        book_id: bookId,
      })
    });
    return { ok: true, msg: 'Book saved to wishlist.' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Could not save this book to wishlist.') };
  }
}

async function removeFavoriteBook(studentId, favoriteId) {
  try {
    await apiFetch(`/api/favorites/${favoriteId}/remove`, {
      method: 'POST',
      body: JSON.stringify({
        member_id: studentId,
      })
    });
    return { ok: true, msg: 'Book removed from wishlist.' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Could not remove this book from wishlist.') };
  }
}

async function joinWaitlist(studentId, bookId) {
  try {
    await apiFetch('/api/waitlist', {
      method: 'POST',
      body: JSON.stringify({
        member_id: studentId,
        book_id: bookId,
      })
    });
    return { ok: true, msg: 'Added to the waitlist.' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Could not join the waitlist.') };
  }
}

async function cancelWaitlistEntry(entry) {
  if (!entry || !entry.waitlist_entry_id) {
    return { ok: false, msg: 'Waitlist entry not found.' };
  }
  try {
    await apiFetch(`/api/waitlist/${entry.waitlist_entry_id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({
        member_id: entry.student_id,
      })
    });
    return { ok: true, msg: 'Waitlist entry cancelled.' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Could not cancel the waitlist entry.') };
  }
}

async function fetchBookReviews(bookId, memberId = null) {
  const query = new URLSearchParams({ limit: '25' });
  if (memberId) query.set('member_id', String(memberId));
  return apiFetch(`/api/books/${bookId}/reviews?${query.toString()}`);
}

async function saveBookReview(studentId, bookId, rating, reviewText) {
  try {
    await apiFetch(`/api/books/${bookId}/reviews`, {
      method: 'POST',
      body: JSON.stringify({
        member_id: studentId,
        rating,
        review_text: reviewText,
      })
    });
    return { ok: true, msg: 'Review saved.' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Could not save the review.') };
  }
}

async function removeBookReview(studentId, reviewId) {
  try {
    await apiFetch(`/api/reviews/${reviewId}/delete`, {
      method: 'POST',
      body: JSON.stringify({
        member_id: studentId,
      })
    });
    return { ok: true, msg: 'Review deleted.' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Could not delete the review.') };
  }
}

async function markNotificationAsRead(userId, notificationId) {
  try {
    await apiFetch(`/api/notifications/${notificationId}/read`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
      })
    });
    return { ok: true, msg: 'Notification marked as read.' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Could not update the notification.') };
  }
}

async function markAllNotificationsAsRead(userId) {
  try {
    await apiFetch(`/api/users/${userId}/notifications/read-all`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    return { ok: true, msg: 'All notifications marked as read.' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Could not update notifications.') };
  }
}

function isSlotBookingOpenStatus(status) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'pending' || normalized === 'approved';
}

function isApprovedSlotBookingStatus(status) {
  return String(status || '').toLowerCase() === 'approved';
}

function countSlotReservationsForDate(bookId, slotDate) {
  return getSlotBookings().filter(booking =>
    Number(booking.book_id) === Number(bookId) &&
    sameDate(booking.slot_date, slotDate) &&
    isApprovedSlotBookingStatus(booking.status)
  ).length;
}

function hasSlotBookingForBook(studentId, bookId) {
  return getSlotBookings().some(booking =>
    Number(booking.student_id) === Number(studentId) &&
    Number(booking.book_id) === Number(bookId) &&
    isSlotBookingOpenStatus(booking.status)
  );
}

function getOpenSlotBookingForBook(studentId, bookId) {
  return getSlotBookings().find(booking =>
    Number(booking.student_id) === Number(studentId) &&
    Number(booking.book_id) === Number(bookId) &&
    isSlotBookingOpenStatus(booking.status)
  ) || null;
}

async function createSlotBooking(studentId, bookId, slotDate, slotId) {
  try {
    await apiFetch('/api/slot-bookings', {
      method: 'POST',
      body: JSON.stringify({
        member_id: studentId,
        book_id: bookId,
        slot_id: slotId,
        slot_date: toIsoDate(slotDate),
      })
    });
    return { ok: true, msg: 'Slot booking request sent to the library admin.' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Slot booking failed.') };
  }
}

async function approveSlotBookingRequest(booking) {
  const reviewerUserId = getCurrentAdminReviewerId();
  if (!reviewerUserId) {
    return { ok: false, msg: 'Admin session is missing your user ID. Refresh once and sign in again.' };
  }
  if (!booking || !booking.slot_booking_id) {
    return { ok: false, msg: 'No matching pending slot booking found.' };
  }

  try {
    await apiFetch(`/api/slot-bookings/${booking.slot_booking_id}/review`, {
      method: 'POST',
      body: JSON.stringify({
        reviewer_user_id: reviewerUserId,
        action: 'approved',
      })
    });
    return { ok: true, msg: 'Slot booking approved successfully' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Slot booking approval failed.') };
  }
}

async function rejectSlotBookingRequest(booking) {
  const reviewerUserId = getCurrentAdminReviewerId();
  if (!reviewerUserId) {
    return { ok: false, msg: 'Admin session is missing your user ID. Refresh once and sign in again.' };
  }
  if (!booking || !booking.slot_booking_id) {
    return { ok: false, msg: 'No matching pending slot booking found.' };
  }

  try {
    await apiFetch(`/api/slot-bookings/${booking.slot_booking_id}/review`, {
      method: 'POST',
      body: JSON.stringify({
        reviewer_user_id: reviewerUserId,
        action: 'rejected',
        rejection_reason: 'Rejected by library admin.',
      })
    });
    return { ok: true, msg: 'Slot booking rejected successfully' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Slot booking rejection failed.') };
  }
}

async function cancelSlotBooking(booking) {
  if (!booking || !booking.slot_booking_id || !currentUser) {
    return { ok: false, msg: 'No slot booking found for that book' };
  }

  try {
    await apiFetch(`/api/slot-bookings/${booking.slot_booking_id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({
        member_id: currentUser.id,
      })
    });
    return { ok: true, msg: 'Slot booking canceled successfully' };
  } catch (error) {
    return { ok: false, msg: getErrorMessage(error, 'Slot booking cancellation failed.') };
  }
}

function closeSlotCancelOtpModal() {
  pendingSlotCancellationBooking = null;
  const modal = document.getElementById('slotCancelOtpModal');
  const hint = document.getElementById('slotCancelOtpHint');
  const form = document.getElementById('slotCancelOtpForm');
  if (form) form.reset();
  if (hint) {
    hint.textContent = '';
    hint.style.display = 'none';
  }
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function openSlotCancelOtpModal(booking) {
  if (!currentUser || !booking) return;
  pendingSlotCancellationBooking = booking;
  const modal = document.getElementById('slotCancelOtpModal');
  const label = document.getElementById('slotCancelBookingLabel');
  const hint = document.getElementById('slotCancelOtpHint');
  if (!modal || !label || !hint) return;

  const book = searchBooksById(booking.book_id);
  const title = book ? book.title : `Book #${booking.book_id}`;
  label.textContent = `${title} • ${formatDate(booking.slot_date)} • ${getSlotLabel(booking.slot_id)}`;
  hint.textContent = '';
  hint.style.display = 'none';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeSlotBookingModal() {
  currentSlotBookingBookId = null;
  const modal = document.getElementById('slotBookingModal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function updateSlotBookingOptions(slotDate) {
  const slotSelect = document.getElementById('slotBookingSlot');
  const book = searchBooksById(currentSlotBookingBookId);
  if (!slotSelect || !book) {
    return { isPreservedForDay: false, remainingCopies: 0, hasUpcomingSlots: false, hasBookableSlot: false };
  }

  const availableCopies = Math.max(Number(book.slot_booking_copies) || 0, 0);
  const reservedCopies = slotDate ? countSlotReservationsForDate(book.book_id, slotDate) : 0;
  const remainingCopies = Math.max(availableCopies - reservedCopies, 0);
  const isPreservedForDay = !!slotDate && remainingCopies < 1;
  const previousValue = slotSelect.value;
  const hasUpcomingSlots = !!slotDate && hasUpcomingSlotForDate(slotDate);

  slotSelect.innerHTML = getVisitSlots().map(slot => {
    const isPastSlot = !!slotDate && hasSlotStartedForDate(slot, slotDate);
    const isDisabled = isPreservedForDay || isPastSlot;
    const tags = [];
    if (isPastSlot) tags.push('Past');
    else if (isPreservedForDay) tags.push('Booked');
    const suffix = tags.length ? ` (${tags.join(', ')})` : '';
    return `<option value="${slot.slot_id}" ${isDisabled ? 'disabled' : ''}>${escapeHtml(slot.label)}${suffix}</option>`;
  }).join('');

  const options = Array.from(slotSelect.options);
  const previousOption = options.find(option => option.value === previousValue && !option.disabled);
  const firstAvailableOption = options.find(option => !option.disabled);
  if (previousOption) slotSelect.value = previousOption.value;
  else if (firstAvailableOption) slotSelect.value = firstAvailableOption.value;
  else if (options.length > 0) slotSelect.selectedIndex = 0;

  return {
    isPreservedForDay,
    remainingCopies,
    availableCopies,
    reservedCopies,
    hasUpcomingSlots,
    hasBookableSlot: !!firstAvailableOption,
  };
}

function updateSlotBookingAvailability() {
  const availabilityEl = document.getElementById('slotBookingAvailability');
  const dateValue = document.getElementById('slotBookingDate')?.value || '';
  const slotSelect = document.getElementById('slotBookingSlot');
  const submitButton = document.querySelector('#slotBookingForm button[type="submit"]');
  const book = searchBooksById(currentSlotBookingBookId);
  const slotDate = parseDateInput(dateValue);
  if (!availabilityEl || !book) return;
  if (!slotDate) {
    updateSlotBookingOptions(null);
    if (submitButton) submitButton.disabled = false;
    availabilityEl.textContent = 'Choose a date and slot to see availability.';
    return;
  }

  const availability = updateSlotBookingOptions(slotDate);
  const slotId = parseInt(slotSelect?.value || '0', 10);
  if (!availability.hasUpcomingSlots && compareDateParts(slotDate, today()) === 0) {
    if (submitButton) submitButton.disabled = true;
    availabilityEl.textContent = `All time slots for ${formatDate(slotDate)} are already in the past. Choose tomorrow.`;
    return;
  }

  if (submitButton) submitButton.disabled = availability.isPreservedForDay || !availability.hasBookableSlot;

  if (availability.isPreservedForDay) {
    availabilityEl.textContent = `All slot-booking copies are already booked for ${formatDate(slotDate)}. Choose another date.`;
    return;
  }

  if (!slotSelect || isNaN(slotId) || slotId < 1) {
    availabilityEl.textContent = `Choose an available time slot for ${formatDate(slotDate)}.`;
    return;
  }

  availabilityEl.textContent = `${availability.remainingCopies} slot-booking copy/copies are still available for ${formatDate(slotDate)}. ${getSlotLabel(slotId)} is available.`;
}

function openSlotBookingModal(bookId) {
  if (!currentUser) return;
  if (hasSlotBookingForBook(currentUser.id, bookId)) {
    showMessage('You already have a pending or approved slot booking for this book.', true);
    return;
  }

  const book = searchBooksById(bookId);
  const modal = document.getElementById('slotBookingModal');
  const label = document.getElementById('slotBookingBookLabel');
  const slotSelect = document.getElementById('slotBookingSlot');
  const dateInput = document.getElementById('slotBookingDate');
  if (!book || !modal || !label || !slotSelect || !dateInput) return;

  currentSlotBookingBookId = bookId;
  label.textContent = `${book.title} • ${book.lib}`;
  const todayDate = today();
  const defaultSlotDate = hasUpcomingSlotForDate(todayDate) ? todayDate : addDays(todayDate, 1);
  const todayValue = toIsoDate(todayDate);
  dateInput.min = todayValue;
  dateInput.value = toIsoDate(defaultSlotDate);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  updateSlotBookingAvailability();
}

function initSlotBookingModal() {
  const modal = document.getElementById('slotBookingModal');
  const cancel = document.getElementById('slotBookingCancel');
  const dateInput = document.getElementById('slotBookingDate');
  const slotSelect = document.getElementById('slotBookingSlot');
  const form = document.getElementById('slotBookingForm');
  if (!modal || !cancel || !dateInput || !slotSelect || !form) return;

  cancel.onclick = closeSlotBookingModal;
  const backdrop = modal.querySelector('.modal-backdrop');
  if (backdrop) backdrop.onclick = closeSlotBookingModal;
  dateInput.addEventListener('change', updateSlotBookingAvailability);
  slotSelect.addEventListener('change', updateSlotBookingAvailability);

  form.onsubmit = (event) => {
    event.preventDefault();
    if (!currentUser || !currentSlotBookingBookId) return;
    const submitButton = event.submitter || form.querySelector('button[type="submit"]');
    const slotDate = parseDateInput(dateInput.value);
    const slotId = parseInt(slotSelect.value, 10);
    const selectedOption = slotSelect.options[slotSelect.selectedIndex];
    const selectedSlot = getVisitSlotById(slotId);
    if (!slotDate || isNaN(slotId) || slotId < 1 || !selectedOption || selectedOption.disabled) {
      showMessage('Choose a valid date and slot.', true);
      return;
    }
    if (selectedSlot && hasSlotStartedForDate(selectedSlot, slotDate)) {
      showMessage('That slot is already in the past. Choose a later slot or tomorrow.', true);
      return;
    }

    runWithButtonLoading(submitButton, 'Booking...', async () => {
      const result = await createSlotBooking(currentUser.id, currentSlotBookingBookId, slotDate, slotId);
      showMessage(result.msg, !result.ok);
      if (result.ok) {
        closeSlotBookingModal();
        await loadUserDashboard();
      }
    });
  };
}

function initSlotCancelOtpModal() {
  const modal = document.getElementById('slotCancelOtpModal');
  const closeButton = document.getElementById('slotCancelOtpClose');
  const sendOtpButton = document.getElementById('slotCancelSendOtp');
  const form = document.getElementById('slotCancelOtpForm');
  const hint = document.getElementById('slotCancelOtpHint');
  const input = document.getElementById('slotCancelOtpInput');
  if (!modal || !closeButton || !sendOtpButton || !form || !hint || !input) return;

  closeButton.onclick = closeSlotCancelOtpModal;
  const backdrop = modal.querySelector('.modal-backdrop');
  if (backdrop) backdrop.onclick = closeSlotCancelOtpModal;

  sendOtpButton.onclick = () => {
    if (!currentUser || !pendingSlotCancellationBooking) {
      closeSlotCancelOtpModal();
      return;
    }
    runWithButtonLoading(sendOtpButton, 'Sending...', async () => {
      const sendResult = await sendOtpToEmail(currentUser.email, { purpose: 'slot_booking_cancel' });
      hint.textContent = sendResult && sendResult.fallbackOtp
        ? `${sendResult.message} Demo OTP: ${sendResult.fallbackOtp}`
        : 'Check your email for the 6-digit OTP code.';
      hint.style.display = 'block';
      showMessage(sendResult && sendResult.fallbackOtp
        ? 'Demo OTP generated for slot cancellation.'
        : 'OTP sent for slot cancellation.');
    });
  };

  form.onsubmit = (event) => {
    event.preventDefault();
    if (!currentUser || !pendingSlotCancellationBooking) {
      closeSlotCancelOtpModal();
      return;
    }
    const submitButton = event.submitter || form.querySelector('button[type="submit"]');
    const otp = input.value.trim();
    if (!otp) {
      showMessage('Enter the OTP to cancel the slot booking.', true);
      return;
    }

    runWithButtonLoading(submitButton, 'Verifying...', async () => {
      const verifyResult = await verifyOtpWithBackend(currentUser.email, otp);
      if (!verifyResult.ok) {
        showMessage(verifyResult.msg || 'Invalid OTP', true);
        return;
      }

      const result = await cancelSlotBooking(pendingSlotCancellationBooking);
      showMessage(result.msg, !result.ok);
      if (!result.ok) return;

      closeSlotCancelOtpModal();
      await loadUserDashboard();
    });
  };
}

function getIssuedCopiesForBook(book) {
  const issueTotalCopies = Math.max(Number(book?.issue_total_copies) || 0, 0);
  const availableCopies = Math.max(Number(book?.available_copies) || 0, 0);
  return Math.max(issueTotalCopies - availableCopies, 0);
}

function closeBookActionModal() {
  currentBookActionConfig = null;
  const modal = document.getElementById('bookActionModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function renderBookActionFacts(facts) {
  const items = Array.isArray(facts)
    ? facts.filter(item => item && item.label && item.value !== undefined && item.value !== null)
    : [];
  if (!items.length) {
    return '<p class="empty">No extra details available for this action.</p>';
  }
  return items.map(item => `
    <div class="book-action-fact">
      <span class="book-action-fact-label">${escapeHtml(item.label)}</span>
      <strong class="book-action-fact-value">${escapeHtml(item.value)}</strong>
    </div>
  `).join('');
}

function openBookActionModal(config) {
  const modal = document.getElementById('bookActionModal');
  const titleEl = document.getElementById('bookActionModalTitle');
  const labelEl = document.getElementById('bookActionModalBookLabel');
  const hintEl = document.getElementById('bookActionModalHint');
  const factsEl = document.getElementById('bookActionModalFacts');
  const confirmButton = document.getElementById('bookActionModalConfirm');
  if (!modal || !titleEl || !labelEl || !hintEl || !factsEl || !confirmButton) return;

  currentBookActionConfig = config || null;
  titleEl.textContent = config?.title || 'Book Action';
  labelEl.textContent = config?.bookLabel || '';
  hintEl.textContent = config?.hint || '';
  factsEl.innerHTML = renderBookActionFacts(config?.facts || []);
  confirmButton.textContent = config?.confirmLabel || 'Continue';
  confirmButton.disabled = !!config?.confirmDisabled;
  confirmButton.style.display = typeof config?.onConfirm === 'function' ? '' : 'none';

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function initBookActionModal() {
  const modal = document.getElementById('bookActionModal');
  const closeButton = document.getElementById('bookActionModalClose');
  const confirmButton = document.getElementById('bookActionModalConfirm');
  if (!modal || !closeButton || !confirmButton) return;

  closeButton.onclick = closeBookActionModal;
  const backdrop = modal.querySelector('.modal-backdrop');
  if (backdrop) backdrop.onclick = closeBookActionModal;

  confirmButton.onclick = () => {
    const config = currentBookActionConfig;
    if (!config || typeof config.onConfirm !== 'function') {
      closeBookActionModal();
      return;
    }

    void runWithButtonLoading(confirmButton, config.loadingText || 'Working...', async () => {
      try {
        const result = await config.onConfirm();
        if (result && result.msg) {
          showMessage(result.msg, !result.ok);
        }
        if (!result || result.ok !== false) {
          closeBookActionModal();
        }
      } catch (error) {
        showMessage(getErrorMessage(error, 'This action could not be completed.'), true);
      }
    });
  };
}

function openIssueRequestPrompt(bookId) {
  if (!currentUser) return;
  const book = searchBooksById(bookId);
  if (!book) return;

  const waitlistEntry = getActiveWaitlistEntryForBook(currentUser.id, bookId);
  const availableCopies = Math.max(Number(book.available_copies) || 0, 0);
  const issueTotalCopies = Math.max(Number(book.issue_total_copies) || 0, 0);
  const issuedCopies = getIssuedCopiesForBook(book);
  const facts = [
    { label: 'Availability', value: availableCopies > 0 ? `${availableCopies} of ${issueTotalCopies} ready` : 'Currently unavailable' },
    { label: 'Issued now', value: `${issuedCopies} copy/copies out` },
    { label: 'Waitlist', value: `${Number(book.waitlist_count || 0)} active reader(s)` },
  ];

  if (availableCopies > 0) {
    openBookActionModal({
      title: 'Request Issue',
      bookLabel: `${book.title} • ${book.lib}`,
      hint: 'This book still has issue copies available. Send the request and the library team can approve it.',
      facts,
      confirmLabel: 'Send Request',
      loadingText: 'Requesting...',
      onConfirm: async () => {
        const result = await requestIssueBook(currentUser.id, bookId);
        if (result.ok) await loadUserDashboard();
        return result;
      },
    });
    return;
  }

  openBookActionModal({
    title: waitlistEntry ? 'Issue Unavailable' : 'Book Fully Issued',
    bookLabel: `${book.title} • ${book.lib}`,
    hint: waitlistEntry
      ? `All issue copies are out right now. You are already on the waitlist${waitlistEntry.position ? ` at position ${waitlistEntry.position}` : ''}.`
      : 'All issue copies are out right now. You can join the waitlist from here instead.',
    facts,
    confirmLabel: waitlistEntry ? 'Close' : 'Join Waitlist',
    loadingText: 'Joining...',
    onConfirm: waitlistEntry ? null : async () => {
      const result = await joinWaitlist(currentUser.id, bookId);
      if (result.ok) await loadUserDashboard();
      return result;
    },
  });
}

function openPurchaseRequestPrompt(bookId) {
  if (!currentUser) return;
  const book = searchBooksById(bookId);
  if (!book) return;

  openBookActionModal({
    title: 'Request Purchase',
    bookLabel: `${book.title} • ${book.lib}`,
    hint: 'This sends a purchase request to the library admin for review.',
    facts: [
      { label: 'Purchase price', value: `Rs ${Number(book.purchase_price || 0).toFixed(2)}` },
      { label: 'Wishlist', value: `${Number(book.favorite_count || 0)} reader(s) saved this` },
      { label: 'Reviews', value: `${Number(book.average_rating || 0).toFixed(1)} / 5 from ${Number(book.review_count || 0)} review(s)` },
    ],
    confirmLabel: 'Send Request',
    loadingText: 'Requesting...',
    onConfirm: async () => {
      const result = await requestPurchaseBook(currentUser.id, bookId);
      if (result.ok) await loadUserDashboard();
      return result;
    },
  });
}

function openSlotActionPrompt(bookId) {
  if (!currentUser) return;
  const book = searchBooksById(bookId);
  if (!book) return;

  const openSlotBooking = getOpenSlotBookingForBook(currentUser.id, bookId);
  const facts = [
    { label: 'Slot-booking copies', value: `${Math.max(Number(book.slot_booking_copies) || 0, 0)} per day` },
    { label: 'Library', value: String(book.lib || 'Unknown library') },
  ];
  if (openSlotBooking) {
    facts.push(
      { label: 'Current status', value: String(openSlotBooking.status || 'pending').toLowerCase() },
      { label: 'Booked for', value: `${formatDate(openSlotBooking.slot_date)} • ${getSlotLabel(openSlotBooking.slot_id)}` },
    );
    openBookActionModal({
      title: 'Slot Booking Status',
      bookLabel: `${book.title} • ${book.lib}`,
      hint: 'You already have an open slot booking for this book. You can open the cancel flow from here.',
      facts,
      confirmLabel: 'Cancel Booking',
      loadingText: 'Opening...',
      onConfirm: async () => {
        openSlotCancelOtpModal(openSlotBooking);
        return { ok: true };
      },
    });
    return;
  }

  openBookActionModal({
    title: 'Request Slot',
    bookLabel: `${book.title} • ${book.lib}`,
    hint: 'Pick a date and time in the next step. This popup keeps the card simple and shows the slot summary first.',
    facts,
    confirmLabel: 'Continue',
    loadingText: 'Opening...',
    onConfirm: async () => {
      openSlotBookingModal(bookId);
      return { ok: true };
    },
  });
}

function openFavoriteActionPrompt(bookId) {
  if (!currentUser) return;
  const book = searchBooksById(bookId);
  if (!book) return;

  const favorite = findFavoriteByBookId(currentUser.id, bookId);
  const isSaved = !!favorite;
  openBookActionModal({
    title: isSaved ? 'Remove Saved Book' : 'Save Book',
    bookLabel: `${book.title} • ${book.lib}`,
    hint: isSaved
      ? 'This book is already in your wishlist. You can remove it here.'
      : 'Save this book to your wishlist so you can find it again quickly.',
    facts: [
      { label: 'Wishlist count', value: `${Number(book.favorite_count || 0)} saved reader(s)` },
      { label: 'Waitlist count', value: `${Number(book.waitlist_count || 0)} active reader(s)` },
    ],
    confirmLabel: isSaved ? 'Remove' : 'Save',
    loadingText: isSaved ? 'Removing...' : 'Saving...',
    onConfirm: async () => {
      const result = isSaved
        ? await removeFavoriteBook(currentUser.id, favorite.favorite_id)
        : await addBookToFavorites(currentUser.id, bookId);
      if (result.ok) await loadUserDashboard();
      return result;
    },
  });
}

function openWaitlistActionPrompt(bookId) {
  if (!currentUser) return;
  const book = searchBooksById(bookId);
  if (!book) return;

  const waitlistEntry = getActiveWaitlistEntryForBook(currentUser.id, bookId);
  const facts = [
    {
      label: 'Issue availability',
      value: Math.max(Number(book.available_copies) || 0, 0) > 0 ? `${Math.max(Number(book.available_copies) || 0, 0)} copy/copies ready` : 'No issue copies ready',
    },
    { label: 'Waitlist size', value: `${Number(book.waitlist_count || 0)} active reader(s)` },
  ];

  if (waitlistEntry) {
    facts.push(
      { label: 'Your status', value: String(waitlistEntry.status || 'waiting').toLowerCase() },
      { label: 'Your position', value: waitlistEntry.position ? String(waitlistEntry.position) : 'Updating soon' },
    );
    openBookActionModal({
      title: 'Waitlist Status',
      bookLabel: `${book.title} • ${book.lib}`,
      hint: 'You are already on the waitlist. If you no longer need the book, you can cancel the waitlist entry here.',
      facts,
      confirmLabel: 'Cancel Waitlist',
      loadingText: 'Cancelling...',
      onConfirm: async () => {
        const result = await cancelWaitlistEntry(waitlistEntry);
        if (result.ok) await loadUserDashboard();
        return result;
      },
    });
    return;
  }

  openBookActionModal({
    title: 'Join Waitlist',
    bookLabel: `${book.title} • ${book.lib}`,
    hint: 'Join the waitlist and the next available copy can be routed to you when it is returned.',
    facts,
    confirmLabel: 'Join Waitlist',
    loadingText: 'Joining...',
    onConfirm: async () => {
      const result = await joinWaitlist(currentUser.id, bookId);
      if (result.ok) await loadUserDashboard();
      return result;
    },
  });
}

function openBookDetailsPrompt(bookId) {
  const book = searchBooksById(bookId);
  if (!book) return;

  const readUrl = getBookReadOnlineUrl(book);
  const readingMode = !readUrl
    ? 'No reading source linked'
    : isLocalOriginalReadUrl(readUrl)
      ? 'Original library file available'
      : 'Read-online reference available';

  openBookActionModal({
    title: 'Book Details',
    bookLabel: `${book.title} • ${book.lib}`,
    facts: [
      { label: 'Author', value: String(book.author || 'Unknown author') },
      { label: 'Purchase price', value: `Rs ${Number(book.purchase_price || 0).toFixed(2)}` },
      { label: 'Rating', value: `${Number(book.average_rating || 0).toFixed(1)} / 5 from ${Number(book.review_count || 0)} review(s)` },
      { label: 'Wishlist', value: `${Number(book.favorite_count || 0)} saved reader(s)` },
      { label: 'Waitlist', value: `${Number(book.waitlist_count || 0)} active reader(s)` },
      { label: 'Issue copies', value: `${Math.max(Number(book.available_copies) || 0, 0)} available of ${Math.max(Number(book.issue_total_copies) || 0, 0)}` },
      { label: 'Issued now', value: `${getIssuedCopiesForBook(book)} copy/copies out` },
      { label: 'Slot-booking copies', value: `${Math.max(Number(book.slot_booking_copies) || 0, 0)} per day` },
      { label: 'Total copies', value: `${Math.max(Number(book.total_copies) || 0, 0)}` },
      { label: 'Reading access', value: readingMode },
    ],
  });
}

function closeReviewModal() {
  currentReviewBookId = null;
  const modal = document.getElementById('reviewModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

async function populateReviewModal(bookId) {
  if (!currentUser) return;
  const book = searchBooksById(bookId);
  const titleEl = document.getElementById('reviewModalBookTitle');
  const summaryEl = document.getElementById('reviewModalSummary');
  const eligibilityEl = document.getElementById('reviewModalEligibility');
  const listEl = document.getElementById('reviewModalReviewsList');
  const ratingEl = document.getElementById('reviewModalRating');
  const textEl = document.getElementById('reviewModalText');
  const deleteButton = document.getElementById('reviewModalDelete');
  const submitButton = document.getElementById('reviewModalSubmit');
  const form = document.getElementById('reviewModalForm');
  if (!titleEl || !summaryEl || !eligibilityEl || !listEl || !ratingEl || !textEl || !deleteButton || !submitButton || !form) return;

  titleEl.textContent = book ? `${book.title} • ${book.lib}` : `Book #${bookId}`;
  summaryEl.textContent = 'Loading reviews...';
  eligibilityEl.textContent = '';
  listEl.innerHTML = '<p class="empty">Loading reviews...</p>';
  deleteButton.style.display = 'none';
  ratingEl.disabled = false;
  textEl.disabled = false;
  submitButton.disabled = false;
  submitButton.textContent = 'Save Review';
  form.classList.remove('is-disabled');

  try {
    const payload = await fetchBookReviews(bookId, currentUser.id);
    const reviews = Array.isArray(payload.reviews) ? payload.reviews.map(toBookReviewModel) : [];
    const summary = payload.summary || {};
    const viewer = payload.viewer || {};
    const ownReview = reviews.find(review => Number(review.student_id) === Number(currentUser.id)) || null;
    const canReview = !!viewer.can_review || !!ownReview;

    summaryEl.textContent = `${Number(summary.average_rating || 0).toFixed(1)} / 5 from ${Number(summary.review_count || 0)} review(s)`;
    eligibilityEl.textContent = canReview
      ? 'You can add or update a review for this book.'
      : String(viewer.reason || 'You can review only books you have issued at least once.');
    ratingEl.value = ownReview ? String(ownReview.rating || 5) : '5';
    textEl.value = ownReview ? (ownReview.review_text || '') : '';
    ratingEl.disabled = !canReview;
    textEl.disabled = !canReview;
    submitButton.disabled = !canReview;
    submitButton.textContent = canReview ? 'Save Review' : 'Issue Once to Review';
    form.classList.toggle('is-disabled', !canReview);
    deleteButton.style.display = ownReview ? '' : 'none';
    deleteButton.onclick = () => {
      if (!ownReview) return;
      void runButtonActionWithStatus(deleteButton, 'Deleting...', 'Deleted', 'Failed', async () => {
        const result = await removeBookReview(currentUser.id, ownReview.review_id);
        if (result.ok) {
          markCatalogDirty();
          await refreshCatalogData(true);
          await loadUserDashboard();
          await populateReviewModal(bookId);
        }
        showMessage(result.msg, !result.ok);
        return result;
      });
    };

    if (!reviews.length) {
      listEl.innerHTML = `<p class="empty">${canReview ? 'No reviews yet. Be the first to rate this book.' : 'No reviews yet for this book.'}</p>`;
      return;
    }

    listEl.innerHTML = reviews.map(review => `
      <div class="review-entry">
        <div class="review-entry-head">
          <strong>${escapeHtml(review.user_name || `User #${review.student_id}`)}</strong>
          <span class="review-stars">${'★'.repeat(Math.max(0, Math.min(5, review.rating || 0)))}${'☆'.repeat(Math.max(0, 5 - Math.max(0, Math.min(5, review.rating || 0))))}</span>
        </div>
        <div class="module-meta">${escapeHtml(formatDateTime(review.updated_at || review.created_at))}</div>
        <p>${escapeHtml(review.review_text || 'No written comment provided.')}</p>
      </div>
    `).join('');
  } catch (error) {
    summaryEl.textContent = 'Could not load reviews.';
    eligibilityEl.textContent = '';
    listEl.innerHTML = `<p class="empty">${escapeHtml(getErrorMessage(error, 'Could not load reviews.'))}</p>`;
  }
}

function openReviewModal(bookId) {
  if (!currentUser) return;
  currentReviewBookId = bookId;
  const modal = document.getElementById('reviewModal');
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  void populateReviewModal(bookId);
}

function initReviewModal() {
  const modal = document.getElementById('reviewModal');
  const closeButton = document.getElementById('reviewModalClose');
  const form = document.getElementById('reviewModalForm');
  if (!modal || !closeButton || !form) return;

  closeButton.onclick = closeReviewModal;
  const backdrop = modal.querySelector('.modal-backdrop');
  if (backdrop) backdrop.onclick = closeReviewModal;

  form.onsubmit = (event) => {
    event.preventDefault();
    if (!currentUser || !currentReviewBookId) return;
    const submitControl = document.getElementById('reviewModalSubmit');
    if (submitControl && submitControl.disabled) {
      showMessage('You can review only books you have issued at least once.', true);
      return;
    }
    const rating = parseInt(document.getElementById('reviewModalRating')?.value || '0', 10);
    const reviewText = document.getElementById('reviewModalText')?.value.trim() || '';
    const submitButton = event.submitter || form.querySelector('button[type="submit"]');
    if (isNaN(rating) || rating < 1 || rating > 5) {
      showMessage('Choose a rating between 1 and 5.', true);
      return;
    }

    void runButtonActionWithStatus(submitButton, 'Saving...', 'Saved', 'Failed', async () => {
      const result = await saveBookReview(currentUser.id, currentReviewBookId, rating, reviewText);
      if (result.ok) {
        markCatalogDirty();
        await refreshCatalogData(true);
        await loadUserDashboard();
        await populateReviewModal(currentReviewBookId);
      }
      showMessage(result.msg, !result.ok);
      return result;
    });
  };
}

function getSlotBookingsForUser(studentId) {
  return getSlotBookings().filter(booking => Number(booking.student_id) === Number(studentId));
}

function getSlotBookingsForAdmin(adminLib) {
  return getSlotBookings().filter(booking => !adminLib || libraryMatches(booking.lib, adminLib));
}

function getIssuedForAdmin(adminLib) {
  return getIssued().filter(issue => !issue.returned && (!adminLib || libraryMatches(issue.lib, adminLib)));
}

async function logoutCurrentSession() {
  try {
    await apiFetch('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  } catch (_error) {
    // Keep logout resilient on the client even if the API call fails.
  }
}

// ----- API bootstrap -----
const BACKEND_BASE = APP_SERVER_URL;

/** Clear stale local browser state and reset the in-memory cache. */
function clearAppLocalStorage() {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  saveBooks([]);
  saveUsers([]);
  saveAdmins([]);
  saveDevelopers([]);
  saveIssued([]);
  saveIssueRequests([]);
  savePurchaseRequests([]);
  saveIssueHistory([]);
  saveSlotBookings([]);
  saveFavorites([]);
  saveWaitlistEntries([]);
  saveNotifications([]);
  saveQueue([]);
  saveLibraries([]);
  saveVisitSlots([]);
  saveDeveloperUsers([]);
  saveDeveloperLogs([]);
  apiState.developerMetrics = {};
  apiState.userMetrics = {};
  apiState.adminMetrics = {};
  saveAdminTopBooks([]);
  saveAdminRecentReviews([]);
  markCatalogDirty();
}

async function loadBackendDataFromServer() {
  await refreshCatalogData(true);
}

function setSaveStatus(text, isError = false) {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('error', isError);
}

function checkBackend() {
  return apiFetch('/api/health')
    .then(() => {
      setSaveStatus('API online');
      return true;
    })
    .catch(() => {
      setSaveStatus('API offline', true);
      return false;
    });
}

function scheduleSync() {
  return Promise.resolve(false);
}

function syncBackendFiles() {
  return Promise.resolve(false);
}

// ----- UI state -----
let currentUser = null;
let currentAdmin = null;
let currentDeveloper = null;
/** Pending registration after OTP sent: { type: 'user'|'admin', name, email, password, lib? } */
let pendingReg = null;
let pendingPasswordResetEmail = null;
let messageTimer = null;
let approvedLoansPanelOpen = false;
let activeScreenId = 'home';
let dashboardPollTimer = null;
let dashboardPollTarget = '';
let dashboardPollInFlight = false;
let userDashboardLoadPromise = null;
let adminDashboardLoadPromise = null;
let developerDashboardLoadPromise = null;
let catalogLoadedAt = 0;
let currentSlotBookingBookId = null;
let pendingSlotCancellationBooking = null;
let currentReviewBookId = null;
let currentBookActionConfig = null;
let brandLoaderStartedAt = 0;
let brandLoaderClosingPromise = null;
const SCREEN_HISTORY_STATE_KEY = 'smartLibraryScreenId';
const userBookSearchState = {
  searchType: 'title',
  query: '',
  libraryFilter: '',
};
const adminAddBookDraft = {
  bookId: '',
  title: '',
  author: '',
  readOnlineUrl: '',
  price: '',
  total: '',
  issueTotal: '',
  slotCopies: '',
  isDirty: false,
};
const dashboardRenderState = {
  user: Object.create(null),
  admin: Object.create(null),
  developer: Object.create(null),
};
const dashboardHydrationState = {
  user: false,
  admin: false,
  developer: false,
};
const DASHBOARD_SKELETON_SECTIONS = {
  user: ['profile', 'books', 'issued', 'requests', 'purchaseRequests', 'slotBookings', 'approvedSlots', 'wishlist', 'waitlist', 'notifications'],
  admin: ['profile', 'analytics', 'books', 'requests', 'purchaseRequests', 'approvedLoans', 'slotBookings', 'approvedSlots'],
  developer: ['profile', 'stats', 'users', 'logs'],
};

const USER_DASHBOARD_POLL_INTERVAL_MS = 2000;
const ADMIN_DASHBOARD_POLL_INTERVAL_MS = 3000;
const DEVELOPER_DASHBOARD_POLL_INTERVAL_MS = 3000;
const CATALOG_REFRESH_INTERVAL_MS = 30000;
const USER_SCREEN_IDS = new Set([
  'user-dashboard',
  'user-issued-screen',
  'user-issue-requests-screen',
  'user-purchase-requests-screen',
  'user-slot-bookings-screen',
  'user-approved-slots-screen',
  'user-wishlist-screen',
  'user-waitlist-screen',
  'user-notifications-screen',
]);
const ADMIN_SCREEN_IDS = new Set([
  'admin-dashboard',
  'admin-issue-requests-screen',
  'admin-purchase-requests-screen',
  'admin-loans-screen',
  'admin-slot-bookings-screen',
  'admin-approved-slots-screen',
]);
const DEVELOPER_SCREEN_IDS = new Set([
  'developer-dashboard',
  'developer-users-screen',
  'developer-logs-screen',
]);

function getDefaultScreenId() {
  if (currentDeveloper) return 'developer-dashboard';
  if (currentAdmin) return 'admin-dashboard';
  if (currentUser) return 'user-dashboard';
  return 'home';
}

function getCurrentHistoryScreenId() {
  const state = window.history && window.history.state ? window.history.state : null;
  const screenId = state && state[SCREEN_HISTORY_STATE_KEY];
  return String(screenId || '').trim();
}

function writeScreenHistoryState(screenId, mode = 'push') {
  if (!window.history || typeof window.history.pushState !== 'function') return;
  const normalizedId = String(screenId || '').trim() || getDefaultScreenId();
  const nextState = {
    ...(window.history.state || {}),
    [SCREEN_HISTORY_STATE_KEY]: normalizedId,
  };

  if (mode === 'replace') {
    window.history.replaceState(nextState, '', window.location.href);
    return;
  }

  if (getCurrentHistoryScreenId() === normalizedId) return;
  window.history.pushState(nextState, '', window.location.href);
}

function isKnownScreenId(id) {
  const element = document.getElementById(String(id || '').trim());
  return !!(element && element.classList.contains('screen'));
}

function normalizeScreenIdForAccess(id) {
  const candidate = String(id || '').trim();
  if (!candidate || !isKnownScreenId(candidate)) {
    return getDefaultScreenId();
  }
  if (USER_SCREEN_IDS.has(candidate) && !currentUser) {
    return getDefaultScreenId();
  }
  if (ADMIN_SCREEN_IDS.has(candidate) && !currentAdmin) {
    return getDefaultScreenId();
  }
  if (DEVELOPER_SCREEN_IDS.has(candidate) && !currentDeveloper) {
    return getDefaultScreenId();
  }
  return candidate;
}

function updateNav() {
  const loginBtn = document.getElementById('navLogin');
  const signupBtn = document.getElementById('navSignup');
  const dashBtn = document.getElementById('navDashboard');
  const logoutBtn = document.getElementById('navLogout');
  const loggedIn = !!currentDeveloper || !!currentAdmin || !!currentUser;
  if (loginBtn) loginBtn.style.display = loggedIn ? 'none' : '';
  if (signupBtn) signupBtn.style.display = loggedIn ? 'none' : '';
  if (dashBtn) {
    dashBtn.style.display = loggedIn ? '' : 'none';
    dashBtn.textContent = currentDeveloper
      ? 'Developer Dashboard'
      : (currentAdmin ? 'Admin Dashboard' : 'User Dashboard');
  }
  if (logoutBtn) logoutBtn.style.display = loggedIn ? '' : 'none';
}

function resetDashboardRenderState(scope) {
  if (scope === 'user' || scope === 'admin' || scope === 'developer') {
    dashboardRenderState[scope] = Object.create(null);
    dashboardHydrationState[scope] = false;
    return;
  }
  dashboardRenderState.user = Object.create(null);
  dashboardRenderState.admin = Object.create(null);
  dashboardRenderState.developer = Object.create(null);
  dashboardHydrationState.user = false;
  dashboardHydrationState.admin = false;
  dashboardHydrationState.developer = false;
}

function clearDashboardSectionRenderState(scope, keys = []) {
  const bucket = dashboardRenderState[scope] || (dashboardRenderState[scope] = Object.create(null));
  keys.forEach(key => {
    delete bucket[key];
  });
}

function renderDashboardSection(scope, key, signature, renderFn) {
  const bucket = dashboardRenderState[scope] || (dashboardRenderState[scope] = Object.create(null));
  if (bucket[key] === signature) return false;
  renderFn();
  bucket[key] = signature;
  return true;
}

function buildSignature(items, itemToKey, emptyKey = 'empty') {
  if (!Array.isArray(items) || items.length === 0) return emptyKey;
  return items.map(itemToKey).join('||');
}

function buildBooksSignature(books) {
  return buildSignature(books, book =>
    [
      book.book_id,
      book.library_id,
      book.title,
      book.author,
      book.issue_total_copies,
      book.available_copies,
      book.slot_booking_copies,
      book.total_copies,
      book.lib,
      book.read_online_url,
      book.average_rating,
      book.review_count,
      book.waitlist_count,
      book.favorite_count,
    ].join('|')
  );
}

function buildBorrowRequestsSignature(requests) {
  return buildSignature(requests, request =>
    [
      request.borrow_request_id,
      request.student_id,
      request.book_id,
      request.status,
      request.user_name,
      request.user_email,
      request.lib,
      toIsoDate(request.request_date),
    ].join('|')
  );
}

function buildPurchaseRequestsSignature(requests) {
  return buildSignature(requests, request =>
    [
      request.purchase_request_id,
      request.student_id,
      request.book_id,
      request.status,
      request.user_name,
      request.user_email,
      request.lib,
      request.requested_price,
      toIsoDate(request.request_date),
    ].join('|')
  );
}

function buildLoansSignature(loans) {
  return buildSignature(loans, loan =>
    [
      loan.loan_id,
      loan.student_id,
      loan.book_id,
      loan.returned ? 1 : 0,
      loan.user_name,
      loan.user_email,
      loan.lib,
      toIsoDate(loan.issue_date),
      toIsoDate(loan.due_date),
      loan.fine,
    ].join('|')
  );
}

function buildSlotBookingsSignature(bookings) {
  return buildSignature(bookings, booking =>
    [
      booking.slot_booking_id,
      booking.student_id,
      booking.book_id,
      booking.slot_id,
      booking.status,
      booking.rejection_reason || '',
      booking.user_name,
      booking.user_email,
      booking.lib,
      toIsoDate(booking.request_date),
      toIsoDate(booking.slot_date),
    ].join('|')
  );
}

function buildFavoritesSignature(favorites) {
  return buildSignature(favorites, favorite =>
    [
      favorite.favorite_id,
      favorite.student_id,
      favorite.book_id,
      favorite.created_at || '',
    ].join('|')
  );
}

function buildWaitlistSignature(entries) {
  return buildSignature(entries, entry =>
    [
      entry.waitlist_entry_id,
      entry.student_id,
      entry.book_id,
      entry.status,
      entry.position,
      entry.notified_at || '',
      entry.created_at || '',
    ].join('|')
  );
}

function buildNotificationsSignature(items) {
  return buildSignature(items, item =>
    [
      item.notification_id,
      item.user_id,
      item.category,
      item.title,
      item.is_read ? 1 : 0,
      item.created_at || '',
    ].join('|')
  );
}

function buildAdminTopBooksSignature(items) {
  return buildSignature(items, item =>
    [
      item.book_id,
      item.loan_count || 0,
      item.pending_borrow_requests || 0,
      item.waitlist_count || 0,
      item.review_count || 0,
      item.average_rating || 0,
    ].join('|')
  );
}

function buildReviewSignature(items) {
  return buildSignature(items, item =>
    [
      item.review_id,
      item.book_id,
      item.student_id,
      item.rating,
      item.updated_at || '',
      item.review_text || '',
    ].join('|')
  );
}

function buildDeveloperUsersSignature(users) {
  return buildSignature(users, user =>
    [
      user.user_id,
      user.role,
      user.full_name,
      user.email,
      user.is_active ? 1 : 0,
      user.is_currently_active ? 1 : 0,
      user.last_seen_at || '',
      user.last_path || '',
    ].join('|')
  );
}

function buildDeveloperLogsSignature(logs) {
  return buildSignature(logs, log =>
    [
      log.timestamp || '',
      log.session_id || '',
      log.actor_email || '',
      log.method || '',
      log.path || '',
      log.status_code || '',
      log.action || '',
    ].join('|')
  );
}

function setTextIfChanged(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const next = String(value ?? '');
  if (el.dataset.loadingSkeleton === 'true' || el.textContent !== next) {
    el.textContent = next;
    delete el.dataset.loadingSkeleton;
    el.removeAttribute('aria-busy');
  }
}

function setLoadingRegion(target, isLoading) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return;
  el.classList.toggle('is-skeleton-loading', !!isLoading);
  if (isLoading) {
    el.setAttribute('aria-busy', 'true');
  } else {
    el.removeAttribute('aria-busy');
  }
}

function setTextSkeleton(id, widthClass = 'skeleton-w-md') {
  const el = document.getElementById(id);
  if (!el) return;
  el.dataset.loadingSkeleton = 'true';
  el.setAttribute('aria-busy', 'true');
  el.innerHTML = `<span class="text-skeleton ${widthClass}" aria-hidden="true"></span>`;
}

function skeletonLine(widthClass = 'skeleton-w-md', extraClass = '') {
  return `<span class="text-skeleton ${widthClass}${extraClass ? ` ${extraClass}` : ''}" aria-hidden="true"></span>`;
}

function skeletonButton(widthClass = 'skeleton-w-sm') {
  return `<span class="skeleton-button ${widthClass}" aria-hidden="true"></span>`;
}

function skeletonPill(widthClass = 'skeleton-w-sm') {
  return `<span class="skeleton-pill ${widthClass}" aria-hidden="true"></span>`;
}

function renderPagerSkeleton(pagerId, count = 4) {
  const pagerEl = document.getElementById(pagerId);
  if (!pagerEl) return;
  setLoadingRegion(pagerEl, true);
  const items = Array.from({ length: count }, (_, index) =>
    index === 0 || index === count - 1
      ? skeletonButton('skeleton-w-sm')
      : skeletonButton('skeleton-w-xs')
  ).join('');
  pagerEl.innerHTML = `<div class="pager-inner skeleton-pager" aria-hidden="true">${items}</div>`;
}

function renderBooksSkeleton(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const count = options.count || 6;
  setLoadingRegion(container, true);
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="book-card skeleton-card" aria-hidden="true">
      <div class="book-cover skeleton-cover-placeholder"></div>
      <div class="book-meta">
        ${skeletonLine('skeleton-w-xs')}
        ${skeletonLine('skeleton-w-lg')}
        ${skeletonLine('skeleton-w-md')}
        ${skeletonLine('skeleton-w-md')}
        ${skeletonLine('skeleton-w-sm')}
        ${skeletonLine('skeleton-w-xl')}
        <div class="book-actions skeleton-actions">
          ${skeletonButton('skeleton-w-md')}
          ${skeletonButton('skeleton-w-md')}
        </div>
      </div>
    </div>
  `).join('');
  if (options.pagerId) {
    renderPagerSkeleton(options.pagerId, options.pagerCount || 4);
  }
}

function renderModuleListSkeleton(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const count = options.count || 4;
  const lineWidths = Array.isArray(options.lineWidths) && options.lineWidths.length
    ? options.lineWidths
    : ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-xl', 'skeleton-w-md'];
  const actionWidths = Array.isArray(options.actionWidths) ? options.actionWidths : ['skeleton-w-sm'];
  const leadingPill = options.leadingPill === false ? '' : skeletonPill(options.pillWidth || 'skeleton-w-sm');
  const cardClass = options.cardClass ? ` ${options.cardClass}` : '';
  setLoadingRegion(container, true);
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="issued-card module-card skeleton-card${cardClass}" aria-hidden="true">
      <div class="module-copy">
        ${lineWidths.map(width => skeletonLine(width)).join('')}
      </div>
      ${(leadingPill || actionWidths.length) ? `
        <div class="module-actions skeleton-actions">
          ${leadingPill}
          ${actionWidths.map(width => skeletonButton(width)).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');
}

function renderDashboardProfileSkeleton(scope) {
  if (scope === 'admin') {
    setTextSkeleton('adminInfoName', 'skeleton-w-lg');
    setTextSkeleton('adminInfoEmail', 'skeleton-w-lg');
    setTextSkeleton('adminInfoLib', 'skeleton-w-md');
    setTextSkeleton('adminInfoId', 'skeleton-w-xs');
    return;
  }
  if (scope === 'developer') {
    setTextSkeleton('developerInfoName', 'skeleton-w-lg');
    setTextSkeleton('developerInfoEmail', 'skeleton-w-lg');
    setTextSkeleton('developerInfoRole', 'skeleton-w-sm');
    setTextSkeleton('developerInfoId', 'skeleton-w-xs');
    return;
  }
  setTextSkeleton('userInfoName', 'skeleton-w-lg');
  setTextSkeleton('userInfoEmail', 'skeleton-w-lg');
  setTextSkeleton('userInfoId', 'skeleton-w-xs');
}

function renderDeveloperStatsSkeleton() {
  [
    'developerActiveUsersCount',
    'developerTotalUsersCount',
    'developerMemberUsersCount',
    'developerAdminUsersCount',
    'developerDeveloperUsersCount',
  ].forEach(id => setTextSkeleton(id, 'skeleton-w-sm'));
}

function showDashboardSkeleton(scope, keys) {
  const activeKeys = Array.isArray(keys) && keys.length
    ? keys
    : (DASHBOARD_SKELETON_SECTIONS[scope] || []);
  clearDashboardSectionRenderState(scope, activeKeys);

  activeKeys.forEach(key => {
    if (key === 'profile') {
      renderDashboardProfileSkeleton(scope);
      return;
    }
    if (scope === 'developer' && key === 'stats') {
      renderDeveloperStatsSkeleton();
      return;
    }
    if (scope === 'admin') {
      if (key === 'analytics') {
        [
          'adminAnalyticsTotalBooks',
          'adminAnalyticsAvailableCopies',
          'adminAnalyticsActiveLoans',
          'adminAnalyticsPendingBorrows',
          'adminAnalyticsPendingPurchases',
          'adminAnalyticsPendingSlots',
          'adminAnalyticsWaitlistEntries',
          'adminAnalyticsAverageRating',
        ].forEach(id => setTextSkeleton(id, 'skeleton-w-sm'));
        renderModuleListSkeleton('adminAnalyticsTopBooksList', {
          count: 4,
          lineWidths: ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-sm'],
          actionWidths: [],
          leadingPill: false,
        });
        renderModuleListSkeleton('adminAnalyticsRecentReviewsList', {
          count: 4,
          lineWidths: ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-xl'],
          actionWidths: [],
          leadingPill: false,
        });
      } else if (key === 'books') renderBooksSkeleton('adminBooksList', { pagerId: 'adminBooksListPager' });
      else if (key === 'requests') {
        renderModuleListSkeleton('adminIssueRequestsList', {
          lineWidths: ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-xl', 'skeleton-w-md'],
          actionWidths: ['skeleton-w-sm', 'skeleton-w-sm'],
        });
      } else if (key === 'purchaseRequests') {
        renderModuleListSkeleton('adminPurchaseRequestsList', {
          lineWidths: ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-xl', 'skeleton-w-md'],
          actionWidths: ['skeleton-w-sm', 'skeleton-w-sm'],
        });
      } else if (key === 'approvedLoans') {
        setTextSkeleton('approvedLoansCount', 'skeleton-w-sm');
        renderModuleListSkeleton('adminIssuedBooksList', {
          lineWidths: ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-xl', 'skeleton-w-md'],
          actionWidths: [],
          leadingPill: false,
        });
      } else if (key === 'slotBookings') {
        renderModuleListSkeleton('adminSlotBookingsList', {
          lineWidths: ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-sm', 'skeleton-w-xl', 'skeleton-w-md'],
          actionWidths: ['skeleton-w-sm', 'skeleton-w-sm'],
        });
      } else if (key === 'approvedSlots') {
        renderModuleListSkeleton('adminApprovedSlotBookingsList', {
          lineWidths: ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-sm', 'skeleton-w-xl'],
          actionWidths: [],
        });
      }
      return;
    }
    if (scope === 'developer') {
      if (key === 'users') {
        renderModuleListSkeleton('developerUsersActivityList', {
          count: 5,
          cardClass: 'activity-card',
          lineWidths: ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-md', 'skeleton-w-xl'],
          actionWidths: [],
        });
      } else if (key === 'logs') {
        renderModuleListSkeleton('developerActivityLogList', {
          count: 6,
          cardClass: 'activity-card',
          lineWidths: ['skeleton-w-md', 'skeleton-w-xl', 'skeleton-w-lg', 'skeleton-w-xl'],
          actionWidths: [],
          leadingPill: false,
        });
      }
      return;
    }
    if (key === 'books') {
      renderBooksSkeleton('userBooksList', { pagerId: 'userBooksListPager' });
    } else if (key === 'issued') {
      renderModuleListSkeleton('userIssuedList', {
        lineWidths: ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-xl', 'skeleton-w-md'],
        actionWidths: ['skeleton-w-sm'],
        leadingPill: false,
      });
    } else if (key === 'requests') {
      renderModuleListSkeleton('userIssueRequestsList', {
        lineWidths: ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-xl', 'skeleton-w-md'],
        actionWidths: ['skeleton-w-sm'],
      });
    } else if (key === 'purchaseRequests') {
      renderModuleListSkeleton('userPurchaseRequestsList', {
        lineWidths: ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-xl', 'skeleton-w-md'],
        actionWidths: ['skeleton-w-sm'],
      });
    } else if (key === 'slotBookings') {
      renderModuleListSkeleton('userSlotBookingsList', {
        lineWidths: ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-sm', 'skeleton-w-xl'],
        actionWidths: ['skeleton-w-sm'],
      });
    } else if (key === 'approvedSlots') {
      renderModuleListSkeleton('userApprovedSlotBookingsList', {
        lineWidths: ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-sm', 'skeleton-w-xl'],
        actionWidths: ['skeleton-w-sm'],
      });
    } else if (key === 'wishlist') {
      renderBooksSkeleton('userWishlistList');
    } else if (key === 'waitlist') {
      renderModuleListSkeleton('userWaitlistList', {
        lineWidths: ['skeleton-w-lg', 'skeleton-w-md', 'skeleton-w-sm', 'skeleton-w-md'],
        actionWidths: ['skeleton-w-sm'],
      });
    } else if (key === 'notifications') {
      renderModuleListSkeleton('userNotificationsList', {
        count: 5,
        lineWidths: ['skeleton-w-lg', 'skeleton-w-xl', 'skeleton-w-md'],
        actionWidths: ['skeleton-w-sm'],
      });
    }
  });
}

function prefillContactEmailField() {
  const contactEmail = document.getElementById('contactEmail');
  if (!contactEmail) return;
  const preferredEmail = (currentUser && currentUser.email) ||
    (currentAdmin && currentAdmin.email) ||
    (currentDeveloper && currentDeveloper.email) ||
    '';
  if (preferredEmail && !contactEmail.value.trim()) {
    contactEmail.value = preferredEmail;
  }
}

function renderLibraryFilterOptions() {
  const filter = document.getElementById('userLibraryFilter');
  if (!filter) return;
  const currentValue = filter.value;
  const options = ['<option value="">All libraries</option>'].concat(
    getLibraries().map(library =>
      `<option value="${escapeHtml(library.name)}">${escapeHtml(library.name)}</option>`
    )
  );
  filter.innerHTML = options.join('');
  filter.value = currentValue && Array.from(filter.options).some(option => option.value === currentValue)
    ? currentValue
    : '';
}

function getSelectedLibraryFilter() {
  return String(document.getElementById('userLibraryFilter')?.value || '').trim();
}

function syncUserBookSearchStateFromControls() {
  userBookSearchState.query = document.getElementById('userSearchQuery')?.value.trim() || '';
  userBookSearchState.searchType = document.getElementById('userSearchBy')?.value || 'title';
  userBookSearchState.libraryFilter = getSelectedLibraryFilter();
}

function initBrandLoader() {
  const loader = document.getElementById('brandBootLoader');
  const isPending = document.documentElement.classList.contains('brand-loader-pending');
  brandLoaderStartedAt = isPending ? Date.now() : 0;
  if (!loader) return;
  loader.setAttribute('aria-hidden', isPending ? 'false' : 'true');
}

function markBrandLoaderSeen() {
  try {
    window.localStorage.setItem(BRAND_LOADER_STORAGE_KEY, '1');
  } catch (_error) {
    // Ignore storage failures and allow the loader to appear again later.
  }
}

async function releaseBrandLoader(force = false) {
  if (brandLoaderClosingPromise) {
    return brandLoaderClosingPromise;
  }

  const loader = document.getElementById('brandBootLoader');
  const isPending = document.documentElement.classList.contains('brand-loader-pending');
  if (!loader || !isPending) {
    if (loader) loader.setAttribute('aria-hidden', 'true');
    return;
  }

  const elapsed = brandLoaderStartedAt > 0 ? Date.now() - brandLoaderStartedAt : 0;
  const remaining = force ? 0 : Math.max(0, BRAND_LOADER_MIN_DURATION_MS - elapsed);

  brandLoaderClosingPromise = new Promise(resolve => {
    window.setTimeout(() => {
      loader.classList.add('is-leaving');
      window.setTimeout(() => {
        document.documentElement.classList.remove('brand-loader-pending');
        loader.classList.remove('is-leaving');
        loader.setAttribute('aria-hidden', 'true');
        markBrandLoaderSeen();
        brandLoaderClosingPromise = null;
        resolve();
      }, 360);
    }, remaining);
  });

  return brandLoaderClosingPromise;
}

function resetAdminAddBookDraft() {
  adminAddBookDraft.bookId = '';
  adminAddBookDraft.title = '';
  adminAddBookDraft.author = '';
  adminAddBookDraft.readOnlineUrl = '';
  adminAddBookDraft.price = '';
  adminAddBookDraft.total = '';
  adminAddBookDraft.issueTotal = '';
  adminAddBookDraft.slotCopies = '';
  adminAddBookDraft.isDirty = false;
}

function syncAdminAddBookDraftFromControls() {
  adminAddBookDraft.bookId = document.getElementById('addBookId')?.value || '';
  adminAddBookDraft.title = document.getElementById('addBookTitle')?.value || '';
  adminAddBookDraft.author = document.getElementById('addBookAuthor')?.value || '';
  adminAddBookDraft.readOnlineUrl = document.getElementById('addBookReadUrl')?.value || '';
  adminAddBookDraft.price = document.getElementById('addBookPrice')?.value || '';
  adminAddBookDraft.total = document.getElementById('addBookTotal')?.value || '';
  adminAddBookDraft.issueTotal = document.getElementById('addBookIssueTotal')?.value || '';
  adminAddBookDraft.slotCopies = document.getElementById('addBookSlotCopies')?.value || '';
  adminAddBookDraft.isDirty = true;
}

function syncAdminAddBookControls() {
  const nextGeneratedBookId = String(nextBookId());
  const values = adminAddBookDraft.isDirty
    ? {
      bookId: adminAddBookDraft.bookId,
      title: adminAddBookDraft.title,
      author: adminAddBookDraft.author,
      readOnlineUrl: adminAddBookDraft.readOnlineUrl,
      price: adminAddBookDraft.price,
      total: adminAddBookDraft.total,
      issueTotal: adminAddBookDraft.issueTotal,
      slotCopies: adminAddBookDraft.slotCopies,
    }
    : {
      bookId: nextGeneratedBookId,
      title: '',
      author: '',
      readOnlineUrl: '',
      price: '',
      total: '',
      issueTotal: '',
      slotCopies: '',
    };

  if (!adminAddBookDraft.isDirty) {
    adminAddBookDraft.bookId = nextGeneratedBookId;
  }

  const fieldMap = [
    ['addBookId', values.bookId],
    ['addBookTitle', values.title],
    ['addBookAuthor', values.author],
    ['addBookReadUrl', values.readOnlineUrl],
    ['addBookPrice', values.price],
    ['addBookTotal', values.total],
    ['addBookIssueTotal', values.issueTotal],
    ['addBookSlotCopies', values.slotCopies],
  ];

  fieldMap.forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (!input) return;
    const nextValue = String(value ?? '');
    if (input.value !== nextValue) {
      input.value = nextValue;
    }
  });
}

function getFilteredUserBooks() {
  return filterBooksByLibrary(getBooks(), getSelectedLibraryFilter());
}

function resetUserBookSearchState() {
  userBookSearchState.searchType = 'title';
  userBookSearchState.query = '';
  userBookSearchState.libraryFilter = '';
}

function syncUserBookSearchControls() {
  const byInput = document.getElementById('userSearchBy');
  if (byInput) byInput.value = userBookSearchState.searchType || 'title';

  const queryInput = document.getElementById('userSearchQuery');
  if (queryInput && queryInput.value !== userBookSearchState.query) {
    queryInput.value = userBookSearchState.query;
  }

  const libraryFilter = document.getElementById('userLibraryFilter');
  if (!libraryFilter) return;
  const nextValue = userBookSearchState.libraryFilter || '';
  libraryFilter.value = Array.from(libraryFilter.options).some(option => option.value === nextValue)
    ? nextValue
    : '';
}

function getVisibleUserBooks() {
  return searchBooks(
    userBookSearchState.searchType,
    userBookSearchState.query,
    userBookSearchState.libraryFilter
  );
}

function showScreen(id, options = {}) {
  const normalizedId = normalizeScreenIdForAccess(id);
  const previousScreenId = activeScreenId;
  const historyMode = options.historyMode || 'push';
  activeScreenId = normalizedId;
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(normalizedId);
  if (el) el.classList.add('active');
  if (normalizedId === 'contact-page') prefillContactEmailField();
  if (historyMode === 'replace') {
    writeScreenHistoryState(normalizedId, 'replace');
  } else if (historyMode === 'push' && previousScreenId !== normalizedId) {
    writeScreenHistoryState(normalizedId, 'push');
  }
  updateNav();
  updateDashboardPolling();
}

function getPollingTarget() {
  if (document.visibilityState !== 'visible') return '';
  if (currentDeveloper && DEVELOPER_SCREEN_IDS.has(activeScreenId)) return 'developer';
  if (currentAdmin && ADMIN_SCREEN_IDS.has(activeScreenId)) return 'admin';
  if (currentUser && USER_SCREEN_IDS.has(activeScreenId)) return 'user';
  return '';
}

function stopDashboardPolling() {
  if (dashboardPollTimer) {
    window.clearInterval(dashboardPollTimer);
    dashboardPollTimer = null;
  }
  dashboardPollTarget = '';
}

function getDashboardPollingInterval(target) {
  if (target === 'user') return USER_DASHBOARD_POLL_INTERVAL_MS;
  if (target === 'developer') return DEVELOPER_DASHBOARD_POLL_INTERVAL_MS;
  return ADMIN_DASHBOARD_POLL_INTERVAL_MS;
}

function updateDashboardPolling() {
  const target = getPollingTarget();
  if (!target) {
    stopDashboardPolling();
    return;
  }

  if (dashboardPollTimer && dashboardPollTarget === target) {
    return;
  }

  stopDashboardPolling();
  dashboardPollTarget = target;
  dashboardPollTimer = window.setInterval(() => {
    void pollActiveDashboard();
  }, getDashboardPollingInterval(target));
}

async function pollActiveDashboard() {
  const target = getPollingTarget();
  if (!target) {
    stopDashboardPolling();
    return;
  }

  if (dashboardPollTarget !== target) {
    updateDashboardPolling();
  }

  if (dashboardPollInFlight) return;

  dashboardPollInFlight = true;
  try {
    if (target === 'admin') await loadAdminDashboard({ showSkeleton: false });
    else if (target === 'developer') await loadDeveloperDashboard({ showSkeleton: false });
    else await loadUserDashboard({ showSkeleton: false });
    setSaveStatus('API online');
  } catch (error) {
    console.error('Dashboard polling failed:', error);
    setSaveStatus('API offline', true);
  } finally {
    dashboardPollInFlight = false;
    updateDashboardPolling();
  }
}

function showMessage(msg, isError = false) {
  const el = document.getElementById('message');
  if (!el) return;
  el.textContent = msg;
  el.className = 'message ' + (isError ? 'error' : 'success');
  el.style.display = 'block';
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    el.style.display = 'none';
  }, 4000);
}

function setButtonLoading(button, isLoading, loadingText = 'Processing...') {
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }
    const width = button.getBoundingClientRect().width;
    if (width > 0) {
      button.style.width = `${Math.ceil(width)}px`;
    }
    button.disabled = true;
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${loadingText}</span>`;
    return;
  }

  button.disabled = false;
  button.classList.remove('is-loading');
  button.removeAttribute('aria-busy');
  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
  }
  button.style.removeProperty('width');
}

function showButtonResult(button, isSuccess, text, duration = 1500) {
  if (!button) return Promise.resolve();

  button.disabled = true;
  button.classList.remove('is-loading', 'is-success', 'is-error');
  button.classList.add(isSuccess ? 'is-success' : 'is-error');
  button.innerHTML = `<span class="btn-status-icon" aria-hidden="true">${isSuccess ? '&#10003;' : '&#10005;'}</span><span>${text}</span>`;

  return new Promise(resolve => {
    setTimeout(() => {
      button.disabled = false;
      button.classList.remove('is-success', 'is-error');
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
      }
      button.style.removeProperty('width');
      resolve();
    }, duration);
  });
}

function runWithButtonLoading(button, loadingText, work) {
  if (!button) return Promise.resolve().then(work);
  setButtonLoading(button, true, loadingText);
  return new Promise(resolve => requestAnimationFrame(resolve))
    .then(() => work())
    .finally(() => setButtonLoading(button, false));
}

async function runButtonActionWithStatus(button, loadingText, successText, errorText, work) {
  if (!button) {
    return work();
  }

  setButtonLoading(button, true, loadingText);
  try {
    const result = await new Promise(resolve => requestAnimationFrame(resolve)).then(() => work());
    setButtonLoading(button, false);
    await showButtonResult(button, !(result && result.ok === false), (result && result.ok === false) ? errorText : successText);
    return result;
  } catch (error) {
    setButtonLoading(button, false);
    await showButtonResult(button, false, errorText);
    throw error;
  }
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
  const pagerEl = options.pagerId ? document.getElementById(options.pagerId) : null;
  setLoadingRegion(container, false);
  if (pagerEl) setLoadingRegion(pagerEl, false);
  if (!books || books.length === 0) {
    container.innerHTML = '<p class="empty">No books found.</p>';
    container._lastBooks = [];
    container._lastOptions = options;
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
    const isCompactCard = !!options.compactCard;
    const coverUrl = bookCoverDataUri(b);
    const readOnlineAction = isCompactCard
      ? `<button type="button" class="btn btn-sm btn-ghost" data-details="${b.book_id}">Details</button>`
      : renderReadOnlineAction(b);
    const favorite = options.showFavoriteToggle && currentUser
      ? findFavoriteByBookId(currentUser.id, b.book_id)
      : null;
    const waitlistEntry = options.showWaitlist && currentUser
      ? getActiveWaitlistEntryForBook(currentUser.id, b.book_id)
      : null;
    const openSlotBooking = options.showSlot && currentUser
      ? getOpenSlotBookingForBook(currentUser.id, b.book_id)
      : null;
    const slotStatusLabel = openSlotBooking ? String(openSlotBooking.status || 'pending').toLowerCase() : '';
    const slotStatusText = slotStatusLabel ? `Slot ${slotStatusLabel}` : '';
    const slotStatusNote = openSlotBooking
      ? `${formatDate(openSlotBooking.slot_date)} • ${getSlotLabel(openSlotBooking.slot_id)}`
      : '';
    const showWaitlistControl = !!options.showWaitlist && !!currentUser && (!!waitlistEntry || Number(b.available_copies) < 1);
    const slotAction = !options.showSlot || b.slot_booking_copies < 1
      ? ''
      : isCompactCard
        ? `<button type="button" class="btn btn-sm" data-slot="${b.book_id}">${openSlotBooking ? 'Slot Status' : 'Request Slot'}</button>`
      : openSlotBooking
        ? `
          <div class="book-slot-summary">
            <span class="status-pill ${requestStatusClass(slotStatusLabel)}">${escapeHtml(slotStatusText)}</span>
            <span class="book-slot-note">${escapeHtml(slotStatusNote)}</span>
          </div>
        `
        : `<button type="button" class="btn btn-sm" data-slot="${b.book_id}">Request Slot</button>`;
    const waitlistAction = !showWaitlistControl
      ? ''
      : isCompactCard
        ? `<button type="button" class="btn btn-sm" data-waitlist="${b.book_id}">${waitlistEntry ? 'Waitlist Status' : 'Join Waitlist'}</button>`
      : waitlistEntry
        ? `
          <div class="book-waitlist-summary">
            <span class="status-pill ${requestStatusClass(waitlistEntry.status)}">Waitlist ${escapeHtml(waitlistEntry.status)}</span>
            <span class="book-slot-note">${waitlistEntry.position ? `Position ${waitlistEntry.position}` : 'Waiting for update'}</span>
          </div>
        `
        : `<button type="button" class="btn btn-sm" data-waitlist="${b.book_id}">Join Waitlist</button>`;
    const requestDisabled = !isCompactCard && options.showRequest && b.available_copies < 1 ? 'disabled' : '';
    const availabilityBadgeClass = Number(b.available_copies || 0) > 0 ? 'available' : 'unavailable';
    const availabilityBadgeText = Number(b.available_copies || 0) > 0
      ? `${Number(b.available_copies || 0)} available now`
      : 'All issue copies are out';
    const ratingBadgeText = Number(b.review_count || 0) > 0
      ? `${Number(b.average_rating || 0).toFixed(1)} / 5`
      : 'No reviews yet';
    const metaMarkup = isCompactCard
      ? `
        <div class="book-id">#${b.book_id}</div>
        <h3>${escapeHtml(b.title)}</h3>
        <p class="author">${escapeHtml(b.author)}</p>
        <p class="lib">${escapeHtml(b.lib)}</p>
        <div class="book-badge-row">
          <span class="book-badge ${availabilityBadgeClass}">${escapeHtml(availabilityBadgeText)}</span>
          <span class="book-badge neutral">${escapeHtml(ratingBadgeText)}</span>
        </div>
      `
      : `
        <div class="book-id">#${b.book_id}</div>
        <h3>${escapeHtml(b.title)}</h3>
        <p class="author">${escapeHtml(b.author)}</p>
        <p class="lib">${escapeHtml(b.lib)}</p>
        <p class="price">Purchase price: Rs ${Number(b.purchase_price || 0).toFixed(2)}</p>
        <p class="book-statline">Rating: ${Number(b.average_rating || 0).toFixed(1)} / 5 from ${Number(b.review_count || 0)} review(s)</p>
        <p class="book-statline">Wishlist: ${Number(b.favorite_count || 0)} saved • Waitlist: ${Number(b.waitlist_count || 0)} active</p>
        <p class="copies">Issue available: ${b.available_copies} / ${b.issue_total_copies}</p>
        <p class="copies">Slot-booking copies: ${b.slot_booking_copies} per day</p>
        <p class="copies">Total copies: ${b.total_copies}</p>
      `;
    return `
    <div class="book-card" data-book-id="${b.book_id}">
      <div class="book-cover" style="${bookCoverStyle(b)}">
        <img class="book-cover-img" src="${coverUrl}" alt="${escapeHtml(b.title)} cover" loading="lazy">
      </div>
      <div class="book-meta${isCompactCard ? ' compact' : ''}">
        ${metaMarkup}
        <div class="book-actions${isCompactCard ? ' compact' : ''}">
          ${options.showRequest ? `<button type="button" class="btn btn-sm" data-request="${b.book_id}" ${requestDisabled}>${isCompactCard ? 'Request Issue' : (b.available_copies > 0 ? 'Request Issue' : 'Issue Unavailable')}</button>` : ''}
          ${options.showPurchase ? `<button type="button" class="btn btn-sm" data-purchase="${b.book_id}">Request Purchase</button>` : ''}
          ${slotAction}
          ${waitlistAction}
          ${options.showFavoriteToggle && currentUser ? `<button type="button" class="btn btn-sm${favorite ? ' is-active' : ''}" data-favorite="${b.book_id}">${favorite ? 'Saved' : 'Save'}</button>` : ''}
          ${options.showReviews ? `<button type="button" class="btn btn-sm btn-ghost" data-reviews="${b.book_id}">Reviews</button>` : ''}
          ${readOnlineAction}
          ${options.showEdit ? `<button type="button" class="btn btn-sm" data-edit="${b.book_id}">Edit</button>` : ''}
          ${options.showDelete ? `<button type="button" class="btn btn-sm danger" data-delete="${b.book_id}">Delete</button>` : ''}
        </div>
      </div>
    </div>
  `;
  }).join('');

  if (options.onRequest) {
    container.querySelectorAll('[data-request]').forEach(btn => {
      btn.addEventListener('click', () => options.onRequest(parseInt(btn.dataset.request, 10), btn));
    });
  }
  if (options.onPurchase) {
    container.querySelectorAll('[data-purchase]').forEach(btn => {
      btn.addEventListener('click', () => options.onPurchase(parseInt(btn.dataset.purchase, 10), btn));
    });
  }
  if (options.onSlot) {
    container.querySelectorAll('[data-slot]').forEach(btn => {
      btn.addEventListener('click', () => options.onSlot(parseInt(btn.dataset.slot, 10)));
    });
  }
  if (options.onWaitlist) {
    container.querySelectorAll('[data-waitlist]').forEach(btn => {
      btn.addEventListener('click', () => options.onWaitlist(parseInt(btn.dataset.waitlist, 10), btn));
    });
  }
  if (options.onFavoriteToggle) {
    container.querySelectorAll('[data-favorite]').forEach(btn => {
      btn.addEventListener('click', () => options.onFavoriteToggle(parseInt(btn.dataset.favorite, 10), btn));
    });
  }
  if (options.onReviews) {
    container.querySelectorAll('[data-reviews]').forEach(btn => {
      btn.addEventListener('click', () => options.onReviews(parseInt(btn.dataset.reviews, 10), btn));
    });
  }
  if (options.onDetails) {
    container.querySelectorAll('[data-details]').forEach(btn => {
      btn.addEventListener('click', () => options.onDetails(parseInt(btn.dataset.details, 10), btn));
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

function requestStatusClass(status) {
  switch (String(status || '').toLowerCase()) {
    case 'approved':
    case 'fulfilled':
    case 'notified':
      return 'approved';
    case 'rejected':
    case 'expired':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

function renderIssueRequestsList(containerId, requests, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  setLoadingRegion(container, false);

  if (!requests || requests.length === 0) {
    container.innerHTML = `<p class="empty">${escapeHtml(options.emptyText || 'No pending requests.')}</p>`;
    return;
  }

  container.innerHTML = requests.map((request, index) => {
    const book = searchBooksById(request.book_id);
    const readOnlineAction = renderReadOnlineAction(book);
    const user = getUserById(request.student_id);
    const userName = request.user_name || (user ? user.name : 'Unknown user');
    const userEmail = request.user_email || (user ? user.email : 'No email');
    const title = book ? book.title : `Book #${request.book_id}`;
    const author = book ? book.author : 'Unknown author';
    const lib = request.lib || (book ? book.lib : 'Unknown library');
    const statusLabel = options.statusText || request.status || null;
    return `
      <div class="issued-card module-card">
        <div class="module-copy">
          <strong>${escapeHtml(title)}</strong>
          <div class="module-meta">Book ID: ${request.book_id} • Student ID: ${request.student_id}</div>
          ${options.showUserDetails ? `<div class="module-meta">User: ${escapeHtml(userName)} • ${escapeHtml(userEmail)}</div>` : ''}
          <div class="module-meta">${escapeHtml(author)} • ${escapeHtml(lib)}</div>
          <div class="module-meta">Requested on ${formatDate(request.request_date)}</div>
        </div>
        <div class="module-actions">
          ${statusLabel ? `<span class="status-pill ${requestStatusClass(statusLabel)}">${escapeHtml(statusLabel)}</span>` : ''}
          ${readOnlineAction}
          ${options.showApprove ? `<button type="button" class="btn btn-sm" data-approve="${index}">Approve</button>` : ''}
          ${options.showReject ? `<button type="button" class="btn btn-sm danger" data-reject="${index}">Reject</button>` : ''}
          ${options.showCancel && String(request.status || '').toLowerCase() === 'pending' ? `<button type="button" class="btn btn-sm danger" data-cancel-request="${index}">Cancel Request</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (options.onApprove) {
    container.querySelectorAll('[data-approve]').forEach(button => {
      button.addEventListener('click', () => {
        const request = requests[parseInt(button.dataset.approve, 10)];
        options.onApprove(request, button);
      });
    });
  }

  if (options.onReject) {
    container.querySelectorAll('[data-reject]').forEach(button => {
      button.addEventListener('click', () => {
        const request = requests[parseInt(button.dataset.reject, 10)];
        options.onReject(request, button);
      });
    });
  }

  if (options.onCancel) {
    container.querySelectorAll('[data-cancel-request]').forEach(button => {
      button.addEventListener('click', () => {
        const request = requests[parseInt(button.dataset.cancelRequest, 10)];
        options.onCancel(request, button);
      });
    });
  }
}

function renderPurchaseRequestsList(containerId, requests, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  setLoadingRegion(container, false);

  if (!requests || requests.length === 0) {
    container.innerHTML = `<p class="empty">${escapeHtml(options.emptyText || 'No purchase requests found.')}</p>`;
    return;
  }

  container.innerHTML = requests.map((request, index) => {
    const book = searchBooksById(request.book_id);
    const readOnlineAction = renderReadOnlineAction(book);
    const user = getUserById(request.student_id);
    const userName = request.user_name || (user ? user.name : 'Unknown user');
    const userEmail = request.user_email || (user ? user.email : 'No email');
    const title = book ? book.title : `Book #${request.book_id}`;
    const author = book ? book.author : 'Unknown author';
    const lib = request.lib || (book ? book.lib : 'Unknown library');
    const statusLabel = options.statusText || request.status || null;
    return `
      <div class="issued-card module-card">
        <div class="module-copy">
          <strong>${escapeHtml(title)}</strong>
          <div class="module-meta">Book ID: ${request.book_id} • Student ID: ${request.student_id}</div>
          ${options.showUserDetails ? `<div class="module-meta">User: ${escapeHtml(userName)} • ${escapeHtml(userEmail)}</div>` : ''}
          <div class="module-meta">${escapeHtml(author)} • ${escapeHtml(lib)}</div>
          <div class="module-meta">Requested on ${formatDate(request.request_date)} • Rs ${Number(request.requested_price || 0).toFixed(2)}</div>
        </div>
        <div class="module-actions">
          ${statusLabel ? `<span class="status-pill ${requestStatusClass(statusLabel)}">${escapeHtml(statusLabel)}</span>` : ''}
          ${readOnlineAction}
          ${options.showApprove ? `<button type="button" class="btn btn-sm" data-approve-purchase="${index}">Approve</button>` : ''}
          ${options.showReject ? `<button type="button" class="btn btn-sm danger" data-reject-purchase="${index}">Reject</button>` : ''}
          ${options.showCancel && String(request.status || '').toLowerCase() === 'pending' ? `<button type="button" class="btn btn-sm danger" data-cancel-purchase="${index}">Cancel Request</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (options.onApprove) {
    container.querySelectorAll('[data-approve-purchase]').forEach(button => {
      button.addEventListener('click', () => {
        const request = requests[parseInt(button.dataset.approvePurchase, 10)];
        options.onApprove(request, button);
      });
    });
  }

  if (options.onReject) {
    container.querySelectorAll('[data-reject-purchase]').forEach(button => {
      button.addEventListener('click', () => {
        const request = requests[parseInt(button.dataset.rejectPurchase, 10)];
        options.onReject(request, button);
      });
    });
  }

  if (options.onCancel) {
    container.querySelectorAll('[data-cancel-purchase]').forEach(button => {
      button.addEventListener('click', () => {
        const request = requests[parseInt(button.dataset.cancelPurchase, 10)];
        options.onCancel(request, button);
      });
    });
  }
}

function renderSlotBookingsList(containerId, slotBookings, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  setLoadingRegion(container, false);

  if (!slotBookings || slotBookings.length === 0) {
    container.innerHTML = `<p class="empty">${escapeHtml(options.emptyText || 'No slot bookings found.')}</p>`;
    return;
  }

  container.innerHTML = slotBookings.map((booking, index) => {
    const book = searchBooksById(booking.book_id);
    const readOnlineAction = renderReadOnlineAction(book);
    const user = getUserById(booking.student_id);
    const userName = booking.user_name || (user ? user.name : 'Unknown user');
    const userEmail = booking.user_email || (user ? user.email : 'No email');
    const title = book ? book.title : `Book #${booking.book_id}`;
    const lib = booking.lib || (book ? book.lib : 'Unknown library');
    const statusLabel = booking.status || 'pending';
    const normalizedStatus = String(statusLabel).toLowerCase();
    const isPending = normalizedStatus === 'pending';
    const canCancel = isSlotBookingOpenStatus(statusLabel);
    const bookingLineLabel = normalizedStatus === 'approved' ? 'Booked for' : 'Requested for';
    return `
      <div class="issued-card module-card">
        <div class="module-copy">
          <strong>${escapeHtml(title)}</strong>
          <div class="module-meta">Book ID: ${booking.book_id} • Student ID: ${booking.student_id}</div>
          ${options.showUserDetails ? `<div class="module-meta">User: ${escapeHtml(userName)} • ${escapeHtml(userEmail)}</div>` : ''}
          <div class="module-meta">${escapeHtml(lib)}</div>
          ${booking.request_date ? `<div class="module-meta">Requested on ${formatDate(booking.request_date)}</div>` : ''}
          <div class="module-meta">${bookingLineLabel} ${formatDate(booking.slot_date)} • ${escapeHtml(getSlotLabel(booking.slot_id))}</div>
          ${booking.rejection_reason ? `<div class="module-meta">Reason: ${escapeHtml(booking.rejection_reason)}</div>` : ''}
        </div>
        <div class="module-actions">
          <span class="status-pill ${requestStatusClass(statusLabel)}">${escapeHtml(statusLabel)}</span>
          ${readOnlineAction}
          ${options.showApprove && isPending ? `<button type="button" class="btn btn-sm" data-approve-slot="${index}">Approve</button>` : ''}
          ${options.showReject && isPending ? `<button type="button" class="btn btn-sm danger" data-reject-slot="${index}">Reject</button>` : ''}
          ${options.showCancel && canCancel ? `<button type="button" class="btn btn-sm danger" data-cancel-slot="${index}">Cancel Slot</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (options.onApprove) {
    container.querySelectorAll('[data-approve-slot]').forEach(button => {
      button.addEventListener('click', () => {
        const booking = slotBookings[parseInt(button.dataset.approveSlot, 10)];
        options.onApprove(booking, button);
      });
    });
  }

  if (options.onReject) {
    container.querySelectorAll('[data-reject-slot]').forEach(button => {
      button.addEventListener('click', () => {
        const booking = slotBookings[parseInt(button.dataset.rejectSlot, 10)];
        options.onReject(booking, button);
      });
    });
  }

  if (options.onCancel) {
    container.querySelectorAll('[data-cancel-slot]').forEach(button => {
      button.addEventListener('click', () => {
        const booking = slotBookings[parseInt(button.dataset.cancelSlot, 10)];
        options.onCancel(booking, button);
      });
    });
  }
}

function renderWaitlistEntriesList(containerId, entries, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  setLoadingRegion(container, false);

  if (!entries || entries.length === 0) {
    container.innerHTML = `<p class="empty">${escapeHtml(options.emptyText || 'No waitlist entries found.')}</p>`;
    return;
  }

  container.innerHTML = entries.map((entry, index) => {
    const book = searchBooksById(entry.book_id);
    const title = book ? book.title : `Book #${entry.book_id}`;
    const lib = entry.lib || (book ? book.lib : 'Unknown library');
    const positionLine = entry.position ? `Position ${entry.position}` : 'Position pending';
    const notifiedLine = entry.notified_at ? `Notified on ${escapeHtml(formatDateTime(entry.notified_at))}` : '';
    return `
      <div class="issued-card module-card">
        <div class="module-copy">
          <strong>${escapeHtml(title)}</strong>
          <div class="module-meta">Book ID: ${entry.book_id} • ${escapeHtml(lib)}</div>
          <div class="module-meta">${escapeHtml(positionLine)}</div>
          <div class="module-meta">Joined on ${escapeHtml(formatDateTime(entry.created_at))}</div>
          ${notifiedLine ? `<div class="module-meta">${notifiedLine}</div>` : ''}
        </div>
        <div class="module-actions">
          <span class="status-pill ${requestStatusClass(entry.status)}">${escapeHtml(entry.status)}</span>
          ${options.showCancel && String(entry.status).toLowerCase() === 'waiting' ? `<button type="button" class="btn btn-sm danger" data-cancel-waitlist="${index}">Cancel</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (options.onCancel) {
    container.querySelectorAll('[data-cancel-waitlist]').forEach(button => {
      button.addEventListener('click', () => {
        const entry = entries[parseInt(button.dataset.cancelWaitlist, 10)];
        options.onCancel(entry, button);
      });
    });
  }
}

function renderNotificationsList(containerId, notifications, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  setLoadingRegion(container, false);

  if (!notifications || notifications.length === 0) {
    container.innerHTML = `<p class="empty">${escapeHtml(options.emptyText || 'No notifications yet.')}</p>`;
    return;
  }

  container.innerHTML = notifications.map((item, index) => `
    <div class="issued-card module-card notification-card${item.is_read ? '' : ' notification-unread'}">
      <div class="module-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <div class="module-meta">${escapeHtml(formatDateTime(item.created_at))} • ${escapeHtml(item.category)}</div>
        <div class="module-meta">${escapeHtml(item.message)}</div>
        ${item.book_title ? `<div class="module-meta">${escapeHtml(item.book_title)}${item.lib ? ` • ${escapeHtml(item.lib)}` : ''}</div>` : ''}
      </div>
      <div class="module-actions">
        <span class="status-pill ${item.is_read ? 'approved' : 'pending'}">${item.is_read ? 'Read' : 'Unread'}</span>
        ${options.showMarkRead && !item.is_read ? `<button type="button" class="btn btn-sm" data-mark-read="${index}">Mark Read</button>` : ''}
      </div>
    </div>
  `).join('');

  if (options.onMarkRead) {
    container.querySelectorAll('[data-mark-read]').forEach(button => {
      button.addEventListener('click', () => {
        const item = notifications[parseInt(button.dataset.markRead, 10)];
        options.onMarkRead(item, button);
      });
    });
  }
}

function renderAdminTopBooksList(containerId, books) {
  const container = document.getElementById(containerId);
  if (!container) return;
  setLoadingRegion(container, false);

  if (!books || books.length === 0) {
    container.innerHTML = '<p class="empty">No analytics highlights yet.</p>';
    return;
  }

  container.innerHTML = books.map(book => `
    <div class="issued-card module-card">
      <div class="module-copy">
        <strong>${escapeHtml(book.title || `Book #${book.book_id}`)}</strong>
        <div class="module-meta">${escapeHtml(book.author || 'Unknown author')}</div>
        <div class="module-meta">Loans: ${Number(book.loan_count || 0)} • Pending requests: ${Number(book.pending_borrow_requests || 0)}</div>
        <div class="module-meta">Waitlist: ${Number(book.waitlist_count || 0)} • Reviews: ${Number(book.review_count || 0)}</div>
      </div>
      <div class="module-actions">
        <span class="status-pill approved">${Number(book.average_rating || 0).toFixed(1)} / 5</span>
      </div>
    </div>
  `).join('');
}

function renderAdminRecentReviewsList(containerId, reviews) {
  const container = document.getElementById(containerId);
  if (!container) return;
  setLoadingRegion(container, false);

  if (!reviews || reviews.length === 0) {
    container.innerHTML = '<p class="empty">No book reviews have been submitted yet.</p>';
    return;
  }

  container.innerHTML = reviews.map(review => `
    <div class="issued-card module-card">
      <div class="module-copy">
        <strong>${escapeHtml(review.book_title || `Book #${review.book_id}`)}</strong>
        <div class="module-meta">${escapeHtml(review.user_name || 'Unknown member')} • ${escapeHtml(formatDateTime(review.updated_at || review.created_at))}</div>
        <div class="module-meta review-stars">Rating: ${'★'.repeat(Math.max(0, Math.min(5, review.rating || 0)))}${'☆'.repeat(Math.max(0, 5 - Math.max(0, Math.min(5, review.rating || 0))))}</div>
        <div class="module-meta">${escapeHtml(review.review_text || 'No written comment provided.')}</div>
      </div>
    </div>
  `).join('');
}

function renderIssuedRecordsList(containerId, issuedRecords, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  setLoadingRegion(container, false);

  if (!issuedRecords || issuedRecords.length === 0) {
    container.innerHTML = `<p class="empty">${escapeHtml(options.emptyText || 'No issued books found.')}</p>`;
    return;
  }

  container.innerHTML = issuedRecords.map(record => {
    const book = searchBooksById(record.book_id);
    const readOnlineAction = renderReadOnlineAction(book);
    const user = getUserById(record.student_id);
    const userName = record.user_name || (user ? user.name : 'Unknown user');
    const userEmail = record.user_email || (user ? user.email : 'No email');
    const title = book ? book.title : `Book #${record.book_id}`;
    const lib = record.lib || (book ? book.lib : 'Unknown library');
    return `
      <div class="issued-card module-card">
        <div class="module-copy">
          <strong>${escapeHtml(title)}</strong>
          <div class="module-meta">Book ID: ${record.book_id} • Student ID: ${record.student_id}</div>
          <div class="module-meta">User: ${escapeHtml(userName)} • ${escapeHtml(userEmail)}</div>
          <div class="module-meta">${escapeHtml(lib)}</div>
          <div class="module-meta">Issue period: ${formatDate(record.issue_date)} to ${formatDate(record.due_date)}</div>
        </div>
        <div class="module-actions">
          ${readOnlineAction}
        </div>
      </div>
    `;
  }).join('');
}

function renderDeveloperUsersList(containerId, users) {
  const container = document.getElementById(containerId);
  if (!container) return;
  setLoadingRegion(container, false);

  if (!users || users.length === 0) {
    container.innerHTML = '<p class="empty">No user activity found.</p>';
    return;
  }

  container.innerHTML = users.map(user => {
    const statusLabel = user.is_currently_active ? 'Active now' : (user.is_active ? 'Idle' : 'Disabled');
    const statusClass = user.is_currently_active ? 'approved' : (user.is_active ? 'pending' : 'cancelled');
    const lastSeen = user.last_seen_at ? new Date(user.last_seen_at).toLocaleString() : 'Never';
    const lastLogin = user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never';
    return `
      <div class="issued-card module-card activity-card">
        <div class="module-copy">
          <strong>${escapeHtml(user.full_name || `User #${user.user_id}`)}</strong>
          <div class="module-meta">User ID: ${user.user_id} • Role: ${escapeHtml(user.role || 'unknown')}</div>
          <div class="module-meta">${escapeHtml(user.email || 'No email')}</div>
          <div class="module-meta">Last login: ${escapeHtml(lastLogin)}</div>
          <div class="module-meta">Last seen: ${escapeHtml(lastSeen)}</div>
          <div class="module-meta">Last API: ${escapeHtml(user.last_method || '-')} ${escapeHtml(user.last_path || '')}</div>
        </div>
        <div class="module-actions">
          <span class="status-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function developerUserStatus(user) {
  if (user.is_currently_active) return 'active';
  if (user.is_active) return 'idle';
  return 'disabled';
}

function summarizeDeveloperLogResponse(value) {
  if (!value || typeof value !== 'object') return '';
  const serialized = JSON.stringify(value);
  if (!serialized) return '';
  return serialized.length > 220 ? `${serialized.slice(0, 217)}...` : serialized;
}

function renderDeveloperLogsList(containerId, logs) {
  const container = document.getElementById(containerId);
  if (!container) return;
  setLoadingRegion(container, false);

  if (!logs || logs.length === 0) {
    container.innerHTML = '<p class="empty">No audit log entries found yet.</p>';
    return;
  }

  container.innerHTML = logs.map(log => {
    const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Unknown time';
    const actor = log.actor_email || `User #${log.actor_id || 'unknown'}`;
    const responseSummary = summarizeDeveloperLogResponse(log.response);
    return `
      <div class="issued-card module-card activity-card">
        <div class="module-copy">
          <strong>${escapeHtml(actor)}</strong>
          <div class="activity-meta">${escapeHtml(timestamp)} • ${escapeHtml(log.method || '')} • Status ${escapeHtml(String(log.status_code || ''))}</div>
          <div class="log-path">${escapeHtml(log.path || log.route || 'Unknown path')}</div>
          <div class="activity-meta">Session: ${escapeHtml(log.session_id || 'n/a')} • Action: ${escapeHtml(log.action || 'n/a')}</div>
          ${responseSummary ? `<div class="activity-meta activity-response">Response: ${escapeHtml(responseSummary)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function setApprovedLoansPanelState(isOpen) {
  approvedLoansPanelOpen = !!isOpen;
  const toggle = document.getElementById('approvedLoansToggle');
  const panel = document.getElementById('approvedLoansPanel');
  if (!toggle || !panel) return;
  toggle.setAttribute('aria-expanded', approvedLoansPanelOpen ? 'true' : 'false');
  panel.classList.toggle('open', approvedLoansPanelOpen);
}

function updateApprovedLoansSummary(records) {
  const count = Array.isArray(records) ? records.length : 0;
  setTextIfChanged('approvedLoansCount', `${count} active`);
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
  const contactBtn = document.getElementById('navContact');
  if (contactBtn) {
    contactBtn.onclick = () => showScreen('contact-page');
  }
  const loginBtn = document.getElementById('navLogin');
  if (loginBtn) loginBtn.onclick = () => showScreen('user-login');
  const signupBtn = document.getElementById('navSignup');
  if (signupBtn) signupBtn.onclick = () => showScreen('user-register');
  const dashBtn = document.getElementById('navDashboard');
  if (dashBtn) {
    dashBtn.onclick = () => {
      if (currentDeveloper) {
        showScreen('developer-dashboard');
        void loadDeveloperDashboard();
      }
      else if (currentAdmin) {
        showScreen('admin-dashboard');
        void loadAdminDashboard();
      }
      else if (currentUser) {
        showScreen('user-dashboard');
        void loadUserDashboard();
      }
      else showScreen('user-login');
    };
  }
  const logoutBtn = document.getElementById('navLogout');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await logoutCurrentSession();
      clearAuthenticatedIdentity();
      pendingSlotCancellationBooking = null;
      currentReviewBookId = null;
      closeBookActionModal();
      closeReviewModal();
      resetUserBookSearchState();
      resetAdminAddBookDraft();
      pendingReg = null;
      pendingPasswordResetEmail = null;
      startAuditSession();
      saveFavorites([]);
      saveWaitlistEntries([]);
      saveNotifications([]);
      saveAdminTopBooks([]);
      saveAdminRecentReviews([]);
      apiState.userMetrics = {};
      apiState.adminMetrics = {};
      resetDashboardRenderState();
      showScreen('home');
      updateNav();
    };
  }
  updateNav();
}

function initContactPage() {
  const contactForm = document.getElementById('contactForm');
  if (!contactForm) return;

  contactForm.onsubmit = (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('contactEmail');
    const submitButton = e.submitter || contactForm.querySelector('button[type="submit"]');
    const email = emailInput.value.trim();
    const subject = document.getElementById('contactSubject').value.trim();
    const body = document.getElementById('contactBody').value.trim();
    if (!email || !subject || !body) {
      showMessage('Please fill in your email, subject, and message.', true);
      return;
    }
    if (!isAllowedContactEmail(email)) {
      if (emailInput) emailInput.focus();
      showMessage('Only @gmail.com email addresses are allowed in the contact form.', true);
      return;
    }

    runWithButtonLoading(submitButton, 'Sending...', () =>
      sendContactMessage({
        from_email: email,
        subject,
        body,
      }).then(result => {
        if (!result.ok) {
          return showButtonResult(submitButton, false, 'Failed');
        }
        contactForm.reset();
        prefillContactEmailField();
        return showButtonResult(submitButton, true, 'Sent');
      }).catch(() => {
        return showButtonResult(submitButton, false, 'Failed');
      })
    );
  };
}

function initAdminRegister() {
  document.getElementById('adminRegBack').onclick = () => showScreen('auth-register');
  document.getElementById('adminRegForm').onsubmit = (e) => {
    e.preventDefault();
    const submitButton = e.submitter || e.target.querySelector('button[type="submit"]');
    const name = document.getElementById('adminRegName').value.trim();
    const email = document.getElementById('adminRegEmail').value.trim();
    const password = document.getElementById('adminRegPassword').value;
    const lib = document.getElementById('adminRegLib').value.trim();
    if (!name || !email || !password || !lib) { showMessage('Fill all fields', true); return; }
    runWithButtonLoading(submitButton, 'Sending OTP...', () =>
      sendOtpToEmail(email).then((sendResult) => {
        if (!sendResult.sent && !sendResult.fallbackOtp) {
          showMessage(sendResult.message || 'Failed to send OTP.', true);
          return;
        }
        pendingReg = { type: 'admin', name, email, password, lib };
        const emailEl = document.getElementById('adminOtpEmail');
        const hintEl = document.getElementById('adminOtpDevHint');
        const inputEl = document.getElementById('adminOtpInput');
        if (!emailEl || !hintEl || !inputEl) { showMessage('OTP screen error', true); return; }
        emailEl.textContent = email;
        hintEl.textContent = sendResult.fallbackOtp
          ? `${sendResult.message} Demo OTP: ${sendResult.fallbackOtp}`
          : (sendResult.message || 'Check your email for the 6-digit OTP code.');
        inputEl.value = '';
        showScreen('admin-register-otp');
        showMessage(sendResult.fallbackOtp
          ? 'Demo OTP generated for admin registration.'
          : (sendResult.message || 'OTP sent to your email. Please check your inbox.'));
      }).catch(err => {
        console.error('OTP error:', err);
        showMessage('Failed to send OTP: ' + (err.message || 'Check if email server is running'), true);
      })
    );
  };
}

function initAdminRegisterOtp() {
  const adminOtpBack = document.getElementById('adminOtpBack');
  const adminOtpForm = document.getElementById('adminOtpForm');
  if (!adminOtpBack || !adminOtpForm) return; // OTP screen not in DOM
  adminOtpBack.onclick = () => { pendingReg = null; showScreen('admin-register'); };
  adminOtpForm.onsubmit = (e) => {
    e.preventDefault();
    const submitButton = e.submitter || adminOtpForm.querySelector('button[type="submit"]');
    const input = document.getElementById('adminOtpInput').value.trim();
    if (!pendingReg || pendingReg.type !== 'admin') { showScreen('home'); return; }
    runWithButtonLoading(submitButton, 'Verifying...', () =>
      verifyOtpWithBackend(pendingReg.email, input).then(async verifyResult => {
        if (!verifyResult.ok) { showMessage(verifyResult.msg || 'Invalid OTP', true); return; }
        const result = await registerAdmin(pendingReg.name, pendingReg.email, pendingReg.password, pendingReg.lib);
        pendingReg = null;
        if (result.ok) {
          showMessage('Registration successful');
          document.getElementById('adminRegForm').reset();
          document.getElementById('adminOtpForm').reset();
          await applyAuthenticatedIdentity(result.admin, { openDashboard: true });
        }
        else showMessage(result.msg, true);
      })
    );
  };
}

function openEditBookModal(bookId) {
  const book = searchBooksById(bookId);
  if (!book) return;
  document.getElementById('editBookId').textContent = '#' + book.book_id;
  document.getElementById('editBookTitle').value = book.title || '';
  document.getElementById('editBookAuthor').value = book.author || '';
  document.getElementById('editBookReadUrl').value = book.read_online_url || '';
  document.getElementById('editBookAvailable').value = String(book.available_copies ?? 0);
  document.getElementById('editBookIssueTotal').value = String(book.issue_total_copies ?? 0);
  document.getElementById('editBookSlotCopies').value = String(book.slot_booking_copies ?? 0);
  document.getElementById('editBookTotal').value = String(book.total_copies ?? 0);
  document.getElementById('editBookForm').dataset.editBookId = String(book.book_id);
  const modal = document.getElementById('editBookModal');
  if (modal) { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); }
}

function closeEditBookModal() {
  const modal = document.getElementById('editBookModal');
  if (modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
}

async function loadAdminDashboard(options = {}) {
  if (!currentAdmin) return;
  if (adminDashboardLoadPromise) return adminDashboardLoadPromise;
  const shouldShowSkeleton = options.showSkeleton ?? !dashboardHydrationState.admin;
  if (shouldShowSkeleton) {
    showDashboardSkeleton('admin', options.skeletonKeys);
  }

  adminDashboardLoadPromise = (async () => {
    await refreshCatalogData();
    await refreshAdminDashboardData(currentAdmin);
    setTextIfChanged('adminInfoName', currentAdmin.name);
    setTextIfChanged('adminInfoLib', currentAdmin.lib);
    setTextIfChanged('adminInfoId', currentAdmin.id);
    setTextIfChanged('adminInfoEmail', currentAdmin.email);
    syncAdminAddBookControls();
    const analytics = apiState.adminMetrics || {};
    setTextIfChanged('adminAnalyticsTotalBooks', analytics.total_books || 0);
    setTextIfChanged('adminAnalyticsAvailableCopies', analytics.available_issue_copies || 0);
    setTextIfChanged('adminAnalyticsActiveLoans', analytics.active_loans || 0);
    setTextIfChanged('adminAnalyticsPendingBorrows', analytics.pending_borrow_requests || 0);
    setTextIfChanged('adminAnalyticsPendingPurchases', analytics.pending_purchase_requests || 0);
    setTextIfChanged('adminAnalyticsPendingSlots', analytics.pending_slot_requests || 0);
    setTextIfChanged('adminAnalyticsWaitlistEntries', analytics.active_waitlist_entries || 0);
    setTextIfChanged('adminAnalyticsAverageRating', Number(analytics.average_rating || 0).toFixed(1));
    renderDashboardSection('admin', 'analytics', `${currentAdmin.id}:${JSON.stringify(analytics || {})}:${buildAdminTopBooksSignature(getAdminTopBooks())}:${buildReviewSignature(getAdminRecentReviews())}`, () => {
      renderAdminTopBooksList('adminAnalyticsTopBooksList', getAdminTopBooks());
      renderAdminRecentReviewsList('adminAnalyticsRecentReviewsList', getAdminRecentReviews());
    });
    const books = booksForLibrary(currentAdmin.lib);
    renderDashboardSection('admin', 'books', `${currentAdmin.id}:${buildBooksSignature(books)}`, () => {
      renderBooksList('adminBooksList', books, {
        showEdit: true,
        showDelete: true,
        pagerId: 'adminBooksListPager',
        pagination: true,
        onEdit: (id) => openEditBookModal(id),
        onDelete: (id) => {
          const ok = window.confirm(`Do you really want to delete Book ID ${id}?`);
          if (!ok) return;
          void deleteBook(id).then(async deleted => {
            if (!deleted) {
              showMessage('Book delete failed', true);
              return;
            }
            showMessage('Book deleted');
            await loadAdminDashboard();
          });
        }
      });
    });

    const adminRequests = getIssueRequestsForAdmin(currentAdmin.lib);
    renderDashboardSection('admin', 'requests', `${currentAdmin.id}:${buildBorrowRequestsSignature(adminRequests)}`, () => {
      renderIssueRequestsList('adminIssueRequestsList', adminRequests, {
        emptyText: 'No pending issue approvals for your library.',
        showUserDetails: true,
        showApprove: true,
        showReject: true,
        onApprove: (request, button) => {
          void runButtonActionWithStatus(button, 'Approving...', 'Approved', 'Failed', async () => {
            const result = await approveIssueRequest(request);
            if (!result.ok) {
              showMessage(result.msg, true);
              return result;
            }
            approvedLoansPanelOpen = true;
            if (result.approvalEmailSent) {
              showMessage(result.msg + ' Confirmation email sent to the student.');
            } else {
              const emailSuffix = result.approvalEmailError
                ? ` But the confirmation email could not be sent: ${result.approvalEmailError}`
                : ' But the confirmation email could not be sent.';
              showMessage(result.msg + emailSuffix, true);
            }
            return result;
          }).then(async result => {
            if (result && result.ok) {
              if (button) button.disabled = true;
              await loadAdminDashboard();
            }
          }).catch(() => {});
        },
        onReject: (request, button) => {
          void runButtonActionWithStatus(button, 'Rejecting...', 'Rejected', 'Failed', async () => {
            const result = await rejectIssueRequest(request);
            showMessage(result.msg, !result.ok);
            return result;
          }).then(async result => {
            if (result && result.ok) {
              if (button) button.disabled = true;
              await loadAdminDashboard();
            }
          }).catch(() => {});
        }
      });
    });

    const adminPurchaseRequests = getPurchaseRequestsForAdmin(currentAdmin.lib);
    renderDashboardSection('admin', 'purchaseRequests', `${currentAdmin.id}:${buildPurchaseRequestsSignature(adminPurchaseRequests)}`, () => {
      renderPurchaseRequestsList('adminPurchaseRequestsList', adminPurchaseRequests, {
        emptyText: 'No pending purchase approvals for your library.',
        showUserDetails: true,
        showApprove: true,
        showReject: true,
        onApprove: (request, button) => {
          void runButtonActionWithStatus(button, 'Approving...', 'Approved', 'Failed', async () => {
            const result = await approvePurchaseRequest(request);
            showMessage(result.msg, !result.ok);
            return result;
          }).then(async result => {
            if (result && result.ok) {
              if (button) button.disabled = true;
              await loadAdminDashboard();
            }
          }).catch(() => {});
        },
        onReject: (request, button) => {
          void runButtonActionWithStatus(button, 'Rejecting...', 'Rejected', 'Failed', async () => {
            const result = await rejectPurchaseRequest(request);
            showMessage(result.msg, !result.ok);
            return result;
          }).then(async result => {
            if (result && result.ok) {
              if (button) button.disabled = true;
              await loadAdminDashboard();
            }
          }).catch(() => {});
        }
      });
    });

    const issuedSearchQuery = String(document.getElementById('adminIssuedUserSearch')?.value || '').trim().toLowerCase();
    const approvedLoans = getIssuedForAdmin(currentAdmin.lib).filter(loan => {
      if (!issuedSearchQuery) return true;
      return caseInsensitiveMatch(loan.user_name, issuedSearchQuery) ||
        caseInsensitiveMatch(loan.user_email, issuedSearchQuery) ||
        String(loan.student_id || '').includes(issuedSearchQuery);
    });
    approvedLoansPanelOpen = approvedLoansPanelOpen || approvedLoans.length > 0;
    updateApprovedLoansSummary(approvedLoans);
    renderDashboardSection('admin', 'approvedLoans', `${currentAdmin.id}:${issuedSearchQuery}:${buildLoansSignature(approvedLoans)}`, () => {
      renderIssuedRecordsList('adminIssuedBooksList', approvedLoans, {
        emptyText: 'No active issued books for your library.'
      });
    });
    setApprovedLoansPanelState(approvedLoansPanelOpen);

    const adminSlotBookings = getSlotBookingsForAdmin(currentAdmin.lib)
      .filter(booking => String(booking.status || '').toLowerCase() === 'pending');
    renderDashboardSection('admin', 'slotBookings', `${currentAdmin.id}:${buildSlotBookingsSignature(adminSlotBookings)}`, () => {
      renderSlotBookingsList('adminSlotBookingsList', adminSlotBookings, {
        emptyText: 'No pending slot requests for your library.',
        showUserDetails: true,
        showApprove: true,
        showReject: true,
        onApprove: (booking, button) => {
          void runButtonActionWithStatus(button, 'Approving...', 'Approved', 'Failed', async () => {
            const result = await approveSlotBookingRequest(booking);
            showMessage(result.msg, !result.ok);
            return result;
          }).then(async result => {
            if (result && result.ok) {
              if (button) button.disabled = true;
              await loadAdminDashboard();
            }
          }).catch(() => {});
        },
        onReject: (booking, button) => {
          void runButtonActionWithStatus(button, 'Rejecting...', 'Rejected', 'Failed', async () => {
            const result = await rejectSlotBookingRequest(booking);
            showMessage(result.msg, !result.ok);
            return result;
          }).then(async result => {
            if (result && result.ok) {
              if (button) button.disabled = true;
              await loadAdminDashboard();
            }
          }).catch(() => {});
        }
      });
    });

    const approvedSlotBookings = getSlotBookingsForAdmin(currentAdmin.lib)
      .filter(booking => String(booking.status || '').toLowerCase() === 'approved');
    renderDashboardSection('admin', 'approvedSlots', `${currentAdmin.id}:${buildSlotBookingsSignature(approvedSlotBookings)}`, () => {
      renderSlotBookingsList('adminApprovedSlotBookingsList', approvedSlotBookings, {
        emptyText: 'No approved slot bookings for your library.',
        showUserDetails: true,
      });
    });
  })();

  try {
    await adminDashboardLoadPromise;
    dashboardHydrationState.admin = true;
  } finally {
    adminDashboardLoadPromise = null;
  }
}

function initAdminDashboard() {
  document.querySelectorAll('[data-admin-screen-open]').forEach(button => {
    button.addEventListener('click', () => {
      const target = String(button.dataset.adminScreenOpen || '').trim();
      if (!target) return;
      showScreen(target);
      void loadAdminDashboard();
    });
  });

  document.querySelectorAll('[data-admin-screen-back]').forEach(button => {
    button.addEventListener('click', () => {
      const target = String(button.dataset.adminScreenBack || 'admin-dashboard').trim() || 'admin-dashboard';
      showScreen(target);
      void loadAdminDashboard();
    });
  });

  const approvedLoansToggle = document.getElementById('approvedLoansToggle');
  if (approvedLoansToggle) {
    approvedLoansToggle.onclick = () => setApprovedLoansPanelState(!approvedLoansPanelOpen);
  }
  document.getElementById('adminAddBookForm').onsubmit = (e) => {
    e.preventDefault();
    const submitButton = e.submitter || e.target.querySelector('button[type="submit"]');
    const bookId = parseInt(document.getElementById('addBookId').value, 10);
    const title = document.getElementById('addBookTitle').value.trim();
    const author = document.getElementById('addBookAuthor').value.trim();
    const readOnlineUrlRaw = document.getElementById('addBookReadUrl').value.trim();
    const priceValue = document.getElementById('addBookPrice').value.trim();
    const total = parseInt(document.getElementById('addBookTotal').value, 10);
    const issueTotal = parseInt(document.getElementById('addBookIssueTotal').value, 10);
    const slotCopies = parseInt(document.getElementById('addBookSlotCopies').value, 10);
    if (isNaN(bookId) || bookId < 1 || !title || !author || isNaN(total) || total < 1 || isNaN(issueTotal) || issueTotal < 0 || issueTotal > total || isNaN(slotCopies) || slotCopies < 0 || slotCopies > total) {
      showMessage('Enter valid total copies, issue copies, and slot-booking copies.', true);
      return;
    }
    runWithButtonLoading(submitButton, 'Saving...', async () => {
      const price = priceValue ? parseFloat(priceValue) : null;
      if (priceValue && (isNaN(price) || price < 0)) {
        showMessage('Enter a valid price or leave it blank for auto pricing.', true);
        return;
      }
      const readOnlineUrlResult = normalizeBookReadOnlineInput(readOnlineUrlRaw);
      if (!readOnlineUrlResult.ok) {
        showMessage(readOnlineUrlResult.msg, true);
        return;
      }
      if (await addBook(
        bookId,
        currentAdmin.lib,
        title,
        author,
        total,
        issueTotal,
        slotCopies,
        price,
        readOnlineUrlResult.value
      )) {
        showMessage('Book added');
        resetAdminAddBookDraft();
        await loadAdminDashboard();
        e.target.reset();
        syncAdminAddBookControls();
      }
      else showMessage('Book add failed. Check the library name/code and duplicate ID.', true);
    });
  };
  document.querySelectorAll('#adminAddBookForm input').forEach(input => {
    input.addEventListener('input', () => {
      syncAdminAddBookDraftFromControls();
    });
    input.addEventListener('change', () => {
      syncAdminAddBookDraftFromControls();
    });
  });
  const adminIssuedUserSearch = document.getElementById('adminIssuedUserSearch');
  if (adminIssuedUserSearch) {
    adminIssuedUserSearch.addEventListener('input', () => {
      delete dashboardRenderState.admin.approvedLoans;
      void loadAdminDashboard({ showSkeleton: true, skeletonKeys: ['approvedLoans'] });
    });
  }
  const editModal = document.getElementById('editBookModal');
  const editCancel = document.getElementById('editBookCancel');
  if (editCancel) editCancel.onclick = closeEditBookModal;
  const backdrop = editModal && editModal.querySelector('.modal-backdrop');
  if (backdrop) backdrop.onclick = closeEditBookModal;
  document.getElementById('editBookForm').onsubmit = (e) => {
    e.preventDefault();
    const submitButton = e.submitter || e.target.querySelector('button[type="submit"]');
    const bookId = parseInt(document.getElementById('editBookForm').dataset.editBookId || '0', 10);
    const title = document.getElementById('editBookTitle').value.trim();
    const author = document.getElementById('editBookAuthor').value.trim();
    const readOnlineUrlRaw = document.getElementById('editBookReadUrl').value.trim();
    const available = parseInt(document.getElementById('editBookAvailable').value, 10);
    const issueTotal = parseInt(document.getElementById('editBookIssueTotal').value, 10);
    const slotCopies = parseInt(document.getElementById('editBookSlotCopies').value, 10);
    const total = parseInt(document.getElementById('editBookTotal').value, 10);
    if (!title || !author || isNaN(available) || available < 0 || isNaN(issueTotal) || issueTotal < 0 || isNaN(slotCopies) || slotCopies < 0 || isNaN(total) || total < 0 || issueTotal > total || slotCopies > total || available > issueTotal) {
      showMessage('Issue availability must be between 0 and issue copies, and each pool must stay within total copies.', true);
      return;
    }
    runWithButtonLoading(submitButton, 'Saving...', async () => {
      const readOnlineUrlResult = normalizeBookReadOnlineInput(readOnlineUrlRaw);
      if (!readOnlineUrlResult.ok) {
        showMessage(readOnlineUrlResult.msg, true);
        return;
      }
      if (await editBook(bookId, {
        title,
        author,
        read_online_url: readOnlineUrlResult.value || null,
        available_copies: available,
        issue_total_copies: issueTotal,
        slot_booking_copies: slotCopies,
        total_copies: total
      })) {
        showMessage('Book updated');
        closeEditBookModal();
        await loadAdminDashboard();
      } else showMessage('Book update failed', true);
    });
  };
}

function initUserRegister() {
  document.getElementById('userRegBack').onclick = () => showScreen('home');
  document.getElementById('userRegForm').onsubmit = (e) => {
    e.preventDefault();
    const submitButton = e.submitter || e.target.querySelector('button[type="submit"]');
    const name = document.getElementById('userRegName').value.trim();
    const email = document.getElementById('userRegEmail').value.trim();
    const password = document.getElementById('userRegPassword').value;
    if (!name || !email || !password) { showMessage('Fill all fields', true); return; }
    runWithButtonLoading(submitButton, 'Sending OTP...', () =>
      sendOtpToEmail(email).then((sendResult) => {
        if (!sendResult.sent && !sendResult.fallbackOtp) {
          showMessage(sendResult.message || 'Failed to send OTP.', true);
          return;
        }
        pendingReg = { type: 'user', name, email, password };
        const emailEl = document.getElementById('userOtpEmail');
        const hintEl = document.getElementById('userOtpDevHint');
        const inputEl = document.getElementById('userOtpInput');
        if (!emailEl || !hintEl || !inputEl) { showMessage('OTP screen error', true); return; }
        emailEl.textContent = email;
        hintEl.textContent = sendResult && sendResult.fallbackOtp
          ? `${sendResult.message} Demo OTP: ${sendResult.fallbackOtp}`
          : 'Check your email for the 6-digit OTP code.';
        inputEl.value = '';
        showScreen('user-register-otp');
        showMessage(sendResult && sendResult.fallbackOtp
          ? 'OTP generated for demo mode.'
          : 'OTP sent to your email. Please check your inbox.');
      }).catch(err => {
        console.error('OTP error:', err);
        showMessage('Failed to send OTP: ' + (err.message || 'Check if email server is running'), true);
      })
    );
  };
}

function initUserRegisterOtp() {
  const userOtpBack = document.getElementById('userOtpBack');
  const userOtpForm = document.getElementById('userOtpForm');
  if (!userOtpBack || !userOtpForm) return; // OTP screen not in DOM
  userOtpBack.onclick = () => { pendingReg = null; showScreen('user-register'); };
  userOtpForm.onsubmit = (e) => {
    e.preventDefault();
    const submitButton = e.submitter || userOtpForm.querySelector('button[type="submit"]');
    const input = document.getElementById('userOtpInput').value.trim();
    if (!pendingReg || pendingReg.type !== 'user') { showScreen('home'); return; }
    runWithButtonLoading(submitButton, 'Verifying...', () =>
      verifyOtpWithBackend(pendingReg.email, input).then(async verifyResult => {
        if (!verifyResult.ok) { showMessage(verifyResult.msg || 'Invalid OTP', true); return; }
        const result = await registerUser(pendingReg.name, pendingReg.email, pendingReg.password);
        pendingReg = null;
        if (result.ok) {
          document.getElementById('userRegForm').reset();
          document.getElementById('userOtpForm').reset();
          showMessage('Registration successful');
          await applyAuthenticatedIdentity(result.user, { openDashboard: true });
        }
        else showMessage(result.msg, true);
      })
    );
  };
}

function initUserLogin() {
  document.getElementById('userLoginBack').onclick = () => showScreen('home');
  const forgotButton = document.getElementById('userForgotPassword');
  if (forgotButton) {
    forgotButton.onclick = () => {
      const email = document.getElementById('userLoginEmail').value.trim();
      if (!email) {
        showMessage('Enter the email address first.', true);
        return;
      }
      runWithButtonLoading(forgotButton, 'Sending OTP...', () =>
        sendOtpToEmail(email, { purpose: 'password_reset' }).then((sendResult) => {
          if (!sendResult.sent && !sendResult.fallbackOtp) {
            showMessage(sendResult.message || 'Failed to send OTP.', true);
            return;
          }
          pendingPasswordResetEmail = email;
          const emailEl = document.getElementById('forgotOtpEmail');
          const hintEl = document.getElementById('forgotOtpDevHint');
          const inputEl = document.getElementById('forgotOtpInput');
          if (!emailEl || !hintEl || !inputEl) {
            showMessage('Forgot password screen is missing.', true);
            return;
          }
          emailEl.textContent = email;
          hintEl.textContent = sendResult && sendResult.fallbackOtp
            ? `${sendResult.message} Demo OTP: ${sendResult.fallbackOtp}`
            : 'Check your email for the 6-digit OTP code.';
          inputEl.value = '';
          showScreen('user-forgot-otp');
          showMessage(sendResult && sendResult.fallbackOtp
            ? 'Demo OTP generated for password reset.'
            : 'OTP sent for password reset.');
        }).catch(err => {
          console.error('OTP error:', err);
          showMessage('Failed to send OTP: ' + (err.message || 'Check if email server is running'), true);
        })
      );
    };
  }
  document.getElementById('userLoginForm').onsubmit = (e) => {
    e.preventDefault();
    const submitButton = e.submitter || e.target.querySelector('button[type="submit"]');
    const email = document.getElementById('userLoginEmail').value.trim();
    const password = document.getElementById('userLoginPassword').value;
    if (!email || !password) {
      showMessage('Enter both email and password.', true);
      return;
    }
    runWithButtonLoading(submitButton, 'Signing in...', async () => {
      const baseResult = await loginAny(email, password);
      if (!baseResult.ok) {
        showMessage(baseResult.msg || 'Login failed', true);
        return;
      }
      if (baseResult.type === 'developer') {
        document.getElementById('userLoginPassword').value = '';
        showMessage('Login successful');
        await applyAuthenticatedIdentity(baseResult.developer, { openDashboard: true });
        return;
      }
      if (baseResult.type === 'admin') {
        document.getElementById('userLoginPassword').value = '';
        showMessage('Login successful');
        await applyAuthenticatedIdentity(baseResult.admin, { openDashboard: true });
        return;
      }
      document.getElementById('userLoginPassword').value = '';
      showMessage('Login successful');
      await applyAuthenticatedIdentity(baseResult.user, { openDashboard: true });
    });
  };
}

function initForgotPassword() {
  const forgotOtpBack = document.getElementById('forgotOtpBack');
  const forgotOtpForm = document.getElementById('forgotOtpForm');
  const resetPasswordBack = document.getElementById('resetPasswordBack');
  const resetPasswordFormEl = document.getElementById('resetPasswordForm');
  if (forgotOtpBack) {
    forgotOtpBack.onclick = () => {
      pendingPasswordResetEmail = null;
      showScreen('user-login');
    };
  }
  if (forgotOtpForm) {
    forgotOtpForm.onsubmit = (e) => {
      e.preventDefault();
      const submitButton = e.submitter || forgotOtpForm.querySelector('button[type="submit"]');
      const otp = document.getElementById('forgotOtpInput').value.trim();
      if (!pendingPasswordResetEmail) {
        showScreen('user-login');
        return;
      }
      runWithButtonLoading(submitButton, 'Verifying...', () =>
        verifyOtpWithBackend(pendingPasswordResetEmail, otp).then(result => {
          if (!result.ok) {
            showMessage(result.msg || 'Invalid OTP', true);
            return;
          }
          document.getElementById('forgotOtpForm').reset();
          document.getElementById('resetPasswordForm').dataset.email = pendingPasswordResetEmail;
          showScreen('user-reset-password');
        })
      );
    };
  }
  if (resetPasswordBack) {
    resetPasswordBack.onclick = () => {
      pendingPasswordResetEmail = null;
      showScreen('user-login');
    };
  }
  if (resetPasswordFormEl) {
    resetPasswordFormEl.onsubmit = (e) => {
      e.preventDefault();
      const submitButton = e.submitter || resetPasswordFormEl.querySelector('button[type="submit"]');
      const email = resetPasswordFormEl.dataset.email || pendingPasswordResetEmail || '';
      const password = document.getElementById('resetPasswordValue').value;
      if (!password) {
        showMessage('Enter a new password.', true);
        return;
      }
      runWithButtonLoading(submitButton, 'Updating...', async () => {
        const result = await resetUserPassword(email, password);
        if (!result.ok) {
          showMessage(result.msg, true);
          return;
        }
        pendingPasswordResetEmail = null;
        resetPasswordFormEl.reset();
        document.getElementById('userLoginPassword').value = '';
        showMessage(result.msg);
        showScreen('user-login');
      });
    };
  }
}

async function loadDeveloperDashboard(options = {}) {
  if (!currentDeveloper) return;
  if (developerDashboardLoadPromise) return developerDashboardLoadPromise;
  const shouldShowSkeleton = options.showSkeleton ?? !dashboardHydrationState.developer;
  if (shouldShowSkeleton) {
    showDashboardSkeleton('developer', options.skeletonKeys);
  }

  developerDashboardLoadPromise = (async () => {
    await refreshDeveloperDashboardData();
    setTextIfChanged('developerInfoName', currentDeveloper.name);
    setTextIfChanged('developerInfoEmail', currentDeveloper.email);
    setTextIfChanged('developerInfoId', currentDeveloper.id);
    setTextIfChanged('developerInfoRole', currentDeveloper.role);

    const metrics = apiState.developerMetrics || {};
    setTextIfChanged('developerActiveUsersCount', metrics.currently_active_count || 0);
    setTextIfChanged('developerTotalUsersCount', metrics.total_users || 0);
    setTextIfChanged('developerMemberUsersCount', metrics.member_count || 0);
    setTextIfChanged('developerAdminUsersCount', metrics.admin_count || 0);
    setTextIfChanged('developerDeveloperUsersCount', metrics.developer_count || 0);

    const userSearch = String(document.getElementById('developerUserSearch')?.value || '').trim().toLowerCase();
    const statusFilter = String(document.getElementById('developerUserStatusFilter')?.value || '').trim().toLowerCase();
    const filteredUsers = getDeveloperUsers().filter(user => {
      const matchesSearch = !userSearch || caseInsensitiveMatch(user.full_name, userSearch) ||
        caseInsensitiveMatch(user.email, userSearch) ||
        caseInsensitiveMatch(user.role, userSearch) ||
        String(user.user_id || '').includes(userSearch);
      const matchesStatus = !statusFilter || developerUserStatus(user) === statusFilter;
      return matchesSearch && matchesStatus;
    });
    renderDashboardSection('developer', 'users', `${currentDeveloper.id}:${userSearch}:${statusFilter}:${buildDeveloperUsersSignature(filteredUsers)}`, () => {
      renderDeveloperUsersList('developerUsersActivityList', filteredUsers);
    });

    const logSearch = String(document.getElementById('developerLogSearch')?.value || '').trim().toLowerCase();
    const filteredLogs = getDeveloperLogs().filter(log => {
      if (!logSearch) return true;
      return caseInsensitiveMatch(log.actor_email, logSearch) ||
        caseInsensitiveMatch(log.path, logSearch) ||
        caseInsensitiveMatch(log.action, logSearch) ||
        caseInsensitiveMatch(log.session_id, logSearch) ||
        String(log.status_code || '').includes(logSearch);
    });
    renderDashboardSection('developer', 'logs', `${currentDeveloper.id}:${logSearch}:${buildDeveloperLogsSignature(filteredLogs)}`, () => {
      renderDeveloperLogsList('developerActivityLogList', filteredLogs);
    });
  })();

  try {
    await developerDashboardLoadPromise;
    dashboardHydrationState.developer = true;
  } finally {
    developerDashboardLoadPromise = null;
  }
}

function initDeveloperDashboard() {
  document.querySelectorAll('[data-developer-screen-open]').forEach(button => {
    button.addEventListener('click', () => {
      const target = String(button.dataset.developerScreenOpen || '').trim();
      if (!target) return;
      showScreen(target);
      void loadDeveloperDashboard();
    });
  });

  document.querySelectorAll('[data-developer-screen-back]').forEach(button => {
    button.addEventListener('click', () => {
      const target = String(button.dataset.developerScreenBack || 'developer-dashboard').trim() || 'developer-dashboard';
      showScreen(target);
      void loadDeveloperDashboard();
    });
  });

  const developerUserSearch = document.getElementById('developerUserSearch');
  if (developerUserSearch) {
    developerUserSearch.addEventListener('input', () => {
      delete dashboardRenderState.developer.users;
      void loadDeveloperDashboard({ showSkeleton: true, skeletonKeys: ['users'] });
    });
  }

  const developerUserStatusFilter = document.getElementById('developerUserStatusFilter');
  if (developerUserStatusFilter) {
    developerUserStatusFilter.addEventListener('change', () => {
      delete dashboardRenderState.developer.users;
      void loadDeveloperDashboard({ showSkeleton: true, skeletonKeys: ['users'] });
    });
  }

  const developerLogSearch = document.getElementById('developerLogSearch');
  if (developerLogSearch) {
    developerLogSearch.addEventListener('input', () => {
      delete dashboardRenderState.developer.logs;
      void loadDeveloperDashboard({ showSkeleton: true, skeletonKeys: ['logs'] });
    });
  }
}

async function loadUserDashboard(options = {}) {
  if (!currentUser) return;
  if (userDashboardLoadPromise) return userDashboardLoadPromise;
  const shouldShowSkeleton = options.showSkeleton ?? !dashboardHydrationState.user;
  if (shouldShowSkeleton) {
    showDashboardSkeleton('user', options.skeletonKeys);
  }

  userDashboardLoadPromise = (async () => {
    await refreshCatalogData();
    await refreshUserDashboardData(currentUser.id);
    renderLibraryFilterOptions();
    syncUserBookSearchControls();
    setTextIfChanged('userInfoName', currentUser.name);
    setTextIfChanged('userInfoEmail', currentUser.email);
    setTextIfChanged('userInfoId', currentUser.id);
    setTextIfChanged('userNotificationsUnread', getUnreadNotificationsCount(currentUser.id));
    const visibleBooks = getVisibleUserBooks();
    renderDashboardSection('user', 'books', `${currentUser.id}:${userBookSearchState.libraryFilter}:${userBookSearchState.searchType}:${userBookSearchState.query}:${buildBooksSignature(visibleBooks)}`, () => {
      renderBooksList('userBooksList', visibleBooks, {
        compactCard: true,
        showRequest: true,
        showPurchase: true,
        showSlot: true,
        showWaitlist: true,
        showFavoriteToggle: true,
        showReviews: true,
        pagerId: 'userBooksListPager',
        pagination: true,
        onRequest: (bookId) => {
          openIssueRequestPrompt(bookId);
        },
        onPurchase: (bookId) => {
          openPurchaseRequestPrompt(bookId);
        },
        onSlot: (bookId) => {
          openSlotActionPrompt(bookId);
        },
        onWaitlist: (bookId) => {
          openWaitlistActionPrompt(bookId);
        },
        onFavoriteToggle: (bookId) => {
          openFavoriteActionPrompt(bookId);
        },
        onReviews: (bookId) => {
          openReviewModal(bookId);
        },
        onDetails: (bookId) => {
          openBookDetailsPrompt(bookId);
        }
      });
    });

    const userRequests = getIssueRequestsForUser(currentUser.id);
    renderDashboardSection('user', 'requests', `${currentUser.id}:${buildBorrowRequestsSignature(userRequests)}`, () => {
      renderIssueRequestsList('userIssueRequestsList', userRequests, {
        emptyText: 'No books applied for issue yet.',
        showCancel: true,
        onCancel: (request, button) => {
          void runButtonActionWithStatus(button, 'Cancelling...', 'Cancelled', 'Failed', async () => {
            const result = await cancelIssueRequest(request);
            if (result.ok) {
              await loadUserDashboard();
            }
            showMessage(result.msg, !result.ok);
            return result;
          });
        }
      });
    });

    const purchaseRequests = getPurchaseRequestsForUser(currentUser.id);
    renderDashboardSection('user', 'purchaseRequests', `${currentUser.id}:${buildPurchaseRequestsSignature(purchaseRequests)}`, () => {
      renderPurchaseRequestsList('userPurchaseRequestsList', purchaseRequests, {
        emptyText: 'No books applied for purchase yet.',
        showCancel: true,
        onCancel: (request, button) => {
          void runButtonActionWithStatus(button, 'Cancelling...', 'Cancelled', 'Failed', async () => {
            const result = await cancelPurchaseRequest(request);
            if (result.ok) {
              await loadUserDashboard();
            }
            showMessage(result.msg, !result.ok);
            return result;
          });
        }
      });
    });

    const issued = getIssuedForUser(currentUser.id);
    const issuedEl = document.getElementById('userIssuedList');
    if (issuedEl) {
      renderDashboardSection('user', 'issued', `${currentUser.id}:${buildLoansSignature(issued)}`, () => {
        setLoadingRegion(issuedEl, false);
        if (issued.length === 0) issuedEl.innerHTML = '<p class="empty">No books issued.</p>';
        else issuedEl.innerHTML = issued.map(i => {
          const book = searchBooksById(i.book_id);
          const readOnlineAction = renderReadOnlineAction(book);
          const title = book ? book.title : 'Book #' + i.book_id;
          const lib = i.lib || (book ? book.lib : 'Unknown library');
          return `
            <div class="issued-card module-card">
              <div class="module-copy">
                <strong>${escapeHtml(title)}</strong>
                <div class="module-meta">Book ID: ${i.book_id} • ${escapeHtml(lib)}</div>
                <div class="module-meta">Due: ${formatDate(i.due_date)}</div>
              </div>
              <div class="module-actions">
                ${readOnlineAction}
                <button type="button" class="btn btn-sm" data-return="${i.book_id}">Return</button>
              </div>
            </div>
          `;
        }).join('');
        issuedEl.querySelectorAll('[data-return]').forEach(btn => {
          btn.addEventListener('click', () => {
            void returnBook(currentUser.id, parseInt(btn.dataset.return, 10)).then(async r => {
              showMessage(r.ok ? 'Book returned' : r.msg, !r.ok);
              if (r.ok) await loadUserDashboard();
            });
          });
        });
      });
    }

    const slotRequests = getSlotBookingsForUser(currentUser.id)
      .filter(booking => String(booking.status || '').toLowerCase() === 'pending');
    renderDashboardSection('user', 'slotBookings', `${currentUser.id}:${buildSlotBookingsSignature(slotRequests)}`, () => {
      renderSlotBookingsList('userSlotBookingsList', slotRequests, {
        emptyText: 'No slot requests yet.',
        showCancel: true,
        onCancel: (booking) => {
          openSlotCancelOtpModal(booking);
        }
      });
    });

    const approvedSlotBookings = getSlotBookingsForUser(currentUser.id)
      .filter(booking => String(booking.status || '').toLowerCase() === 'approved');
    renderDashboardSection('user', 'approvedSlots', `${currentUser.id}:${buildSlotBookingsSignature(approvedSlotBookings)}`, () => {
      renderSlotBookingsList('userApprovedSlotBookingsList', approvedSlotBookings, {
        emptyText: 'No approved slots yet.',
        showCancel: true,
        onCancel: (booking) => {
          openSlotCancelOtpModal(booking);
        }
      });
    });

    const wishlistBooks = getFavoritesForUser(currentUser.id)
      .map(favorite => searchBooksById(favorite.book_id))
      .filter(Boolean);
    renderDashboardSection('user', 'wishlist', `${currentUser.id}:${buildFavoritesSignature(getFavoritesForUser(currentUser.id))}:${buildBooksSignature(wishlistBooks)}`, () => {
      renderBooksList('userWishlistList', wishlistBooks, {
        compactCard: true,
        showRequest: true,
        showPurchase: true,
        showSlot: true,
        showWaitlist: true,
        showFavoriteToggle: true,
        showReviews: true,
        onRequest: (bookId) => {
          openIssueRequestPrompt(bookId);
        },
        onPurchase: (bookId) => {
          openPurchaseRequestPrompt(bookId);
        },
        onSlot: (bookId) => {
          openSlotActionPrompt(bookId);
        },
        onWaitlist: (bookId) => {
          openWaitlistActionPrompt(bookId);
        },
        onFavoriteToggle: (bookId) => {
          openFavoriteActionPrompt(bookId);
        },
        onReviews: (bookId) => {
          openReviewModal(bookId);
        },
        onDetails: (bookId) => {
          openBookDetailsPrompt(bookId);
        }
      });
    });

    const waitlistEntries = getWaitlistEntriesForUser(currentUser.id);
    renderDashboardSection('user', 'waitlist', `${currentUser.id}:${buildWaitlistSignature(waitlistEntries)}`, () => {
      renderWaitlistEntriesList('userWaitlistList', waitlistEntries, {
        emptyText: 'You are not waiting for any books right now.',
        showCancel: true,
        onCancel: (entry, button) => {
          void runButtonActionWithStatus(button, 'Cancelling...', 'Cancelled', 'Failed', async () => {
            const result = await cancelWaitlistEntry(entry);
            if (result.ok) await loadUserDashboard();
            showMessage(result.msg, !result.ok);
            return result;
          });
        }
      });
    });

    const notifications = getNotificationsForUser(currentUser.id);
    renderDashboardSection('user', 'notifications', `${currentUser.id}:${buildNotificationsSignature(notifications)}`, () => {
      renderNotificationsList('userNotificationsList', notifications, {
        emptyText: 'You have no notifications yet.',
        showMarkRead: true,
        onMarkRead: (item, button) => {
          void runButtonActionWithStatus(button, 'Updating...', 'Updated', 'Failed', async () => {
            const result = await markNotificationAsRead(currentUser.id, item.notification_id);
            if (result.ok) await loadUserDashboard();
            showMessage(result.msg, !result.ok);
            return result;
          });
        }
      });
    });
  })();

  try {
    await userDashboardLoadPromise;
    dashboardHydrationState.user = true;
  } finally {
    userDashboardLoadPromise = null;
  }
}

function initUserDashboard() {
  document.querySelectorAll('[data-user-screen-open]').forEach(button => {
    button.addEventListener('click', () => {
      const target = String(button.dataset.userScreenOpen || '').trim();
      if (!target) return;
      showScreen(target);
      void loadUserDashboard();
    });
  });

  document.querySelectorAll('[data-user-screen-back]').forEach(button => {
    button.addEventListener('click', () => {
      const target = String(button.dataset.userScreenBack || 'user-dashboard').trim() || 'user-dashboard';
      showScreen(target);
      void loadUserDashboard();
    });
  });

  const userSearchForm = document.getElementById('userSearchForm');
  if (userSearchForm) {
    userSearchForm.onsubmit = (e) => {
      e.preventDefault();
      const q = document.getElementById('userSearchQuery')?.value.trim() || '';
      const by = document.getElementById('userSearchBy')?.value || 'title';
      const libraryFilter = getSelectedLibraryFilter();
      if (by === 'id' && q && isNaN(parseInt(q, 10))) {
        showMessage('Book ID must be a number.', true);
        return;
      }
      userBookSearchState.query = q;
      userBookSearchState.searchType = by;
      userBookSearchState.libraryFilter = libraryFilter;
      delete dashboardRenderState.user.books;
      void loadUserDashboard({ showSkeleton: true, skeletonKeys: ['books'] });
    };
  }

  const userSearchBy = document.getElementById('userSearchBy');
  if (userSearchBy) {
    userSearchBy.addEventListener('change', () => {
      syncUserBookSearchStateFromControls();
    });
  }

  const userSearchQuery = document.getElementById('userSearchQuery');
  if (userSearchQuery) {
    userSearchQuery.addEventListener('input', () => {
      syncUserBookSearchStateFromControls();
    });
  }

  const libraryFilter = document.getElementById('userLibraryFilter');
  if (libraryFilter) {
    libraryFilter.addEventListener('change', () => {
      syncUserBookSearchStateFromControls();
      delete dashboardRenderState.user.books;
      void loadUserDashboard({ showSkeleton: true, skeletonKeys: ['books'] });
    });
  }

  const markAllNotificationsButton = document.getElementById('userNotificationsMarkAll');
  if (markAllNotificationsButton) {
    markAllNotificationsButton.addEventListener('click', () => {
      if (!currentUser) return;
      void runButtonActionWithStatus(markAllNotificationsButton, 'Updating...', 'Updated', 'Failed', async () => {
        const result = await markAllNotificationsAsRead(currentUser.id);
        if (result.ok) await loadUserDashboard();
        showMessage(result.msg, !result.ok);
        return result;
      });
    });
  }
}

// ----- Bootstrap -----
async function init() {
  initBrandLoader();
  try {
    setSaveStatus('Connecting to API...');
    initHome();
    initNav();
    initContactPage();
    initAdminDashboard();
    initUserRegister();
    initUserRegisterOtp();
    initUserLogin();
    initForgotPassword();
    initDeveloperDashboard();
    initBookActionModal();
    initSlotBookingModal();
    initSlotCancelOtpModal();
    initReviewModal();
    initUserDashboard();
    window.addEventListener('popstate', () => {
      void syncScreenFromHistoryState(window.history.state || {});
    });
    document.addEventListener('visibilitychange', () => {
      updateDashboardPolling();
      if (document.visibilityState === 'visible') {
        void pollActiveDashboard();
      }
    });
    showScreen(getCurrentHistoryScreenId() || 'home', { historyMode: 'skip' });
    const backendOk = await checkBackend();
    if (backendOk) {
      try {
        await loadBackendDataFromServer();
        await restoreAuthSession();
      } catch (error) {
        console.error('Initial API load failed:', error);
        showMessage(getErrorMessage(error, 'Initial API load failed.'), true);
      }
    }
    writeScreenHistoryState(activeScreenId, 'replace');
  } finally {
    await releaseBrandLoader();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void init(); });
else void init();
