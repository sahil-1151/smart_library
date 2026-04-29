package smartlibrary;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import javax.net.ssl.SSLSocketFactory;

public final class OtpEmailService {
    private static final int SOCKET_TIMEOUT_MS = 10000;

    public static final class SendResult {
        public final boolean sent;
        public final String message;

        public SendResult(boolean sent, String message) {
            this.sent = sent;
            this.message = message;
        }
    }

    private static final class SmtpConfig {
        private final String host;
        private final int port;
        private final String username;
        private final String password;
        private final String fromAddress;
        private final boolean ssl;

        private SmtpConfig(String host, int port, String username, String password, String fromAddress, boolean ssl) {
            this.host = host;
            this.port = port;
            this.username = username;
            this.password = password;
            this.fromAddress = fromAddress;
            this.ssl = ssl;
        }
    }

    private OtpEmailService() {
    }

    public static SendResult sendOtp(String email, int otp) {
        SmtpConfig config = loadConfig();
        if (config == null) {
            return new SendResult(false, "SMTP is not configured, so the OTP will be shown locally.");
        }

        try {
            sendEmail(config, email, otp);
            return new SendResult(true, "OTP email sent successfully.");
        } catch (IOException ex) {
            return new SendResult(false, "Email sending failed (" + ex.getMessage() + "), so the OTP will be shown locally.");
        }
    }

    private static SmtpConfig loadConfig() {
        String host = trim(System.getenv("SMART_LIBRARY_SMTP_HOST"));
        String portValue = trim(System.getenv("SMART_LIBRARY_SMTP_PORT"));
        String username = trim(System.getenv("SMART_LIBRARY_SMTP_USER"));
        String password = trim(System.getenv("SMART_LIBRARY_SMTP_PASSWORD"));
        String fromAddress = trim(System.getenv("SMART_LIBRARY_SMTP_FROM"));
        String sslValue = trim(System.getenv("SMART_LIBRARY_SMTP_SSL"));

        if (host == null || username == null || password == null || fromAddress == null) {
            return null;
        }

        int port = 465;
        if (portValue != null) {
            try {
                port = Integer.parseInt(portValue);
            } catch (NumberFormatException ignored) {
                port = 465;
            }
        }

        boolean ssl = sslValue == null || Boolean.parseBoolean(sslValue);
        return new SmtpConfig(host, port, username, password, fromAddress, ssl);
    }

    private static void sendEmail(SmtpConfig config, String email, int otp) throws IOException {
        Socket socket = config.ssl
                ? SSLSocketFactory.getDefault().createSocket(config.host, config.port)
                : new Socket(config.host, config.port);

        socket.setSoTimeout(SOCKET_TIMEOUT_MS);

        try (socket;
             BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
             BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8))) {

            expect(readResponse(reader), "220");

            writeCommand(writer, "EHLO smart-library");
            expect(readResponse(reader), "250");

            writeCommand(writer, "AUTH LOGIN");
            expect(readResponse(reader), "334");

            writeCommand(writer, base64(config.username));
            expect(readResponse(reader), "334");

            writeCommand(writer, base64(config.password));
            expect(readResponse(reader), "235");

            writeCommand(writer, "MAIL FROM:<" + config.fromAddress + ">");
            expect(readResponse(reader), "250");

            writeCommand(writer, "RCPT TO:<" + email + ">");
            expect(readResponse(reader), "250", "251");

            writeCommand(writer, "DATA");
            expect(readResponse(reader), "354");

            writer.write("From: Smart Library <" + config.fromAddress + ">\r\n");
            writer.write("To: <" + email + ">\r\n");
            writer.write("Subject: Smart Library OTP Verification\r\n");
            writer.write("Content-Type: text/plain; charset=UTF-8\r\n");
            writer.write("\r\n");
            writer.write("Your Smart Library OTP is: " + otp + "\r\n");
            writer.write("Use this code to complete verification in the app.\r\n");
            writer.write("\r\n.\r\n");
            writer.flush();
            expect(readResponse(reader), "250");

            writeCommand(writer, "QUIT");
            readResponse(reader);
        }
    }

    private static void writeCommand(BufferedWriter writer, String command) throws IOException {
        writer.write(command);
        writer.write("\r\n");
        writer.flush();
    }

    private static String readResponse(BufferedReader reader) throws IOException {
        String firstLine = reader.readLine();
        if (firstLine == null) {
            throw new IOException("No SMTP response received.");
        }

        StringBuilder response = new StringBuilder(firstLine);
        String currentLine = firstLine;
        while (currentLine.length() > 3 && currentLine.charAt(3) == '-') {
            currentLine = reader.readLine();
            if (currentLine == null) {
                break;
            }
            response.append('\n').append(currentLine);
        }
        return response.toString();
    }

    private static void expect(String response, String... validCodes) throws IOException {
        for (String code : validCodes) {
            if (response.startsWith(code)) {
                return;
            }
        }
        throw new IOException("Unexpected SMTP response: " + response);
    }

    private static String base64(String value) {
        return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String trim(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
