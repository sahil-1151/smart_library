#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "User.h"
#include "Bst.h"
#include "Queue.h"
#include "Linked.h"
#include "Storage.h"

static void clear_input_buffer(void) {
    int c;
    while ((c = getchar()) != '\n' && c != EOF);
}

int main(void) {
    srand(time(NULL));

    struct treenode *book_root = NULL;
    struct student  *user_root = NULL;
    struct node     *issue_root = NULL;
    struct queue    *queue_front = NULL;
    struct queue    *queue_rear  = NULL;

    book_root   = load_books();
    user_root   = load_users();
    issue_root  = load_issued_books();
    queue_front = load_queue(&queue_rear);

    int main_choice;

    while (1) {
        printf("\n===== LIBRARY SYSTEM =====\n");
        printf("1. Admin\n");
        printf("2. User\n");
        printf("3. Exit\n");
        printf("Enter choice: ");

        if (scanf("%d", &main_choice) != 1) {
            clear_input_buffer();
            printf("Invalid input\n");
            continue;
        }
        clear_input_buffer();

        if (main_choice == 1) {
            int admin_choice;

            while (1) {
                printf("\n--- ADMIN MENU ---\n");
                printf("1. View all books\n");
                printf("2. Add book\n");
                printf("3. Delete book\n");
                printf("4. Back\n");
                printf("Enter choice: ");

                if (scanf("%d", &admin_choice) != 1) {
                    clear_input_buffer();
                    continue;
                }
                clear_input_buffer();

                if (admin_choice == 1) {
                    inorder(book_root);
                }
                else if (admin_choice == 2) {
                    int id, total;
                    char title[25], author[20];

                    printf("Book ID: ");
                    scanf("%d", &id);
                    clear_input_buffer();

                    printf("Title: ");
                    fgets(title, sizeof(title), stdin);
                    title[strcspn(title, "\n")] = '\0';

                    printf("Author: ");
                    fgets(author, sizeof(author), stdin);
                    author[strcspn(author, "\n")] = '\0';

                    printf("Total copies: ");
                    scanf("%d", &total);
                    clear_input_buffer();

                    struct treenode *node =
                        createnode(id, title, author, total);

                    if (node)
                        book_root = insert(book_root, node);

                    printf("Book added successfully\n");
                }
                else if (admin_choice == 3) {
                    int id;
                    printf("Enter book ID to delete: ");
                    scanf("%d", &id);
                    clear_input_buffer();

                    book_root = deletenode(book_root, id);
                    printf("Delete operation completed\n");
                }
                else if (admin_choice == 4) {
                    break;
                }
            }
        }

        else if (main_choice == 2) {
    int entry_choice;

    while (1) {
        printf("\n--- USER ---\n");
        printf("1. Register\n");//done
        printf("2. Login\n");//done
        printf("3. Back\n");//done
        printf("Enter choice: ");

        if (scanf("%d", &entry_choice) != 1) {
            clear_input_buffer();
            continue;
        }
        clear_input_buffer();
        if (entry_choice == 1) {
            char name[25], email[50], password[25];

            printf("Name: ");
            fgets(name, sizeof(name), stdin);
            name[strcspn(name, "\n")] = '\0';

            printf("Email: ");
            fgets(email, sizeof(email), stdin);
            email[strcspn(email, "\n")] = '\0';

            if (search_user_by_email(user_root, email)) {
                printf("User already exists\n");
                continue;
            }

            printf("Password: ");
            fgets(password, sizeof(password), stdin);
            password[strcspn(password, "\n")] = '\0';

            struct student *u = create_user(name, email, password);
            if (!u) {
                printf("Registration failed\n");
                continue;
            }

            int otp = rand() % 900000 + 100000;
            int input;
            sent_otp_email(email, otp);

            printf("Enter OTP: ");
            scanf("%d", &input);
            clear_input_buffer();

            if (!verify(otp, input)) {
                printf("Invalid OTP\n");
                free(u);
                continue;
            }

            user_root = insert_user(user_root, u);
            printf("Registration successful\n");
        }

        else if (entry_choice == 2) {
                        char email[50], password[25];

                        printf("Email: ");
                        fgets(email, sizeof(email), stdin);
                        email[strcspn(email, "\n")] = '\0';

                        printf("Password: ");
                        fgets(password, sizeof(password), stdin);
                        password[strcspn(password, "\n")] = '\0';

                        if (!authenticate_user(user_root, email, password)) {
                            printf("Login failed\n");
                            continue;
                        }
                        struct student *temp_student=search_user_by_email(user_root,email);
                        printf("Login successful\n");

                        while (1) {
                            int user_choice;
                            printf("\n--- USER MENU ---\n");
                            printf("1. User Information\n");
                            printf("2. View books\n");//done
                            printf("3. Search books\n");//done
                            printf("4. Issue book\n");//done
                            printf("5. Return book\n");
                            printf("6. View Issue Book\n");//done
                            printf("7. Logout\n");
                            printf("Enter Choice: ");
                            scanf("%d",&user_choice);
                            if (user_choice == 1){
                                printf("\n   Name    : %s",temp_student->name);
                                printf("\n   Email   : %s",temp_student->email);
                                printf("\nStudent id : %d\n",temp_student->id);
                            }
                            else if (user_choice == 2){
                                view(book_root);
                            }

                            else if(user_choice == 3){
                                        while(1){
                                        printf("\n--- Searching Choice ---\n");
                                        printf("1. Search Id \n");//done
                                        printf("2. Search Title \n");//done
                                        printf("3. Search Author \n");//done
                                        printf("4. Back \n");//done
                                        printf("Enter Choice :");
                                        scanf("%d",&user_choice);
                                        clear_input_buffer();
                                        if(user_choice == 1){
                                            int id;
                                            printf("\nEnter Book Id :");
                                            scanf("%d",&id);
                                            struct treenode *temp=search_id(book_root,id);
                                            if(temp == NULL){
                                                printf("\nBook Not Found ...\n");
                                            }
                                            else{
                                                printf("\n      Book Id     : %d\n",temp->book_id);
                                                printf("      Title       : %s\n",temp->title);
                                                printf("      Author      : %s\n",temp->author);
                                                printf(" Available Copies : %d\n",temp->available_copies);
                                            }
                                        }
                                        else if(user_choice == 2){
                                            char search_titl[25];
                                            printf("Enter Title :");
                                            fgets(search_titl, sizeof(search_titl), stdin);
                                            search_titl[strcspn(search_titl, "\n")] = '\0';
                                            if(!search_string(book_root,search_titl)){
                                                printf("\nBook Not Found ...\n");
                                            }

                                        }
                                        else if(user_choice == 3){
                                            char search_auth[25];
                                            printf("Enter Author Name :");
                                            fgets(search_auth, sizeof(search_auth), stdin);
                                            search_auth[strcspn(search_auth, "\n")] = '\0';
                                            if(!search_string(book_root,search_auth)){
                                                printf("\nBook Not Found ...\n");
                                            }

                                        }
                                        else if(user_choice == 4){
                                            break;
                                        }
                                        else {
                                            printf("Invalid Choice ...");
                                        }
                                    }
                            }
                            else if(user_choice == 4){
                                int book_id;
                                struct date d1;
                                printf("\nEnter Book Id :");
                                scanf("%d",&book_id);
                                d1=current_date();
                                if(issue_book(&issue_root,book_root,temp_student->id,book_id,d1)){
                                printf("\nBook Issued ...\n"); 
                                }
                                else{
                                    printf("\nBook Not Issued ...\n");
                                }
                            }
                            else if(user_choice == 5){
                                int book_id;
                                printf("\nEnter Book Id :");
                                scanf("%d",&book_id);
                                if(return_book(&issue_root,temp_student->id,book_id,current_date(),NULL)){
                                    printf("\nBook Retured Successfully ...\n");
                                }
                                else{
                                    printf("\nReturn Failed ...\n");
                                }
                            }
                            else if (user_choice == 6){
                                if(!view_issue_book(issue_root,temp_student->id)){
                                    printf("\nNo Book Issued ...\n");
                                }
                            }
                            else if(user_choice == 7){
                                printf("\nLogged Out Successfully ...\n");
                                break;
                            }
                            else{
                                printf("\nInvalid Choice ...\n");
                            }
                        }
                    }

        else if (entry_choice == 3) {
            break;
        }
    }
}


        else if (main_choice == 3) {
            printf("Saving data...\n");

            save_books(book_root);
            save_users(user_root);
            save_issued_books(issue_root);
            save_queue(queue_front);

            printf("Exit successful\n");
            exit(0);
        }
    }

    return 0;
}
