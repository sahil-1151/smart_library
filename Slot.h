#ifndef SLOT_H
#define SLOT_H

#include "Bst.h"
#include "Linked.h"

struct slot_booking {
    int student_id;
    int book_id;
    struct date slot_date;
    int slot_id;
    struct slot_booking *next;
};

const char *slot_label(int slot_id);

int is_valid_slot_id(int slot_id);

int add_slot_booking(struct slot_booking **root,
                     int student_id,
                     int book_id,
                     struct date slot_date,
                     int slot_id);

int has_slot_booking_for_book(struct slot_booking *root,
                              int student_id,
                              int book_id);

int count_slot_bookings_for_date(struct slot_booking *root,
                                 int book_id,
                                 struct date slot_date);

int count_active_slot_bookings_for_book(struct slot_booking *root,
                                        int book_id);

int remove_slot_booking(struct slot_booking **root,
                        int student_id,
                        int book_id);

int view_student_slot_bookings(struct slot_booking *root,
                               int student_id,
                               struct treenode *book_root);

int view_admin_slot_bookings(struct slot_booking *root,
                             struct treenode *book_root,
                             const char *admin_lib);

void free_slot_bookings(struct slot_booking *root);

#endif
