#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "Admin.h"
#include "Bst.h"
#include "Linked.h"
#include "Queue.h"
#include "Request.h"
#include "Slot.h"
#include "Storage.h"
#include "User.h"

static void clear_input_buffer(void) {
    int c;
    while ((c = getchar()) != '\n' && c != EOF);
}

static void save_all(struct treenode *book_root,
                     struct student *user_root,
                     struct node *issue_root,
                     struct queue *queue_front,
                     struct admin *admin_root,
                     struct request *request_root,
                     struct slot_booking *slot_root)
{
    save_books(book_root);
    save_users(user_root);
    save_issued_books(issue_root);
    save_queue(queue_front);
    save_admin(admin_root);
    save_issue_requests(request_root);
    save_slot_bookings(slot_root);
}

static int admin_can_manage_book(struct treenode *book_root,
                                 const char *admin_lib,
                                 int book_id)
{
    struct treenode *book = search_id(book_root, book_id);

    return book && case_insensitive_cmp(book->lib, admin_lib);
}

static int is_basic_valid_date(struct date date)
{
    return date.year >= 1900 &&
           date.month >= 1 && date.month <= 12 &&
           date.day >= 1 && date.day <= 31;
}

static int is_leap_year_value(int year)
{
    return (year % 400 == 0) ||
           (year % 4 == 0 && year % 100 != 0);
}

static int days_in_month_value(int month, int year)
{
    static const int days[] =
        {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};

    if (month == 2 && is_leap_year_value(year))
        return 29;

    return days[month - 1];
}

static int is_real_calendar_date(struct date date)
{
    if (!is_basic_valid_date(date))
        return 0;

    return date.day <= days_in_month_value(date.month, date.year);
}

static int read_slot_date(struct date *slot_date)
{
    if (!slot_date)
        return 0;

    printf("Enter slot date (DD MM YYYY): ");
    if (scanf("%d %d %d",
              &slot_date->day,
              &slot_date->month,
              &slot_date->year) != 3) {
        clear_input_buffer();
        return 0;
    }
    clear_input_buffer();

    if (!is_real_calendar_date(*slot_date))
        return 0;

    if (compare_date(*slot_date, current_date()) < 0)
        return 0;

    return 1;
}

static int read_slot_id_from_user(int *slot_id)
{
    if (!slot_id)
        return 0;

    printf("\nAvailable Slots\n");
    printf("1. %s\n", slot_label(1));
    printf("2. %s\n", slot_label(2));
    printf("3. %s\n", slot_label(3));
    printf("4. %s\n", slot_label(4));
    printf("Choose slot: ");

    if (scanf("%d", slot_id) != 1) {
        clear_input_buffer();
        return 0;
    }
    clear_input_buffer();

    return is_valid_slot_id(*slot_id);
}

static void handle_admin_session(struct admin *temp_admin,
                                 struct treenode **book_root,
                                 struct node **issue_root,
                                 struct request **request_root,
                                 struct slot_booking *slot_root)
{
    int admin_choice;

    while (1) {
        printf("\n--- ADMIN MENU ---\n");
        printf("1. View Admin Information\n");
        printf("2. View Library Books\n");
        printf("3. Add Book\n");
        printf("4. Delete Book\n");
        printf("5. Edit Book Information\n");
        printf("6. View Pending Issue Requests\n");
        printf("7. Approve Issue Request\n");
        printf("8. Reject Issue Request\n");
        printf("9. View Slot Bookings\n");
        printf("10. Back\n");
        printf("Enter choice: ");

        if (scanf("%d", &admin_choice) != 1) {
            clear_input_buffer();
            printf("\nInvalid input\n");
            continue;
        }
        clear_input_buffer();

        if (admin_choice == 1) {
            printf("\nLibrarian Name : %s\n", temp_admin->name);
            printf("Library Name   : %s\n", temp_admin->lib);
            printf("Librarian Id   : %d\n", temp_admin->id);
            printf("Email          : %s\n", temp_admin->email);
        }
        else if (admin_choice == 2) {
            visit_lib(*book_root, temp_admin->lib);
        }
        else if (admin_choice == 3) {
            int id, total, issue_total, slot_booking;
            char title[25], author[20];
            struct treenode *node;

            printf("Book ID: ");
            if (scanf("%d", &id) != 1) {
                clear_input_buffer();
                printf("\nInvalid book id\n");
                continue;
            }
            clear_input_buffer();

            printf("Title: ");
            fgets(title, sizeof(title), stdin);
            title[strcspn(title, "\n")] = '\0';

            printf("Author: ");
            fgets(author, sizeof(author), stdin);
            author[strcspn(author, "\n")] = '\0';

            printf("Total copies: ");
            if (scanf("%d", &total) != 1) {
                clear_input_buffer();
                printf("\nInvalid copies\n");
                continue;
            }
            clear_input_buffer();

            printf("Issue copies: ");
            if (scanf("%d", &issue_total) != 1) {
                clear_input_buffer();
                printf("\nInvalid issue copies\n");
                continue;
            }
            clear_input_buffer();

            printf("Slot-booking copies: ");
            if (scanf("%d", &slot_booking) != 1) {
                clear_input_buffer();
                printf("\nInvalid slot-booking copies\n");
                continue;
            }
            clear_input_buffer();

            if (issue_total < 0 || issue_total > total ||
                slot_booking < 0 || slot_booking > total) {
                printf("\nIssue and slot-booking copies must stay between 0 and total copies\n");
                continue;
            }

            node = createnode(id, temp_admin->lib, title, author, total);

            if (!node) {
                printf("\nBook add failed\n");
                continue;
            }

            node->issue_total_copies = issue_total;
            node->available_copies = issue_total;
            node->slot_booking_copies = slot_booking;

            *book_root = insert(*book_root, node);
            save_books(*book_root);
            printf("\nBook added successfully\n");
        }
        else if (admin_choice == 4) {
            int id;

            printf("Enter book ID to delete: ");
            if (scanf("%d", &id) != 1) {
                clear_input_buffer();
                printf("\nInvalid book id\n");
                continue;
            }
            clear_input_buffer();

            if (!admin_can_manage_book(*book_root, temp_admin->lib, id)) {
                printf("\nYou can delete only books from your library\n");
                continue;
            }

            *book_root = deletenode(*book_root, id);
            save_books(*book_root);
            printf("\nDelete operation completed\n");
        }
        else if (admin_choice == 5) {
            int book_id;
            struct treenode *temp;

            printf("\nEditing Book Id: ");
            if (scanf("%d", &book_id) != 1) {
                clear_input_buffer();
                printf("\nInvalid book id\n");
                continue;
            }
            clear_input_buffer();

            if (!admin_can_manage_book(*book_root, temp_admin->lib, book_id)) {
                printf("\nYou can edit only books from your library\n");
                continue;
            }

            temp = search_id(*book_root, book_id);
            if (!temp) {
                printf("\nBook not found\n");
                continue;
            }

            while (1) {
                int choice;

                printf("\n1. Edit Author Name\n");
                printf("2. Edit Title\n");
                printf("3. Edit Issue Copies Available\n");
                printf("4. Edit Issue Copy Limit\n");
                printf("5. Edit Slot-Booking Copies\n");
                printf("6. Edit Total Copies\n");
                printf("7. Back\n");
                printf("Enter your choice: ");

                if (scanf("%d", &choice) != 1) {
                    clear_input_buffer();
                    printf("\nInvalid choice\n");
                    continue;
                }
                clear_input_buffer();

                if (choice == 1) {
                    char author[25];

                    printf("Author: ");
                    fgets(author, sizeof(author), stdin);
                    author[strcspn(author, "\n")] = '\0';
                    edit(temp, author, temp->title,
                         temp->available_copies, temp->issue_total_copies,
                         temp->slot_booking_copies, temp->total_copies);
                    save_books(*book_root);
                    printf("\nAuthor updated successfully\n");
                }
                else if (choice == 2) {
                    char title[25];

                    printf("Title: ");
                    fgets(title, sizeof(title), stdin);
                    title[strcspn(title, "\n")] = '\0';
                    edit(temp, temp->author, title,
                         temp->available_copies, temp->issue_total_copies,
                         temp->slot_booking_copies, temp->total_copies);
                    save_books(*book_root);
                    printf("\nTitle updated successfully\n");
                }
                else if (choice == 3) {
                    int avail_copies;

                    printf("Issue Copies Available: ");
                    if (scanf("%d", &avail_copies) != 1) {
                        clear_input_buffer();
                        printf("\nInvalid copies\n");
                        continue;
                    }
                    clear_input_buffer();

                    edit(temp, temp->author, temp->title,
                         avail_copies, temp->issue_total_copies,
                         temp->slot_booking_copies, temp->total_copies);
                    save_books(*book_root);
                    printf("\nIssue copies available updated successfully\n");
                }
                else if (choice == 4) {
                    int issue_total_copies;

                    printf("Issue Copy Limit: ");
                    if (scanf("%d", &issue_total_copies) != 1) {
                        clear_input_buffer();
                        printf("\nInvalid copies\n");
                        continue;
                    }
                    clear_input_buffer();

                    edit(temp, temp->author, temp->title,
                         temp->available_copies, issue_total_copies,
                         temp->slot_booking_copies, temp->total_copies);
                    save_books(*book_root);
                    printf("\nIssue copy limit updated successfully\n");
                }
                else if (choice == 5) {
                    int slot_booking_copies;

                    printf("Slot-Booking Copies: ");
                    if (scanf("%d", &slot_booking_copies) != 1) {
                        clear_input_buffer();
                        printf("\nInvalid copies\n");
                        continue;
                    }
                    clear_input_buffer();

                    edit(temp, temp->author, temp->title,
                         temp->available_copies, temp->issue_total_copies,
                         slot_booking_copies, temp->total_copies);
                    save_books(*book_root);
                    printf("\nSlot-booking copies updated successfully\n");
                }
                else if (choice == 6) {
                    int total_copies;

                    printf("Total Copies: ");
                    if (scanf("%d", &total_copies) != 1) {
                        clear_input_buffer();
                        printf("\nInvalid copies\n");
                        continue;
                    }
                    clear_input_buffer();

                    edit(temp, temp->author, temp->title,
                         temp->available_copies, temp->issue_total_copies,
                         temp->slot_booking_copies, total_copies);
                    save_books(*book_root);
                    printf("\nTotal copies updated successfully\n");
                }
                else if (choice == 7) {
                    break;
                }
                else {
                    printf("\nInvalid choice\n");
                }
            }
        }
        else if (admin_choice == 6) {
            if (!view_admin_requests(*request_root, *book_root, temp_admin->lib))
                printf("\nNo pending requests for your library\n");
        }
        else if (admin_choice == 7) {
            int student_id, book_id;

            printf("Enter Student ID: ");
            if (scanf("%d", &student_id) != 1) {
                clear_input_buffer();
                printf("\nInvalid student id\n");
                continue;
            }
            clear_input_buffer();

            printf("Enter Book ID: ");
            if (scanf("%d", &book_id) != 1) {
                clear_input_buffer();
                printf("\nInvalid book id\n");
                continue;
            }
            clear_input_buffer();

            if (!request_exists(*request_root, student_id, book_id)) {
                printf("\nNo matching pending request found\n");
                continue;
            }

            if (!admin_can_manage_book(*book_root, temp_admin->lib, book_id)) {
                printf("\nYou can approve only requests for your library\n");
                continue;
            }

            if (is_book_issued_to_student(*issue_root, student_id, book_id)) {
                remove_issue_request(request_root, student_id, book_id);
                save_issue_requests(*request_root);
                printf("\nRequest removed because the book is already issued\n");
                continue;
            }

            if (issue_book(issue_root, *book_root,
                           student_id, book_id, current_date())) {
                remove_issue_request(request_root, student_id, book_id);
                save_books(*book_root);
                save_issued_books(*issue_root);
                save_issue_requests(*request_root);
                printf("\nRequest approved and book issued successfully\n");
            }
            else {
                printf("\nApproval failed. Book may be unavailable right now\n");
            }
        }
        else if (admin_choice == 8) {
            int student_id, book_id;

            printf("Enter Student ID: ");
            if (scanf("%d", &student_id) != 1) {
                clear_input_buffer();
                printf("\nInvalid student id\n");
                continue;
            }
            clear_input_buffer();

            printf("Enter Book ID: ");
            if (scanf("%d", &book_id) != 1) {
                clear_input_buffer();
                printf("\nInvalid book id\n");
                continue;
            }
            clear_input_buffer();

            if (!request_exists(*request_root, student_id, book_id)) {
                printf("\nNo matching pending request found\n");
                continue;
            }

            if (!admin_can_manage_book(*book_root, temp_admin->lib, book_id)) {
                printf("\nYou can reject only requests for your library\n");
                continue;
            }

            if (remove_issue_request(request_root, student_id, book_id)) {
                save_issue_requests(*request_root);
                printf("\nRequest rejected successfully\n");
            }
            else {
                printf("\nRequest rejection failed\n");
            }
        }
        else if (admin_choice == 9) {
            if (!view_admin_slot_bookings(slot_root, *book_root, temp_admin->lib))
                printf("\nNo slot bookings for your library\n");
        }
        else if (admin_choice == 10) {
            break;
        }
        else {
            printf("\nInvalid choice\n");
        }
    }
}

static void handle_user_session(struct student *temp_student,
                                struct treenode *book_root,
                                struct node **issue_root,
                                struct request **request_root,
                                struct slot_booking **slot_root)
{
    while (1) {
        int user_choice;

        printf("\n--- USER MENU ---\n");
        printf("1. User Information\n");
        printf("2. View Books\n");
        printf("3. Search Books\n");
        printf("4. Request Book Issue\n");
        printf("5. Return Book\n");
        printf("6. View Issued Books\n");
        printf("7. View Pending Requests\n");
        printf("8. Book Time Slot\n");
        printf("9. View Slot Bookings\n");
        printf("10. Cancel Slot Booking\n");
        printf("11. Logout\n");
        printf("Enter Choice: ");

        if (scanf("%d", &user_choice) != 1) {
            clear_input_buffer();
            printf("\nInvalid choice\n");
            continue;
        }
        clear_input_buffer();

        if (user_choice == 1) {
            printf("\nName       : %s", temp_student->name);
            printf("\nEmail      : %s", temp_student->email);
            printf("\nStudent Id : %d\n", temp_student->id);
        }
        else if (user_choice == 2) {
            inorder(book_root);
        }
        else if (user_choice == 3) {
            while (1) {
                int search_choice;

                printf("\n--- SEARCH MENU ---\n");
                printf("1. Search By Id\n");
                printf("2. Search By Title\n");
                printf("3. Search By Author\n");
                printf("4. Back\n");
                printf("Enter Choice: ");

                if (scanf("%d", &search_choice) != 1) {
                    clear_input_buffer();
                    printf("\nInvalid choice\n");
                    continue;
                }
                clear_input_buffer();

                if (search_choice == 1) {
                    int id;
                    struct treenode *temp;

                    printf("\nEnter Book Id: ");
                    if (scanf("%d", &id) != 1) {
                        clear_input_buffer();
                        printf("\nInvalid book id\n");
                        continue;
                    }
                    clear_input_buffer();

                    temp = search_id(book_root, id);
                    if (!temp) {
                        printf("\nBook not found\n");
                    }
                    else {
                        printf("\nBook Id          : %d\n", temp->book_id);
                        printf("Library          : %s\n", temp->lib);
                        printf("Title            : %s\n", temp->title);
                        printf("Author           : %s\n", temp->author);
                        printf("Issue Available  : %d\n",
                               temp->available_copies);
                        printf("Issue Pool       : %d\n",
                               temp->issue_total_copies);
                        printf("Slot Pool        : %d\n",
                               temp->slot_booking_copies);
                    }
                }
                else if (search_choice == 2) {
                    char search_title[25];

                    printf("Enter Title: ");
                    fgets(search_title, sizeof(search_title), stdin);
                    search_title[strcspn(search_title, "\n")] = '\0';

                    if (!search_string(book_root, search_title))
                        printf("\nBook not found\n");
                }
                else if (search_choice == 3) {
                    char search_author[25];

                    printf("Enter Author Name: ");
                    fgets(search_author, sizeof(search_author), stdin);
                    search_author[strcspn(search_author, "\n")] = '\0';

                    if (!search_string(book_root, search_author))
                        printf("\nBook not found\n");
                }
                else if (search_choice == 4) {
                    break;
                }
                else {
                    printf("\nInvalid choice\n");
                }
            }
        }
        else if (user_choice == 4) {
            int book_id;
            struct treenode *book;

            printf("\nEnter Book Id: ");
            if (scanf("%d", &book_id) != 1) {
                clear_input_buffer();
                printf("\nInvalid book id\n");
                continue;
            }
            clear_input_buffer();

            book = search_id(book_root, book_id);
            if (!book) {
                printf("\nBook not found\n");
            }
            else if (is_book_issued_to_student(*issue_root,
                                               temp_student->id,
                                               book_id)) {
                printf("\nThis book is already issued to you\n");
            }
            else if (request_exists(*request_root,
                                    temp_student->id,
                                    book_id)) {
                printf("\nYou already have a pending request for this book\n");
            }
            else if (add_issue_request(request_root,
                                       temp_student->id,
                                       book_id,
                                       current_date())) {
                save_issue_requests(*request_root);
                printf("\nIssue request sent. Waiting for admin approval\n");
            }
            else {
                printf("\nIssue request could not be created\n");
            }
        }
        else if (user_choice == 5) {
            int book_id;
            struct treenode *book;

            printf("\nEnter Book Id: ");
            if (scanf("%d", &book_id) != 1) {
                clear_input_buffer();
                printf("\nInvalid book id\n");
                continue;
            }
            clear_input_buffer();

            book = search_id(book_root, book_id);

            if (return_book(issue_root, temp_student->id,
                            book_id, current_date(), NULL)) {
                if (book && book->available_copies < book->issue_total_copies)
                    book->available_copies += 1;

                save_books(book_root);
                save_issued_books(*issue_root);
                printf("\nBook returned successfully\n");
            }
            else {
                printf("\nReturn failed\n");
            }
        }
        else if (user_choice == 6) {
            if (!view_issue_book(*issue_root, temp_student->id))
                printf("\nNo book issued\n");
        }
        else if (user_choice == 7) {
            if (!view_student_requests(*request_root,
                                       temp_student->id,
                                       book_root)) {
                printf("\nNo pending requests\n");
            }
        }
        else if (user_choice == 8) {
            int book_id;
            int slot_id;
            int day_reservation_count;
            struct date slot_date;
            struct treenode *book;

            printf("\nEnter Book Id: ");
            if (scanf("%d", &book_id) != 1) {
                clear_input_buffer();
                printf("\nInvalid book id\n");
                continue;
            }
            clear_input_buffer();

            book = search_id(book_root, book_id);
            if (!book) {
                printf("\nBook not found\n");
                continue;
            }

            if (book->slot_booking_copies <= 0) {
                printf("\nNo copies are configured for slot booking\n");
                continue;
            }

            if (has_slot_booking_for_book(*slot_root,
                                          temp_student->id,
                                          book_id)) {
                printf("\nYou already have a slot booking for this book\n");
                continue;
            }

            if (!read_slot_date(&slot_date)) {
                printf("\nInvalid slot date\n");
                continue;
            }

            day_reservation_count =
                count_slot_bookings_for_date(*slot_root,
                                             book_id,
                                             slot_date);

            if (day_reservation_count >= book->slot_booking_copies) {
                printf("\nAll slot-booking copies of this book are Preserved for that date\n");
                continue;
            }

            if (!read_slot_id_from_user(&slot_id)) {
                printf("\nInvalid slot choice\n");
                continue;
            }

            if (add_slot_booking(slot_root,
                                 temp_student->id,
                                 book_id,
                                 slot_date,
                                 slot_id)) {
                save_slot_bookings(*slot_root);
                printf("\nTime slot booked successfully\n");
            }
            else {
                printf("\nTime slot booking failed\n");
            }
        }
        else if (user_choice == 9) {
            if (!view_student_slot_bookings(*slot_root,
                                            temp_student->id,
                                            book_root)) {
                printf("\nNo slot bookings found\n");
            }
        }
        else if (user_choice == 10) {
            int book_id;

            printf("\nEnter Book Id: ");
            if (scanf("%d", &book_id) != 1) {
                clear_input_buffer();
                printf("\nInvalid book id\n");
                continue;
            }
            clear_input_buffer();

            if (remove_slot_booking(slot_root,
                                    temp_student->id,
                                    book_id)) {
                save_slot_bookings(*slot_root);
                printf("\nSlot booking canceled successfully\n");
            }
            else {
                printf("\nNo slot booking found for that book\n");
            }
        }
        else if (user_choice == 11) {
            printf("\nLogged out successfully\n");
            break;
        }
        else {
            printf("\nInvalid choice\n");
        }
    }
}

int main(void) {
    int main_choice;
    struct treenode *book_root = NULL;
    struct student *user_root = NULL;
    struct node *issue_root = NULL;
    struct queue *queue_front = NULL;
    struct queue *queue_rear = NULL;
    struct admin *admin_root = NULL;
    struct request *request_root = NULL;
    struct slot_booking *slot_root = NULL;

    srand(time(NULL));

    book_root = load_books();
    user_root = load_users();
    admin_root = load_admin();
    issue_root = load_issued_books();
    queue_front = load_queue(&queue_rear);
    request_root = load_issue_requests();
    slot_root = load_slot_bookings();

    while (1) {
        printf("\n===== LIBRARY RESERVATION SYSTEM =====\n");
        printf("1. Admin\n");
        printf("2. User\n");
        printf("3. Exit\n");
        printf("Enter choice: ");

        if (scanf("%d", &main_choice) != 1) {
            clear_input_buffer();
            printf("\nInvalid input\n");
            continue;
        }
        clear_input_buffer();

        if (main_choice == 1) {
            while (1) {
                int entry_choice = 0;

                printf("\n--- ADMIN ---\n");
                printf("1. Register\n");
                printf("2. Login\n");
                printf("3. Back\n");
                printf("Enter choice: ");

                if (scanf("%d", &entry_choice) != 1) {
                    clear_input_buffer();
                    printf("\nInvalid input\n");
                    continue;
                }
                clear_input_buffer();

                if (entry_choice == 1) {
                    char name[50], email[50], password[50], lib[50];
                    int otp, input;
                    struct admin *a;

                    printf("Name: ");
                    fgets(name, sizeof(name), stdin);
                    name[strcspn(name, "\n")] = '\0';

                    printf("Library Name: ");
                    fgets(lib, sizeof(lib), stdin);
                    lib[strcspn(lib, "\n")] = '\0';

                    printf("Email: ");
                    fgets(email, sizeof(email), stdin);
                    email[strcspn(email, "\n")] = '\0';

                    if (search_admin_by_email(admin_root, email)) {
                        printf("\nAdmin already exists\n");
                        continue;
                    }

                    printf("Password: ");
                    fgets(password, sizeof(password), stdin);
                    password[strcspn(password, "\n")] = '\0';

                    a = create_admin(name, email, password, lib);
                    if (!a) {
                        printf("\nRegistration failed\n");
                        continue;
                    }

                    otp = rand() % 900000 + 100000;
                    sent_otp_email(email, otp);

                    printf("Enter OTP: ");
                    if (scanf("%d", &input) != 1) {
                        clear_input_buffer();
                        free(a);
                        printf("\nInvalid OTP input\n");
                        continue;
                    }
                    clear_input_buffer();

                    if (!verify(otp, input)) {
                        printf("\nInvalid OTP\n");
                        free(a);
                        continue;
                    }

                    admin_root = insert_admin(admin_root, a);
                    save_admin(admin_root);
                    printf("\nRegistration successful\n");
                }
                else if (entry_choice == 2) {
                    char email[50], password[50];
                    struct admin *temp_admin;

                    printf("Email: ");
                    fgets(email, sizeof(email), stdin);
                    email[strcspn(email, "\n")] = '\0';

                    printf("Password: ");
                    fgets(password, sizeof(password), stdin);
                    password[strcspn(password, "\n")] = '\0';

                    if (!authenticate_admin(admin_root, email, password)) {
                        printf("\nLogin failed\n");
                        continue;
                    }

                    temp_admin = search_admin_by_email(admin_root, email);
                    printf("\nLogin successful\n");
                    handle_admin_session(temp_admin, &book_root,
                                         &issue_root, &request_root,
                                         slot_root);
                }
                else if (entry_choice == 3) {
                    break;
                }
                else {
                    printf("\nInvalid input\n");
                }
            }
        }
        else if (main_choice == 2) {
            while (1) {
                int entry_choice;

                printf("\n--- USER ---\n");
                printf("1. Register\n");
                printf("2. Login\n");
                printf("3. Back\n");
                printf("Enter choice: ");

                if (scanf("%d", &entry_choice) != 1) {
                    clear_input_buffer();
                    printf("\nInvalid input\n");
                    continue;
                }
                clear_input_buffer();

                if (entry_choice == 1) {
                    char name[25], email[50], password[25];
                    int otp, input;
                    struct student *u;

                    printf("Name: ");
                    fgets(name, sizeof(name), stdin);
                    name[strcspn(name, "\n")] = '\0';

                    printf("Email: ");
                    fgets(email, sizeof(email), stdin);
                    email[strcspn(email, "\n")] = '\0';

                    if (search_user_by_email(user_root, email)) {
                        printf("\nUser already exists\n");
                        continue;
                    }

                    printf("Password: ");
                    fgets(password, sizeof(password), stdin);
                    password[strcspn(password, "\n")] = '\0';

                    u = create_user(name, email, password);
                    if (!u) {
                        printf("\nRegistration failed\n");
                        continue;
                    }

                    otp = rand() % 900000 + 100000;
                    sent_otp_email(email, otp);

                    printf("Enter OTP: ");
                    if (scanf("%d", &input) != 1) {
                        clear_input_buffer();
                        free(u);
                        printf("\nInvalid OTP input\n");
                        continue;
                    }
                    clear_input_buffer();

                    if (!verify(otp, input)) {
                        printf("\nInvalid OTP\n");
                        free(u);
                        continue;
                    }

                    user_root = insert_user(user_root, u);
                    save_users(user_root);
                    printf("\nRegistration successful\n");
                }
                else if (entry_choice == 2) {
                    char email[50], password[25];
                    struct student *temp_student;

                    printf("Email: ");
                    fgets(email, sizeof(email), stdin);
                    email[strcspn(email, "\n")] = '\0';

                    printf("Password: ");
                    fgets(password, sizeof(password), stdin);
                    password[strcspn(password, "\n")] = '\0';

                    if (!authenticate_user(user_root, email, password)) {
                        printf("\nLogin failed\n");
                        continue;
                    }

                    temp_student = search_user_by_email(user_root, email);
                    printf("\nLogin successful\n");
                    handle_user_session(temp_student, book_root,
                                        &issue_root, &request_root,
                                        &slot_root);
                }
                else if (entry_choice == 3) {
                    break;
                }
                else {
                    printf("\nInvalid input\n");
                }
            }
        }
        else if (main_choice == 3) {
            printf("\nSaving data...\n");
            save_all(book_root, user_root, issue_root,
                     queue_front, admin_root, request_root, slot_root);
            printf("Exit successful\n");
            return 0;
        }
        else {
            printf("\nInvalid input\n");
        }
    }
}
