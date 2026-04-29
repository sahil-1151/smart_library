package smartlibrary.swing;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.regex.Pattern;

final class SmartLibraryRepository {
    private static final Pattern GMAIL_AND = Pattern.compile("&");
    private static final Pattern DASHES = Pattern.compile("[_-]+");
    private static final Pattern MULTI_SPACE = Pattern.compile("\\s+");
    private static final Pattern NON_ALNUM_SPACE = Pattern.compile("[^a-z0-9\\s]");

    private final Path root;

    SmartLibraryRepository(Path root) {
        this.root = root;
    }

    Path root() {
        return root;
    }

    LibraryState load() throws IOException {
        ensureAllFiles();

        LibraryState state = new LibraryState();
        state.books.addAll(parseBooks(readFile("data_book.txt")));
        state.users.addAll(parseUsers(readFile("user_login.txt")));
        state.admins.addAll(parseAdmins(readFile("admin_login.txt")));
        state.issued.addAll(parseIssued(readFile("issue_book.txt")));
        state.issueRequests.addAll(parseIssueRequests(readFile("issue_request.txt")));
        state.issueHistory.addAll(parseIssueHistory(readFile("issue_history.txt")));
        state.slotBookings.addAll(parseSlotBookings(readFile("slot_booking.txt")));
        state.queue.addAll(parseQueue(readFile("queue_book.txt")));

        if (state.issueHistory.isEmpty() && !state.issueRequests.isEmpty()) {
            for (IssueRequestRecord request : state.issueRequests) {
                state.issueHistory.add(new IssueRequestRecord(
                    request.studentId,
                    request.bookId,
                    request.requestDate,
                    "Pending"
                ));
            }
        }

        return state;
    }

    void save(LibraryState state) throws IOException {
        ensureAllFiles();
        writeFile("data_book.txt", serializeBooks(state.books));
        writeFile("user_login.txt", serializeUsers(state.users));
        writeFile("admin_login.txt", serializeAdmins(state.admins));
        writeFile("issue_book.txt", serializeIssued(state.issued));
        writeFile("issue_request.txt", serializeIssueRequests(state.issueRequests));
        writeFile("issue_history.txt", serializeIssueHistory(state.issueHistory));
        writeFile("slot_booking.txt", serializeSlotBookings(state.slotBookings));
        writeFile("queue_book.txt", serializeQueue(state.queue));
    }

    private void ensureAllFiles() throws IOException {
        Files.createDirectories(root);
        ensureFile("data_book.txt");
        ensureFile("user_login.txt");
        ensureFile("admin_login.txt");
        ensureFile("issue_book.txt");
        ensureFile("issue_request.txt");
        ensureFile("issue_history.txt");
        ensureFile("slot_booking.txt");
        ensureFile("queue_book.txt");
    }

    private void ensureFile(String name) throws IOException {
        Path path = root.resolve(name);
        if (Files.notExists(path)) {
            Files.writeString(path, "", StandardCharsets.UTF_8);
        }
    }

    private String readFile(String name) throws IOException {
        return Files.readString(root.resolve(name), StandardCharsets.UTF_8);
    }

    private void writeFile(String name, String content) throws IOException {
        Path target = root.resolve(name);
        Path temp = root.resolve(name + ".tmp");
        Files.writeString(temp, content, StandardCharsets.UTF_8);
        Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
    }

    private List<Book> parseBooks(String text) {
        return text.lines()
            .map(String::trim)
            .filter(line -> !line.isEmpty())
            .map(line -> line.split("\\|", -1))
            .filter(parts -> parts.length >= 6)
            .map(parts -> new Book(
                parseInt(parts[0], 0),
                parts[1].trim(),
                parts[2].trim(),
                parts[3].trim(),
                parseInt(parts[4], 0),
                parseInt(parts[5], parseInt(parts[4], 0))
            ))
            .toList();
    }

    private List<UserAccount> parseUsers(String text) {
        return text.lines()
            .map(String::trim)
            .filter(line -> !line.isEmpty())
            .map(line -> line.split("\\|", -1))
            .filter(parts -> parts.length >= 4)
            .map(parts -> new UserAccount(
                parseInt(parts[0], 0),
                parts[1].trim(),
                parts[2].trim(),
                parts[3].trim()
            ))
            .toList();
    }

    private List<AdminAccount> parseAdmins(String text) {
        return text.lines()
            .map(String::trim)
            .filter(line -> !line.isEmpty())
            .map(line -> line.split("\\|", -1))
            .filter(parts -> parts.length >= 5)
            .map(parts -> {
                String first = parts[1].trim();
                String second = parts[2].trim();
                boolean swapped = looksLikeLibraryLabel(first) && !looksLikeLibraryLabel(second);
                String name = swapped ? second : first;
                String lib = swapped ? first : second;
                return new AdminAccount(
                    parseInt(parts[0], 0),
                    name,
                    parts[3].trim(),
                    parts[4].trim(),
                    lib
                );
            })
            .toList();
    }

    private List<IssueRecord> parseIssued(String text) {
        return text.lines()
            .map(String::trim)
            .filter(line -> !line.isEmpty())
            .map(line -> line.split("\\|", -1))
            .filter(parts -> parts.length >= 8)
            .map(parts -> new IssueRecord(
                parseInt(parts[0], 0),
                parseInt(parts[1], 0),
                new DateParts(parseInt(parts[2], 0), parseInt(parts[3], 0), parseInt(parts[4], 0)),
                new DateParts(parseInt(parts[5], 0), parseInt(parts[6], 0), parseInt(parts[7], 0)),
                0,
                false
            ))
            .filter(record -> record.studentId > 0 && record.bookId > 0)
            .toList();
    }

    private List<IssueRequestRecord> parseIssueRequests(String text) {
        return text.lines()
            .map(String::trim)
            .filter(line -> !line.isEmpty())
            .map(line -> line.split("\\|", -1))
            .filter(parts -> parts.length >= 5)
            .map(parts -> new IssueRequestRecord(
                parseInt(parts[0], 0),
                parseInt(parts[1], 0),
                new DateParts(parseInt(parts[2], 0), parseInt(parts[3], 0), parseInt(parts[4], 0)),
                "Pending"
            ))
            .filter(record -> record.studentId > 0 && record.bookId > 0)
            .toList();
    }

    private List<IssueRequestRecord> parseIssueHistory(String text) {
        return text.lines()
            .map(String::trim)
            .filter(line -> !line.isEmpty())
            .map(line -> line.split("\\|", -1))
            .filter(parts -> parts.length >= 6)
            .map(parts -> new IssueRequestRecord(
                parseInt(parts[0], 0),
                parseInt(parts[1], 0),
                new DateParts(parseInt(parts[2], 0), parseInt(parts[3], 0), parseInt(parts[4], 0)),
                parts[5].trim().isEmpty() ? "Pending" : parts[5].trim()
            ))
            .filter(record -> record.studentId > 0 && record.bookId > 0)
            .toList();
    }

    private List<SlotBooking> parseSlotBookings(String text) {
        return text.lines()
            .map(String::trim)
            .filter(line -> !line.isEmpty())
            .map(line -> line.split("\\|", -1))
            .filter(parts -> parts.length >= 6)
            .map(parts -> new SlotBooking(
                parseInt(parts[0], 0),
                parseInt(parts[1], 0),
                new DateParts(parseInt(parts[2], 0), parseInt(parts[3], 0), parseInt(parts[4], 0)),
                parseInt(parts[5], 0)
            ))
            .filter(record -> record.studentId > 0 && record.bookId > 0 && record.slotId > 0)
            .toList();
    }

    private List<QueueEntry> parseQueue(String text) {
        return text.lines()
            .map(String::trim)
            .filter(line -> !line.isEmpty())
            .map(line -> line.split("\\|", -1))
            .filter(parts -> parts.length >= 2)
            .map(parts -> new QueueEntry(parseInt(parts[0], 0), parseInt(parts[1], 0)))
            .filter(entry -> entry.studentId > 0 && entry.bookId > 0)
            .toList();
    }

    private String serializeBooks(List<Book> books) {
        StringBuilder builder = new StringBuilder();
        for (Book book : books) {
            builder.append(book.bookId).append('|')
                .append(nullSafe(book.lib)).append('|')
                .append(nullSafe(book.title)).append('|')
                .append(nullSafe(book.author)).append('|')
                .append(book.totalCopies).append('|')
                .append(book.availableCopies).append('\n');
        }
        return builder.toString();
    }

    private String serializeUsers(List<UserAccount> users) {
        StringBuilder builder = new StringBuilder();
        for (UserAccount user : users) {
            builder.append(user.id).append('|')
                .append(nullSafe(user.name)).append('|')
                .append(nullSafe(user.email)).append('|')
                .append(nullSafe(user.password)).append('\n');
        }
        return builder.toString();
    }

    private String serializeAdmins(List<AdminAccount> admins) {
        StringBuilder builder = new StringBuilder();
        for (AdminAccount admin : admins) {
            builder.append(admin.id).append('|')
                .append(nullSafe(admin.name)).append('|')
                .append(nullSafe(admin.lib)).append('|')
                .append(nullSafe(admin.email)).append('|')
                .append(nullSafe(admin.password)).append('\n');
        }
        return builder.toString();
    }

    private String serializeIssued(List<IssueRecord> issued) {
        StringBuilder builder = new StringBuilder();
        for (IssueRecord record : issued) {
            if (record.returned) {
                continue;
            }
            builder.append(record.studentId).append('|')
                .append(record.bookId).append('|')
                .append(record.issueDate.day).append('|')
                .append(record.issueDate.month).append('|')
                .append(record.issueDate.year).append('|')
                .append(record.dueDate.day).append('|')
                .append(record.dueDate.month).append('|')
                .append(record.dueDate.year).append('\n');
        }
        return builder.toString();
    }

    private String serializeIssueRequests(List<IssueRequestRecord> requests) {
        StringBuilder builder = new StringBuilder();
        for (IssueRequestRecord request : requests) {
            builder.append(request.studentId).append('|')
                .append(request.bookId).append('|')
                .append(request.requestDate.day).append('|')
                .append(request.requestDate.month).append('|')
                .append(request.requestDate.year).append('\n');
        }
        return builder.toString();
    }

    private String serializeIssueHistory(List<IssueRequestRecord> history) {
        StringBuilder builder = new StringBuilder();
        for (IssueRequestRecord request : history) {
            String status = (request.status == null || request.status.isBlank()) ? "Pending" : request.status;
            builder.append(request.studentId).append('|')
                .append(request.bookId).append('|')
                .append(request.requestDate.day).append('|')
                .append(request.requestDate.month).append('|')
                .append(request.requestDate.year).append('|')
                .append(nullSafe(status)).append('\n');
        }
        return builder.toString();
    }

    private String serializeSlotBookings(List<SlotBooking> bookings) {
        StringBuilder builder = new StringBuilder();
        for (SlotBooking booking : bookings) {
            builder.append(booking.studentId).append('|')
                .append(booking.bookId).append('|')
                .append(booking.slotDate.day).append('|')
                .append(booking.slotDate.month).append('|')
                .append(booking.slotDate.year).append('|')
                .append(booking.slotId).append('\n');
        }
        return builder.toString();
    }

    private String serializeQueue(List<QueueEntry> queue) {
        StringBuilder builder = new StringBuilder();
        for (QueueEntry entry : queue) {
            builder.append(entry.studentId).append('|').append(entry.bookId).append('\n');
        }
        return builder.toString();
    }

    private boolean looksLikeLibraryLabel(String value) {
        String raw = value == null ? "" : value.trim();
        String label = raw.toLowerCase();
        return label.contains("lib")
            || label.contains("library")
            || label.contains("centre")
            || label.contains("center")
            || label.contains("knowledge")
            || raw.matches("(?i)^(iit|nit|iiit|jnu|geu|du|bits)[\\s_-].*");
    }

    static boolean libraryMatches(String first, String second) {
        String firstNormalized = normalizeLibrary(first);
        String secondNormalized = normalizeLibrary(second);
        if (firstNormalized.isEmpty() || secondNormalized.isEmpty()) {
            return false;
        }
        if (firstNormalized.equals(secondNormalized)) {
            return true;
        }

        List<String> firstTokens = tokenizeLibrary(firstNormalized);
        List<String> secondTokens = tokenizeLibrary(secondNormalized);
        if (firstTokens.isEmpty() || secondTokens.isEmpty()) {
            return false;
        }

        List<String> smaller = firstTokens.size() <= secondTokens.size() ? firstTokens : secondTokens;
        List<String> larger = smaller == firstTokens ? secondTokens : firstTokens;
        return smaller.stream().allMatch(larger::contains);
    }

    private static String normalizeLibrary(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase();
        normalized = GMAIL_AND.matcher(normalized).replaceAll(" and ");
        normalized = DASHES.matcher(normalized).replaceAll(" ");
        normalized = normalized.replace("bombay", "mumbai");
        normalized = normalized.replace("centre", "center");
        normalized = normalized.replace("lib", "library");
        normalized = NON_ALNUM_SPACE.matcher(normalized).replaceAll(" ");
        normalized = MULTI_SPACE.matcher(normalized).replaceAll(" ").trim();
        return normalized;
    }

    private static List<String> tokenizeLibrary(String normalizedValue) {
        return List.of(normalizedValue.split(" "))
            .stream()
            .map(String::trim)
            .filter(token -> !token.isEmpty())
            .filter(token -> !token.equals("library"))
            .filter(token -> !token.equals("center"))
            .filter(token -> !token.equals("knowledge"))
            .filter(token -> !token.equals("central"))
            .toList();
    }

    private int parseInt(String raw, int fallback) {
        try {
            return Integer.parseInt(raw.trim());
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private String nullSafe(String value) {
        return value == null ? "" : value;
    }
}
