package smartlibrary;

import java.util.concurrent.ThreadLocalRandom;

public final class UserModule {
    private UserModule() {
    }

    public static final class StudentNode {
        public int id;
        public String name;
        public String email;
        public String password;
        public StudentNode left;
        public StudentNode right;

        public StudentNode(int id, String name, String email, String password) {
            this.id = id;
            this.name = name;
            this.email = email;
            this.password = password;
        }
    }

    public static StudentNode createUser(int id, String name, String email, String password) {
        return new StudentNode(id, name, email, password);
    }

    public static StudentNode insertUser(StudentNode root, StudentNode newNode) {
        if (newNode == null) {
            return root;
        }
        if (root == null) {
            return newNode;
        }
        int cmp = newNode.email.compareToIgnoreCase(root.email);
        if (cmp < 0) {
            root.left = insertUser(root.left, newNode);
        } else if (cmp > 0) {
            root.right = insertUser(root.right, newNode);
        }
        return root;
    }

    public static StudentNode searchUserByEmail(StudentNode root, String email) {
        if (root == null) {
            return null;
        }
        int cmp = email.compareToIgnoreCase(root.email);
        if (cmp == 0) {
            return root;
        }
        if (cmp < 0) {
            return searchUserByEmail(root.left, email);
        }
        return searchUserByEmail(root.right, email);
    }

    public static boolean authenticateUser(StudentNode root, String email, String password) {
        StudentNode user = searchUserByEmail(root, email);
        return user != null && user.password.equals(password);
    }

    public static int maxUserId(StudentNode root) {
        if (root == null) {
            return 0;
        }
        return Math.max(root.id, Math.max(maxUserId(root.left), maxUserId(root.right)));
    }

    public static int generateOtp() {
        return ThreadLocalRandom.current().nextInt(100000, 1000000);
    }

    public static boolean verify(int otp, int input) {
        return otp == input;
    }

    public static void sendOtpEmail(String email, int otp) {
        OtpEmailService.SendResult result = OtpEmailService.sendOtp(email, otp);
        System.out.println();
        System.out.println(result.message);
        if (!result.sent) {
            System.out.println("[OTP fallback] Email for " + email + ": " + otp);
        }
        System.out.println();
    }
}
