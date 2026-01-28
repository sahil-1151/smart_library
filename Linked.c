#include <stdio.h>
#include <stdlib.h>
#include "Linked.h"

static int is_leap_year(int year) {
    return (year % 400 == 0) ||
           (year % 4 == 0 && year % 100 != 0);
}

static int days_in_month(int month, int year) {
    static const int days[] =
        {31,28,31,30,31,30,31,31,30,31,30,31};

    if (month == 2 && is_leap_year(year))
        return 29;

    return days[month - 1];
}

int compare_date(struct date d1, struct date d2) {
    if (d1.year != d2.year)
        return d1.year - d2.year;
    if (d1.month != d2.month)
        return d1.month - d2.month;
    return d1.day - d2.day;
}

struct date add_days(struct date d, int days) {
    while (days-- > 0) {
        d.day++;
        if (d.day > days_in_month(d.month, d.year)) {
            d.day = 1;
            d.month++;
            if (d.month > 12) {
                d.month = 1;
                d.year++;
            }
        }
    }
    return d;
}

struct node *create_issue_node(int student_id,
                               int book_id,
                               struct date issue,
                               struct date due)
{
    struct node *n = malloc(sizeof *n);
    if (!n) return NULL;

    n->student_id = student_id;
    n->book_id = book_id;
    n->issue_date = issue;
    n->due_date = due;
    n->fine = 0;
    n->next = NULL;

    return n;
}

void issue_book(struct node **top,
                int student_id,
                int book_id,
                struct date issue_date)
{
    struct date due_date = add_days(issue_date, 14);

    struct node *n =
        create_issue_node(student_id, book_id,
                          issue_date, due_date);

    if (!n) {
        printf("Issue failed: memory error\n");
        return;
    }

    n->next = *top;
    *top = n;
}

int return_book(struct node **top,
                int student_id,
                int book_id,
                struct date return_date,
                int *fine_out)
{
    struct node *curr = *top;
    struct node *prev = NULL;

    while (curr) {
        if (curr->student_id == student_id &&
            curr->book_id == book_id) {

            int late_days = compare_date(return_date,
                                         curr->due_date);

            if (late_days > 0)
                curr->fine = late_days * 10;
            else
                curr->fine = 0;

            if (fine_out)
                *fine_out = curr->fine;

            if (!prev)
                *top = curr->next;
            else
                prev->next = curr->next;

            free(curr);
            return 1;
        }
        prev = curr;
        curr = curr->next;
    }
    return 0;
}

void free_issue_list(struct node *top) {
    while (top) {
        struct node *tmp = top;
        top = top->next;
        free(tmp);
    }
}
