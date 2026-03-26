#ifndef REQUEST_H
#define REQUEST_H

#include "Bst.h"
#include "Linked.h"

struct request {
    int student_id;
    int book_id;
    struct date request_date;
    struct request *next;
};

struct request *create_request_node(int student_id,
                                    int book_id,
                                    struct date request_date);

int add_issue_request(struct request **root,
                      int student_id,
                      int book_id,
                      struct date request_date);

int request_exists(struct request *root,
                   int student_id,
                   int book_id);

int remove_issue_request(struct request **root,
                         int student_id,
                         int book_id);

int view_student_requests(struct request *root,
                          int student_id,
                          struct treenode *book_root);

int view_admin_requests(struct request *root,
                        struct treenode *book_root,
                        const char *admin_lib);

void free_request_list(struct request *root);

#endif
