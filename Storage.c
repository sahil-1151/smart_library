#include "Storage.h"


static void save_books_rec(struct treenode *root, FILE *fp) {
    if (!root) return;

    fprintf(fp, "%d|%s|%s|%s|%d|%d|%d|%d\n",
            root->book_id,
            root->lib,
            root->title,
            root->author,
            root->total_copies,
            root->issue_total_copies,
            root->available_copies,
            root->slot_booking_copies);

    save_books_rec(root->left, fp);
    save_books_rec(root->right, fp);
}

void save_books(struct treenode *root) {
    FILE *fp = fopen("data_book.txt", "w");
    if (!fp) return;

    save_books_rec(root, fp);
    fclose(fp);
}

struct treenode *load_books(void) {
    FILE *fp = fopen("data_book.txt", "r");
    if (!fp) return NULL;

    struct treenode *root = NULL;
    char line[256];
    char title[50], author[50],lib[50]={0};

    while (fgets(line, sizeof(line), fp)) {
        int id;
        int total;
        int issue_total;
        int available;
        int slot_booking;
        int parsed;

        parsed = sscanf(line,
                        "%d|%49[^|]|%49[^|]|%49[^|]|%d|%d|%d|%d",
                        &id, lib, title, author,
                        &total, &issue_total, &available, &slot_booking);

        if (parsed != 8) {
            parsed = sscanf(line,
                            "%d|%49[^|]|%49[^|]|%49[^|]|%d|%d",
                            &id, lib, title, author,
                            &total, &available);
            if (parsed != 6)
                continue;

            issue_total = total;
            slot_booking = total;
        }

        struct treenode *n = createnode(id, lib, title, author, total);
        if (!n) continue;

        n->issue_total_copies = issue_total;
        n->available_copies = available;
        n->slot_booking_copies = slot_booking;
        root = insert(root, n);
    }

    fclose(fp);
    return root;
}

static void save_admin_rec(struct admin *root,FILE *fp){
    if(!root) return;
    fprintf(fp,"%d|%s|%s|%s|%s\n",
            root->id,
            root->name,
            root->lib,
            root->email,
            root->password);
    save_admin_rec(root->left,fp);
    save_admin_rec(root->right,fp);
}

void save_admin(struct admin *root){
    FILE *fp = fopen("admin_login.txt","w");
    if(!fp) return;

    save_admin_rec(root,fp);
    fclose(fp);
}

struct admin *load_admin(void){
    FILE *fp=fopen("admin_login.txt","r");
    if(!fp){
        return NULL;
    }
    struct admin *root = NULL;
    int id;
    char name[50], email[50], password[50], lib[50];

    while (fscanf(fp, "%d|%49[^|]|%49[^|]|%49[^|]|%49[^\n]",
                  &id, name, lib, email, password) == 5) {

        struct admin *a = create_admin(name, email, password,lib);
        if (!a) continue;

        a->id = id;
        root = insert_admin(root, a);
    }
    fclose(fp);
    return root;
}

void save_issue_requests(struct request *root) {
    FILE *fp = fopen("issue_request.txt", "w");
    if (!fp) return;

    while (root) {
        fprintf(fp, "%d|%d|%d|%d|%d\n",
                root->student_id,
                root->book_id,
                root->request_date.day,
                root->request_date.month,
                root->request_date.year);
        root = root->next;
    }

    fclose(fp);
}

struct request *load_issue_requests(void) {
    FILE *fp = fopen("issue_request.txt", "r");
    struct request *root = NULL;
    struct date request_date;
    int sid, bid;

    if (!fp)
        return NULL;

    while (fscanf(fp, "%d|%d|%d|%d|%d\n",
                  &sid,
                  &bid,
                  &request_date.day,
                  &request_date.month,
                  &request_date.year) == 5) {
        add_issue_request(&root, sid, bid, request_date);
    }

    fclose(fp);
    return root;
}

void save_slot_bookings(struct slot_booking *root) {
    FILE *fp = fopen("slot_booking.txt", "w");
    if (!fp) return;

    while (root) {
        fprintf(fp, "%d|%d|%d|%d|%d|%d\n",
                root->student_id,
                root->book_id,
                root->slot_date.day,
                root->slot_date.month,
                root->slot_date.year,
                root->slot_id);
        root = root->next;
    }

    fclose(fp);
}

struct slot_booking *load_slot_bookings(void) {
    FILE *fp = fopen("slot_booking.txt", "r");
    struct slot_booking *root = NULL;
    struct date slot_date;
    int sid, bid, slot_id;

    if (!fp)
        return NULL;

    while (fscanf(fp, "%d|%d|%d|%d|%d|%d\n",
                  &sid,
                  &bid,
                  &slot_date.day,
                  &slot_date.month,
                  &slot_date.year,
                  &slot_id) == 6) {
        add_slot_booking(&root, sid, bid, slot_date, slot_id);
    }

    fclose(fp);
    return root;
}

static void save_users_rec(struct student *root, FILE *fp) {
    if (!root) return;

    fprintf(fp, "%d|%s|%s|%s\n",
            root->id,
            root->name,
            root->email,
            root->password);

    save_users_rec(root->left, fp);
    save_users_rec(root->right, fp);
}

void save_users(struct student *root) {
    FILE *fp = fopen("user_login.txt", "w");
    if (!fp) return;

    save_users_rec(root, fp);
    fclose(fp);
}

struct student *load_users(void) {
    FILE *fp = fopen("user_login.txt", "r");
    if (!fp) return NULL;

    struct student *root = NULL;
    int id;
    char name[25], email[50], password[25];

    while (fscanf(fp, "%d|%24[^|]|%49[^|]|%24[^\n]\n",
                  &id, name, email, password) == 4) {

        struct student *u = create_user(name, email, password);
        if (!u) continue;

        u->id = id;
        root = insert_user(root, u);
    }

    fclose(fp);
    return root;
}

void save_issued_books(struct node *root) {
    FILE *fp = fopen("issue_book.txt", "w");
    if (!fp) return;

    while (root) {
        fprintf(fp, "%d|%d|%d|%d|%d|%d|%d|%d\n",
                root->student_id,
                root->book_id,
                root->issue_date.day,
                root->issue_date.month,
                root->issue_date.year,
                root->due_date.day,
                root->due_date.month,
                root->due_date.year);
        root = root->next;
    }

    fclose(fp);
}

struct node *load_issued_books(void) {
    FILE *fp = fopen("issue_book.txt", "r");
    if (!fp) return NULL;

    struct node *top = NULL;
    struct date issue, due;
    int sid, bid;

    while (fscanf(fp, "%d|%d|%d|%d|%d|%d|%d|%d\n",
                  &sid, &bid,
                  &issue.day, &issue.month, &issue.year,
                  &due.day, &due.month, &due.year) == 8) {

        struct node *n =
            create_issue_node(sid, bid, issue, due);

        if (!n) continue;

        n->next = top;
        top = n;
    }

    fclose(fp);
    return top;
}

void save_queue(struct queue *front) {
    FILE *fp = fopen("queue_book.txt", "w");
    if (!fp) return;

    while (front) {
        fprintf(fp, "%d|%d\n",
                front->student_id,
                front->book_id);
        front = front->next;
    }

    fclose(fp);
}

struct queue *load_queue(struct queue **rear) {
    FILE *fp = fopen("queue_book.txt", "r");
    if (!fp) {
        *rear = NULL;
        return NULL;
    }

    struct queue *front = NULL;
    *rear = NULL;

    int sid, bid;
    while (fscanf(fp, "%d|%d\n", &sid, &bid) == 2) {
        enqueue(&front, rear, sid, bid);
    }

    fclose(fp);
    return front;
}
