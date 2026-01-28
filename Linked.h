#ifndef LINKED_H
#define LINKED_H

struct queue;

struct date {
    int day;
    int month;
    int year;
};

struct node {
    int student_id;
    int book_id;
    struct date issue_date;
    struct date due_date;
    int fine;
    struct node *next;
};

struct node *create_issue_node(int student_id,
                               int book_id,
                               struct date issue,
                               struct date due);

void issue_book(struct node **top,
                int student_id,
                int book_id,
                struct date issue_date);

int return_book(struct node **top,
                int student_id,
                int book_id,
                struct date return_date,
                int *fine_out);


int compare_date(struct date d1, struct date d2);

struct date add_days(struct date d, int days);

void free_issue_list(struct node *top);

#endif
