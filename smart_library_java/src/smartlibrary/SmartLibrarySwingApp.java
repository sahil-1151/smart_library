package smartlibrary.swing;

import java.awt.BasicStroke;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Component;
import java.awt.Container;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.Font;
import java.awt.GradientPaint;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.GridLayout;
import java.awt.Image;
import java.awt.Insets;
import java.awt.LayoutManager;
import java.awt.RenderingHints;
import java.awt.Toolkit;
import java.awt.Window;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.event.HierarchyEvent;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.net.URL;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.IntConsumer;
import javax.imageio.ImageIO;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.ImageIcon;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JComponent;
import javax.swing.JDialog;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.OverlayLayout;
import javax.swing.JPanel;
import javax.swing.JPasswordField;
import javax.swing.JScrollPane;
import javax.swing.JTextArea;
import javax.swing.JTextField;
import javax.swing.ScrollPaneConstants;
import javax.swing.SwingConstants;
import javax.swing.SwingUtilities;
import javax.swing.Timer;
import javax.swing.UIManager;
import javax.swing.border.EmptyBorder;
import javax.swing.event.DocumentEvent;
import javax.swing.event.DocumentListener;

public final class SmartLibrarySwingApp {
    private static final String SCREEN_HOME = "home";
    private static final String SCREEN_ABOUT = "about";
    private static final String SCREEN_CONTACT = "contact";
    private static final String SCREEN_REGISTER = "register";
    private static final String SCREEN_REGISTER_OTP = "registerOtp";
    private static final String SCREEN_LOGIN = "login";
    private static final String SCREEN_FORGOT_OTP = "forgotOtp";
    private static final String SCREEN_RESET_PASSWORD = "resetPassword";
    private static final String SCREEN_USER_DASHBOARD = "userDashboard";
    private static final String SCREEN_ADMIN_DASHBOARD = "adminDashboard";

    private static final Color BG = new Color(0xF6F2EA);
    private static final Color BG_DEEP = new Color(0xEFE7DC);
    private static final Color SURFACE = new Color(0xFFFFFF);
    private static final Color SURFACE_2 = new Color(0xF4EFE7);
    private static final Color BORDER = new Color(0xE6DBC9);
    private static final Color INK = new Color(0x0B1320);
    private static final Color MUTED = new Color(0x5F6C7B);
    private static final Color ACCENT = new Color(0x0EA5A8);
    private static final Color ACCENT_2 = new Color(0xF97316);
    private static final Color ACCENT_3 = new Color(0x1D4ED8);
    private static final Color SUCCESS = new Color(0x16A34A);
    private static final Color ERROR = new Color(0xDC2626);

    private static final Font DISPLAY_FONT = new Font("SansSerif", Font.BOLD, 28);
    private static final Font SECTION_FONT = new Font("SansSerif", Font.BOLD, 22);
    private static final Font CARD_TITLE_FONT = new Font("SansSerif", Font.BOLD, 18);
    private static final Font BODY_FONT = new Font("SansSerif", Font.PLAIN, 15);
    private static final Font SMALL_FONT = new Font("SansSerif", Font.PLAIN, 13);

    private static final List<FeaturedCover> FEATURED_ROW_ONE = List.of(
        new FeaturedCover("Harry Potter and the Sorcerer's Stone", "https://covers.openlibrary.org/b/isbn/9780439554930-L.jpg"),
        new FeaturedCover("To Kill a Mockingbird", "https://covers.openlibrary.org/b/isbn/9780061120084-L.jpg"),
        new FeaturedCover("The Great Gatsby", "https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg"),
        new FeaturedCover("1984", "https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg"),
        new FeaturedCover("Pride and Prejudice", "https://covers.openlibrary.org/b/isbn/9780141439518-L.jpg"),
        new FeaturedCover("The Hobbit", "https://covers.openlibrary.org/b/isbn/9780547928227-L.jpg"),
        new FeaturedCover("The Catcher in the Rye", "https://covers.openlibrary.org/b/isbn/9780316769488-L.jpg"),
        new FeaturedCover("The Alchemist", "https://covers.openlibrary.org/b/isbn/9780061122415-L.jpg"),
        new FeaturedCover("The Book Thief", "https://covers.openlibrary.org/b/isbn/9780375842207-L.jpg"),
        new FeaturedCover("The Hunger Games", "https://covers.openlibrary.org/b/isbn/9780439023528-L.jpg"),
        new FeaturedCover("Sapiens", "https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg"),
        new FeaturedCover("Atomic Habits", "https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg")
    );

    private static final List<FeaturedCover> FEATURED_ROW_TWO = List.of(
        new FeaturedCover("Dune", "https://covers.openlibrary.org/b/isbn/9780441013593-L.jpg"),
        new FeaturedCover("The Shining", "https://covers.openlibrary.org/b/isbn/9780307743657-L.jpg"),
        new FeaturedCover("Gone Girl", "https://covers.openlibrary.org/b/isbn/9780307588371-L.jpg"),
        new FeaturedCover("The Art of War", "https://covers.openlibrary.org/b/isbn/9780140283334-L.jpg"),
        new FeaturedCover("The Subtle Art of Not Giving a F*ck", "https://covers.openlibrary.org/b/isbn/9780062457714-L.jpg"),
        new FeaturedCover("Thinking, Fast and Slow", "https://covers.openlibrary.org/b/isbn/9780374533557-L.jpg"),
        new FeaturedCover("It Ends with Us", "https://covers.openlibrary.org/b/isbn/9781501124020-L.jpg"),
        new FeaturedCover("The Fault in Our Stars", "https://covers.openlibrary.org/b/isbn/9780142424179-L.jpg"),
        new FeaturedCover("The Girl on the Train", "https://covers.openlibrary.org/b/isbn/9781594633669-L.jpg"),
        new FeaturedCover("The Silent Patient", "https://covers.openlibrary.org/b/isbn/9781250301697-L.jpg"),
        new FeaturedCover("The Martian", "https://covers.openlibrary.org/b/isbn/9780804139021-L.jpg"),
        new FeaturedCover("Brave New World", "https://covers.openlibrary.org/b/isbn/9780060850524-L.jpg")
    );

    private final SmartLibraryService service;
    private final SmartLibraryEmailClient emailClient;

    private JFrame frame;
    private JPanel screenCards;
    private java.awt.CardLayout screenLayout;
    private JPanel messageBanner;
    private JLabel messageLabel;
    private JLabel saveStatusLabel;
    private Timer messageTimer;

    private StyledButton navHomeButton;
    private StyledButton navAboutButton;
    private StyledButton navContactButton;
    private StyledButton navLoginButton;
    private StyledButton navSignupButton;
    private StyledButton navDashboardButton;
    private StyledButton navLogoutButton;

    private UserAccount currentUser;
    private AdminAccount currentAdmin;
    private PendingRegistration pendingRegistration;
    private String pendingPasswordResetEmail;

    private JTextField contactEmailField;
    private JTextField contactSubjectField;
    private JTextArea contactBodyArea;

    private JTextField userRegNameField;
    private JTextField userRegEmailField;
    private JPasswordField userRegPasswordField;
    private ResponsiveTextLabel userOtpEmailLabel;
    private JLabel userOtpHintLabel;
    private JTextField userOtpField;

    private JTextField loginEmailField;
    private JPasswordField loginPasswordField;
    private ResponsiveTextLabel forgotOtpEmailLabel;
    private JLabel forgotOtpHintLabel;
    private JTextField forgotOtpField;
    private JPasswordField resetPasswordField;

    private JLabel adminInfoNameLabel;
    private JLabel adminInfoLibraryLabel;
    private JLabel adminInfoIdLabel;
    private JLabel adminInfoEmailLabel;
    private JLabel approvedLoansCountLabel;
    private JTextField addBookIdField;
    private JTextField addBookTitleField;
    private JTextField addBookAuthorField;
    private JTextField addBookTotalField;
    private JPanel adminIssueRequestsListPanel;
    private JPanel adminApprovedListPanel;
    private JPanel adminBooksPanel;
    private JPanel adminBooksPager;
    private int adminBooksPage = 1;

    private JLabel userInfoNameLabel;
    private JLabel userInfoEmailLabel;
    private JLabel userInfoIdLabel;
    private JComboBox<String> userSearchByCombo;
    private JTextField userSearchQueryField;
    private JPanel userSearchResultsPanel;
    private JPanel userSearchResultsPager;
    private JPanel userIssueRequestsListPanel;
    private JPanel userBooksPanel;
    private JPanel userBooksPager;
    private JPanel userIssuedListPanel;
    private List<Book> lastUserSearchResults = List.of();
    private int userSearchPage = 1;
    private int userBooksPage = 1;

    private JDialog editBookDialog;
    private JLabel editBookIdLabel;
    private JTextField editBookTitleField;
    private JTextField editBookAuthorField;
    private JTextField editBookAvailableField;
    private JTextField editBookTotalField;
    private int editingBookId = -1;

    public SmartLibrarySwingApp(Path root) throws Exception {
        this.service = new SmartLibraryService(root);
        this.emailClient = new SmartLibraryEmailClient("http://localhost:8081");
        buildUi();
    }

    public static void main(String[] args) {
        Path root = args.length > 1 ? Paths.get(args[1]) : Paths.get(".").toAbsolutePath().normalize();

        if (args.length > 0 && "--smoke-test".equals(args[0])) {
            runSmokeTest(root);
            return;
        }

        SwingUtilities.invokeLater(() -> {
            try {
                installBaseLookAndFeel();
                SmartLibrarySwingApp app = new SmartLibrarySwingApp(root);
                app.show();
            } catch (Exception ex) {
                ex.printStackTrace();
                JOptionPane.showMessageDialog(
                    null,
                    "Unable to start the Swing port:\n" + ex.getMessage(),
                    "Smart Library",
                    JOptionPane.ERROR_MESSAGE
                );
            }
        });
    }

    private static void installBaseLookAndFeel() {
        UIManager.put("Label.font", BODY_FONT);
        UIManager.put("Button.font", BODY_FONT);
        UIManager.put("TextField.font", BODY_FONT);
        UIManager.put("PasswordField.font", BODY_FONT);
        UIManager.put("ComboBox.font", BODY_FONT);
        UIManager.put("TextArea.font", BODY_FONT);
        UIManager.put("OptionPane.messageFont", BODY_FONT);
    }

    private static void runSmokeTest(Path root) {
        try {
            SmartLibraryService service = new SmartLibraryService(root);
            System.out.println("Smart Library Swing smoke test");
            System.out.println("Root: " + service.root());
            System.out.println("Books: " + service.getBooks().size());
            System.out.println("Users: " + service.getUsers().size());
            System.out.println("Admins: " + service.getAdmins().size());
            System.out.println("Issued: " + service.getIssuedRecords().size());
        } catch (Exception ex) {
            ex.printStackTrace();
            System.exit(1);
        }
    }

    private void buildUi() {
        frame = new JFrame("Smart Library - Java Swing");
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setMinimumSize(new Dimension(860, 640));
        Dimension screenSize = Toolkit.getDefaultToolkit().getScreenSize();
        int width = Math.max(860, Math.min(1380, screenSize.width - 64));
        int height = Math.max(640, Math.min(900, screenSize.height - 88));
        frame.setSize(width, height);
        frame.setLocationRelativeTo(null);
        if (screenSize.width < 1280 || screenSize.height < 800) {
            frame.setExtendedState(JFrame.MAXIMIZED_BOTH);
        }

        GradientBackgroundPanel rootPanel = new GradientBackgroundPanel(new BorderLayout());
        rootPanel.setBorder(new EmptyBorder(0, 0, 0, 0));
        frame.setContentPane(rootPanel);

        rootPanel.add(buildHeader(), BorderLayout.NORTH);

        JPanel center = new JPanel(new BorderLayout());
        center.setOpaque(false);
        center.add(buildMessageBanner(), BorderLayout.NORTH);
        center.add(buildScreens(), BorderLayout.CENTER);
        rootPanel.add(center, BorderLayout.CENTER);

        buildEditBookDialog();
        updateSaveStatus("Local files loaded", false);
        showScreen(SCREEN_HOME);
    }

    private void show() {
        frame.setVisible(true);
    }

    private JComponent buildHeader() {
        HeaderPanel header = new HeaderPanel(new BorderLayout());
        header.setBorder(new EmptyBorder(22, 24, 18, 24));

        JPanel inner = new JPanel(new BorderLayout(24, 16));
        inner.setOpaque(false);

        JPanel brandPanel = new JPanel();
        brandPanel.setOpaque(false);
        brandPanel.setLayout(new BoxLayout(brandPanel, BoxLayout.Y_AXIS));

        JLabel logoLabel = new JLabel("Smart Library");
        logoLabel.setFont(new Font("SansSerif", Font.BOLD, 28));
        logoLabel.setForeground(INK);

        JLabel taglineLabel = new JLabel("Book discovery & reservation");
        taglineLabel.setFont(new Font("SansSerif", Font.PLAIN, 14));
        taglineLabel.setForeground(MUTED);

        brandPanel.add(logoLabel);
        brandPanel.add(Box.createVerticalStrut(4));
        brandPanel.add(taglineLabel);

        JPanel navPanel = new JPanel(new WrapLayout(FlowLayout.CENTER, 10, 8));
        navPanel.setOpaque(false);

        navHomeButton = new StyledButton("Home", ButtonKind.NAV, false);
        navAboutButton = new StyledButton("About", ButtonKind.NAV, false);
        navContactButton = new StyledButton("Contact Us", ButtonKind.NAV, false);
        navLoginButton = new StyledButton("Sign In", ButtonKind.NAV, false);
        navSignupButton = new StyledButton("Sign Up", ButtonKind.CTA, false);
        navDashboardButton = new StyledButton("Workspace", ButtonKind.NAV, false);
        navLogoutButton = new StyledButton("Logout", ButtonKind.NAV, false);

        navHomeButton.addActionListener(e -> showScreen(SCREEN_HOME));
        navAboutButton.addActionListener(e -> showScreen(SCREEN_ABOUT));
        navContactButton.addActionListener(e -> showScreen(SCREEN_CONTACT));
        navLoginButton.addActionListener(e -> showScreen(SCREEN_LOGIN));
        navSignupButton.addActionListener(e -> showScreen(SCREEN_REGISTER));
        navDashboardButton.addActionListener(e -> {
            if (currentAdmin != null) {
                showScreen(SCREEN_ADMIN_DASHBOARD);
            } else if (currentUser != null) {
                showScreen(SCREEN_USER_DASHBOARD);
            } else {
                showScreen(SCREEN_LOGIN);
            }
        });
        navLogoutButton.addActionListener(e -> {
            currentUser = null;
            currentAdmin = null;
            pendingRegistration = null;
            pendingPasswordResetEmail = null;
            showMessage("Logged out successfully", false);
            showScreen(SCREEN_HOME);
        });

        navPanel.add(navHomeButton);
        navPanel.add(navAboutButton);
        navPanel.add(navContactButton);
        navPanel.add(navLoginButton);
        navPanel.add(navSignupButton);
        navPanel.add(navDashboardButton);
        navPanel.add(navLogoutButton);

        saveStatusLabel = new JLabel("Not saved");
        saveStatusLabel.setFont(new Font("SansSerif", Font.BOLD, 11));
        saveStatusLabel.setOpaque(true);
        saveStatusLabel.setBorder(new EmptyBorder(7, 12, 7, 12));
        saveStatusLabel.setHorizontalAlignment(SwingConstants.CENTER);

        JPanel statusWrap = new JPanel(new FlowLayout(FlowLayout.RIGHT, 0, 0));
        statusWrap.setOpaque(false);
        statusWrap.add(saveStatusLabel);

        inner.add(brandPanel, BorderLayout.WEST);
        inner.add(navPanel, BorderLayout.CENTER);
        inner.add(statusWrap, BorderLayout.EAST);

        header.add(inner, BorderLayout.CENTER);
        updateNav();
        return header;
    }

    private JComponent buildMessageBanner() {
        messageBanner = new JPanel(new BorderLayout());
        messageBanner.setBorder(new EmptyBorder(14, 24, 0, 24));
        messageBanner.setOpaque(false);

        RoundedPanel messageCard = new RoundedPanel(new BorderLayout(), false);
        messageCard.setBorder(new EmptyBorder(14, 18, 14, 18));
        messageCard.setPreferredSize(new Dimension(0, 58));

        messageLabel = new JLabel();
        messageLabel.setFont(BODY_FONT);
        messageCard.add(messageLabel, BorderLayout.CENTER);

        messageBanner.add(messageCard, BorderLayout.CENTER);
        messageBanner.setVisible(false);
        return messageBanner;
    }

    private JComponent buildScreens() {
        screenLayout = new java.awt.CardLayout();
        screenCards = new JPanel(screenLayout);
        screenCards.setOpaque(false);
        screenCards.add(wrapScreen(buildHomeScreen()), SCREEN_HOME);
        screenCards.add(wrapScreen(buildAboutScreen()), SCREEN_ABOUT);
        screenCards.add(wrapScreen(buildContactScreen()), SCREEN_CONTACT);
        screenCards.add(wrapScreen(buildRegisterScreen()), SCREEN_REGISTER);
        screenCards.add(wrapScreen(buildRegisterOtpScreen()), SCREEN_REGISTER_OTP);
        screenCards.add(wrapScreen(buildLoginScreen()), SCREEN_LOGIN);
        screenCards.add(wrapScreen(buildForgotOtpScreen()), SCREEN_FORGOT_OTP);
        screenCards.add(wrapScreen(buildResetPasswordScreen()), SCREEN_RESET_PASSWORD);
        screenCards.add(wrapScreen(buildUserDashboardScreen()), SCREEN_USER_DASHBOARD);
        screenCards.add(wrapScreen(buildAdminDashboardScreen()), SCREEN_ADMIN_DASHBOARD);
        return screenCards;
    }

    private JScrollPane wrapScreen(JComponent screen) {
        JScrollPane scrollPane = new JScrollPane(screen);
        scrollPane.setBorder(BorderFactory.createEmptyBorder());
        scrollPane.setHorizontalScrollBarPolicy(ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER);
        scrollPane.getVerticalScrollBar().setUnitIncrement(18);
        scrollPane.setOpaque(false);
        scrollPane.getViewport().setOpaque(false);
        return scrollPane;
    }

    private JPanel createScreenStack() {
        JPanel panel = new JPanel();
        panel.setOpaque(false);
        panel.setBorder(new EmptyBorder(24, 24, 36, 24));
        panel.setLayout(new BoxLayout(panel, BoxLayout.Y_AXIS));
        return panel;
    }

    private JPanel createCardRow() {
        JPanel panel = new JPanel(new WrapLayout(FlowLayout.CENTER, 16, 16));
        panel.setOpaque(false);
        panel.setAlignmentX(Component.CENTER_ALIGNMENT);
        return panel;
    }

    private <T extends JComponent> T limitSectionWidth(T component, int maxWidth) {
        component.setAlignmentX(Component.CENTER_ALIGNMENT);
        component.setMaximumSize(new Dimension(maxWidth, Integer.MAX_VALUE));
        return component;
    }

    private <T extends JComponent> T setPreferredWidth(T component, int width) {
        Dimension preferred = component.getPreferredSize();
        int targetWidth = Math.max(width, preferred.width);
        component.setPreferredSize(new Dimension(targetWidth, preferred.height));
        component.setMinimumSize(new Dimension(Math.min(targetWidth, width), preferred.height));
        return component;
    }

    private JComponent fixedCardWidth(JComponent component, int width) {
        return new WidthConstrainedPanel(component, width);
    }

    private JComponent buildHomeScreen() {
        JPanel screen = createScreenStack();
        screen.add(limitSectionWidth(createFeaturedShelfCard(), 1100));
        return screen;
    }

    private JComponent buildAboutScreen() {
        JPanel screen = createScreenStack();
        screen.add(createScreenHeading("About"));
        screen.add(Box.createVerticalStrut(16));

        RoundedPanel card = new RoundedPanel(new BorderLayout(), true);
        card.setBorder(new EmptyBorder(24, 24, 24, 24));

        JPanel copy = new JPanel();
        copy.setOpaque(false);
        copy.setLayout(new BoxLayout(copy, BoxLayout.Y_AXIS));

        JLabel heading = sectionLabel("Designed for modern library operations");
        ResponsiveTextLabel paragraph = bodyLabel(
            "Smart Library is built to keep everyday library tasks simple, reliable, and efficient. "
                + "Readers can discover titles quickly, check live availability, and submit requests without friction. "
                + "Library teams can review activity, maintain collections, and complete approvals in a clear workflow-focused interface. "
                + "The product combines dependable backend operations with a polished desktop experience for consistent day-to-day use.",
            900
        );
        JLabel remark = new JLabel("- Sahil (B.Tech, Cybersecurity)");
        remark.setFont(new Font("SansSerif", Font.BOLD, 12));
        remark.setForeground(MUTED);
        remark.setAlignmentX(Component.RIGHT_ALIGNMENT);

        copy.add(heading);
        copy.add(Box.createVerticalStrut(10));
        copy.add(paragraph);
        copy.add(Box.createVerticalStrut(18));
        copy.add(remark);

        card.add(copy, BorderLayout.CENTER);
        screen.add(limitSectionWidth(card, 1040));
        return screen;
    }

    private JComponent buildContactScreen() {
        JPanel screen = createScreenStack();
        screen.add(createScreenHeading("Contact Us"));
        screen.add(Box.createVerticalStrut(6));
        screen.add(bodyLabel("Reach the support team for account help, book workflows, or platform guidance.", 1040));
        screen.add(Box.createVerticalStrut(16));

        JPanel grid = createCardRow();
        grid.setOpaque(false);

        RoundedPanel formCard = new RoundedPanel(new BorderLayout(), true);
        formCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        JPanel formStack = new JPanel();
        formStack.setOpaque(false);
        formStack.setLayout(new BoxLayout(formStack, BoxLayout.Y_AXIS));

        formStack.add(sectionLabel("Support request"));
        formStack.add(Box.createVerticalStrut(8));
        formStack.add(bodyLabel("Use this form if you need help with login issues, book requests, reservations, or general support.", 520));
        formStack.add(Box.createVerticalStrut(16));

        contactEmailField = styledTextField();
        contactEmailField.setToolTipText("name@gmail.com");
        contactSubjectField = styledTextField();
        contactBodyArea = styledTextArea(7);

        formStack.add(labeledField("Your email", contactEmailField));
        formStack.add(Box.createVerticalStrut(8));
        formStack.add(labeledField("Subject", contactSubjectField));
        formStack.add(Box.createVerticalStrut(8));
        formStack.add(labeledField("Message", wrapTextArea(contactBodyArea)));
        formStack.add(Box.createVerticalStrut(16));

        StyledButton sendMessageButton = new StyledButton("Send Request", ButtonKind.PRIMARY, false);
        sendMessageButton.addActionListener(e -> handleContactSubmit());
        formStack.add(sendMessageButton);
        formCard.add(formStack, BorderLayout.CENTER);

        RoundedPanel addressCard = new RoundedPanel(new BorderLayout(), true);
        addressCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        JPanel addressStack = new JPanel();
        addressStack.setOpaque(false);
        addressStack.setLayout(new BoxLayout(addressStack, BoxLayout.Y_AXIS));
        addressStack.add(sectionLabel("Support office"));
        addressStack.add(Box.createVerticalStrut(8));
        addressStack.add(bodyLabel("Smart Library Support Office", 360));
        addressStack.add(Box.createVerticalStrut(12));
        addressStack.add(bodyLabel("4th Floor, Meridian House\nBarakhamba Lane, Connaught Place\nNew Delhi, Delhi 110001", 360));
        addressStack.add(Box.createVerticalStrut(12));
        addressStack.add(bodyLabel("Office Hours: Monday to Saturday, 10:00 AM to 6:00 PM", 360));
        addressStack.add(Box.createVerticalStrut(12));
        addressStack.add(bodyLabel("Quick note: Messages sent through the form above reach the support inbox directly.", 360));
        addressCard.add(addressStack, BorderLayout.CENTER);

        grid.add(fixedCardWidth(formCard, 700));
        grid.add(fixedCardWidth(addressCard, 340));

        screen.add(limitSectionWidth(grid, 1120));
        return screen;
    }

    private JComponent buildRegisterScreen() {
        RoundedPanel formCard = new RoundedPanel(new BorderLayout(), true);
        formCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        formCard.setMaximumSize(new Dimension(600, Integer.MAX_VALUE));
        formCard.setAlignmentX(Component.CENTER_ALIGNMENT);

        JPanel formStack = new JPanel();
        formStack.setOpaque(false);
        formStack.setLayout(new BoxLayout(formStack, BoxLayout.Y_AXIS));

        userRegNameField = styledTextField();
        userRegEmailField = styledTextField();
        userRegPasswordField = styledPasswordField();

        formStack.add(inlineLabeledField("Name", userRegNameField, 104));
        formStack.add(Box.createVerticalStrut(8));
        formStack.add(inlineLabeledField("Email", userRegEmailField, 104));
        formStack.add(Box.createVerticalStrut(8));
        formStack.add(inlineLabeledField("Password", userRegPasswordField, 104));
        formStack.add(Box.createVerticalStrut(16));

        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.CENTER, 12, 0));
        buttons.setOpaque(false);
        StyledButton registerButton = new StyledButton("Create Account", ButtonKind.PRIMARY, false);
        StyledButton backButton = new StyledButton("Back to Home", ButtonKind.GHOST, false);
        registerButton.addActionListener(e -> handleUserRegister());
        backButton.addActionListener(e -> showScreen(SCREEN_HOME));
        buttons.add(registerButton);
        buttons.add(backButton);
        formStack.add(buttons);

        formCard.add(formStack, BorderLayout.CENTER);
        setPreferredWidth(formCard, 560);
        return buildAuthEntryScreen("Create your account", formCard);
    }

    private JComponent buildRegisterOtpScreen() {
        JPanel screen = createScreenStack();
        screen.add(createScreenHeading("Verify your email"));
        screen.add(Box.createVerticalStrut(6));
        screen.add(bodyLabel("Enter the one-time code sent to your inbox to complete registration.", 620));
        screen.add(Box.createVerticalStrut(16));

        RoundedPanel card = new RoundedPanel(new BorderLayout(), true);
        card.setBorder(new EmptyBorder(24, 24, 24, 24));
        card.setMaximumSize(new Dimension(600, Integer.MAX_VALUE));

        JPanel stack = new JPanel();
        stack.setOpaque(false);
        stack.setLayout(new BoxLayout(stack, BoxLayout.Y_AXIS));
        userOtpEmailLabel = bodyLabel("", 520);
        userOtpHintLabel = mutedLabel("Check your email for the 6-digit OTP code.");
        userOtpField = styledTextField();

        stack.add(bodyLabel("OTP sent to", 520));
        stack.add(Box.createVerticalStrut(4));
        stack.add(userOtpEmailLabel);
        stack.add(Box.createVerticalStrut(8));
        stack.add(userOtpHintLabel);
        stack.add(Box.createVerticalStrut(16));
        stack.add(inlineLabeledField("Enter OTP", userOtpField, 104));
        stack.add(Box.createVerticalStrut(16));

        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.CENTER, 12, 0));
        buttons.setOpaque(false);
        StyledButton verifyButton = new StyledButton("Verify Code", ButtonKind.PRIMARY, false);
        StyledButton backButton = new StyledButton("Back to Sign Up", ButtonKind.GHOST, false);
        verifyButton.addActionListener(e -> handleUserRegisterOtp());
        backButton.addActionListener(e -> {
            pendingRegistration = null;
            showScreen(SCREEN_REGISTER);
        });
        buttons.add(verifyButton);
        buttons.add(backButton);
        stack.add(buttons);

        card.add(stack, BorderLayout.CENTER);
        setPreferredWidth(card, 560);
        screen.add(limitSectionWidth(card, 620));
        return screen;
    }

    private JComponent buildLoginScreen() {
        RoundedPanel formCard = new RoundedPanel(new BorderLayout(), true);
        formCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        formCard.setMaximumSize(new Dimension(600, Integer.MAX_VALUE));
        formCard.setAlignmentX(Component.CENTER_ALIGNMENT);

        JPanel stack = new JPanel();
        stack.setOpaque(false);
        stack.setLayout(new BoxLayout(stack, BoxLayout.Y_AXIS));

        loginEmailField = styledTextField();
        loginPasswordField = styledPasswordField();
        stack.add(inlineLabeledField("Email", loginEmailField, 104));
        stack.add(Box.createVerticalStrut(8));
        stack.add(inlineLabeledField("Password", loginPasswordField, 104));
        stack.add(Box.createVerticalStrut(16));

        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.CENTER, 12, 0));
        buttons.setOpaque(false);
        StyledButton loginButton = new StyledButton("Sign In", ButtonKind.PRIMARY, false);
        StyledButton forgotButton = new StyledButton("Reset Password", ButtonKind.SECONDARY, false);
        StyledButton backButton = new StyledButton("Back to Home", ButtonKind.GHOST, false);
        loginButton.addActionListener(e -> handleLogin());
        forgotButton.addActionListener(e -> handleForgotPasswordStart());
        backButton.addActionListener(e -> showScreen(SCREEN_HOME));
        buttons.add(loginButton);
        buttons.add(forgotButton);
        buttons.add(backButton);
        stack.add(buttons);

        formCard.add(stack, BorderLayout.CENTER);
        setPreferredWidth(formCard, 560);
        return buildAuthEntryScreen("Sign in", formCard);
    }

    private JComponent buildForgotOtpScreen() {
        JPanel screen = createScreenStack();
        screen.add(createScreenHeading("Reset password"));
        screen.add(Box.createVerticalStrut(6));
        screen.add(bodyLabel("Confirm the OTP from your email to continue setting a new password.", 620));
        screen.add(Box.createVerticalStrut(16));

        RoundedPanel card = new RoundedPanel(new BorderLayout(), true);
        card.setBorder(new EmptyBorder(24, 24, 24, 24));
        card.setMaximumSize(new Dimension(600, Integer.MAX_VALUE));

        JPanel stack = new JPanel();
        stack.setOpaque(false);
        stack.setLayout(new BoxLayout(stack, BoxLayout.Y_AXIS));
        forgotOtpEmailLabel = bodyLabel("", 520);
        forgotOtpHintLabel = mutedLabel("Check your email for the 6-digit OTP code.");
        forgotOtpField = styledTextField();

        stack.add(bodyLabel("OTP sent to", 520));
        stack.add(Box.createVerticalStrut(4));
        stack.add(forgotOtpEmailLabel);
        stack.add(Box.createVerticalStrut(8));
        stack.add(forgotOtpHintLabel);
        stack.add(Box.createVerticalStrut(16));
        stack.add(inlineLabeledField("Enter OTP", forgotOtpField, 104));
        stack.add(Box.createVerticalStrut(16));

        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.CENTER, 12, 0));
        buttons.setOpaque(false);
        StyledButton verifyButton = new StyledButton("Verify Code", ButtonKind.PRIMARY, false);
        StyledButton backButton = new StyledButton("Back to Sign In", ButtonKind.GHOST, false);
        verifyButton.addActionListener(e -> handleForgotOtpVerify());
        backButton.addActionListener(e -> {
            pendingPasswordResetEmail = null;
            showScreen(SCREEN_LOGIN);
        });
        buttons.add(verifyButton);
        buttons.add(backButton);
        stack.add(buttons);

        card.add(stack, BorderLayout.CENTER);
        setPreferredWidth(card, 560);
        screen.add(limitSectionWidth(card, 620));
        return screen;
    }

    private JComponent buildResetPasswordScreen() {
        JPanel screen = createScreenStack();
        screen.add(createScreenHeading("Set a new password"));
        screen.add(Box.createVerticalStrut(6));
        screen.add(bodyLabel("Choose a strong password to secure your account.", 620));
        screen.add(Box.createVerticalStrut(16));

        RoundedPanel card = new RoundedPanel(new BorderLayout(), true);
        card.setBorder(new EmptyBorder(24, 24, 24, 24));
        card.setMaximumSize(new Dimension(600, Integer.MAX_VALUE));

        JPanel stack = new JPanel();
        stack.setOpaque(false);
        stack.setLayout(new BoxLayout(stack, BoxLayout.Y_AXIS));
        resetPasswordField = styledPasswordField();
        stack.add(inlineLabeledField("New Password", resetPasswordField, 104));
        stack.add(Box.createVerticalStrut(18));

        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.CENTER, 12, 0));
        buttons.setOpaque(false);
        StyledButton updateButton = new StyledButton("Save New Password", ButtonKind.PRIMARY, false);
        StyledButton backButton = new StyledButton("Back to Sign In", ButtonKind.GHOST, false);
        updateButton.addActionListener(e -> handleResetPasswordSubmit());
        backButton.addActionListener(e -> {
            pendingPasswordResetEmail = null;
            showScreen(SCREEN_LOGIN);
        });
        buttons.add(updateButton);
        buttons.add(backButton);
        stack.add(buttons);

        card.add(stack, BorderLayout.CENTER);
        setPreferredWidth(card, 560);
        screen.add(limitSectionWidth(card, 620));
        return screen;
    }

    private JComponent buildAdminDashboardScreen() {
        JPanel screen = createScreenStack();
        screen.add(createScreenHeading("Library Operations"));
        screen.add(Box.createVerticalStrut(6));
        screen.add(bodyLabel("Handle requests, manage active loans, and keep your library catalog accurate from a single workspace.", 1120));
        screen.add(Box.createVerticalStrut(16));

        RoundedPanel infoCard = new RoundedPanel(new BorderLayout(), true);
        infoCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        JPanel infoStack = new JPanel();
        infoStack.setOpaque(false);
        infoStack.setLayout(new BoxLayout(infoStack, BoxLayout.Y_AXIS));
        infoStack.add(sectionLabel("Account snapshot"));
        infoStack.add(Box.createVerticalStrut(14));
        adminInfoNameLabel = infoValueLabel();
        adminInfoLibraryLabel = infoValueLabel();
        adminInfoIdLabel = infoValueLabel();
        adminInfoEmailLabel = infoValueLabel();
        infoStack.add(keyValueRow("Name:", adminInfoNameLabel));
        infoStack.add(Box.createVerticalStrut(6));
        infoStack.add(keyValueRow("Library:", adminInfoLibraryLabel));
        infoStack.add(Box.createVerticalStrut(6));
        infoStack.add(keyValueRow("ID:", adminInfoIdLabel));
        infoStack.add(Box.createVerticalStrut(6));
        infoStack.add(keyValueRow("Email:", adminInfoEmailLabel));
        infoCard.add(infoStack, BorderLayout.CENTER);

        RoundedPanel addBookCard = new RoundedPanel(new BorderLayout(), true);
        addBookCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        JPanel addBookStack = new JPanel();
        addBookStack.setOpaque(false);
        addBookStack.setLayout(new BoxLayout(addBookStack, BoxLayout.Y_AXIS));
        addBookStack.add(sectionLabel("Catalog management"));
        addBookStack.add(Box.createVerticalStrut(8));
        addBookStack.add(bodyLabel("Enter complete details to publish a title to your library catalog.", 620));
        addBookStack.add(Box.createVerticalStrut(16));

        addBookIdField = styledTextField();
        addBookTitleField = styledTextField();
        addBookAuthorField = styledTextField();
        addBookTotalField = styledTextField();

        JPanel addBookGrid = new ResponsiveColumnsPanel(2, 1, 720, 12, 12);
        addBookGrid.setOpaque(false);
        addBookGrid.add(labeledField("Book ID", addBookIdField));
        addBookGrid.add(labeledField("Title", addBookTitleField));
        addBookGrid.add(labeledField("Author", addBookAuthorField));
        addBookGrid.add(labeledField("Total copies", addBookTotalField));
        addBookStack.add(addBookGrid);
        addBookStack.add(Box.createVerticalStrut(14));

        StyledButton addBookButton = new StyledButton("Add book", ButtonKind.PRIMARY, false);
        addBookButton.addActionListener(e -> handleAddBook());
        addBookStack.add(addBookButton);
        addBookCard.add(addBookStack, BorderLayout.CENTER);

        RoundedPanel pendingCard = new RoundedPanel(new BorderLayout(), true);
        pendingCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        JPanel pendingStack = new JPanel();
        pendingStack.setOpaque(false);
        pendingStack.setLayout(new BoxLayout(pendingStack, BoxLayout.Y_AXIS));
        pendingStack.add(sectionLabel("Pending borrow requests"));
        pendingStack.add(Box.createVerticalStrut(8));
        pendingStack.add(bodyLabel("Review member requests and approve only when copies are available.", 900));
        pendingStack.add(Box.createVerticalStrut(14));
        adminIssueRequestsListPanel = moduleListPanel();
        pendingStack.add(adminIssueRequestsListPanel);
        pendingCard.add(pendingStack, BorderLayout.CENTER);

        RoundedPanel loansCard = new RoundedPanel(new BorderLayout(), true);
        loansCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        JPanel loansStack = new JPanel();
        loansStack.setOpaque(false);
        loansStack.setLayout(new BoxLayout(loansStack, BoxLayout.Y_AXIS));
        JPanel loansHeader = new JPanel(new BorderLayout());
        loansHeader.setOpaque(false);
        loansHeader.add(sectionLabel("Approved loans"), BorderLayout.WEST);
        approvedLoansCountLabel = createPillLabel("0 active", MUTED, new Color(255, 255, 255, 0));
        loansHeader.add(approvedLoansCountLabel, BorderLayout.EAST);
        loansStack.add(loansHeader);
        loansStack.add(Box.createVerticalStrut(14));
        adminApprovedListPanel = moduleListPanel();
        loansStack.add(adminApprovedListPanel);
        loansCard.add(loansStack, BorderLayout.CENTER);

        RoundedPanel booksCard = new RoundedPanel(new BorderLayout(), true);
        booksCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        JPanel booksStack = new JPanel();
        booksStack.setOpaque(false);
        booksStack.setLayout(new BoxLayout(booksStack, BoxLayout.Y_AXIS));
        booksStack.add(sectionLabel("Books in your library"));
        booksStack.add(Box.createVerticalStrut(8));
        booksStack.add(bodyLabel("Edit, remove, or review titles currently listed for your branch.", 900));
        booksStack.add(Box.createVerticalStrut(14));
        adminBooksPanel = new JPanel(new WrapLayout(FlowLayout.LEFT, 16, 16));
        adminBooksPanel.setOpaque(false);
        adminBooksPager = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        adminBooksPager.setOpaque(false);
        booksStack.add(adminBooksPanel);
        booksStack.add(Box.createVerticalStrut(12));
        booksStack.add(adminBooksPager);
        booksCard.add(booksStack, BorderLayout.CENTER);

        JPanel summaryRow = createCardRow();
        summaryRow.add(fixedCardWidth(infoCard, 340));
        summaryRow.add(fixedCardWidth(addBookCard, 760));

        screen.add(limitSectionWidth(summaryRow, 1120));
        screen.add(Box.createVerticalStrut(14));
        screen.add(limitSectionWidth(pendingCard, 1100));
        screen.add(Box.createVerticalStrut(14));
        screen.add(limitSectionWidth(loansCard, 1100));
        screen.add(Box.createVerticalStrut(14));
        screen.add(limitSectionWidth(booksCard, 1100));
        return screen;
    }

    private JComponent buildUserDashboardScreen() {
        JPanel screen = createScreenStack();
        screen.add(createScreenHeading("My Library"));
        screen.add(Box.createVerticalStrut(6));
        screen.add(bodyLabel("Find books fast, follow your requests, and manage issued titles from one clean workspace.", 1120));
        screen.add(Box.createVerticalStrut(16));

        RoundedPanel infoCard = new RoundedPanel(new BorderLayout(), true);
        infoCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        JPanel infoStack = new JPanel();
        infoStack.setOpaque(false);
        infoStack.setLayout(new BoxLayout(infoStack, BoxLayout.Y_AXIS));
        infoStack.add(sectionLabel("Account snapshot"));
        infoStack.add(Box.createVerticalStrut(14));
        userInfoNameLabel = infoValueLabel();
        userInfoEmailLabel = infoValueLabel();
        userInfoIdLabel = infoValueLabel();
        infoStack.add(keyValueRow("Name:", userInfoNameLabel));
        infoStack.add(Box.createVerticalStrut(6));
        infoStack.add(keyValueRow("Email:", userInfoEmailLabel));
        infoStack.add(Box.createVerticalStrut(6));
        infoStack.add(keyValueRow("ID:", userInfoIdLabel));
        infoCard.add(infoStack, BorderLayout.CENTER);

        RoundedPanel searchCard = new RoundedPanel(new BorderLayout(), true);
        searchCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        JPanel searchStack = new JPanel();
        searchStack.setOpaque(false);
        searchStack.setLayout(new BoxLayout(searchStack, BoxLayout.Y_AXIS));
        searchStack.add(sectionLabel("Find books quickly"));
        searchStack.add(Box.createVerticalStrut(8));
        searchStack.add(bodyLabel("Look up titles, authors, or IDs without spreading the whole dashboard across the screen.", 620));
        searchStack.add(Box.createVerticalStrut(14));

        JPanel searchForm = new ResponsiveColumnsPanel(3, 1, 820, 12, 12);
        searchForm.setOpaque(false);
        userSearchByCombo = new JComboBox<>(new String[] {"title", "author", "id"});
        styleComboBox(userSearchByCombo);
        userSearchQueryField = styledTextField();
        searchForm.add(labeledField("By", userSearchByCombo));
        searchForm.add(labeledField("Query", userSearchQueryField));
        JPanel searchButtonWrap = new JPanel();
        searchButtonWrap.setOpaque(false);
        searchButtonWrap.setLayout(new BoxLayout(searchButtonWrap, BoxLayout.Y_AXIS));
        searchButtonWrap.add(Box.createVerticalStrut(26));
        StyledButton searchButton = new StyledButton("Search", ButtonKind.PRIMARY, false);
        searchButton.addActionListener(e -> handleUserSearch());
        searchButtonWrap.add(searchButton);
        searchButtonWrap.add(Box.createVerticalGlue());
        searchForm.add(searchButtonWrap);
        searchStack.add(searchForm);
        searchCard.add(searchStack, BorderLayout.CENTER);

        RoundedPanel searchResultsCard = new RoundedPanel(new BorderLayout(), true);
        searchResultsCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        JPanel searchResultsStack = new JPanel();
        searchResultsStack.setOpaque(false);
        searchResultsStack.setLayout(new BoxLayout(searchResultsStack, BoxLayout.Y_AXIS));
        searchResultsStack.add(sectionLabel("Search results"));
        searchResultsStack.add(Box.createVerticalStrut(8));
        searchResultsStack.add(bodyLabel("Matching titles appear here so browsing results stays separate from the search form.", 900));
        searchResultsStack.add(Box.createVerticalStrut(14));
        userSearchResultsPanel = new JPanel(new WrapLayout(FlowLayout.LEFT, 16, 16));
        userSearchResultsPanel.setOpaque(false);
        userSearchResultsPager = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        userSearchResultsPager.setOpaque(false);
        searchResultsStack.add(userSearchResultsPanel);
        searchResultsStack.add(Box.createVerticalStrut(12));
        searchResultsStack.add(userSearchResultsPager);
        searchResultsCard.add(searchResultsStack, BorderLayout.CENTER);

        RoundedPanel requestsCard = new RoundedPanel(new BorderLayout(), true);
        requestsCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        JPanel requestsStack = new JPanel();
        requestsStack.setOpaque(false);
        requestsStack.setLayout(new BoxLayout(requestsStack, BoxLayout.Y_AXIS));
        requestsStack.add(sectionLabel("Issue requests"));
        requestsStack.add(Box.createVerticalStrut(8));
        requestsStack.add(bodyLabel("Track every submitted request here until it is approved or rejected.", 900));
        requestsStack.add(Box.createVerticalStrut(14));
        userIssueRequestsListPanel = moduleListPanel();
        requestsStack.add(userIssueRequestsListPanel);
        requestsCard.add(requestsStack, BorderLayout.CENTER);

        RoundedPanel allBooksCard = new RoundedPanel(new BorderLayout(), true);
        allBooksCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        JPanel allBooksStack = new JPanel();
        allBooksStack.setOpaque(false);
        allBooksStack.setLayout(new BoxLayout(allBooksStack, BoxLayout.Y_AXIS));
        allBooksStack.add(sectionLabel("Browse all books"));
        allBooksStack.add(Box.createVerticalStrut(8));
        allBooksStack.add(bodyLabel("Explore the full catalog and request available titles in a single scrollable section.", 900));
        allBooksStack.add(Box.createVerticalStrut(14));
        userBooksPanel = new JPanel(new WrapLayout(FlowLayout.LEFT, 16, 16));
        userBooksPanel.setOpaque(false);
        userBooksPager = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        userBooksPager.setOpaque(false);
        allBooksStack.add(userBooksPanel);
        allBooksStack.add(Box.createVerticalStrut(12));
        allBooksStack.add(userBooksPager);
        allBooksCard.add(allBooksStack, BorderLayout.CENTER);

        RoundedPanel issuedCard = new RoundedPanel(new BorderLayout(), true);
        issuedCard.setBorder(new EmptyBorder(24, 24, 24, 24));
        JPanel issuedStack = new JPanel();
        issuedStack.setOpaque(false);
        issuedStack.setLayout(new BoxLayout(issuedStack, BoxLayout.Y_AXIS));
        issuedStack.add(sectionLabel("Currently issued to you"));
        issuedStack.add(Box.createVerticalStrut(14));
        userIssuedListPanel = moduleListPanel();
        issuedStack.add(userIssuedListPanel);
        issuedCard.add(issuedStack, BorderLayout.CENTER);

        JPanel summaryRow = createCardRow();
        summaryRow.add(fixedCardWidth(infoCard, 320));
        summaryRow.add(fixedCardWidth(searchCard, 780));

        screen.add(limitSectionWidth(summaryRow, 1120));
        screen.add(Box.createVerticalStrut(14));
        screen.add(limitSectionWidth(searchResultsCard, 1100));
        screen.add(Box.createVerticalStrut(14));
        screen.add(limitSectionWidth(requestsCard, 1100));
        screen.add(Box.createVerticalStrut(14));
        screen.add(limitSectionWidth(allBooksCard, 1100));
        screen.add(Box.createVerticalStrut(14));
        screen.add(limitSectionWidth(issuedCard, 1100));
        return screen;
    }

    private void buildEditBookDialog() {
        editBookDialog = new JDialog(frame, "Edit book", true);
        editBookDialog.setSize(430, 420);
        editBookDialog.setLocationRelativeTo(frame);

        GradientBackgroundPanel background = new GradientBackgroundPanel(new BorderLayout());
        background.setBorder(new EmptyBorder(18, 18, 18, 18));
        editBookDialog.setContentPane(background);

        RoundedPanel content = new RoundedPanel(new BorderLayout(), true);
        content.setBorder(new EmptyBorder(22, 22, 22, 22));
        background.add(content, BorderLayout.CENTER);

        JPanel stack = new JPanel();
        stack.setOpaque(false);
        stack.setLayout(new BoxLayout(stack, BoxLayout.Y_AXIS));

        JPanel heading = new JPanel(new BorderLayout());
        heading.setOpaque(false);
        heading.add(sectionLabel("Edit book"), BorderLayout.WEST);
        editBookIdLabel = mutedLabel("");
        heading.add(editBookIdLabel, BorderLayout.EAST);

        stack.add(heading);
        stack.add(Box.createVerticalStrut(16));

        editBookTitleField = styledTextField();
        editBookAuthorField = styledTextField();
        editBookAvailableField = styledTextField();
        editBookTotalField = styledTextField();

        stack.add(labeledField("Title", editBookTitleField));
        stack.add(Box.createVerticalStrut(8));
        stack.add(labeledField("Author", editBookAuthorField));
        stack.add(Box.createVerticalStrut(8));
        stack.add(labeledField("Available copies", editBookAvailableField));
        stack.add(Box.createVerticalStrut(8));
        stack.add(labeledField("Total copies", editBookTotalField));
        stack.add(Box.createVerticalStrut(16));

        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.LEFT, 12, 0));
        buttons.setOpaque(false);
        StyledButton saveButton = new StyledButton("Save", ButtonKind.PRIMARY, false);
        StyledButton cancelButton = new StyledButton("Cancel", ButtonKind.GHOST, false);
        saveButton.addActionListener(e -> handleEditBookSave());
        cancelButton.addActionListener(e -> editBookDialog.setVisible(false));
        buttons.add(saveButton);
        buttons.add(cancelButton);
        stack.add(buttons);

        content.add(stack, BorderLayout.CENTER);
    }

    private JComponent createFeaturedShelfCard() {
        RoundedPanel card = new RoundedPanel(new BorderLayout(), true);
        card.setBorder(new EmptyBorder(22, 22, 22, 22));

        JPanel stack = new JPanel();
        stack.setOpaque(false);
        stack.setLayout(new BoxLayout(stack, BoxLayout.Y_AXIS));

        JPanel header = new JPanel();
        header.setOpaque(false);
        header.setLayout(new BoxLayout(header, BoxLayout.Y_AXIS));
        JLabel heading = sectionLabel("Featured Titles");
        heading.setAlignmentX(Component.LEFT_ALIGNMENT);
        ResponsiveTextLabel description = new ResponsiveTextLabel(
            "Explore a visual wall of popular reads curated for your library.",
            760,
            BODY_FONT,
            MUTED
        );
        description.setAlignmentX(Component.LEFT_ALIGNMENT);
        header.add(heading);
        header.add(Box.createVerticalStrut(4));
        header.add(description);

        stack.add(header);
        stack.add(Box.createVerticalStrut(18));
        stack.add(new MarqueeStripPanel(FEATURED_ROW_ONE, 1, 42, 1f));
        stack.add(Box.createVerticalStrut(16));
        stack.add(new MarqueeStripPanel(FEATURED_ROW_TWO, -1, 52, 1f));

        card.add(stack, BorderLayout.CENTER);
        return card;
    }

    private JComponent createAuthBackdropCard() {
        RoundedPanel card = new RoundedPanel(new BorderLayout(), false);
        card.setBorder(new EmptyBorder(24, 24, 24, 24));
        card.setBackground(new Color(255, 255, 255, 180));
        card.setPreferredSize(new Dimension(920, 460));
        card.setMaximumSize(new Dimension(Integer.MAX_VALUE, 500));
        card.add(new MarqueeStripPanel(FEATURED_ROW_ONE, 1, 36, 0.18f), BorderLayout.NORTH);
        card.add(Box.createVerticalStrut(96), BorderLayout.CENTER);
        card.add(new MarqueeStripPanel(FEATURED_ROW_TWO, -1, 46, 0.18f), BorderLayout.SOUTH);
        return card;
    }

    private JComponent buildAuthEntryScreen(String title, RoundedPanel formCard) {
        JPanel screen = createScreenStack();

        JPanel stage = new JPanel();
        stage.setOpaque(false);
        stage.setLayout(new OverlayLayout(stage));
        stage.setAlignmentX(Component.CENTER_ALIGNMENT);
        stage.setMaximumSize(new Dimension(1000, 560));
        stage.setPreferredSize(new Dimension(940, 500));

        JComponent backdrop = createAuthBackdropCard();
        backdrop.setAlignmentX(0.5f);
        backdrop.setAlignmentY(0.5f);

        JPanel overlay = new JPanel(new GridBagLayout());
        overlay.setOpaque(false);
        overlay.setAlignmentX(0.5f);
        overlay.setAlignmentY(0.5f);

        JPanel column = new JPanel();
        column.setOpaque(false);
        column.setLayout(new BoxLayout(column, BoxLayout.Y_AXIS));
        column.setMaximumSize(new Dimension(620, Integer.MAX_VALUE));

        JLabel heading = createScreenHeading(title);
        heading.setAlignmentX(Component.CENTER_ALIGNMENT);
        formCard.setAlignmentX(Component.CENTER_ALIGNMENT);

        column.add(Box.createVerticalStrut(8));
        column.add(heading);
        column.add(Box.createVerticalStrut(16));
        column.add(formCard);

        overlay.add(column);
        stage.add(backdrop);
        stage.add(overlay);
        stage.setComponentZOrder(overlay, 0);
        stage.setComponentZOrder(backdrop, 1);

        screen.add(stage);
        return screen;
    }

    private JLabel createScreenHeading(String text) {
        JLabel label = new JLabel(text);
        label.setFont(DISPLAY_FONT);
        label.setForeground(INK);
        label.setAlignmentX(Component.LEFT_ALIGNMENT);
        return label;
    }

    private JLabel sectionLabel(String text) {
        JLabel label = new JLabel(text);
        label.setFont(CARD_TITLE_FONT);
        label.setForeground(INK);
        return label;
    }

    private JLabel mutedLabel(String text) {
        JLabel label = new JLabel(text);
        label.setFont(BODY_FONT);
        label.setForeground(MUTED);
        return label;
    }

    private ResponsiveTextLabel bodyLabel(String text, int width) {
        return new ResponsiveTextLabel(text, width, BODY_FONT, MUTED);
    }

    private JLabel infoValueLabel() {
        JLabel label = new JLabel();
        label.setFont(BODY_FONT);
        label.setForeground(INK);
        return label;
    }

    private JPanel keyValueRow(String key, JLabel value) {
        JPanel row = new JPanel(new FlowLayout(FlowLayout.LEFT, 4, 0));
        row.setOpaque(false);
        JLabel keyLabel = new JLabel(key);
        keyLabel.setFont(new Font("SansSerif", Font.BOLD, 14));
        keyLabel.setForeground(INK);
        row.add(keyLabel);
        row.add(value);
        row.setAlignmentX(Component.LEFT_ALIGNMENT);
        return row;
    }

    private JPanel moduleListPanel() {
        JPanel panel = new JPanel();
        panel.setOpaque(false);
        panel.setLayout(new BoxLayout(panel, BoxLayout.Y_AXIS));
        panel.setAlignmentX(Component.LEFT_ALIGNMENT);
        return panel;
    }

    private JTextField styledTextField() {
        JTextField field = new JTextField();
        field.setFont(BODY_FONT);
        field.setForeground(INK);
        field.setBackground(new Color(255, 255, 255, 230));
        field.setCaretColor(INK);
        field.setBorder(BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(BORDER, 1, true),
            new EmptyBorder(10, 12, 10, 12)
        ));
        field.setMaximumSize(new Dimension(Integer.MAX_VALUE, 44));
        return field;
    }

    private JPasswordField styledPasswordField() {
        JPasswordField field = new JPasswordField();
        field.setFont(BODY_FONT);
        field.setForeground(INK);
        field.setBackground(new Color(255, 255, 255, 230));
        field.setCaretColor(INK);
        field.setBorder(BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(BORDER, 1, true),
            new EmptyBorder(10, 12, 10, 12)
        ));
        field.setMaximumSize(new Dimension(Integer.MAX_VALUE, 44));
        return field;
    }

    private JTextArea styledTextArea(int rows) {
        JTextArea area = new JTextArea(rows, 20);
        area.setLineWrap(true);
        area.setWrapStyleWord(true);
        area.setFont(BODY_FONT);
        area.setForeground(INK);
        area.setBackground(new Color(255, 255, 255, 230));
        area.setCaretColor(INK);
        area.setBorder(new EmptyBorder(10, 12, 10, 12));
        return area;
    }

    private JScrollPane wrapTextArea(JTextArea area) {
        JScrollPane scrollPane = new JScrollPane(area);
        scrollPane.setBorder(BorderFactory.createLineBorder(BORDER, 1, true));
        scrollPane.setPreferredSize(new Dimension(area.getPreferredSize().width + 6, 166));
        scrollPane.setMaximumSize(new Dimension(Integer.MAX_VALUE, 180));
        scrollPane.getVerticalScrollBar().setUnitIncrement(16);
        return scrollPane;
    }

    private void styleComboBox(JComboBox<String> comboBox) {
        comboBox.setFont(BODY_FONT);
        comboBox.setForeground(INK);
        comboBox.setBackground(new Color(255, 255, 255, 230));
        comboBox.setBorder(BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(BORDER, 1, true),
            new EmptyBorder(6, 8, 6, 8)
        ));
        comboBox.setMaximumSize(new Dimension(Integer.MAX_VALUE, 44));
    }

    private JPanel labeledField(String label, JComponent field) {
        JPanel panel = new JPanel();
        panel.setOpaque(false);
        panel.setLayout(new BoxLayout(panel, BoxLayout.Y_AXIS));
        panel.setAlignmentX(Component.LEFT_ALIGNMENT);
        JLabel labelView = new JLabel(label);
        labelView.setFont(new Font("SansSerif", Font.BOLD, 14));
        labelView.setForeground(INK);
        labelView.setAlignmentX(Component.LEFT_ALIGNMENT);
        field.setAlignmentX(Component.LEFT_ALIGNMENT);
        panel.add(labelView);
        panel.add(Box.createVerticalStrut(6));
        panel.add(field);
        Dimension preferred = panel.getPreferredSize();
        panel.setMaximumSize(new Dimension(Integer.MAX_VALUE, preferred.height));
        return panel;
    }

    private JPanel inlineLabeledField(String label, JComponent field, int labelWidth) {
        JPanel outer = new JPanel(new FlowLayout(FlowLayout.CENTER, 0, 0));
        outer.setOpaque(false);
        outer.setAlignmentX(Component.CENTER_ALIGNMENT);

        JPanel row = new JPanel(new BorderLayout(14, 0));
        row.setOpaque(false);

        JLabel labelView = new JLabel(label);
        labelView.setFont(new Font("SansSerif", Font.BOLD, 14));
        labelView.setForeground(INK);
        labelView.setVerticalAlignment(JLabel.CENTER);
        labelView.setHorizontalAlignment(SwingConstants.LEFT);
        labelView.setPreferredSize(new Dimension(labelWidth, Math.max(32, field.getPreferredSize().height)));

        int fieldHeight = Math.max(44, field.getPreferredSize().height);
        field.setPreferredSize(new Dimension(300, fieldHeight));

        row.add(labelView, BorderLayout.WEST);
        row.add(field, BorderLayout.CENTER);
        row.setPreferredSize(new Dimension(labelWidth + 14 + 300, fieldHeight));
        row.setMaximumSize(row.getPreferredSize());

        outer.add(row);
        Dimension preferred = row.getPreferredSize();
        outer.setMaximumSize(new Dimension(Integer.MAX_VALUE, preferred.height));
        return outer;
    }

    private void handleContactSubmit() {
        String email = contactEmailField.getText().trim();
        String subject = contactSubjectField.getText().trim();
        String body = contactBodyArea.getText().trim();
        if (email.isEmpty() || subject.isEmpty() || body.isEmpty()) {
            showMessage("Please fill in your email, subject, and message.", true);
            return;
        }
        if (!emailClient.isAllowedContactEmail(email)) {
            showMessage("Only @gmail.com email addresses are allowed in the contact form.", true);
            contactEmailField.requestFocusInWindow();
            return;
        }
        OperationResult result = emailClient.sendContactMessage(email, subject, body);
        showMessage(result.message(), !result.ok());
        if (result.ok()) {
            contactSubjectField.setText("");
            contactBodyArea.setText("");
            prefillContactEmailField(true);
        }
    }

    private void handleUserRegister() {
        String name = userRegNameField.getText().trim();
        String email = userRegEmailField.getText().trim();
        String password = new String(userRegPasswordField.getPassword());
        if (name.isEmpty() || email.isEmpty() || password.isEmpty()) {
            showMessage("Fill all fields", true);
            return;
        }
        boolean userExists = service.getUsers().stream().anyMatch(user -> user.email.equalsIgnoreCase(email));
        if (userExists) {
            showMessage("User already exists", true);
            return;
        }

        OtpSendResult otp = emailClient.sendOtp(email, "email_verification");
        pendingRegistration = new PendingRegistration("user", name, email, password);
        userOtpEmailLabel.setText(email);
        userOtpHintLabel.setText(otp.fallbackOtp() != null
            ? "Email server is unavailable, so a demo OTP is shown below: " + otp.fallbackOtp()
            : "Check your email for the 6-digit OTP code.");
        userOtpField.setText("");
        showScreen(SCREEN_REGISTER_OTP);
        showMessage(otp.fallbackOtp() != null ? "OTP generated for demo mode." : "OTP sent to your email. Please check your inbox.", false);
    }

    private void handleUserRegisterOtp() {
        if (pendingRegistration == null || !"user".equals(pendingRegistration.type)) {
            showScreen(SCREEN_HOME);
            return;
        }

        OperationResult verifyResult = emailClient.verifyOtp(pendingRegistration.email, userOtpField.getText().trim());
        if (!verifyResult.ok()) {
            showMessage(verifyResult.message(), true);
            return;
        }

        OperationResult registerResult = service.registerUser(
            pendingRegistration.name,
            pendingRegistration.email,
            pendingRegistration.password
        );
        if (!registerResult.ok()) {
            showMessage(registerResult.message(), true);
            return;
        }

        AuthResult loginResult = service.loginAny(pendingRegistration.email, pendingRegistration.password);
        pendingRegistration = null;
        userRegNameField.setText("");
        userRegEmailField.setText("");
        userRegPasswordField.setText("");
        userOtpField.setText("");
        if (loginResult.ok()) {
            currentUser = loginResult.user();
            currentAdmin = null;
            showMessage("Registration successful", false);
            showScreen(SCREEN_USER_DASHBOARD);
        } else {
            showMessage("Registration successful. Please log in.", false);
            showScreen(SCREEN_LOGIN);
        }
    }

    private void handleLogin() {
        String email = loginEmailField.getText().trim();
        String password = new String(loginPasswordField.getPassword());
        if (email.isEmpty() || password.isEmpty()) {
            showMessage("Enter both email and password.", true);
            return;
        }

        AuthResult result = service.loginAny(email, password);
        if (!result.ok()) {
            showMessage(result.message(), true);
            return;
        }

        loginPasswordField.setText("");
        if ("admin".equals(result.type())) {
            currentAdmin = result.admin();
            currentUser = null;
            showMessage("Login successful", false);
            showScreen(SCREEN_ADMIN_DASHBOARD);
            return;
        }

        currentUser = result.user();
        currentAdmin = null;
        showMessage("Login successful", false);
        showScreen(SCREEN_USER_DASHBOARD);
    }

    private void handleForgotPasswordStart() {
        String email = loginEmailField.getText().trim();
        if (email.isEmpty()) {
            showMessage("Enter the email address first.", true);
            return;
        }

        OtpSendResult otp = emailClient.sendOtp(email, "password_reset");
        pendingPasswordResetEmail = email;
        forgotOtpEmailLabel.setText(email);
        forgotOtpHintLabel.setText(otp.fallbackOtp() != null
            ? otp.message() + " Demo OTP: " + otp.fallbackOtp()
            : "Check your email for the 6-digit OTP code.");
        forgotOtpField.setText("");
        showScreen(SCREEN_FORGOT_OTP);
        showMessage(otp.fallbackOtp() != null ? "Demo OTP generated for password reset." : "OTP sent for password reset.", false);
    }

    private void handleForgotOtpVerify() {
        if (pendingPasswordResetEmail == null || pendingPasswordResetEmail.isBlank()) {
            showScreen(SCREEN_LOGIN);
            return;
        }
        OperationResult verifyResult = emailClient.verifyOtp(pendingPasswordResetEmail, forgotOtpField.getText().trim());
        if (!verifyResult.ok()) {
            showMessage(verifyResult.message(), true);
            return;
        }
        forgotOtpField.setText("");
        showScreen(SCREEN_RESET_PASSWORD);
    }

    private void handleResetPasswordSubmit() {
        String password = new String(resetPasswordField.getPassword());
        if (password.isEmpty()) {
            showMessage("Enter a new password.", true);
            return;
        }
        OperationResult result = service.resetUserPassword(pendingPasswordResetEmail, password);
        showMessage(result.message(), !result.ok());
        if (result.ok()) {
            pendingPasswordResetEmail = null;
            resetPasswordField.setText("");
            loginPasswordField.setText("");
            showScreen(SCREEN_LOGIN);
        }
    }

    private void handleUserSearch() {
        if (currentUser == null) {
            return;
        }
        try {
            lastUserSearchResults = service.searchBooks((String) userSearchByCombo.getSelectedItem(), userSearchQueryField.getText().trim());
            userSearchPage = 1;
            renderUserSearchResults();
        } catch (IllegalArgumentException ex) {
            showMessage(ex.getMessage(), true);
        }
    }

    private void handleAddBook() {
        if (currentAdmin == null) {
            return;
        }
        try {
            int bookId = Integer.parseInt(addBookIdField.getText().trim());
            int totalCopies = Integer.parseInt(addBookTotalField.getText().trim());
            String title = addBookTitleField.getText().trim();
            String author = addBookAuthorField.getText().trim();
            if (bookId < 1 || totalCopies < 1 || title.isEmpty() || author.isEmpty()) {
                showMessage("Enter a valid book ID, title, author, and total copies.", true);
                return;
            }
            OperationResult result = service.addBook(bookId, currentAdmin.lib, title, author, totalCopies);
            showMessage(result.message(), !result.ok());
            if (result.ok()) {
                addBookIdField.setText(String.valueOf(service.nextBookId()));
                addBookTitleField.setText("");
                addBookAuthorField.setText("");
                addBookTotalField.setText("");
                adminBooksPage = 1;
                refreshAdminDashboard();
                updateSaveStatus("Local files synced", false);
            }
        } catch (NumberFormatException ex) {
            showMessage("Enter a valid book ID, title, author, and total copies.", true);
        }
    }

    private void handleEditBookSave() {
        try {
            int available = Integer.parseInt(editBookAvailableField.getText().trim());
            int total = Integer.parseInt(editBookTotalField.getText().trim());
            String title = editBookTitleField.getText().trim();
            String author = editBookAuthorField.getText().trim();
            if (title.isEmpty() || author.isEmpty()) {
                showMessage("Fill all fields", true);
                return;
            }
            OperationResult result = service.editBook(editingBookId, title, author, available, total);
            showMessage(result.message(), !result.ok());
            if (result.ok()) {
                editBookDialog.setVisible(false);
                refreshAdminDashboard();
                updateSaveStatus("Local files synced", false);
            }
        } catch (NumberFormatException ex) {
            showMessage("Enter valid copy counts.", true);
        }
    }

    private void openEditBookDialog(int bookId) {
        Book book = service.getBookById(bookId);
        if (book == null) {
            showMessage("Book not found", true);
            return;
        }
        editingBookId = book.bookId;
        editBookIdLabel.setText("#" + book.bookId);
        editBookTitleField.setText(book.title);
        editBookAuthorField.setText(book.author);
        editBookAvailableField.setText(String.valueOf(book.availableCopies));
        editBookTotalField.setText(String.valueOf(book.totalCopies));
        editBookDialog.setLocationRelativeTo(frame);
        editBookDialog.setVisible(true);
    }

    private void handleBookDelete(int bookId) {
        int choice = JOptionPane.showConfirmDialog(
            frame,
            "Do you really want to delete Book ID " + bookId + "?",
            "Delete Book",
            JOptionPane.YES_NO_OPTION
        );
        if (choice != JOptionPane.YES_OPTION) {
            return;
        }
        OperationResult result = service.deleteBook(bookId);
        showMessage(result.message(), !result.ok());
        if (result.ok()) {
            refreshAdminDashboard();
            updateSaveStatus("Local files synced", false);
        }
    }

    private void showScreen(String screenId) {
        screenLayout.show(screenCards, screenId);
        if (SCREEN_CONTACT.equals(screenId)) {
            prefillContactEmailField(false);
        }
        if (SCREEN_USER_DASHBOARD.equals(screenId)) {
            refreshUserDashboard();
        }
        if (SCREEN_ADMIN_DASHBOARD.equals(screenId)) {
            refreshAdminDashboard();
        }
        updateNav();
    }

    private void updateNav() {
        boolean loggedIn = currentUser != null || currentAdmin != null;
        navLoginButton.setVisible(!loggedIn);
        navSignupButton.setVisible(!loggedIn);
        navDashboardButton.setVisible(loggedIn);
        navLogoutButton.setVisible(loggedIn);
        navDashboardButton.setText(currentAdmin != null ? "Library Operations" : "My Library");
        frame.repaint();
    }

    private void prefillContactEmailField(boolean overwriteExisting) {
        if (contactEmailField == null) {
            return;
        }
        if (!overwriteExisting && !contactEmailField.getText().trim().isEmpty()) {
            return;
        }
        if (currentUser != null) {
            contactEmailField.setText(currentUser.email);
        } else if (currentAdmin != null) {
            contactEmailField.setText(currentAdmin.email);
        }
    }

    private void refreshAdminDashboard() {
        if (currentAdmin == null) {
            return;
        }
        adminInfoNameLabel.setText(currentAdmin.name);
        adminInfoLibraryLabel.setText(currentAdmin.lib);
        adminInfoIdLabel.setText(String.valueOf(currentAdmin.id));
        adminInfoEmailLabel.setText(currentAdmin.email);
        if (addBookIdField.getText().trim().isEmpty()) {
            addBookIdField.setText(String.valueOf(service.nextBookId()));
        }

        List<IssueRequestRecord> requests = service.getIssueRequestsForAdmin(currentAdmin.lib);
        renderIssueRequestCards(
            adminIssueRequestsListPanel,
            requests,
            true,
            false,
            request -> {
                ApprovalResult result = service.approveIssueRequest(request.studentId, request.bookId, currentAdmin.lib);
                if (!result.ok()) {
                    showMessage(result.message(), true);
                    return;
                }
                refreshAdminDashboard();
                updateSaveStatus("Local files synced", false);
                OperationResult emailResult = emailClient.sendIssueApprovalEmail(result.emailData());
                if (emailResult.ok()) {
                    showMessage(result.message() + " Confirmation email sent to the student.", false);
                } else {
                    showMessage(result.message() + " But the confirmation email could not be sent.", false);
                }
            },
            request -> {
                OperationResult result = service.rejectIssueRequest(request.studentId, request.bookId, currentAdmin.lib);
                showMessage(result.message(), !result.ok());
                if (result.ok()) {
                    refreshAdminDashboard();
                    updateSaveStatus("Local files synced", false);
                }
            }
        );

        List<IssueRecord> approvedLoans = service.getIssuedForAdmin(currentAdmin.lib);
        approvedLoansCountLabel.setText(approvedLoans.size() + " active");
        renderAdminIssuedCards(adminApprovedListPanel, approvedLoans);
        renderAdminBooks(service.booksForLibrary(currentAdmin.lib));
    }

    private void refreshUserDashboard() {
        if (currentUser == null) {
            return;
        }
        userInfoNameLabel.setText(currentUser.name);
        userInfoEmailLabel.setText(currentUser.email);
        userInfoIdLabel.setText(String.valueOf(currentUser.id));

        if (lastUserSearchResults.isEmpty() && !userSearchQueryField.getText().trim().isEmpty()) {
            try {
                lastUserSearchResults = service.searchBooks((String) userSearchByCombo.getSelectedItem(), userSearchQueryField.getText().trim());
            } catch (IllegalArgumentException ignored) {
                lastUserSearchResults = List.of();
            }
        }

        renderUserSearchResults();
        renderIssueRequestCards(
            userIssueRequestsListPanel,
            service.getIssueRequestsForUser(currentUser.id),
            false,
            true,
            null,
            null
        );
        renderUserBooks(service.getBooks());
        renderUserIssuedCards(service.getIssuedForUser(currentUser.id));
    }

    private void renderUserSearchResults() {
        renderBooks(
            userSearchResultsPanel,
            userSearchResultsPager,
            lastUserSearchResults,
            userSearchPage,
            page -> {
                userSearchPage = page;
                renderUserSearchResults();
            },
            true,
            false,
            false,
            false,
            bookId -> {
                OperationResult result = service.requestIssueBook(currentUser.id, bookId);
                showMessage(result.message(), !result.ok());
                if (result.ok()) {
                    refreshUserDashboard();
                    updateSaveStatus("Local files synced", false);
                }
            },
            null,
            null
        );
    }

    private void renderUserBooks(List<Book> books) {
        renderBooks(
            userBooksPanel,
            userBooksPager,
            books,
            userBooksPage,
            page -> {
                userBooksPage = page;
                renderUserBooks(books);
            },
            true,
            false,
            false,
            false,
            bookId -> {
                OperationResult result = service.requestIssueBook(currentUser.id, bookId);
                showMessage(result.message(), !result.ok());
                if (result.ok()) {
                    refreshUserDashboard();
                    updateSaveStatus("Local files synced", false);
                }
            },
            null,
            null
        );
    }

    private void renderAdminBooks(List<Book> books) {
        renderBooks(
            adminBooksPanel,
            adminBooksPager,
            books,
            adminBooksPage,
            page -> {
                adminBooksPage = page;
                renderAdminBooks(books);
            },
            false,
            true,
            true,
            false,
            null,
            this::openEditBookDialog,
            this::handleBookDelete
        );
    }

    private void renderBooks(
        JPanel panel,
        JPanel pagerPanel,
        List<Book> books,
        int currentPage,
        IntConsumer onPageChange,
        boolean showRequest,
        boolean showEdit,
        boolean showDelete,
        boolean showSlot,
        IntConsumer onRequest,
        IntConsumer onEdit,
        IntConsumer onDelete
    ) {
        panel.removeAll();
        pagerPanel.removeAll();

        if (books == null || books.isEmpty()) {
            panel.add(emptyLabel("No books found."));
            panel.revalidate();
            panel.repaint();
            pagerPanel.revalidate();
            pagerPanel.repaint();
            return;
        }

        int pageSize = 10;
        int totalPages = Math.max(1, (int) Math.ceil(books.size() / (double) pageSize));
        int page = Math.max(1, Math.min(currentPage, totalPages));
        int start = (page - 1) * pageSize;
        int end = Math.min(books.size(), start + pageSize);

        for (int index = start; index < end; index++) {
            panel.add(createBookCard(books.get(index), showRequest, showEdit, showDelete, showSlot, onRequest, onEdit, onDelete));
        }

        if (totalPages > 1) {
            pagerPanel.add(mutedLabel("Page"));
            if (page > 1) {
                StyledButton prev = new StyledButton("Previous", ButtonKind.SECONDARY, true);
                prev.addActionListener(e -> onPageChange.accept(page - 1));
                pagerPanel.add(prev);
            }
            for (int index = 1; index <= totalPages; index++) {
                if (index == page) {
                    JLabel current = createPillLabel(String.valueOf(index), Color.WHITE, ACCENT);
                    pagerPanel.add(current);
                } else {
                    StyledButton button = new StyledButton(String.valueOf(index), ButtonKind.SECONDARY, true);
                    int nextPage = index;
                    button.addActionListener(e -> onPageChange.accept(nextPage));
                    pagerPanel.add(button);
                }
            }
            if (page < totalPages) {
                StyledButton next = new StyledButton("Next", ButtonKind.SECONDARY, true);
                next.addActionListener(e -> onPageChange.accept(page + 1));
                pagerPanel.add(next);
            }
        }

        panel.revalidate();
        panel.repaint();
        pagerPanel.revalidate();
        pagerPanel.repaint();
    }

    private JComponent createBookCard(
        Book book,
        boolean showRequest,
        boolean showEdit,
        boolean showDelete,
        boolean showSlot,
        IntConsumer onRequest,
        IntConsumer onEdit,
        IntConsumer onDelete
    ) {
        RoundedPanel card = new RoundedPanel(new BorderLayout(), false);
        card.setBorder(new EmptyBorder(14, 14, 14, 14));
        card.setPreferredSize(new Dimension(208, 402));

        JPanel stack = new JPanel();
        stack.setOpaque(false);
        stack.setLayout(new BoxLayout(stack, BoxLayout.Y_AXIS));

        BookCoverPanel cover = new BookCoverPanel(book);
        cover.setAlignmentX(Component.LEFT_ALIGNMENT);

        JLabel idLabel = new JLabel("#" + book.bookId);
        idLabel.setFont(new Font("SansSerif", Font.BOLD, 11));
        idLabel.setForeground(MUTED);
        idLabel.setAlignmentX(Component.LEFT_ALIGNMENT);

        ResponsiveTextLabel titleLabel = new ResponsiveTextLabel(book.title, 170, new Font("SansSerif", Font.BOLD, 15), INK);
        titleLabel.setAlignmentX(Component.LEFT_ALIGNMENT);

        ResponsiveTextLabel authorLabel = bodyLabel(book.author, 170);
        authorLabel.setFont(SMALL_FONT);
        ResponsiveTextLabel libraryLabel = bodyLabel(book.lib, 170);
        libraryLabel.setFont(SMALL_FONT);
        JLabel copiesLabel = new JLabel("Available: " + book.availableCopies + " / " + book.totalCopies);
        copiesLabel.setFont(SMALL_FONT);
        copiesLabel.setForeground(INK);
        copiesLabel.setAlignmentX(Component.LEFT_ALIGNMENT);

        stack.add(cover);
        stack.add(Box.createVerticalStrut(12));
        stack.add(idLabel);
        stack.add(Box.createVerticalStrut(6));
        stack.add(titleLabel);
        stack.add(Box.createVerticalStrut(4));
        stack.add(authorLabel);
        stack.add(Box.createVerticalStrut(4));
        stack.add(libraryLabel);
        stack.add(Box.createVerticalStrut(8));
        stack.add(copiesLabel);
        stack.add(Box.createVerticalStrut(10));

        JPanel actions = new JPanel(new WrapLayout(FlowLayout.LEFT, 8, 6));
        actions.setOpaque(false);
        if (showRequest) {
            StyledButton request = new StyledButton("Request Book", ButtonKind.SECONDARY, true);
            request.addActionListener(e -> onRequest.accept(book.bookId));
            actions.add(request);
        }
        if (showSlot && book.availableCopies > 0) {
            StyledButton slot = new StyledButton("Reserve Slot", ButtonKind.SECONDARY, true);
            actions.add(slot);
        }
        if (showEdit) {
            StyledButton edit = new StyledButton("Edit", ButtonKind.SECONDARY, true);
            edit.addActionListener(e -> onEdit.accept(book.bookId));
            actions.add(edit);
        }
        if (showDelete) {
            StyledButton delete = new StyledButton("Delete", ButtonKind.DANGER, true);
            delete.addActionListener(e -> onDelete.accept(book.bookId));
            actions.add(delete);
        }
        stack.add(actions);

        card.add(stack, BorderLayout.CENTER);
        return card;
    }

    private void renderIssueRequestCards(
        JPanel panel,
        List<IssueRequestRecord> requests,
        boolean showUserDetails,
        boolean showStatus,
        java.util.function.Consumer<IssueRequestRecord> onApprove,
        java.util.function.Consumer<IssueRequestRecord> onReject
    ) {
        panel.removeAll();
        if (requests == null || requests.isEmpty()) {
            panel.add(emptyLabel(showStatus ? "No books applied for issue yet." : "No pending issue approvals for your library."));
            panel.revalidate();
            panel.repaint();
            return;
        }

        for (IssueRequestRecord request : requests) {
            Book book = service.getBookById(request.bookId);
            UserAccount user = service.getUserById(request.studentId);
            String title = book != null ? book.title : "Book #" + request.bookId;
            String author = book != null ? book.author : "Unknown author";
            String library = book != null ? book.lib : "Unknown library";
            String status = request.status == null || request.status.isBlank() ? "Pending" : request.status;

            RoundedPanel card = new RoundedPanel(new BorderLayout(), false);
            card.setBorder(new EmptyBorder(16, 18, 16, 18));

            JPanel copy = new JPanel();
            copy.setOpaque(false);
            copy.setLayout(new BoxLayout(copy, BoxLayout.Y_AXIS));
            JLabel titleLabel = new JLabel(title);
            titleLabel.setFont(new Font("SansSerif", Font.BOLD, 16));
            titleLabel.setForeground(INK);
            copy.add(titleLabel);
            copy.add(Box.createVerticalStrut(4));
            copy.add(moduleMeta("Book ID: " + request.bookId + " • Student ID: " + request.studentId));
            if (showUserDetails) {
                copy.add(Box.createVerticalStrut(4));
                copy.add(moduleMeta("User: " + (user != null ? user.name : "Unknown user") + " • " + (user != null ? user.email : "No email")));
            }
            copy.add(Box.createVerticalStrut(4));
            copy.add(moduleMeta(author + " • " + library));
            copy.add(Box.createVerticalStrut(4));
            copy.add(moduleMeta("Requested on " + request.requestDate.format()));

            JPanel actions = new JPanel(new WrapLayout(FlowLayout.RIGHT, 8, 0));
            actions.setOpaque(false);
            if (showStatus) {
                actions.add(statusPill(status));
            }
            if (onApprove != null) {
                StyledButton approve = new StyledButton("Approve", ButtonKind.SECONDARY, true);
                approve.addActionListener(e -> onApprove.accept(request));
                actions.add(approve);
            }
            if (onReject != null) {
                StyledButton reject = new StyledButton("Reject", ButtonKind.DANGER, true);
                reject.addActionListener(e -> onReject.accept(request));
                actions.add(reject);
            }

            card.add(copy, BorderLayout.CENTER);
            card.add(actions, BorderLayout.EAST);
            panel.add(card);
            panel.add(Box.createVerticalStrut(12));
        }

        panel.revalidate();
        panel.repaint();
    }

    private void renderAdminIssuedCards(JPanel panel, List<IssueRecord> issuedRecords) {
        panel.removeAll();
        if (issuedRecords == null || issuedRecords.isEmpty()) {
            panel.add(emptyLabel("No active issued books for your library."));
            panel.revalidate();
            panel.repaint();
            return;
        }

        for (IssueRecord record : issuedRecords) {
            Book book = service.getBookById(record.bookId);
            UserAccount user = service.getUserById(record.studentId);
            RoundedPanel card = new RoundedPanel(new BorderLayout(), false);
            card.setBorder(new EmptyBorder(16, 18, 16, 18));

            JPanel copy = new JPanel();
            copy.setOpaque(false);
            copy.setLayout(new BoxLayout(copy, BoxLayout.Y_AXIS));

            JLabel titleLabel = new JLabel(book != null ? book.title : "Book #" + record.bookId);
            titleLabel.setFont(new Font("SansSerif", Font.BOLD, 16));
            titleLabel.setForeground(INK);
            copy.add(titleLabel);
            copy.add(Box.createVerticalStrut(4));
            copy.add(moduleMeta("Book ID: " + record.bookId + " • Student ID: " + record.studentId));
            copy.add(Box.createVerticalStrut(4));
            copy.add(moduleMeta("User: " + (user != null ? user.name : "Unknown user") + " • " + (user != null ? user.email : "No email")));
            copy.add(Box.createVerticalStrut(4));
            copy.add(moduleMeta(book != null ? book.lib : "Unknown library"));
            copy.add(Box.createVerticalStrut(4));
            copy.add(moduleMeta("Issue period: " + record.issueDate.format() + " to " + record.dueDate.format()));

            card.add(copy, BorderLayout.CENTER);
            panel.add(card);
            panel.add(Box.createVerticalStrut(12));
        }

        panel.revalidate();
        panel.repaint();
    }

    private void renderUserIssuedCards(List<IssueRecord> issuedRecords) {
        userIssuedListPanel.removeAll();
        if (issuedRecords == null || issuedRecords.isEmpty()) {
            userIssuedListPanel.add(emptyLabel("No books issued."));
            userIssuedListPanel.revalidate();
            userIssuedListPanel.repaint();
            return;
        }

        for (IssueRecord record : issuedRecords) {
            Book book = service.getBookById(record.bookId);
            RoundedPanel card = new RoundedPanel(new BorderLayout(), false);
            card.setBorder(new EmptyBorder(16, 18, 16, 18));

            JPanel copy = new JPanel();
            copy.setOpaque(false);
            copy.setLayout(new BoxLayout(copy, BoxLayout.Y_AXIS));
            JLabel titleLabel = new JLabel(book != null ? book.title : "Book #" + record.bookId);
            titleLabel.setFont(new Font("SansSerif", Font.BOLD, 16));
            titleLabel.setForeground(INK);
            copy.add(titleLabel);
            copy.add(Box.createVerticalStrut(4));
            copy.add(moduleMeta("ID: " + record.bookId + " • " + (book != null ? book.lib : "Unknown library")));
            copy.add(Box.createVerticalStrut(4));
            copy.add(moduleMeta("Due: " + record.dueDate.format()));

            StyledButton returnButton = new StyledButton("Return", ButtonKind.SECONDARY, true);
            returnButton.addActionListener(e -> {
                OperationResult result = service.returnBook(currentUser.id, record.bookId);
                showMessage(result.message(), !result.ok());
                if (result.ok()) {
                    refreshUserDashboard();
                    updateSaveStatus("Local files synced", false);
                }
            });

            card.add(copy, BorderLayout.CENTER);
            card.add(returnButton, BorderLayout.EAST);
            userIssuedListPanel.add(card);
            userIssuedListPanel.add(Box.createVerticalStrut(12));
        }

        userIssuedListPanel.revalidate();
        userIssuedListPanel.repaint();
    }

    private JLabel moduleMeta(String text) {
        JLabel label = new JLabel(text);
        label.setFont(new Font("SansSerif", Font.PLAIN, 13));
        label.setForeground(MUTED);
        return label;
    }

    private JLabel emptyLabel(String text) {
        JLabel label = new JLabel(text);
        label.setFont(new Font("SansSerif", Font.ITALIC, 14));
        label.setForeground(MUTED);
        return label;
    }

    private JLabel statusPill(String status) {
        String normalized = status == null ? "Pending" : status.trim();
        if (normalized.isEmpty()) {
            normalized = "Pending";
        }
        Color fg = ACCENT;
        Color bg = new Color(14, 165, 168, 28);
        if ("Approved".equalsIgnoreCase(normalized)) {
            fg = SUCCESS;
            bg = new Color(22, 163, 74, 36);
        } else if ("Rejected".equalsIgnoreCase(normalized)) {
            fg = ERROR;
            bg = new Color(220, 38, 38, 28);
        }
        return createPillLabel(normalized, fg, bg);
    }

    private JLabel createPillLabel(String text, Color fg, Color bg) {
        JLabel label = new JLabel(text);
        label.setFont(new Font("SansSerif", Font.BOLD, 12));
        label.setForeground(fg);
        label.setOpaque(true);
        label.setBackground(bg);
        label.setBorder(new EmptyBorder(6, 12, 6, 12));
        return label;
    }

    private void updateSaveStatus(String text, boolean error) {
        if (saveStatusLabel == null) {
            return;
        }
        saveStatusLabel.setText(text);
        saveStatusLabel.setForeground(error ? ERROR : INK);
        saveStatusLabel.setBackground(error ? new Color(220, 38, 38, 25) : new Color(14, 165, 168, 25));
        saveStatusLabel.setBorder(BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(error ? new Color(220, 38, 38, 90) : new Color(14, 165, 168, 90), 1, true),
            new EmptyBorder(7, 12, 7, 12)
        ));
    }

    private void showMessage(String message, boolean error) {
        messageLabel.setText(message);
        messageLabel.setForeground(error ? ERROR : SUCCESS);
        JPanel card = (JPanel) messageBanner.getComponent(0);
        card.setBackground(error ? new Color(220, 38, 38, 20) : new Color(22, 163, 74, 20));
        card.setBorder(BorderFactory.createCompoundBorder(
            BorderFactory.createLineBorder(error ? new Color(220, 38, 38, 60) : new Color(22, 163, 74, 60), 1, true),
            new EmptyBorder(14, 18, 14, 18)
        ));
        messageBanner.setVisible(true);
        if (messageTimer != null) {
            messageTimer.stop();
        }
        messageTimer = new Timer(4000, e -> messageBanner.setVisible(false));
        messageTimer.setRepeats(false);
        messageTimer.start();
    }

    private static String escapeHtml(String text) {
        if (text == null) {
            return "";
        }
        return text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;");
    }

    private record PendingRegistration(String type, String name, String email, String password) {
    }

    private record FeaturedCover(String title, String url) {
    }

    private enum ButtonKind {
        NAV,
        CTA,
        PRIMARY,
        SECONDARY,
        GHOST,
        DANGER
    }

    private static final class StyledButton extends JButton {
        private final ButtonKind kind;
        private final boolean small;
        private boolean hovered;

        StyledButton(String text, ButtonKind kind, boolean small) {
            super(text);
            this.kind = kind;
            this.small = small;
            setFont(small ? new Font("SansSerif", Font.PLAIN, 13) : BODY_FONT);
            setForeground(kind == ButtonKind.PRIMARY || kind == ButtonKind.CTA ? Color.WHITE : INK);
            setBorderPainted(false);
            setContentAreaFilled(false);
            setFocusPainted(false);
            setOpaque(false);
            setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
            setBorder(new EmptyBorder(small ? 8 : 10, small ? 14 : 18, small ? 8 : 10, small ? 14 : 18));
            addMouseListener(new MouseAdapter() {
                @Override
                public void mouseEntered(MouseEvent e) {
                    hovered = true;
                    repaint();
                }

                @Override
                public void mouseExited(MouseEvent e) {
                    hovered = false;
                    repaint();
                }
            });
        }

        @Override
        protected void paintComponent(Graphics graphics) {
            Graphics2D g2 = (Graphics2D) graphics.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            int width = getWidth();
            int height = getHeight();

            if (kind == ButtonKind.GHOST) {
                g2.setColor(hovered ? INK : MUTED);
                g2.setFont(getFont());
                int baseline = (height + g2.getFontMetrics().getAscent() - g2.getFontMetrics().getDescent()) / 2;
                int textWidth = g2.getFontMetrics().stringWidth(getText());
                int x = (width - textWidth) / 2;
                g2.drawString(getText(), x, baseline);
                g2.setStroke(new BasicStroke(1.1f));
                g2.setColor(new Color(MUTED.getRed(), MUTED.getGreen(), MUTED.getBlue(), 120));
                g2.drawLine(x, baseline + 4, x + textWidth, baseline + 4);
                g2.dispose();
                return;
            }

            Color fill;
            Color border;
            Color textColor = getForeground();
            switch (kind) {
                case PRIMARY, CTA -> {
                    fill = hovered ? ACCENT_2 : ACCENT;
                    border = fill;
                }
                case DANGER -> {
                    fill = hovered ? new Color(220, 38, 38, 70) : new Color(220, 38, 38, 38);
                    border = new Color(220, 38, 38, 90);
                    textColor = SmartLibrarySwingApp.ERROR;
                }
                case NAV -> {
                    fill = hovered ? new Color(14, 165, 168, 26) : new Color(255, 255, 255, 0);
                    border = hovered ? new Color(14, 165, 168, 60) : new Color(0, 0, 0, 0);
                }
                case SECONDARY -> {
                    fill = hovered ? Color.WHITE : SURFACE_2;
                    border = BORDER;
                }
                default -> {
                    fill = SURFACE_2;
                    border = BORDER;
                }
            }

            int arc = height;
            if (kind == ButtonKind.PRIMARY || kind == ButtonKind.CTA) {
                GradientPaint paint = new GradientPaint(0, 0, ACCENT, width, height, ACCENT_2);
                g2.setPaint(hovered ? new GradientPaint(0, 0, ACCENT_2, width, height, ACCENT) : paint);
            } else {
                g2.setColor(fill);
            }
            g2.fillRoundRect(0, 0, width - 1, height - 1, arc, arc);
            if (border.getAlpha() > 0) {
                g2.setColor(border);
                g2.drawRoundRect(0, 0, width - 1, height - 1, arc, arc);
            }
            g2.setColor(textColor);
            g2.setFont(getFont());
            int textWidth = g2.getFontMetrics().stringWidth(getText());
            int baseline = (height + g2.getFontMetrics().getAscent() - g2.getFontMetrics().getDescent()) / 2;
            g2.drawString(getText(), (width - textWidth) / 2, baseline);
            g2.dispose();
        }

        @Override
        public Dimension getPreferredSize() {
            Dimension size = super.getPreferredSize();
            return new Dimension(size.width + (small ? 4 : 12), size.height + (small ? 4 : 8));
        }
    }

    private static class GradientBackgroundPanel extends JPanel {
        GradientBackgroundPanel(LayoutManager layout) {
            super(layout);
            setOpaque(false);
        }

        @Override
        protected void paintComponent(Graphics graphics) {
            super.paintComponent(graphics);
            Graphics2D g2 = (Graphics2D) graphics.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            GradientPaint paint = new GradientPaint(0, 0, BG, 0, getHeight(), BG_DEEP);
            g2.setPaint(paint);
            g2.fillRect(0, 0, getWidth(), getHeight());
            g2.setColor(new Color(14, 165, 168, 24));
            g2.fillOval(-160, -120, 560, 380);
            g2.setColor(new Color(249, 115, 22, 22));
            g2.fillOval(getWidth() - 360, -80, 420, 320);
            g2.setColor(new Color(11, 19, 32, 8));
            for (int x = -getHeight(); x < getWidth(); x += 12) {
                g2.drawLine(x, 0, x + getHeight(), getHeight());
            }
            g2.dispose();
        }
    }

    private static final class HeaderPanel extends JPanel {
        HeaderPanel(LayoutManager layout) {
            super(layout);
            setOpaque(false);
        }

        @Override
        protected void paintComponent(Graphics graphics) {
            Graphics2D g2 = (Graphics2D) graphics.create();
            g2.setColor(new Color(255, 255, 255, 230));
            g2.fillRect(0, 0, getWidth(), getHeight());
            g2.setColor(new Color(BORDER.getRed(), BORDER.getGreen(), BORDER.getBlue(), 180));
            g2.drawLine(0, getHeight() - 1, getWidth(), getHeight() - 1);
            g2.dispose();
            super.paintComponent(graphics);
        }
    }

    private static class RoundedPanel extends JPanel {
        private final boolean accentBar;

        RoundedPanel(LayoutManager layout, boolean accentBar) {
            super(layout);
            this.accentBar = accentBar;
            setOpaque(false);
            setBackground(SURFACE);
        }

        @Override
        protected void paintComponent(Graphics graphics) {
            Graphics2D g2 = (Graphics2D) graphics.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            RoundRectangle2D shape = new RoundRectangle2D.Float(0, 0, getWidth() - 1, getHeight() - 1, 22, 22);
            g2.setColor(getBackground());
            g2.fill(shape);
            g2.setColor(BORDER);
            g2.draw(shape);
            if (accentBar) {
                g2.setPaint(new GradientPaint(0, 0, ACCENT, getWidth(), 0, ACCENT_2));
                g2.fillRoundRect(0, 0, getWidth() - 1, 5, 22, 22);
            }
            g2.dispose();
            super.paintComponent(graphics);
        }
    }

    private static final class HeroPanel extends RoundedPanel {
        HeroPanel(LayoutManager layout) {
            super(layout, false);
        }

        @Override
        protected void paintComponent(Graphics graphics) {
            super.paintComponent(graphics);
            Graphics2D g2 = (Graphics2D) graphics.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g2.setPaint(new GradientPaint(0, 0, new Color(14, 165, 168, 28), getWidth(), getHeight(), new Color(249, 115, 22, 18)));
            g2.fillRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 26, 26);
            g2.setColor(new Color(14, 165, 168, 80));
            g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 26, 26);
            g2.setColor(new Color(29, 78, 216, 40));
            g2.fillOval(getWidth() - 220, getHeight() - 120, 260, 220);
            g2.dispose();
        }
    }

    private static final class BookCoverPanel extends JPanel {
        private final Book book;

        BookCoverPanel(Book book) {
            this.book = book;
            setOpaque(false);
            setPreferredSize(new Dimension(176, 240));
            setMaximumSize(new Dimension(176, 240));
        }

        @Override
        protected void paintComponent(Graphics graphics) {
            Graphics2D g2 = (Graphics2D) graphics.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            int width = getWidth();
            int height = getHeight();
            int h1 = hash(book.title + "|" + book.author + "|" + book.lib + "|" + book.bookId) % 360;
            int h2 = (h1 * 3) % 360;
            Color color1 = Color.getHSBColor(h1 / 360f, 0.70f, 0.72f);
            Color color2 = Color.getHSBColor(h2 / 360f, 0.68f, 0.92f);
            g2.setPaint(new GradientPaint(0, 0, color1, width, height, color2));
            g2.fillRoundRect(0, 0, width - 1, height - 1, 18, 18);
            g2.setColor(new Color(255, 255, 255, 60));
            g2.fillOval(-30, -20, width / 2 + 40, height / 2);
            g2.setColor(new Color(11, 19, 32, 90));
            g2.fillRoundRect(0, height - 88, width - 1, 88, 18, 18);
            g2.setColor(Color.WHITE);
            g2.setFont(new Font("SansSerif", Font.BOLD, 17));
            drawWrappedText(g2, book.title, 16, height - 56, width - 32, 20, 2);
            g2.setFont(new Font("SansSerif", Font.PLAIN, 11));
            g2.setColor(new Color(255, 255, 255, 210));
            drawWrappedText(g2, book.author, 16, height - 20, width - 32, 14, 1);
            g2.dispose();
        }

        private int hash(String text) {
            int hash = 216613626;
            for (int index = 0; index < text.length(); index++) {
                hash ^= text.charAt(index);
                hash *= 16777619;
            }
            return Math.abs(hash);
        }

        private void drawWrappedText(Graphics2D g2, String text, int x, int startY, int width, int lineHeight, int maxLines) {
            if (text == null) {
                return;
            }
            String[] words = text.split("\\s+");
            StringBuilder line = new StringBuilder();
            int y = startY;
            int lines = 0;
            for (String word : words) {
                String candidate = line.isEmpty() ? word : line + " " + word;
                if (g2.getFontMetrics().stringWidth(candidate) > width && !line.isEmpty()) {
                    g2.drawString(line.toString(), x, y);
                    y += lineHeight;
                    lines++;
                    if (lines >= maxLines) {
                        return;
                    }
                    line = new StringBuilder(word);
                } else {
                    line = new StringBuilder(candidate);
                }
            }
            if (!line.isEmpty() && lines < maxLines) {
                g2.drawString(line.toString(), x, y);
            }
        }
    }

    private static final class MarqueeStripPanel extends JPanel {
        private static final Map<String, BufferedImage> CACHE = new ConcurrentHashMap<>();
        private static final Set<String> LOADING = ConcurrentHashMap.newKeySet();

        private final List<FeaturedCover> covers;
        private final int direction;
        private final float opacity;
        private final Timer timer;
        private double offset;
        private final double speedPerTick;

        MarqueeStripPanel(List<FeaturedCover> covers, int direction, int secondsPerCycle, float opacity) {
            this.covers = covers;
            this.direction = direction;
            this.opacity = opacity;
            int stripWidth = Math.max(1, covers.size() * 134);
            this.speedPerTick = (stripWidth * 16.0) / (Math.max(14, secondsPerCycle) * 1000.0);
            setOpaque(false);
            setPreferredSize(new Dimension(0, 190));
            setMaximumSize(new Dimension(Integer.MAX_VALUE, 190));

            for (FeaturedCover cover : covers) {
                loadImageAsync(cover.url());
            }

            timer = new Timer(16, e -> {
                if (!isShowing()) {
                    return;
                }
                offset += speedPerTick;
                repaint();
            });
            addHierarchyListener(event -> {
                if ((event.getChangeFlags() & HierarchyEvent.SHOWING_CHANGED) != 0) {
                    if (isShowing()) {
                        timer.start();
                    } else {
                        timer.stop();
                    }
                }
            });
            if (isShowing()) {
                timer.start();
            }
        }

        @Override
        public void addNotify() {
            super.addNotify();
            timer.start();
        }

        @Override
        public void removeNotify() {
            timer.stop();
            super.removeNotify();
        }

        @Override
        protected void paintComponent(Graphics graphics) {
            Graphics2D g2 = (Graphics2D) graphics.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g2.setComposite(java.awt.AlphaComposite.getInstance(java.awt.AlphaComposite.SRC_OVER, opacity));
            int cardWidth = 120;
            int cardHeight = 180;
            int gap = 14;
            int rowWidth = covers.size() * (cardWidth + gap);
            double normalized = rowWidth == 0 ? 0 : offset % rowWidth;
            int y = (getHeight() - cardHeight) / 2;
            int startX = direction > 0 ? (int) (-rowWidth + normalized) : (int) (-normalized);

            for (int base = startX; base < getWidth() + rowWidth; base += rowWidth) {
                int x = base;
                for (FeaturedCover cover : covers) {
                    drawCover(g2, cover, x, y, cardWidth, cardHeight);
                    x += cardWidth + gap;
                }
            }
            g2.dispose();
        }

        private void drawCover(Graphics2D g2, FeaturedCover cover, int x, int y, int width, int height) {
            g2.setColor(new Color(255, 255, 255, 220));
            g2.fillRoundRect(x, y, width, height, 18, 18);
            g2.setColor(new Color(255, 255, 255, 160));
            g2.drawRoundRect(x, y, width, height, 18, 18);

            BufferedImage image = CACHE.get(cover.url());
            if (image != null) {
                g2.drawImage(image, x + 6, y + 6, width - 12, height - 12, null);
                return;
            }

            int hue = Math.abs(cover.title().hashCode()) % 360;
            Color a = Color.getHSBColor(hue / 360f, 0.65f, 0.76f);
            Color b = Color.getHSBColor(((hue * 7) % 360) / 360f, 0.78f, 0.94f);
            g2.setPaint(new GradientPaint(x, y, a, x + width, y + height, b));
            g2.fillRoundRect(x + 6, y + 6, width - 12, height - 12, 14, 14);
            g2.setColor(new Color(11, 19, 32, 95));
            g2.fillRoundRect(x + 6, y + height - 60, width - 12, 54, 14, 14);
            g2.setColor(Color.WHITE);
            g2.setFont(new Font("SansSerif", Font.BOLD, 12));
            drawTitle(g2, cover.title(), x + 14, y + height - 36, width - 28);
        }

        private void drawTitle(Graphics2D g2, String title, int x, int y, int width) {
            String[] words = title.split("\\s+");
            StringBuilder line = new StringBuilder();
            int lines = 0;
            int cursorY = y;
            for (String word : words) {
                String candidate = line.isEmpty() ? word : line + " " + word;
                if (g2.getFontMetrics().stringWidth(candidate) > width && !line.isEmpty()) {
                    g2.drawString(line.toString(), x, cursorY);
                    cursorY += 14;
                    lines++;
                    if (lines == 2) {
                        return;
                    }
                    line = new StringBuilder(word);
                } else {
                    line = new StringBuilder(candidate);
                }
            }
            if (!line.isEmpty() && lines < 2) {
                g2.drawString(line.toString(), x, cursorY);
            }
        }

        private void loadImageAsync(String url) {
            if (CACHE.containsKey(url) || !LOADING.add(url)) {
                return;
            }
            Thread thread = new Thread(() -> {
                try {
                    BufferedImage image = ImageIO.read(new URL(url));
                    if (image != null) {
                        Image scaled = image.getScaledInstance(108, 168, Image.SCALE_SMOOTH);
                        BufferedImage buffered = new BufferedImage(108, 168, BufferedImage.TYPE_INT_ARGB);
                        Graphics2D g2 = buffered.createGraphics();
                        g2.drawImage(scaled, 0, 0, null);
                        g2.dispose();
                        CACHE.put(url, buffered);
                        SwingUtilities.invokeLater(this::repaint);
                    }
                } catch (Exception ignored) {
                    // Keep the generated placeholder when the remote image is unavailable.
                } finally {
                    LOADING.remove(url);
                }
            }, "smart-library-cover-loader");
            thread.setDaemon(true);
            thread.start();
        }
    }

    private static final class WidthConstrainedPanel extends JPanel {
        private final int width;

        WidthConstrainedPanel(JComponent content, int width) {
            super(new BorderLayout());
            this.width = Math.max(260, width);
            setOpaque(false);
            add(content, BorderLayout.CENTER);
        }

        @Override
        public Dimension getPreferredSize() {
            Dimension size = super.getPreferredSize();
            return new Dimension(width, size.height);
        }

        @Override
        public Dimension getMaximumSize() {
            return getPreferredSize();
        }
    }

    private static final class ResponsiveTextLabel extends JTextArea {
        private final int maxWidth;

        ResponsiveTextLabel(String text, int maxWidth, Font font, Color foreground) {
            super(text == null ? "" : text);
            this.maxWidth = Math.max(160, maxWidth);
            setEditable(false);
            setLineWrap(true);
            setWrapStyleWord(true);
            setFocusable(false);
            setOpaque(false);
            setBorder(null);
            setFont(font);
            setForeground(foreground);
            setAlignmentX(Component.LEFT_ALIGNMENT);
        }

        @Override
        public void setFont(Font font) {
            super.setFont(font);
            revalidate();
        }

        @Override
        public Dimension getPreferredSize() {
            int width = maxWidth;
            Container parent = getParent();
            if (parent != null && parent.getWidth() > 0) {
                width = Math.min(maxWidth, Math.max(140, parent.getWidth() - 24));
            }
            setSize(new Dimension(width, Short.MAX_VALUE));
            Dimension size = super.getPreferredSize();
            return new Dimension(width, size.height);
        }

        @Override
        public Dimension getMaximumSize() {
            Dimension preferred = getPreferredSize();
            return new Dimension(Integer.MAX_VALUE, preferred.height);
        }
    }

    private static final class ResponsiveColumnsPanel extends JPanel {
        private final int wideColumns;
        private final int narrowColumns;
        private final int breakpoint;
        private final GridLayout gridLayout;

        ResponsiveColumnsPanel(int wideColumns, int narrowColumns, int breakpoint, int hgap, int vgap) {
            this.wideColumns = Math.max(1, wideColumns);
            this.narrowColumns = Math.max(1, narrowColumns);
            this.breakpoint = breakpoint;
            this.gridLayout = new GridLayout(0, this.wideColumns, hgap, vgap);
            setLayout(gridLayout);
        }

        @Override
        public void doLayout() {
            gridLayout.setColumns(getWidth() >= breakpoint ? wideColumns : narrowColumns);
            super.doLayout();
        }
    }

    private static final class WrapLayout extends FlowLayout {
        WrapLayout(int align, int hgap, int vgap) {
            super(align, hgap, vgap);
        }

        @Override
        public Dimension preferredLayoutSize(Container target) {
            return layoutSize(target, true);
        }

        @Override
        public Dimension minimumLayoutSize(Container target) {
            Dimension minimum = layoutSize(target, false);
            minimum.width -= getHgap() + 1;
            return minimum;
        }

        private Dimension layoutSize(Container target, boolean preferred) {
            synchronized (target.getTreeLock()) {
                int targetWidth = target.getSize().width;
                if (targetWidth == 0) {
                    targetWidth = Integer.MAX_VALUE;
                }

                int horizontalInsetsAndGap = target.getInsets().left + target.getInsets().right + (getHgap() * 2);
                int maxWidth = targetWidth - horizontalInsetsAndGap;

                Dimension dimension = new Dimension(0, 0);
                int rowWidth = 0;
                int rowHeight = 0;

                int componentCount = target.getComponentCount();
                for (int index = 0; index < componentCount; index++) {
                    Component component = target.getComponent(index);
                    if (!component.isVisible()) {
                        continue;
                    }
                    Dimension size = preferred ? component.getPreferredSize() : component.getMinimumSize();
                    if (rowWidth + size.width > maxWidth) {
                        addRow(dimension, rowWidth, rowHeight);
                        rowWidth = 0;
                        rowHeight = 0;
                    }
                    if (rowWidth != 0) {
                        rowWidth += getHgap();
                    }
                    rowWidth += size.width;
                    rowHeight = Math.max(rowHeight, size.height);
                }
                addRow(dimension, rowWidth, rowHeight);

                dimension.width += horizontalInsetsAndGap;
                dimension.height += target.getInsets().top + target.getInsets().bottom + getVgap() * 2;

                Container scrollPane = SwingUtilities.getAncestorOfClass(JScrollPane.class, target);
                if (scrollPane != null) {
                    dimension.width -= getHgap() + 1;
                }
                return dimension;
            }
        }

        private void addRow(Dimension dimension, int rowWidth, int rowHeight) {
            dimension.width = Math.max(dimension.width, rowWidth);
            if (dimension.height > 0) {
                dimension.height += getVgap();
            }
            dimension.height += rowHeight;
        }
    }
}
