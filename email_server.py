#!/usr/bin/env python3
"""
Simple Email Server
- Sends OTP emails
- Sends issue approval confirmation emails
- Sends contact form emails and acknowledgements
Configure delivery with environment variables.
"""

import smtplib
import json
import random
import re
import time
from threading import Lock
from email.mime.text import MIMEText
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os

def load_local_env_file():
    """Load a simple .env file from the project root without extra dependencies."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(env_path):
        return

    with open(env_path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:].strip()
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)


load_local_env_file()

# ===== CONFIGURE WITH ENVIRONMENT VARIABLES =====
SENDER_EMAIL = os.environ.get("SMART_LIBRARY_SENDER_EMAIL", "").strip()
SMTP_SERVER = os.environ.get("SMART_LIBRARY_SMTP_SERVER", "smtp.gmail.com").strip() or "smtp.gmail.com"
APP_PASSWORD = os.environ.get("SMART_LIBRARY_APP_PASSWORD", "").strip()
if SMTP_SERVER.lower().endswith("gmail.com"):
    # Gmail app passwords are often copied in grouped blocks like "abcd efgh ijkl mnop".
    APP_PASSWORD = "".join(APP_PASSWORD.split())
SUPPORT_EMAIL = os.environ.get("SMART_LIBRARY_SUPPORT_EMAIL", SENDER_EMAIL).strip()
SMTP_PORT = int(os.environ.get("SMART_LIBRARY_SMTP_PORT", "465"))
CORS_ORIGIN = os.environ.get("SMART_LIBRARY_CORS_ORIGIN", "*").strip() or "*"
OTP_TTL_SECONDS = int(os.environ.get("SMART_LIBRARY_OTP_TTL_SECONDS", "600"))
ENABLE_DEMO_OTP_FALLBACK = os.environ.get(
    "SMART_LIBRARY_ENABLE_DEMO_OTP_FALLBACK", "true"
).strip().lower() in {"1", "true", "yes", "on"}
# ================================================

# Store OTPs temporarily (email -> {otp, expires_at})
otp_store = {}
otp_store_lock = Lock()

GMAIL_ADDRESS_PATTERN = re.compile(r"^[A-Za-z0-9._%+-]+@gmail\.com$")

def generate_otp():
    """Generate 6-digit OTP (matches C backend: rand() % 900000 + 100000)"""
    return random.randint(100000, 999999)


def is_gmail_address(email):
    """Validate that the provided email is a Gmail address."""
    return bool(GMAIL_ADDRESS_PATTERN.fullmatch((email or "").strip()))

def send_email(to_email, subject, body, reply_to=None):
    """Send a plain text email using SMTP."""
    if not SENDER_EMAIL or not APP_PASSWORD:
        print("Email send skipped: SMART_LIBRARY_SENDER_EMAIL or SMART_LIBRARY_APP_PASSWORD is not configured.")
        return False
    try:
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = SENDER_EMAIL
        msg['To'] = to_email
        if reply_to:
            msg['Reply-To'] = reply_to

        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
            server.login(SENDER_EMAIL, APP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"Email send failed: {e}")
        return False


def build_otp_email_content(otp, purpose="email_verification"):
    """Build subject and body for OTP emails."""
    normalized_purpose = (purpose or "email_verification").strip().lower()

    if normalized_purpose == "password_reset":
        subject = "Smart Library Password Reset Verification Code"
        body = f"""Dear User,

We received a request to reset the password for your Smart Library account associated with this email address.

Please use the one-time verification code below to continue:

Password Reset OTP: {otp}

For your security, do not share this code with anyone. If you did not request a password reset, you can safely ignore this email and no changes will be made to your account.

Regards,
Smart Library Support Team
"""
        return subject, body

    subject = "Smart Library Email Verification Code"
    body = f"""Dear User,

Thank you for using Smart Library.

Please use the following one-time verification code to continue with your request:

Verification OTP: {otp}

This code is intended only for your use. Please do not share it with anyone.

Regards,
Smart Library Support Team
"""
    return subject, body


def send_otp_email(to_email, otp, purpose="email_verification"):
    """Send OTP email using SMTP."""
    subject, body = build_otp_email_content(otp, purpose)
    return send_email(to_email, subject, body)


def build_issue_approval_email(data):
    """Build the issue approval confirmation email body."""
    user_name = data.get('user_name', 'Reader').strip() or 'Reader'
    book_title = data.get('book_title', 'Unknown Book').strip() or 'Unknown Book'
    library = data.get('library', 'Your Library').strip() or 'Your Library'
    book_id = str(data.get('book_id', '')).strip() or 'N/A'
    issue_date = data.get('issue_date', 'N/A').strip() or 'N/A'
    due_date = data.get('due_date', 'N/A').strip() or 'N/A'

    return f"""Dear {user_name},

Warm greetings from {library}.

Your issue request has been approved by the library admin. You can now collect your book from the respective library.

Book Details:
- Title: {book_title}
- Book ID: {book_id}
- Library: {library}
- Issue Date: {issue_date}
- Due Date: {due_date}

Please visit the library and collect your book within 3 days. If the book is not collected within this period, your issue request may be cancelled.

Thank you for using Smart Library.

Regards,
{library}
Smart Library Team
"""


def send_issue_approval_email(to_email, data):
    """Send issue approval confirmation email."""
    subject = f"Issue Request Approved - {data.get('book_title', 'Book')}"
    body = build_issue_approval_email(data)
    return send_email(to_email, subject, body)


def build_contact_email(data):
    """Build the Contact Us email sent to the support inbox."""
    from_email = (data.get('from_email', '') or '').strip()
    subject = (data.get('subject', '') or '').strip() or 'Contact request'
    body = (data.get('body', '') or '').strip() or 'No message provided.'

    mail_subject = f"Smart Library Contact Form - {subject}"
    mail_body = f"""Hello,

You have received a new message from the Smart Library Contact Us form.

Sender Email: {from_email}
Subject: {subject}

Message:
{body}

You can reply directly to this email to respond to the sender.

Regards,
Smart Library Website
"""
    return mail_subject, mail_body, from_email


def send_contact_message(data):
    """Send a contact form message to the support inbox."""
    subject, body, reply_to = build_contact_email(data)
    return send_email(SUPPORT_EMAIL or SENDER_EMAIL, subject, body, reply_to=reply_to or None)


def build_contact_acknowledgement_email(data):
    """Build the acknowledgement email sent back to the contact form sender."""
    sender_email = (data.get('from_email', '') or '').strip()
    original_subject = (data.get('subject', '') or '').strip() or 'your message'

    subject = "We have received your message - Smart Library Support"
    body = f"""Dear User,

Thank you for contacting Smart Library Support.

We are happy to confirm that we have received your message regarding "{original_subject}" from {sender_email}.

Our team is reviewing your request and will get back to you within 24 to 48 hours to help resolve the issue.

If you need to add any important details, you may reply to this email and our support team will review the update.

Regards,
Smart Library Support Team
"""
    return subject, body


def send_contact_acknowledgement(data):
    """Send an acknowledgement email to the contact form sender."""
    sender_email = (data.get('from_email', '') or '').strip()
    subject, body = build_contact_acknowledgement_email(data)
    return send_email(sender_email, subject, body)

class EmailHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        self.send_response(status)
        self.send_header('Access-Control-Allow-Origin', CORS_ORIGIN)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', CORS_ORIGIN)
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_POST(self):
        """Handle POST requests"""
        if self.path == '/send_otp':
            self.handle_send_otp()
        elif self.path == '/verify_otp':
            self.handle_verify_otp()
        elif self.path == '/send_issue_approval':
            self.handle_send_issue_approval()
        elif self.path == '/send_contact_message':
            self.handle_send_contact_message()
        else:
            self._send_json(404, {'ok': False, 'error': 'Not found'})
    
    def handle_send_otp(self):
        """Handle /send_otp - Send OTP to email"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            email = data.get('email', '').strip()
            purpose = data.get('purpose', 'email_verification').strip()
            if not email:
                self._send_json(400, {'ok': False, 'error': 'Email required'})
                return
            
            otp = generate_otp()
            with otp_store_lock:
                otp_store[email] = {
                    'otp': otp,
                    'expires_at': time.time() + OTP_TTL_SECONDS,
                }

            # Try to send email. Even if this reports a failure, we keep the OTP
            # in memory so that verification can still succeed if the mail
            # actually reached the user.
            if send_otp_email(email, otp, purpose):
                self._send_json(200, {'ok': True, 'message': 'OTP sent'})
                print(f"OTP sent to {email} for {purpose}: {otp}")
            else:
                print(f"Email send reported failure for {email} ({purpose}), OTP was: {otp}")
                if ENABLE_DEMO_OTP_FALLBACK:
                    self._send_json(200, {
                        'ok': True,
                        'message': 'Email delivery failed, so a demo OTP has been generated for local testing.',
                        'fallback_otp': str(otp),
                    })
                else:
                    self._send_json(500, {'ok': False, 'error': 'Failed to send OTP email'})
        except Exception as e:
            self._send_json(500, {'ok': False, 'error': str(e)})
    
    def handle_verify_otp(self):
        """Handle /verify_otp - Verify OTP"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            email = data.get('email', '').strip()
            otp_input = data.get('otp', '').strip()
            
            if not email or not otp_input:
                self._send_json(400, {'ok': False, 'error': 'Email and OTP required'})
                return
            
            with otp_store_lock:
                stored_entry = otp_store.get(email)
            if stored_entry is None:
                self._send_json(400, {'ok': False, 'error': 'No OTP found for this email'})
                return
            if stored_entry['expires_at'] < time.time():
                with otp_store_lock:
                    otp_store.pop(email, None)
                self._send_json(400, {'ok': False, 'error': 'OTP expired. Request a new code.'})
                return
            
            try:
                otp_input_int = int(otp_input)
                if stored_entry['otp'] == otp_input_int:
                    with otp_store_lock:
                        otp_store.pop(email, None)
                    self._send_json(200, {'ok': True, 'message': 'OTP verified'})
                else:
                    self._send_json(400, {'ok': False, 'error': 'Invalid OTP'})
            except ValueError:
                self._send_json(400, {'ok': False, 'error': 'Invalid OTP format'})
        except Exception as e:
            self._send_json(500, {'ok': False, 'error': str(e)})

    def handle_send_issue_approval(self):
        """Handle /send_issue_approval - Send approval confirmation email."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))

            email = data.get('email', '').strip()
            if not email:
                self._send_json(400, {'ok': False, 'error': 'Email required'})
                return

            if send_issue_approval_email(email, data):
                self._send_json(200, {'ok': True, 'message': 'Approval email sent'})
                print(f"Issue approval email sent to {email} for book {data.get('book_id', 'N/A')}")
            else:
                self._send_json(500, {'ok': False, 'error': 'Failed to send approval email'})
        except Exception as e:
            self._send_json(500, {'ok': False, 'error': str(e)})

    def handle_send_contact_message(self):
        """Handle /send_contact_message - Send a support email from the Contact Us form."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))

            from_email = data.get('from_email', '').strip()
            subject = data.get('subject', '').strip()
            body = data.get('body', '').strip()

            if not from_email or not subject or not body:
                self._send_json(400, {'ok': False, 'error': 'Email, subject, and message are required'})
                return
            if not is_gmail_address(from_email):
                self._send_json(400, {'ok': False, 'error': 'Only @gmail.com email addresses are allowed'})
                return

            if send_contact_message(data):
                acknowledgement_sent = send_contact_acknowledgement(data)
                if acknowledgement_sent:
                    self._send_json(200, {'ok': True, 'message': 'Contact message sent and acknowledgement delivered'})
                else:
                    self._send_json(200, {'ok': True, 'message': 'Contact message sent, but acknowledgement email could not be delivered'})
                print(f"Contact message received from {from_email}: {subject}")
            else:
                self._send_json(500, {'ok': False, 'error': 'Failed to send contact message'})
        except Exception as e:
            self._send_json(500, {'ok': False, 'error': str(e)})
    
    def log_message(self, format, *args):
        """Suppress default logging"""
        pass

def run_server(port=8081):
    """Run the email server"""
    server_address = ('', port)
    httpd = ThreadingHTTPServer(server_address, EmailHandler)
    print(f"Email Server running on http://localhost:{port}")
    print(f"Using sender: {SENDER_EMAIL or 'not configured'}")
    print("Endpoints: POST /send_otp, POST /verify_otp, POST /send_issue_approval, POST /send_contact_message")
    if not SENDER_EMAIL or not APP_PASSWORD:
        print(
            "\nConfigure SMART_LIBRARY_SENDER_EMAIL and SMART_LIBRARY_APP_PASSWORD "
            "in your shell or a local .env file to enable email delivery."
        )
    else:
        print("SMTP credentials loaded from environment or .env.")
    if ENABLE_DEMO_OTP_FALLBACK:
        print("Demo OTP fallback is enabled when SMTP delivery fails.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down email server...")
        httpd.shutdown()

if __name__ == '__main__':
    port = int(os.environ.get("PORT", "8081"))
    if len(os.sys.argv) > 1:
        port = int(os.sys.argv[1])
    run_server(port)
