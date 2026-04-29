package smartlibrary.swing;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

public final class LibraryModels {
    private LibraryModels() {
    }
}

final class LibraryState {
    final List<Book> books = new ArrayList<>();
    final List<UserAccount> users = new ArrayList<>();
    final List<AdminAccount> admins = new ArrayList<>();
    final List<IssueRecord> issued = new ArrayList<>();
    final List<IssueRequestRecord> issueRequests = new ArrayList<>();
    final List<IssueRequestRecord> issueHistory = new ArrayList<>();
    final List<SlotBooking> slotBookings = new ArrayList<>();
    final List<QueueEntry> queue = new ArrayList<>();
}

final class DateParts {
    final int day;
    final int month;
    final int year;

    DateParts(int day, int month, int year) {
        this.day = day;
        this.month = month;
        this.year = year;
    }

    static DateParts from(LocalDate date) {
        return new DateParts(date.getDayOfMonth(), date.getMonthValue(), date.getYear());
    }

    static DateParts today() {
        return from(LocalDate.now());
    }

    LocalDate toLocalDate() {
        return LocalDate.of(year, month, day);
    }

    DateParts addDays(int days) {
        return from(toLocalDate().plusDays(days));
    }

    String format() {
        return day + "/" + month + "/" + year;
    }
}

final class Book {
    int bookId;
    String lib;
    String title;
    String author;
    int totalCopies;
    int availableCopies;

    Book(int bookId, String lib, String title, String author, int totalCopies, int availableCopies) {
        this.bookId = bookId;
        this.lib = lib;
        this.title = title;
        this.author = author;
        this.totalCopies = totalCopies;
        this.availableCopies = availableCopies;
    }
}

final class UserAccount {
    int id;
    String name;
    String email;
    String password;

    UserAccount(int id, String name, String email, String password) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.password = password;
    }
}

final class AdminAccount {
    int id;
    String name;
    String email;
    String password;
    String lib;

    AdminAccount(int id, String name, String email, String password, String lib) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.password = password;
        this.lib = lib;
    }
}

final class IssueRecord {
    int studentId;
    int bookId;
    DateParts issueDate;
    DateParts dueDate;
    int fine;
    boolean returned;

    IssueRecord(int studentId, int bookId, DateParts issueDate, DateParts dueDate, int fine, boolean returned) {
        this.studentId = studentId;
        this.bookId = bookId;
        this.issueDate = issueDate;
        this.dueDate = dueDate;
        this.fine = fine;
        this.returned = returned;
    }
}

final class IssueRequestRecord {
    int studentId;
    int bookId;
    DateParts requestDate;
    String status;

    IssueRequestRecord(int studentId, int bookId, DateParts requestDate, String status) {
        this.studentId = studentId;
        this.bookId = bookId;
        this.requestDate = requestDate;
        this.status = status;
    }
}

final class SlotBooking {
    int studentId;
    int bookId;
    DateParts slotDate;
    int slotId;

    SlotBooking(int studentId, int bookId, DateParts slotDate, int slotId) {
        this.studentId = studentId;
        this.bookId = bookId;
        this.slotDate = slotDate;
        this.slotId = slotId;
    }
}

final class QueueEntry {
    int studentId;
    int bookId;

    QueueEntry(int studentId, int bookId) {
        this.studentId = studentId;
        this.bookId = bookId;
    }
}

record OperationResult(boolean ok, String message) {
    static OperationResult ok(String message) {
        return new OperationResult(true, message);
    }

    static OperationResult error(String message) {
        return new OperationResult(false, message);
    }
}

record AuthResult(boolean ok, String type, UserAccount user, AdminAccount admin, String message) {
    static AuthResult user(UserAccount user) {
        return new AuthResult(true, "user", user, null, "");
    }

    static AuthResult admin(AdminAccount admin) {
        return new AuthResult(true, "admin", null, admin, "");
    }

    static AuthResult error(String message) {
        return new AuthResult(false, "", null, null, message);
    }
}

record ApprovalEmailData(
    String email,
    String userName,
    String bookTitle,
    String library,
    String bookId,
    String issueDate,
    String dueDate
) {
}

record ApprovalResult(boolean ok, String message, ApprovalEmailData emailData) {
    static ApprovalResult ok(String message, ApprovalEmailData emailData) {
        return new ApprovalResult(true, message, emailData);
    }

    static ApprovalResult error(String message) {
        return new ApprovalResult(false, message, null);
    }
}

record OtpSendResult(boolean sent, String message, String fallbackOtp) {
}
