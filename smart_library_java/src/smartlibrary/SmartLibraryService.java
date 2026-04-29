package smartlibrary.swing;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class SmartLibraryService {
    private static final Comparator<IssueRequestRecord> ISSUE_REQUEST_COMPARATOR = (first, second) -> {
        int dateCompare = compareDateParts(second.requestDate, first.requestDate);
        if (dateCompare != 0) {
            return dateCompare;
        }
        if (first.bookId != second.bookId) {
            return Integer.compare(second.bookId, first.bookId);
        }
        return Integer.compare(second.studentId, first.studentId);
    };

    private final SmartLibraryRepository repository;
    private LibraryState state;
    private int nextUserId;
    private int nextAdminId;

    SmartLibraryService(Path root) throws IOException {
        this.repository = new SmartLibraryRepository(root);
        reload();
    }

    void reload() throws IOException {
        state = repository.load();
        nextUserId = state.users.stream().mapToInt(user -> user.id).max().orElse(0) + 1;
        nextAdminId = state.admins.stream().mapToInt(admin -> admin.id).max().orElse(0) + 1;
    }

    Path root() {
        return repository.root();
    }

    List<Book> getBooks() {
        return List.copyOf(state.books);
    }

    List<UserAccount> getUsers() {
        return List.copyOf(state.users);
    }

    List<AdminAccount> getAdmins() {
        return List.copyOf(state.admins);
    }

    List<IssueRecord> getIssuedRecords() {
        return List.copyOf(state.issued);
    }

    int nextBookId() {
        return state.books.stream().mapToInt(book -> book.bookId).max().orElse(0) + 1;
    }

    UserAccount getUserById(int studentId) {
        return state.users.stream().filter(user -> user.id == studentId).findFirst().orElse(null);
    }

    Book getBookById(int bookId) {
        return state.books.stream().filter(book -> book.bookId == bookId).findFirst().orElse(null);
    }

    AuthResult loginAny(String email, String password) {
        UserAccount user = state.users.stream()
            .filter(entry -> entry.email.equalsIgnoreCase(email) && entry.password.equals(password))
            .findFirst()
            .orElse(null);
        if (user != null) {
            return AuthResult.user(user);
        }

        AdminAccount admin = state.admins.stream()
            .filter(entry -> entry.email.equalsIgnoreCase(email) && entry.password.equals(password))
            .findFirst()
            .orElse(null);
        if (admin != null) {
            return AuthResult.admin(admin);
        }
        return AuthResult.error("Login failed");
    }

    OperationResult registerUser(String name, String email, String password) {
        if (state.users.stream().anyMatch(user -> user.email.equalsIgnoreCase(email))) {
            return OperationResult.error("User already exists");
        }
        state.users.add(new UserAccount(nextUserId++, name, email, password));
        return persist("Registration successful");
    }

    OperationResult resetUserPassword(String email, String newPassword) {
        UserAccount user = state.users.stream()
            .filter(entry -> entry.email.equalsIgnoreCase(email == null ? "" : email.trim()))
            .findFirst()
            .orElse(null);
        if (user == null) {
            return OperationResult.error("No student account found for that email.");
        }
        user.password = newPassword;
        return persist("Password updated successfully.");
    }

    OperationResult addBook(int bookId, String lib, String title, String author, int totalCopies) {
        if (state.books.stream().anyMatch(book -> book.bookId == bookId)) {
            return OperationResult.error("Book ID already exists.");
        }
        state.books.add(new Book(bookId, lib, title, author, totalCopies, totalCopies));
        return persist("Book added successfully.");
    }

    OperationResult deleteBook(int bookId) {
        state.books.removeIf(book -> book.bookId == bookId);
        return persist("Book deleted");
    }

    OperationResult editBook(int bookId, String title, String author, int availableCopies, int totalCopies) {
        Book book = getBookById(bookId);
        if (book == null) {
            return OperationResult.error("Book not found");
        }
        if (availableCopies < 0 || totalCopies < 0) {
            return OperationResult.error("Copies cannot be negative.");
        }
        if (availableCopies > totalCopies) {
            return OperationResult.error("Available copies cannot exceed total copies.");
        }
        book.title = title.trim();
        book.author = author.trim();
        book.availableCopies = availableCopies;
        book.totalCopies = totalCopies;
        return persist("Book updated successfully.");
    }

    List<Book> searchBooks(String searchType, String query) {
        String trimmed = query == null ? "" : query.trim();
        if (trimmed.isEmpty()) {
            return getBooks();
        }
        if ("id".equals(searchType)) {
            int bookId;
            try {
                bookId = Integer.parseInt(trimmed);
            } catch (NumberFormatException ex) {
                throw new IllegalArgumentException("Book ID must be a number.");
            }
            Book book = getBookById(bookId);
            return book == null ? List.of() : List.of(book);
        }
        if ("author".equals(searchType)) {
            return state.books.stream()
                .filter(book -> containsIgnoreCase(book.author, trimmed))
                .toList();
        }
        return state.books.stream()
            .filter(book -> containsIgnoreCase(book.title, trimmed))
            .toList();
    }

    List<Book> booksForLibrary(String library) {
        return state.books.stream()
            .filter(book -> SmartLibraryRepository.libraryMatches(book.lib, library))
            .toList();
    }

    OperationResult requestIssueBook(int studentId, int bookId) {
        Book book = getBookById(bookId);
        if (book == null) {
            return OperationResult.error("Book not found");
        }
        boolean alreadyIssued = state.issued.stream()
            .anyMatch(issue -> issue.studentId == studentId && issue.bookId == bookId && !issue.returned);
        if (alreadyIssued) {
            return OperationResult.error("This book is already issued to you");
        }
        boolean pending = state.issueRequests.stream()
            .anyMatch(request -> request.studentId == studentId && request.bookId == bookId);
        if (pending) {
            return OperationResult.error("You already have a pending request for this book");
        }

        DateParts requestDate = DateParts.today();
        state.issueRequests.add(new IssueRequestRecord(studentId, bookId, requestDate, "Pending"));
        state.issueHistory.add(new IssueRequestRecord(studentId, bookId, requestDate, "Pending"));
        return persist("Issue request sent. Check \"Books applied for issue\" in your dashboard.");
    }

    ApprovalResult approveIssueRequest(int studentId, int bookId, String adminLibrary) {
        Book book = getBookById(bookId);
        if (book == null) {
            return ApprovalResult.error("Book not found");
        }
        if (!SmartLibraryRepository.libraryMatches(book.lib, adminLibrary)) {
            return ApprovalResult.error("You can approve only requests for your library");
        }

        UserAccount user = getUserById(studentId);
        if (user == null) {
            return ApprovalResult.error("Student account not found");
        }

        int requestIndex = findIssueRequestIndex(studentId, bookId);
        if (requestIndex == -1) {
            return ApprovalResult.error("No matching pending request found");
        }

        boolean alreadyIssued = state.issued.stream()
            .anyMatch(issue -> issue.studentId == studentId && issue.bookId == bookId && !issue.returned);
        if (alreadyIssued) {
            state.issueRequests.remove(requestIndex);
            updateIssueHistoryStatus(studentId, bookId, "Approved");
            OperationResult saveResult = persist("This request was already approved earlier.");
            return saveResult.ok()
                ? ApprovalResult.error("This request was already approved earlier.")
                : ApprovalResult.error(saveResult.message());
        }

        if (book.availableCopies < 1) {
            return ApprovalResult.error("Approval failed. Book may be unavailable right now");
        }

        DateParts issueDate = DateParts.today();
        DateParts dueDate = issueDate.addDays(14);
        state.issued.add(new IssueRecord(studentId, bookId, issueDate, dueDate, 0, false));
        state.issueRequests.remove(requestIndex);
        book.availableCopies--;
        updateIssueHistoryStatus(studentId, bookId, "Approved");
        OperationResult saveResult = persist("Request approved and book issued successfully");
        if (!saveResult.ok()) {
            return ApprovalResult.error(saveResult.message());
        }
        return ApprovalResult.ok(
            "Request approved and book issued successfully",
            new ApprovalEmailData(
                user.email,
                user.name,
                book.title,
                book.lib,
                String.valueOf(book.bookId),
                issueDate.format(),
                dueDate.format()
            )
        );
    }

    OperationResult rejectIssueRequest(int studentId, int bookId, String adminLibrary) {
        Book book = getBookById(bookId);
        if (book == null) {
            return OperationResult.error("Book not found");
        }
        if (!SmartLibraryRepository.libraryMatches(book.lib, adminLibrary)) {
            return OperationResult.error("You can reject only requests for your library");
        }

        int requestIndex = findIssueRequestIndex(studentId, bookId);
        if (requestIndex == -1) {
            return OperationResult.error("No matching pending request found");
        }
        state.issueRequests.remove(requestIndex);
        updateIssueHistoryStatus(studentId, bookId, "Rejected");
        return persist("Request rejected successfully");
    }

    OperationResult returnBook(int studentId, int bookId) {
        IssueRecord record = state.issued.stream()
            .filter(entry -> entry.studentId == studentId && entry.bookId == bookId && !entry.returned)
            .findFirst()
            .orElse(null);
        if (record == null) {
            return OperationResult.error("Issue record not found");
        }

        record.returned = true;
        Book book = getBookById(bookId);
        if (book != null) {
            book.availableCopies++;
        }
        return persist("Book returned");
    }

    List<IssueRecord> getIssuedForUser(int studentId) {
        return state.issued.stream()
            .filter(issue -> issue.studentId == studentId && !issue.returned)
            .toList();
    }

    List<IssueRecord> getIssuedForAdmin(String adminLibrary) {
        return state.issued.stream()
            .filter(issue -> !issue.returned)
            .filter(issue -> {
                Book book = getBookById(issue.bookId);
                return book != null && SmartLibraryRepository.libraryMatches(book.lib, adminLibrary);
            })
            .toList();
    }

    List<IssueRequestRecord> getIssueRequestsForUser(int studentId) {
        List<IssueRequestRecord> merged = new ArrayList<>();
        Map<String, IssueRequestRecord> byKey = new HashMap<>();

        for (IssueRequestRecord request : state.issueRequests) {
            if (request.studentId == studentId) {
                addMergedRequest(merged, byKey, request, "Pending");
            }
        }
        for (IssueRequestRecord request : state.issueHistory) {
            if (request.studentId == studentId) {
                addMergedRequest(merged, byKey, request, request.status);
            }
        }

        return merged.stream().sorted(ISSUE_REQUEST_COMPARATOR).toList();
    }

    List<IssueRequestRecord> getIssueRequestsForAdmin(String adminLibrary) {
        return state.issueRequests.stream()
            .filter(request -> {
                Book book = getBookById(request.bookId);
                return book != null && SmartLibraryRepository.libraryMatches(book.lib, adminLibrary);
            })
            .map(request -> new IssueRequestRecord(request.studentId, request.bookId, request.requestDate, "Pending"))
            .sorted(ISSUE_REQUEST_COMPARATOR)
            .toList();
    }

    private void addMergedRequest(
        List<IssueRequestRecord> merged,
        Map<String, IssueRequestRecord> byKey,
        IssueRequestRecord request,
        String fallbackStatus
    ) {
        String key = request.studentId + "|" + request.bookId + "|" + request.requestDate.day + "|" + request.requestDate.month + "|" + request.requestDate.year;
        String status = (request.status == null || request.status.isBlank()) ? fallbackStatus : request.status;
        IssueRequestRecord existing = byKey.get(key);
        if (existing != null) {
            if ((existing.status == null || existing.status.isBlank()) && status != null && !status.isBlank()) {
                existing.status = status;
            }
            return;
        }
        IssueRequestRecord entry = new IssueRequestRecord(request.studentId, request.bookId, request.requestDate, status);
        byKey.put(key, entry);
        merged.add(entry);
    }

    private int findIssueRequestIndex(int studentId, int bookId) {
        for (int index = 0; index < state.issueRequests.size(); index++) {
            IssueRequestRecord request = state.issueRequests.get(index);
            if (request.studentId == studentId && request.bookId == bookId) {
                return index;
            }
        }
        return -1;
    }

    private void updateIssueHistoryStatus(int studentId, int bookId, String status) {
        for (int index = state.issueHistory.size() - 1; index >= 0; index--) {
            IssueRequestRecord request = state.issueHistory.get(index);
            String currentStatus = request.status == null || request.status.isBlank() ? "Pending" : request.status;
            if (request.studentId == studentId && request.bookId == bookId && "Pending".equals(currentStatus)) {
                request.status = status;
                return;
            }
        }
        state.issueHistory.add(new IssueRequestRecord(studentId, bookId, DateParts.today(), status));
    }

    private OperationResult persist(String successMessage) {
        try {
            repository.save(state);
            return OperationResult.ok(successMessage);
        } catch (IOException ex) {
            return OperationResult.error("Could not save data: " + ex.getMessage());
        }
    }

    private static int compareDateParts(DateParts first, DateParts second) {
        return first.toLocalDate().compareTo(second.toLocalDate());
    }

    private static boolean containsIgnoreCase(String value, String query) {
        return (value == null ? "" : value).toLowerCase().contains((query == null ? "" : query).toLowerCase());
    }
}
