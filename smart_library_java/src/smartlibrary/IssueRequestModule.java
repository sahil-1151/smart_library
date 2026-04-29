package smartlibrary;

import java.util.ArrayList;
import java.util.List;

public final class IssueRequestModule {
    private IssueRequestModule() {
    }

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_REJECTED = "REJECTED";

    public static final class RequestNode {
        public int studentId;
        public int bookId;
        public LinkedModule.DateValue requestedAt;
        public String status;
        public RequestNode next;

        public RequestNode(int studentId, int bookId, LinkedModule.DateValue requestedAt, String status) {
            this.studentId = studentId;
            this.bookId = bookId;
            this.requestedAt = requestedAt;
            this.status = status;
        }
    }

    public static RequestNode prepend(RequestNode top, RequestNode node) {
        node.next = top;
        return node;
    }

    public static RequestNode findAny(RequestNode top, int studentId, int bookId) {
        RequestNode cur = top;
        while (cur != null) {
            if (cur.studentId == studentId && cur.bookId == bookId) {
                return cur;
            }
            cur = cur.next;
        }
        return null;
    }

    public static RequestNode findPending(RequestNode top, int studentId, int bookId) {
        RequestNode cur = top;
        while (cur != null) {
            if (cur.studentId == studentId && cur.bookId == bookId && STATUS_PENDING.equals(cur.status)) {
                return cur;
            }
            cur = cur.next;
        }
        return null;
    }

    /** Removes the first node matching student and book (any status). */
    /** Drops every request row for this book (e.g. when the book is deleted). */
    public static RequestNode removeAllForBook(RequestNode top, int bookId) {
        if (top == null) {
            return null;
        }
        RequestNode rest = removeAllForBook(top.next, bookId);
        if (top.bookId == bookId) {
            return rest;
        }
        top.next = rest;
        return top;
    }

    public static RequestNode removeStudentBook(RequestNode top, int studentId, int bookId) {
        if (top == null) {
            return null;
        }
        if (top.studentId == studentId && top.bookId == bookId) {
            return top.next;
        }
        RequestNode cur = top;
        while (cur.next != null) {
            if (cur.next.studentId == studentId && cur.next.bookId == bookId) {
                cur.next = cur.next.next;
                break;
            }
            cur = cur.next;
        }
        return top;
    }

    public static List<RequestNode> allForStudent(RequestNode top, int studentId) {
        List<RequestNode> list = new ArrayList<>();
        RequestNode cur = top;
        while (cur != null) {
            if (cur.studentId == studentId) {
                list.add(cur);
            }
            cur = cur.next;
        }
        return list;
    }

    public static List<RequestNode> pendingForAdminLibrary(RequestNode top, Bst.BookNode bookRoot, String library) {
        List<RequestNode> list = new ArrayList<>();
        if (library == null || library.isBlank()) {
            return list;
        }
        RequestNode cur = top;
        while (cur != null) {
            if (STATUS_PENDING.equals(cur.status)) {
                Bst.BookNode book = Bst.searchId(bookRoot, cur.bookId);
                if (book != null && Bst.caseInsensitiveEquals(book.library, library)) {
                    list.add(cur);
                }
            }
            cur = cur.next;
        }
        return list;
    }
}
