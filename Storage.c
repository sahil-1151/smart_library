#include "Storage.h"


static void save_books_rec(struct treenode *root, FILE *fp) {
    if (!root) return;

    fprintf(fp, "%d|%s|%s|%s|%d|%d\n",
            root->book_id,
            root->lib,
            root->title,
            root->author,
            root->total_copies,
            root->available_copies);

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
    int id, total, available;
    char title[50], author[50],lib[50]={0};

    while (fscanf(fp,"%d|%49[^|]|%49[^|]|%49[^|]|%d|%d\n",
                  &id, lib, title, author,
                  &total, &available) == 6) {

        struct treenode *n = createnode(id, lib, title, author, total);
        if (!n) continue;

        n->available_copies = available;
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
