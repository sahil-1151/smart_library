📚 Smart Library – Book Discovery & Reservation System

📌 Overview
Smart Library is a prototype system designed to simplify how users discover books across nearby libraries. Instead of physically visiting multiple libraries to check availability, users can search for books online, reserve them by paying a nominal fee, and even book time slots to visit libraries.
The system aims to reduce time wastage, improve accessibility, and enable better crowd management in libraries.

🎯 Problem Statement
Traditional libraries require users to:
Physically visit libraries to check book availability
Waste time if a book is not present
Face overcrowding during peak hours
There is no unified system to:
Discover nearby libraries
Check real-time availability of books
Reserve books in advance

Book library visit slots
💡 Proposed Solution
Smart Library provides:
Centralized book discovery across multiple libraries
Advance book reservation (hold system)
Slot booking to manage library crowd flow
Role-based access for users and library admins

✨ Key Features
👤 User Features

Search for books by title (case-insensitive)
View libraries where the book is available
Reserve (hold) a book by paying a nominal fee
Book time slots for visiting the library
View reservation and booking status

🛠️ Admin (Library) Features
Add, update, and remove books
Manage book availability
View reservations and slot bookings
Prevent double booking of books

🧠 System Design Highlights
Modular C programming approach
Structured file handling for persistent storage
Role-based authentication (User / Admin)
Efficient searching using data structures (BST / Linked Lists)
Case-insensitive string matching for book search
Input validation to avoid inconsistent data

🧰 Tech Stack
Language: C
Concepts Used:
Structures
Pointers
File Handling
Modular Programming
Data Structures (BST, Linked List, Queue)
Platform: Command Line (Prototype)

📂 Project Structure
Smart-Library/
│
├── Main.c
├── Student.c / Student.h
├── Bst.c / Bst.h
├── Linked.c / Linked.h
├── Queue.c / Queue.h
├── data_book.txt
├── issue_book.txt
├── user_login.txt
└── README.md

🚀 How to Run the Project
Clone the repository:
git clone https://github.com/your-username/smart-library.git
Compile the project:
gcc Main.c Student.c Bst.c Linked.c Queue.c -o SmartLibrary
Run the executable:
./SmartLibrary

⚠️ Limitations (Current Version)
Console-based interface (no GUI)
Location is simulated (not GPS-based)
Payment is mocked (nominal fee logic only)
Designed as a prototype for academic purposes

🔮 Future Enhancements
Web or mobile frontend
Real-time location-based library discovery
Online payment gateway integration
Notification system for reservations
Admin dashboard with analytics
API-based architecture

📖 Learning Outcomes
Designed a real-world problem-solving system
Improved understanding of modular C programming
Hands-on experience with file-based databases
Applied data structures to real use cases
Learned system design and scalability thinking

👨‍💻 Author
Sahil
B.Tech Student | Cybersecurity Specialization
Interested in system design, backend development, and problem-solvingf
