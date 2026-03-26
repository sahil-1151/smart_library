#include <stdio.h>
#include <stdlib.h>

#include "Request.h"

static void print_request(const struct request *request,
                          struct treenode *book_root)
{
    struct treenode *book = search_id(book_root, request->book_id);

    printf("\nStudent Id   : %d\n", request->student_id);
    printf("Book Id      : %d\n", request->book_id);

    if (book) {
        printf("Library      : %s\n", book->lib);
        printf("Title        : %s\n", book->title);
        printf("Author       : %s\n", book->author);
    }

    printf("Request Date : %02d|%02d|%04d\n",
           request->request_date.day,
           request->request_date.month,
           request->request_date.year);
}

struct request *create_request_node(int student_id,
                                    int book_id,
                                    struct date request_date)
{
    struct request *node = malloc(sizeof *node);

    if (!node)
        return NULL;

    node->student_id = student_id;
    node->book_id = book_id;
    node->request_date = request_date;
    node->next = NULL;

    return node;
}

int request_exists(struct request *root,
                   int student_id,
                   int book_id)
{
    while (root) {
        if (root->student_id == student_id &&
            root->book_id == book_id) {
            return 1;
        }

        root = root->next;
    }

    return 0;
}

int add_issue_request(struct request **root,
                      int student_id,
                      int book_id,
                      struct date request_date)
{
    struct request *node;

    if (!root || request_exists(*root, student_id, book_id))
        return 0;

    node = create_request_node(student_id, book_id, request_date);
    if (!node)
        return 0;

    node->next = *root;
    *root = node;
    return 1;
}

int remove_issue_request(struct request **root,
                         int student_id,
                         int book_id)
{
    struct request *current;
    struct request *previous = NULL;

    if (!root)
        return 0;

    current = *root;

    while (current) {
        if (current->student_id == student_id &&
            current->book_id == book_id) {
            if (!previous)
                *root = current->next;
            else
                previous->next = current->next;

            free(current);
            return 1;
        }

        previous = current;
        current = current->next;
    }

    return 0;
}

int view_student_requests(struct request *root,
                          int student_id,
                          struct treenode *book_root)
{
    int found = 0;

    while (root) {
        if (root->student_id == student_id) {
            print_request(root, book_root);
            found = 1;
        }

        root = root->next;
    }

    return found;
}

int view_admin_requests(struct request *root,
                        struct treenode *book_root,
                        const char *admin_lib)
{
    int found = 0;

    while (root) {
        struct treenode *book = search_id(book_root, root->book_id);

        if (book && case_insensitive_cmp(book->lib, admin_lib)) {
            print_request(root, book_root);
            found = 1;
        }

        root = root->next;
    }

    return found;
}

void free_request_list(struct request *root)
{
    while (root) {
        struct request *next = root->next;
        free(root);
        root = next;
    }
}
