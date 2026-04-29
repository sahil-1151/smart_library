package smartlibrary;

public final class AdminModule {
    private AdminModule() {
    }

    public static final class AdminNode {
        public int id;
        public String library;
        public String name;
        public String email;
        public String password;
        public AdminNode left;
        public AdminNode right;

        public AdminNode(int id, String library, String name, String email, String password) {
            this.id = id;
            this.library = library;
            this.name = name;
            this.email = email;
            this.password = password;
        }
    }

    public static AdminNode createAdmin(int id, String name, String email, String password, String library) {
        return new AdminNode(id, library, name, email, password);
    }

    public static AdminNode insertAdmin(AdminNode root, AdminNode newNode) {
        if (newNode == null) {
            return root;
        }
        if (root == null) {
            return newNode;
        }
        int cmp = newNode.email.compareToIgnoreCase(root.email);
        if (cmp < 0) {
            root.left = insertAdmin(root.left, newNode);
        } else if (cmp > 0) {
            root.right = insertAdmin(root.right, newNode);
        }
        return root;
    }

    public static AdminNode searchAdminByEmail(AdminNode root, String email) {
        if (root == null) {
            return null;
        }
        int cmp = email.compareToIgnoreCase(root.email);
        if (cmp == 0) {
            return root;
        }
        if (cmp < 0) {
            return searchAdminByEmail(root.left, email);
        }
        return searchAdminByEmail(root.right, email);
    }

    public static boolean authenticateAdmin(AdminNode root, String email, String password) {
        AdminNode admin = searchAdminByEmail(root, email);
        return admin != null && admin.password.equals(password);
    }

    public static int maxAdminId(AdminNode root) {
        if (root == null) {
            return 0;
        }
        return Math.max(root.id, Math.max(maxAdminId(root.left), maxAdminId(root.right)));
    }
}
