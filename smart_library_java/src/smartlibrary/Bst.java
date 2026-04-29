package smartlibrary;

import java.util.ArrayList;
import java.util.List;

public final class Bst {
    private Bst() {
    }

    public static final class BookNode {
        public int bookId;
        public String title;
        public String author;
        public String library;
        public int totalCopies;
        public int availableCopies;
        public BookNode left;
        public BookNode right;

        public BookNode(int bookId, String library, String title, String author, int totalCopies) {
            this.bookId = bookId;
            this.library = library;
            this.title = title;
            this.author = author;
            this.totalCopies = totalCopies;
            this.availableCopies = totalCopies;
        }
    }

    public static BookNode createNode(int bookId, String library, String title, String author, int totalCopies) {
        return new BookNode(bookId, library, title, author, totalCopies);
    }

    public static BookNode insert(BookNode root, BookNode newNode) {
        if (newNode == null) {
            return root;
        }
        if (root == null) {
            return newNode;
        }
        if (root.bookId == newNode.bookId) {
            return root;
        }
        if (newNode.bookId < root.bookId) {
            root.left = insert(root.left, newNode);
        } else {
            root.right = insert(root.right, newNode);
        }
        return root;
    }

    public static void edit(BookNode node, String author, String title, int availableCopies, int totalCopies) {
        if (node == null) {
            return;
        }
        node.author = author;
        node.title = title;
        node.totalCopies = totalCopies;
        node.availableCopies = Math.max(0, Math.min(availableCopies, totalCopies));
    }

    public static BookNode searchId(BookNode root, int bookId) {
        if (root == null || root.bookId == bookId) {
            return root;
        }
        if (bookId < root.bookId) {
            return searchId(root.left, bookId);
        }
        return searchId(root.right, bookId);
    }

    public static boolean caseInsensitiveEquals(String a, String b) {
        return a != null && b != null && a.equalsIgnoreCase(b);
    }

    public static List<BookNode> searchString(BookNode root, String query) {
        List<BookNode> matches = new ArrayList<>();
        searchString(root, query, matches);
        return matches;
    }

    private static void searchString(BookNode root, String query, List<BookNode> matches) {
        if (root == null) {
            return;
        }
        if (caseInsensitiveEquals(root.title, query) || caseInsensitiveEquals(root.author, query)) {
            matches.add(root);
        }
        searchString(root.left, query, matches);
        searchString(root.right, query, matches);
    }

    public static BookNode deleteNode(BookNode root, int bookId) {
        if (root == null) {
            return null;
        }
        if (bookId < root.bookId) {
            root.left = deleteNode(root.left, bookId);
            return root;
        }
        if (bookId > root.bookId) {
            root.right = deleteNode(root.right, bookId);
            return root;
        }
        if (root.left == null) {
            return root.right;
        }
        if (root.right == null) {
            return root.left;
        }

        BookNode successor = findMin(root.right);
        root.bookId = successor.bookId;
        root.library = successor.library;
        root.title = successor.title;
        root.author = successor.author;
        root.totalCopies = successor.totalCopies;
        root.availableCopies = successor.availableCopies;
        root.right = deleteNode(root.right, successor.bookId);
        return root;
    }

    public static BookNode findMin(BookNode root) {
        BookNode current = root;
        while (current != null && current.left != null) {
            current = current.left;
        }
        return current;
    }

    public static List<BookNode> inOrder(BookNode root) {
        List<BookNode> books = new ArrayList<>();
        inOrder(root, books);
        return books;
    }

    private static void inOrder(BookNode root, List<BookNode> books) {
        if (root == null) {
            return;
        }
        inOrder(root.left, books);
        books.add(root);
        inOrder(root.right, books);
    }

    public static List<BookNode> visitLibrary(BookNode root, String library) {
        List<BookNode> books = new ArrayList<>();
        visitLibrary(root, library, books);
        return books;
    }

    private static void visitLibrary(BookNode root, String library, List<BookNode> books) {
        if (root == null) {
            return;
        }
        if (caseInsensitiveEquals(root.library, library)) {
            books.add(root);
        }
        visitLibrary(root.left, library, books);
        visitLibrary(root.right, library, books);
    }

    public static int maxBookId(BookNode root) {
        if (root == null) {
            return 0;
        }
        return Math.max(root.bookId, Math.max(maxBookId(root.left), maxBookId(root.right)));
    }
}
