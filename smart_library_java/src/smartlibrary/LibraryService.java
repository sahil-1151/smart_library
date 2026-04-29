package smartlibrary;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public final class LibraryService {
    public enum Role {
        USER,
        ADMIN;

        @Override
        public String toString() {
            return this == USER ? "User" : "Admin";
        }
    }

    public enum SearchType {
        ID,
        TITLE,
        AUTHOR;

        @Override
        public String toString() {
            if (this == ID) {
                return "Book ID";
            }
            if (this == TITLE) {
                return "Title";
            }
            return "Author";
        }
    }

    public static final class UserIssueView {
        public final int bookId;
        public final String title;
        public final String library;
        public final String issueDate;
        public final String dueDate;

        public UserIssueView(int bookId, String title, String library, String issueDate, String dueDate) {
            this.bookId = bookId;
            this.title = title;
            this.library = library;
            this.issueDate = issueDate;
            this.dueDate = dueDate;
        }
    }

    public static final class AdminIssueView {
        public final int studentId;
        public final String userName;
        public final String userEmail;
        public final int bookId;
        public final String title;
        public final String issueDate;
        public final String dueDate;

        public AdminIssueView(int studentId, String userName, String userEmail, int bookId, String title, String issueDate, String dueDate) {
            this.studentId = studentId;
            this.userName = userName;
            this.userEmail = userEmail;
            this.bookId = bookId;
            this.title = title;
            this.issueDate = issueDate;
            this.dueDate = dueDate;
        }
    }

    public static final class UserBorrowRequestView {
        public final int bookId;
        public final String title;
        public final String library;
        public final String requestedAt;
        public final String status;

        public UserBorrowRequestView(int bookId, String title, String library, String requestedAt, String status) {
            this.bookId = bookId;
            this.title = title;
            this.library = library;
            this.requestedAt = requestedAt;
            this.status = status;
        }
    }

    public static final class AdminPendingRequestView {
        public final int studentId;
        public final String userName;
        public final String userEmail;
        public final int bookId;
        public final String title;
        public final String requestedAt;

        public AdminPendingRequestView(
                int studentId, String userName, String userEmail, int bookId, String title, String requestedAt) {
            this.studentId = studentId;
            this.userName = userName;
            this.userEmail = userEmail;
            this.bookId = bookId;
            this.title = title;
            this.requestedAt = requestedAt;
        }
    }

    private final StorageModule storage;
    private final Path baseDirectory;

    private Bst.BookNode bookRoot;
    private UserModule.StudentNode userRoot;
    private AdminModule.AdminNode adminRoot;
    private LinkedModule.IssueNode issueRoot;
    private IssueRequestModule.RequestNode issueRequestRoot;
    private QueueModule.QueueState queueState;

    public LibraryService(Path baseDirectory) {
        this.baseDirectory = resolveBaseDirectory(baseDirectory);
        this.storage = new StorageModule(this.baseDirectory);
        loadData();
    }

    public Path getBaseDirectory() {
        return baseDirectory;
    }

    public void loadData() {
        bookRoot = storage.loadBooks();
        userRoot = storage.loadUsers();
        adminRoot = storage.loadAdmins();
        issueRoot = storage.loadIssuedBooks();
        issueRequestRoot = storage.loadIssueRequests();
        queueState = storage.loadQueue();
    }

    public void persistAll() {
        storage.saveBooks(bookRoot);
        storage.saveUsers(userRoot);
        storage.saveAdmins(adminRoot);
        storage.saveIssuedBooks(issueRoot);
        storage.saveIssueRequests(issueRequestRoot);
        storage.saveQueue(queueState);
    }

    public AdminModule.AdminNode registerAdmin(String name, String library, String email, String password) {
        validateAdminRegistration(name, library, email, password);
        int newId = AdminModule.maxAdminId(adminRoot) + 1;
        AdminModule.AdminNode admin = AdminModule.createAdmin(newId, name.trim(), email.trim(), password, library.trim());
        adminRoot = AdminModule.insertAdmin(adminRoot, admin);
        storage.saveAdmins(adminRoot);
        return admin;
    }

    public UserModule.StudentNode registerUser(String name, String email, String password) {
        validateUserRegistration(name, email, password);
        int newId = UserModule.maxUserId(userRoot) + 1;
        UserModule.StudentNode user = UserModule.createUser(newId, name.trim(), email.trim(), password);
        userRoot = UserModule.insertUser(userRoot, user);
        storage.saveUsers(userRoot);
        return user;
    }

    public void validateAdminRegistration(String name, String library, String email, String password) {
        validateText(name, "Name");
        validateText(library, "Library name");
        validateText(email, "Email");
        validateText(password, "Password");
        if (AdminModule.searchAdminByEmail(adminRoot, email.trim()) != null) {
            throw new IllegalArgumentException("Admin already exists.");
        }
    }

    public void validateUserRegistration(String name, String email, String password) {
        validateText(name, "Name");
        validateText(email, "Email");
        validateText(password, "Password");
        if (UserModule.searchUserByEmail(userRoot, email.trim()) != null) {
            throw new IllegalArgumentException("User already exists.");
        }
    }

    public AdminModule.AdminNode loginAdmin(String email, String password) {
        validateText(email, "Email");
        validateText(password, "Password");
        if (!AdminModule.authenticateAdmin(adminRoot, email.trim(), password)) {
            throw new IllegalArgumentException("Invalid admin email or password.");
        }
        return AdminModule.searchAdminByEmail(adminRoot, email.trim());
    }

    public UserModule.StudentNode loginUser(String email, String password) {
        validateText(email, "Email");
        validateText(password, "Password");
        if (!UserModule.authenticateUser(userRoot, email.trim(), password)) {
            throw new IllegalArgumentException("Invalid user email or password.");
        }
        return UserModule.searchUserByEmail(userRoot, email.trim());
    }

    public void resetPassword(Role role, String email, String newPassword) {
        validateText(email, "Email");
        validateText(newPassword, "New password");

        if (role == Role.USER) {
            UserModule.StudentNode user = UserModule.searchUserByEmail(userRoot, email.trim());
            if (user == null) {
                throw new IllegalArgumentException("User not found for that email.");
            }
            user.password = newPassword;
            storage.saveUsers(userRoot);
            return;
        }

        AdminModule.AdminNode admin = AdminModule.searchAdminByEmail(adminRoot, email.trim());
        if (admin == null) {
            throw new IllegalArgumentException("Admin not found for that email.");
        }
        admin.password = newPassword;
        storage.saveAdmins(adminRoot);
    }

    public List<Bst.BookNode> getAllBooks() {
        return Bst.inOrder(bookRoot);
    }

    public List<Bst.BookNode> getBooksForLibrary(String library) {
        if (library == null || library.isBlank()) {
            return List.of();
        }
        return Bst.visitLibrary(bookRoot, library.trim());
    }

    public List<Bst.BookNode> searchBooks(SearchType type, String query) {
        if (type == SearchType.ID) {
            int bookId;
            try {
                bookId = Integer.parseInt(query.trim());
            } catch (NumberFormatException ex) {
                throw new IllegalArgumentException("Book ID must be a number.");
            }
            Bst.BookNode book = Bst.searchId(bookRoot, bookId);
            return book == null ? List.of() : List.of(book);
        }

        validateText(query, type == SearchType.TITLE ? "Title" : "Author");
        String trimmedQuery = query.trim().toLowerCase();
        List<Bst.BookNode> matches = new ArrayList<>();
        for (Bst.BookNode book : Bst.inOrder(bookRoot)) {
            String value = type == SearchType.TITLE ? book.title : book.author;
            if (value != null && value.toLowerCase().contains(trimmedQuery)) {
                matches.add(book);
            }
        }
        return matches;
    }

    public Bst.BookNode addBook(AdminModule.AdminNode admin, int bookId, String title, String author, int totalCopies) {
        if (admin == null) {
            throw new IllegalArgumentException("Admin session not found.");
        }
        if (bookId <= 0) {
            throw new IllegalArgumentException("Book ID must be positive.");
        }
        if (totalCopies < 0) {
            throw new IllegalArgumentException("Total copies cannot be negative.");
        }
        validateText(title, "Title");
        validateText(author, "Author");
        if (Bst.searchId(bookRoot, bookId) != null) {
            throw new IllegalArgumentException("Book ID already exists.");
        }

        Bst.BookNode node = Bst.createNode(bookId, admin.library, title.trim(), author.trim(), totalCopies);
        bookRoot = Bst.insert(bookRoot, node);
        storage.saveBooks(bookRoot);
        return node;
    }

    public void updateBook(AdminModule.AdminNode admin, int bookId, String title, String author, int availableCopies, int totalCopies) {
        if (admin == null) {
            throw new IllegalArgumentException("Admin session not found.");
        }

        Bst.BookNode book = requireBook(bookId);
        ensureAdminOwnsBook(admin, book);

        if (totalCopies < 0) {
            throw new IllegalArgumentException("Total copies cannot be negative.");
        }
        if (availableCopies < 0) {
            throw new IllegalArgumentException("Available copies cannot be negative.");
        }

        int issuedCopies = countActiveIssuesForBook(bookId);
        if (totalCopies < issuedCopies) {
            throw new IllegalArgumentException("Total copies cannot be less than currently issued copies (" + issuedCopies + ").");
        }
        if (availableCopies > totalCopies - issuedCopies) {
            throw new IllegalArgumentException("Available copies cannot exceed stock that is not currently issued.");
        }

        validateText(title, "Title");
        validateText(author, "Author");
        Bst.edit(book, author.trim(), title.trim(), availableCopies, totalCopies);
        storage.saveBooks(bookRoot);
    }

    public void deleteBook(AdminModule.AdminNode admin, int bookId) {
        if (admin == null) {
            throw new IllegalArgumentException("Admin session not found.");
        }

        Bst.BookNode book = requireBook(bookId);
        ensureAdminOwnsBook(admin, book);
        if (countActiveIssuesForBook(bookId) > 0) {
            throw new IllegalArgumentException("Cannot delete a book that is currently issued.");
        }

        bookRoot = Bst.deleteNode(bookRoot, bookId);
        issueRequestRoot = IssueRequestModule.removeAllForBook(issueRequestRoot, bookId);
        persistAll();
    }

    public LinkedModule.IssueResult issueBook(int studentId, int bookId) {
        LinkedModule.IssueResult result = LinkedModule.issueBook(issueRoot, bookRoot, studentId, bookId, LinkedModule.currentDate());
        issueRoot = result.top;
        if (result.success) {
            persistAll();
        }
        return result;
    }

    /**
     * Student asks to borrow; the book's library admin must approve before a real issue is created.
     */
    public void submitBorrowRequest(int studentId, int bookId) {
        requireBook(bookId);
        if (studentHasActiveLoan(studentId, bookId)) {
            throw new IllegalArgumentException("You already have this book on loan.");
        }
        IssueRequestModule.RequestNode existing = IssueRequestModule.findAny(issueRequestRoot, studentId, bookId);
        if (existing != null && IssueRequestModule.STATUS_PENDING.equals(existing.status)) {
            throw new IllegalArgumentException("You already have a pending request for this book.");
        }
        LinkedModule.DateValue now = LinkedModule.currentDate();
        if (existing != null && IssueRequestModule.STATUS_REJECTED.equals(existing.status)) {
            existing.status = IssueRequestModule.STATUS_PENDING;
            existing.requestedAt = now;
            persistAll();
            return;
        }
        IssueRequestModule.RequestNode node =
                new IssueRequestModule.RequestNode(studentId, bookId, now, IssueRequestModule.STATUS_PENDING);
        issueRequestRoot = IssueRequestModule.prepend(issueRequestRoot, node);
        persistAll();
    }

    public void approveBorrowRequest(AdminModule.AdminNode admin, int studentId, int bookId) {
        if (admin == null) {
            throw new IllegalArgumentException("Admin session not found.");
        }
        Bst.BookNode book = requireBook(bookId);
        ensureAdminOwnsBook(admin, book);
        IssueRequestModule.RequestNode pending = IssueRequestModule.findPending(issueRequestRoot, studentId, bookId);
        if (pending == null) {
            throw new IllegalArgumentException("No pending borrow request for that student and book.");
        }
        LinkedModule.IssueResult result = LinkedModule.issueBook(issueRoot, bookRoot, studentId, bookId, LinkedModule.currentDate());
        issueRoot = result.top;
        if (!result.success) {
            throw new IllegalArgumentException(result.message);
        }
        issueRequestRoot = IssueRequestModule.removeStudentBook(issueRequestRoot, studentId, bookId);
        persistAll();
    }

    public void rejectBorrowRequest(AdminModule.AdminNode admin, int studentId, int bookId) {
        if (admin == null) {
            throw new IllegalArgumentException("Admin session not found.");
        }
        Bst.BookNode book = requireBook(bookId);
        ensureAdminOwnsBook(admin, book);
        IssueRequestModule.RequestNode pending = IssueRequestModule.findPending(issueRequestRoot, studentId, bookId);
        if (pending == null) {
            throw new IllegalArgumentException("No pending borrow request for that student and book.");
        }
        pending.status = IssueRequestModule.STATUS_REJECTED;
        persistAll();
    }

    public List<UserBorrowRequestView> getBorrowRequestViewsForStudent(int studentId) {
        List<UserBorrowRequestView> result = new ArrayList<>();
        for (IssueRequestModule.RequestNode req : IssueRequestModule.allForStudent(issueRequestRoot, studentId)) {
            Bst.BookNode book = Bst.searchId(bookRoot, req.bookId);
            String title = book == null ? "Unknown Book" : book.title;
            String library = book == null ? "Unknown Library" : book.library;
            result.add(new UserBorrowRequestView(
                    req.bookId,
                    title,
                    library,
                    req.requestedAt.toString(),
                    formatRequestStatus(req.status)));
        }
        return result;
    }

    public List<AdminPendingRequestView> getPendingBorrowRequestsForAdminLibrary(String library) {
        List<AdminPendingRequestView> result = new ArrayList<>();
        if (library == null || library.isBlank()) {
            return result;
        }
        for (IssueRequestModule.RequestNode req : IssueRequestModule.pendingForAdminLibrary(issueRequestRoot, bookRoot, library)) {
            UserModule.StudentNode user = findUserById(userRoot, req.studentId);
            String userName = user == null ? "Unknown User (ID " + req.studentId + ")" : user.name;
            String userEmail = user == null ? "—" : user.email;
            Bst.BookNode book = Bst.searchId(bookRoot, req.bookId);
            String title = book == null ? "Unknown Book" : book.title;
            result.add(new AdminPendingRequestView(
                    req.studentId,
                    userName,
                    userEmail,
                    req.bookId,
                    title,
                    req.requestedAt.toString()));
        }
        return result;
    }

    private static String formatRequestStatus(String status) {
        if (IssueRequestModule.STATUS_PENDING.equals(status)) {
            return "Pending approval";
        }
        if (IssueRequestModule.STATUS_REJECTED.equals(status)) {
            return "Rejected";
        }
        return status;
    }

    private boolean studentHasActiveLoan(int studentId, int bookId) {
        for (LinkedModule.IssueNode issue : LinkedModule.issuedBooksForStudent(issueRoot, studentId)) {
            if (issue.bookId == bookId) {
                return true;
            }
        }
        return false;
    }

    public LinkedModule.ReturnResult returnBook(int studentId, int bookId) {
        LinkedModule.ReturnResult result = LinkedModule.returnBook(issueRoot, bookRoot, studentId, bookId, LinkedModule.currentDate());
        issueRoot = result.top;
        if (result.success) {
            persistAll();
        }
        return result;
    }

    public List<UserIssueView> getIssuedBookViewsForStudent(int studentId) {
        List<UserIssueView> result = new ArrayList<>();
        for (LinkedModule.IssueNode issue : LinkedModule.issuedBooksForStudent(issueRoot, studentId)) {
            Bst.BookNode book = Bst.searchId(bookRoot, issue.bookId);
            String title = book == null ? "Unknown Book" : book.title;
            String library = book == null ? "Unknown Library" : book.library;
            result.add(new UserIssueView(issue.bookId, title, library, issue.issueDate.toString(), issue.dueDate.toString()));
        }
        return result;
    }

    public List<AdminIssueView> getIssuedUsersForAdminLibrary(String library) {
        List<AdminIssueView> result = new ArrayList<>();
        if (library == null || library.isBlank()) {
            return result;
        }

        LinkedModule.IssueNode current = issueRoot;
        while (current != null) {
            Bst.BookNode book = Bst.searchId(bookRoot, current.bookId);
            if (book != null && Bst.caseInsensitiveEquals(book.library, library)) {
                UserModule.StudentNode user = findUserById(userRoot, current.studentId);
                String userName = user == null ? "Unknown user (ID " + current.studentId + ")" : user.name;
                String userEmail = user == null ? "—" : user.email;
                result.add(new AdminIssueView(
                        current.studentId,
                        userName,
                        userEmail,
                        current.bookId,
                        book.title,
                        current.issueDate.toString(),
                        current.dueDate.toString()));
            }
            current = current.next;
        }

        return result;
    }

    public Bst.BookNode getBookById(int bookId) {
        return Bst.searchId(bookRoot, bookId);
    }

    public int nextBookId() {
        return Bst.maxBookId(bookRoot) + 1;
    }

    private Bst.BookNode requireBook(int bookId) {
        Bst.BookNode book = Bst.searchId(bookRoot, bookId);
        if (book == null) {
            throw new IllegalArgumentException("Book not found.");
        }
        return book;
    }

    private void ensureAdminOwnsBook(AdminModule.AdminNode admin, Bst.BookNode book) {
        if (!Bst.caseInsensitiveEquals(admin.library, book.library)) {
            throw new IllegalArgumentException("You can only manage books in your own library.");
        }
    }

    private int countActiveIssuesForBook(int bookId) {
        int count = 0;
        LinkedModule.IssueNode current = issueRoot;
        while (current != null) {
            if (current.bookId == bookId) {
                count += 1;
            }
            current = current.next;
        }
        return count;
    }

    private UserModule.StudentNode findUserById(UserModule.StudentNode root, int studentId) {
        if (root == null) {
            return null;
        }
        if (root.id == studentId) {
            return root;
        }

        UserModule.StudentNode leftMatch = findUserById(root.left, studentId);
        if (leftMatch != null) {
            return leftMatch;
        }
        return findUserById(root.right, studentId);
    }

    private void validateText(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " is required.");
        }
    }

    private static Path resolveBaseDirectory(Path startDirectory) {
        Path current = startDirectory.toAbsolutePath().normalize();
        for (int i = 0; i < 6 && current != null; i++) {
            if (looksLikeDataDirectory(current)) {
                return current;
            }
            current = current.getParent();
        }
        return startDirectory.toAbsolutePath().normalize();
    }

    private static boolean looksLikeDataDirectory(Path directory) {
        return Files.exists(directory.resolve("data_book.txt"))
                && Files.exists(directory.resolve("user_login.txt"))
                && Files.exists(directory.resolve("admin_login.txt"));
    }
}
