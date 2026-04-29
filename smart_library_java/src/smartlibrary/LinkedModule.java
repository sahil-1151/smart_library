package smartlibrary;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

public final class LinkedModule {
    private LinkedModule() {
    }

    public static final class DateValue {
        public int day;
        public int month;
        public int year;

        public DateValue(int day, int month, int year) {
            this.day = day;
            this.month = month;
            this.year = year;
        }

        public LocalDate toLocalDate() {
            return LocalDate.of(year, month, day);
        }

        @Override
        public String toString() {
            return day + "/" + month + "/" + year;
        }
    }

    public static final class IssueNode {
        public int studentId;
        public int bookId;
        public DateValue issueDate;
        public DateValue dueDate;
        public int fine;
        public IssueNode next;

        public IssueNode(int studentId, int bookId, DateValue issueDate, DateValue dueDate) {
            this.studentId = studentId;
            this.bookId = bookId;
            this.issueDate = issueDate;
            this.dueDate = dueDate;
        }
    }

    public static final class IssueResult {
        public final IssueNode top;
        public final boolean success;
        public final String message;

        public IssueResult(IssueNode top, boolean success, String message) {
            this.top = top;
            this.success = success;
            this.message = message;
        }
    }

    public static final class ReturnResult {
        public final IssueNode top;
        public final boolean success;
        public final int fine;
        public final String message;

        public ReturnResult(IssueNode top, boolean success, int fine, String message) {
            this.top = top;
            this.success = success;
            this.fine = fine;
            this.message = message;
        }
    }

    public static DateValue currentDate() {
        LocalDate today = LocalDate.now();
        return new DateValue(today.getDayOfMonth(), today.getMonthValue(), today.getYear());
    }

    public static int compareDate(DateValue first, DateValue second) {
        return first.toLocalDate().compareTo(second.toLocalDate());
    }

    public static DateValue addDays(DateValue date, int days) {
        LocalDate updated = date.toLocalDate().plusDays(days);
        return new DateValue(updated.getDayOfMonth(), updated.getMonthValue(), updated.getYear());
    }

    public static IssueNode createIssueNode(int studentId, int bookId, DateValue issueDate, DateValue dueDate) {
        return new IssueNode(studentId, bookId, issueDate, dueDate);
    }

    public static IssueResult issueBook(IssueNode top, Bst.BookNode bookRoot, int studentId, int bookId, DateValue issueDate) {
        Bst.BookNode book = Bst.searchId(bookRoot, bookId);
        if (book == null) {
            return new IssueResult(top, false, "Book not found.");
        }
        if (book.availableCopies <= 0) {
            return new IssueResult(top, false, "No copies available.");
        }

        DateValue dueDate = addDays(issueDate, 14);
        IssueNode issueNode = createIssueNode(studentId, bookId, issueDate, dueDate);
        issueNode.next = top;
        book.availableCopies -= 1;
        return new IssueResult(issueNode, true, "Book issued successfully.");
    }

    public static ReturnResult returnBook(IssueNode top, Bst.BookNode bookRoot, int studentId, int bookId, DateValue returnDate) {
        IssueNode current = top;
        IssueNode previous = null;

        while (current != null) {
            if (current.studentId == studentId && current.bookId == bookId) {
                LocalDate due = current.dueDate.toLocalDate();
                LocalDate actual = returnDate.toLocalDate();
                long lateDays = Math.max(0L, ChronoUnit.DAYS.between(due, actual));
                int fine = (int) lateDays * 10;

                if (previous == null) {
                    top = current.next;
                } else {
                    previous.next = current.next;
                }

                Bst.BookNode book = Bst.searchId(bookRoot, bookId);
                if (book != null) {
                    book.availableCopies = Math.min(book.totalCopies, book.availableCopies + 1);
                }

                return new ReturnResult(top, true, fine, fine > 0 ? "Book returned with fine." : "Book returned successfully.");
            }
            previous = current;
            current = current.next;
        }

        return new ReturnResult(top, false, 0, "No issued record found for this book.");
    }

    public static List<IssueNode> issuedBooksForStudent(IssueNode top, int studentId) {
        List<IssueNode> result = new ArrayList<>();
        IssueNode current = top;
        while (current != null) {
            if (current.studentId == studentId) {
                result.add(current);
            }
            current = current.next;
        }
        return result;
    }
}
