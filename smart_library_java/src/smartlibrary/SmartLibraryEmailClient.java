package smartlibrary.swing;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class SmartLibraryEmailClient {
    private static final Pattern MESSAGE_PATTERN = Pattern.compile("\"(message|error)\"\\s*:\\s*\"((?:\\\\.|[^\"])*)\"");

    private final HttpClient client;
    private final String baseUrl;
    private final Map<String, String> fallbackOtpStore = new ConcurrentHashMap<>();

    SmartLibraryEmailClient(String baseUrl) {
        this.client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    OtpSendResult sendOtp(String email, String purpose) {
        String payload = "{"
            + "\"email\":\"" + jsonEscape(email) + "\","
            + "\"purpose\":\"" + jsonEscape(purpose) + "\""
            + "}";
        try {
            HttpResponse<String> response = postJson("/send_otp", payload);
            boolean ok = response.statusCode() >= 200 && response.statusCode() < 300 && response.body().contains("\"ok\": true");
            String message = extractMessage(response.body(), ok ? "OTP sent to your email." : "Failed to send OTP.");
            return new OtpSendResult(ok, message, null);
        } catch (Exception ex) {
            String fallbackOtp = String.valueOf(generateOtp());
            fallbackOtpStore.put(normalizeEmail(email), fallbackOtp);
            return new OtpSendResult(
                false,
                "Email server is unavailable, so a demo OTP is shown below.",
                fallbackOtp
            );
        }
    }

    OperationResult verifyOtp(String email, String otp) {
        String normalizedEmail = normalizeEmail(email);
        String normalizedOtp = otp == null ? "" : otp.trim();
        String fallbackOtp = fallbackOtpStore.get(normalizedEmail);
        if (fallbackOtp != null && fallbackOtp.equals(normalizedOtp)) {
            fallbackOtpStore.remove(normalizedEmail);
            return OperationResult.ok("OTP verified");
        }

        String payload = "{"
            + "\"email\":\"" + jsonEscape(email) + "\","
            + "\"otp\":\"" + jsonEscape(otp) + "\""
            + "}";
        try {
            HttpResponse<String> response = postJson("/verify_otp", payload);
            boolean ok = response.statusCode() >= 200 && response.statusCode() < 300 && response.body().contains("\"ok\": true");
            if (ok) {
                return OperationResult.ok("OTP verified");
            }
            return OperationResult.error(extractMessage(response.body(), "Invalid OTP"));
        } catch (Exception ex) {
            return OperationResult.error("Verification failed. Start email_server.py or use the fallback OTP if shown.");
        }
    }

    OperationResult sendIssueApprovalEmail(ApprovalEmailData data) {
        String payload = "{"
            + "\"email\":\"" + jsonEscape(data.email()) + "\","
            + "\"user_name\":\"" + jsonEscape(data.userName()) + "\","
            + "\"book_title\":\"" + jsonEscape(data.bookTitle()) + "\","
            + "\"library\":\"" + jsonEscape(data.library()) + "\","
            + "\"book_id\":\"" + jsonEscape(data.bookId()) + "\","
            + "\"issue_date\":\"" + jsonEscape(data.issueDate()) + "\","
            + "\"due_date\":\"" + jsonEscape(data.dueDate()) + "\""
            + "}";
        return postSimple("/send_issue_approval", payload, "Approval email sent.", "Approval email could not be sent. Start email_server.py to enable it.");
    }

    OperationResult sendContactMessage(String fromEmail, String subject, String body) {
        String payload = "{"
            + "\"from_email\":\"" + jsonEscape(fromEmail) + "\","
            + "\"subject\":\"" + jsonEscape(subject) + "\","
            + "\"body\":\"" + jsonEscape(body) + "\""
            + "}";
        return postSimple("/send_contact_message", payload, "Your message has been sent successfully.", "Message could not be sent. Start email_server.py to enable contact support.");
    }

    boolean isAllowedContactEmail(String email) {
        return email != null && email.trim().toLowerCase().matches("^[a-z0-9._%+-]+@gmail\\.com$");
    }

    private OperationResult postSimple(String path, String payload, String successFallback, String errorFallback) {
        try {
            HttpResponse<String> response = postJson(path, payload);
            boolean ok = response.statusCode() >= 200 && response.statusCode() < 300 && response.body().contains("\"ok\": true");
            if (ok) {
                return OperationResult.ok(extractMessage(response.body(), successFallback));
            }
            return OperationResult.error(extractMessage(response.body(), errorFallback));
        } catch (Exception ex) {
            return OperationResult.error(errorFallback);
        }
    }

    private HttpResponse<String> postJson(String path, String payload) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + path))
            .timeout(Duration.ofSeconds(5))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
            .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private String extractMessage(String body, String fallback) {
        if (body == null || body.isBlank()) {
            return fallback;
        }
        Matcher matcher = MESSAGE_PATTERN.matcher(body);
        if (!matcher.find()) {
            return fallback;
        }
        return matcher.group(2)
            .replace("\\n", "\n")
            .replace("\\\"", "\"")
            .replace("\\\\", "\\");
    }

    private String jsonEscape(String value) {
        String raw = value == null ? "" : value;
        return raw
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r");
    }

    private int generateOtp() {
        return 100000 + (int) (Math.random() * 900000);
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }
}
