package smartlibrary;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

public final class StorageModule {
    private final Path baseDirectory;

    public StorageModule(Path baseDirectory) {
        this.baseDirectory = baseDirectory;
    }

    public Bst.BookNode loadBooks() {
        Path path = baseDirectory.resolve("data_book.txt");
        if (!Files.exists(path)) {
            return null;
        }

        Bst.BookNode root = null;
        try {
            for (String line : Files.readAllLines(path, StandardCharsets.UTF_8)) {
                if (line.isBlank()) {
                    continue;
                }
                String[] parts = line.split("\\|", -1);
                if (parts.length < 6) {
                    continue;
                }
                int bookId = parseInt(parts[0]);
                String library = parts[1].trim();
                String title = parts[2].trim();
                String author = parts[3].trim();
                int totalCopies = parseInt(parts[4]);
                int availableCopies = parseInt(parts[5]);

                Bst.BookNode node = Bst.createNode(bookId, library, title, author, totalCopies);
                node.availableCopies = availableCopies;
                root = Bst.insert(root, node);
            }
        } catch (IOException ignored) {
            return null;
        }
        return root;
    }

    public void saveBooks(Bst.BookNode root) {
        StringBuilder builder = new StringBuilder();
        saveBooks(root, builder);
        writeFile("data_book.txt", builder.toString());
    }

    private void saveBooks(Bst.BookNode root, StringBuilder builder) {
        if (root == null) {
            return;
        }
        builder.append(root.bookId).append('|')
                .append(root.library).append('|')
                .append(root.title).append('|')
                .append(root.author).append('|')
                .append(root.totalCopies).append('|')
                .append(root.availableCopies).append('\n');
        saveBooks(root.left, builder);
        saveBooks(root.right, builder);
    }

    public UserModule.StudentNode loadUsers() {
        Path path = baseDirectory.resolve("user_login.txt");
        if (!Files.exists(path)) {
            return null;
        }

        UserModule.StudentNode root = null;
        try {
            for (String line : Files.readAllLines(path, StandardCharsets.UTF_8)) {
                if (line.isBlank()) {
                    continue;
                }
                String[] parts = line.split("\\|", -1);
                if (parts.length < 4) {
                    continue;
                }
                UserModule.StudentNode user = UserModule.createUser(parseInt(parts[0]), parts[1].trim(), parts[2].trim(), parts[3].trim());
                root = UserModule.insertUser(root, user);
            }
        } catch (IOException ignored) {
            return null;
        }
        return root;
    }

    public void saveUsers(UserModule.StudentNode root) {
        StringBuilder builder = new StringBuilder();
        saveUsers(root, builder);
        writeFile("user_login.txt", builder.toString());
    }

    private void saveUsers(UserModule.StudentNode root, StringBuilder builder) {
        if (root == null) {
            return;
        }
        builder.append(root.id).append('|')
                .append(root.name).append('|')
                .append(root.email).append('|')
                .append(root.password).append('\n');
        saveUsers(root.left, builder);
        saveUsers(root.right, builder);
    }

    public AdminModule.AdminNode loadAdmins() {
        Path path = baseDirectory.resolve("admin_login.txt");
        if (!Files.exists(path)) {
            return null;
        }

        AdminModule.AdminNode root = null;
        try {
            for (String line : Files.readAllLines(path, StandardCharsets.UTF_8)) {
                if (line.isBlank()) {
                    continue;
                }
                String[] parts = line.split("\\|", -1);
                if (parts.length < 5) {
                    continue;
                }
                AdminModule.AdminNode admin = AdminModule.createAdmin(parseInt(parts[0]), parts[1].trim(), parts[3].trim(), parts[4].trim(), parts[2].trim());
                root = AdminModule.insertAdmin(root, admin);
            }
        } catch (IOException ignored) {
            return null;
        }
        return root;
    }

    public void saveAdmins(AdminModule.AdminNode root) {
        StringBuilder builder = new StringBuilder();
        saveAdmins(root, builder);
        writeFile("admin_login.txt", builder.toString());
    }

    private void saveAdmins(AdminModule.AdminNode root, StringBuilder builder) {
        if (root == null) {
            return;
        }
        builder.append(root.id).append('|')
                .append(root.name).append('|')
                .append(root.library).append('|')
                .append(root.email).append('|')
                .append(root.password).append('\n');
        saveAdmins(root.left, builder);
        saveAdmins(root.right, builder);
    }

    public LinkedModule.IssueNode loadIssuedBooks() {
        Path path = baseDirectory.resolve("issue_book.txt");
        if (!Files.exists(path)) {
            return null;
        }

        LinkedModule.IssueNode top = null;
        try {
            for (String line : Files.readAllLines(path, StandardCharsets.UTF_8)) {
                if (line.isBlank()) {
                    continue;
                }
                String[] parts = line.split("\\|", -1);
                if (parts.length < 8) {
                    continue;
                }
                LinkedModule.DateValue issue = new LinkedModule.DateValue(parseInt(parts[2]), parseInt(parts[3]), parseInt(parts[4]));
                LinkedModule.DateValue due = new LinkedModule.DateValue(parseInt(parts[5]), parseInt(parts[6]), parseInt(parts[7]));
                LinkedModule.IssueNode node = LinkedModule.createIssueNode(parseInt(parts[0]), parseInt(parts[1]), issue, due);
                node.next = top;
                top = node;
            }
        } catch (IOException ignored) {
            return null;
        }
        return top;
    }

    public void saveIssuedBooks(LinkedModule.IssueNode top) {
        StringBuilder builder = new StringBuilder();
        LinkedModule.IssueNode current = top;
        while (current != null) {
            builder.append(current.studentId).append('|')
                    .append(current.bookId).append('|')
                    .append(current.issueDate.day).append('|')
                    .append(current.issueDate.month).append('|')
                    .append(current.issueDate.year).append('|')
                    .append(current.dueDate.day).append('|')
                    .append(current.dueDate.month).append('|')
                    .append(current.dueDate.year).append('\n');
            current = current.next;
        }
        writeFile("issue_book.txt", builder.toString());
    }

    public IssueRequestModule.RequestNode loadIssueRequests() {
        Path path = baseDirectory.resolve("issue_request.txt");
        if (!Files.exists(path)) {
            return null;
        }

        IssueRequestModule.RequestNode top = null;
        try {
            for (String line : Files.readAllLines(path, StandardCharsets.UTF_8)) {
                if (line.isBlank()) {
                    continue;
                }
                String[] parts = line.split("\\|", -1);
                if (parts.length < 6) {
                    continue;
                }
                LinkedModule.DateValue requested = new LinkedModule.DateValue(
                        parseInt(parts[2]), parseInt(parts[3]), parseInt(parts[4]));
                String status = parts[5].trim();
                IssueRequestModule.RequestNode node =
                        new IssueRequestModule.RequestNode(parseInt(parts[0]), parseInt(parts[1]), requested, status);
                top = IssueRequestModule.prepend(top, node);
            }
        } catch (IOException ignored) {
            return null;
        }
        return top;
    }

    public void saveIssueRequests(IssueRequestModule.RequestNode top) {
        StringBuilder builder = new StringBuilder();
        IssueRequestModule.RequestNode current = top;
        while (current != null) {
            builder.append(current.studentId).append('|')
                    .append(current.bookId).append('|')
                    .append(current.requestedAt.day).append('|')
                    .append(current.requestedAt.month).append('|')
                    .append(current.requestedAt.year).append('|')
                    .append(current.status).append('\n');
            current = current.next;
        }
        writeFile("issue_request.txt", builder.toString());
    }

    public QueueModule.QueueState loadQueue() {
        QueueModule.QueueState state = new QueueModule.QueueState();
        Path path = baseDirectory.resolve("queue_book.txt");
        if (!Files.exists(path)) {
            return state;
        }

        try {
            List<String> lines = Files.readAllLines(path, StandardCharsets.UTF_8);
            for (String line : lines) {
                if (line.isBlank()) {
                    continue;
                }
                String[] parts = line.split("\\|", -1);
                if (parts.length < 2) {
                    continue;
                }
                QueueModule.enqueue(state, parseInt(parts[0]), parseInt(parts[1]));
            }
        } catch (IOException ignored) {
            return state;
        }
        return state;
    }

    public void saveQueue(QueueModule.QueueState state) {
        StringBuilder builder = new StringBuilder();
        QueueModule.QueueNode current = state.front;
        while (current != null) {
            builder.append(current.studentId).append('|')
                    .append(current.bookId).append('\n');
            current = current.next;
        }
        writeFile("queue_book.txt", builder.toString());
    }

    private void writeFile(String fileName, String contents) {
        try {
            Files.writeString(baseDirectory.resolve(fileName), contents, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to write " + fileName, e);
        }
    }

    private int parseInt(String value) {
        return Integer.parseInt(value.trim());
    }
}
