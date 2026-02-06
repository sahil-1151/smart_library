#!/usr/bin/env python3
"""
Simple Email Server - Sends OTP emails using your SMTP credentials
Configure your email and app password below.
"""

import smtplib
import json
import random
from email.mime.text import MIMEText
from http.server import HTTPServer, BaseHTTPRequestHandler
import os

# ===== CONFIGURE YOUR EMAIL HERE =====
SENDER_EMAIL = "sahilprajapati10001@gmail.com"  # Your email
APP_PASSWORD = "ygsl teof ecku ybvi"            # Your Gmail app password
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 465
# ======================================

# Store OTPs temporarily (email -> otp)
otp_store = {}

def generate_otp():
    """Generate 6-digit OTP (matches C backend: rand() % 900000 + 100000)"""
    return random.randint(100000, 999999)

def send_otp_email(to_email, otp):
    """Send OTP email using SMTP"""
    try:
        msg = MIMEText(f"Your OTP is: {otp}")
        msg['Subject'] = 'Email Verification OTP'
        msg['From'] = SENDER_EMAIL
        msg['To'] = to_email
        
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
            server.login(SENDER_EMAIL, APP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"Email send failed: {e}")
        return False

class EmailHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_POST(self):
        """Handle POST requests"""
        if self.path == '/send_otp':
            self.handle_send_otp()
        elif self.path == '/verify_otp':
            self.handle_verify_otp()
        else:
            self.send_response(404)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': False, 'error': 'Not found'}).encode())
    
    def handle_send_otp(self):
        """Handle /send_otp - Send OTP to email"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            email = data.get('email', '').strip()
            if not email:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': 'Email required'}).encode())
                return
            
            otp = generate_otp()
            otp_store[email] = otp

            # Try to send email. Even if this reports a failure, we keep the OTP
            # in memory so that verification can still succeed if the mail
            # actually reached the user.
            if send_otp_email(email, otp):
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': True, 'message': 'OTP sent'}).encode())
                print(f"OTP sent to {email}: {otp}")
            else:
                # Do NOT delete from otp_store; just log the problem.
                print(f"Email send reported failure for {email}, OTP was: {otp}")
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': True, 'message': 'OTP generated (send reported failure)'}).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': False, 'error': str(e)}).encode())
    
    def handle_verify_otp(self):
        """Handle /verify_otp - Verify OTP"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            email = data.get('email', '').strip()
            otp_input = data.get('otp', '').strip()
            
            if not email or not otp_input:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': 'Email and OTP required'}).encode())
                return
            
            stored_otp = otp_store.get(email)
            if stored_otp is None:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': 'No OTP found for this email'}).encode())
                return
            
            try:
                otp_input_int = int(otp_input)
                if stored_otp == otp_input_int:
                    del otp_store[email]
                    self.send_response(200)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'ok': True, 'message': 'OTP verified'}).encode())
                else:
                    self.send_response(400)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'ok': False, 'error': 'Invalid OTP'}).encode())
            except ValueError:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': 'Invalid OTP format'}).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': False, 'error': str(e)}).encode())
    
    def log_message(self, format, *args):
        """Suppress default logging"""
        pass

def run_server(port=8080):
    """Run the email server"""
    server_address = ('', port)
    httpd = HTTPServer(server_address, EmailHandler)
    print(f"Email Server running on http://localhost:{port}")
    print(f"Using sender: {SENDER_EMAIL}")
    print("Endpoints: POST /send_otp, POST /verify_otp")
    print("\nTo change email/password, edit SENDER_EMAIL and APP_PASSWORD in email_server.py")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down email server...")
        httpd.shutdown()

if __name__ == '__main__':
    run_server(8080)
