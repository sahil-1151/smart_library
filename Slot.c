#include <stdio.h>
#include <stdlib.h>

#include "Slot.h"

static int same_date(struct date first, struct date second)
{
    return first.day == second.day &&
           first.month == second.month &&
           first.year == second.year;
}

static int booking_is_active(const struct slot_booking *booking)
{
    return booking && compare_date(booking->slot_date, current_date()) >= 0;
}

static void print_slot_booking(const struct slot_booking *booking,
                               struct treenode *book_root)
{
    struct treenode *book = search_id(book_root, booking->book_id);

    printf("\nStudent Id : %d\n", booking->student_id);
    printf("Book Id    : %d\n", booking->book_id);

    if (book) {
        printf("Library    : %s\n", book->lib);
        printf("Title      : %s\n", book->title);
        printf("Author     : %s\n", book->author);
    }

    printf("Slot Date  : %02d|%02d|%04d\n",
           booking->slot_date.day,
           booking->slot_date.month,
           booking->slot_date.year);
    printf("Time Slot  : %s\n", slot_label(booking->slot_id));
}

const char *slot_label(int slot_id)
{
    switch (slot_id) {
        case 1: return "09:00 - 11:00";
        case 2: return "11:00 - 13:00";
        case 3: return "14:00 - 16:00";
        case 4: return "16:00 - 18:00";
        default: return "Unknown Slot";
    }
}

int is_valid_slot_id(int slot_id)
{
    return slot_id >= 1 && slot_id <= 4;
}

int has_slot_booking_for_book(struct slot_booking *root,
                              int student_id,
                              int book_id)
{
    while (root) {
        if (root->student_id == student_id &&
            root->book_id == book_id &&
            booking_is_active(root)) {
            return 1;
        }

        root = root->next;
    }

    return 0;
}

int add_slot_booking(struct slot_booking **root,
                     int student_id,
                     int book_id,
                     struct date slot_date,
                     int slot_id)
{
    struct slot_booking *node;

    if (!root || !is_valid_slot_id(slot_id))
        return 0;

    node = malloc(sizeof *node);
    if (!node)
        return 0;

    node->student_id = student_id;
    node->book_id = book_id;
    node->slot_date = slot_date;
    node->slot_id = slot_id;
    node->next = *root;
    *root = node;
    return 1;
}

int count_slot_bookings_for_date(struct slot_booking *root,
                                 int book_id,
                                 struct date slot_date)
{
    int count = 0;

    while (root) {
        if (root->book_id == book_id &&
            same_date(root->slot_date, slot_date) &&
            booking_is_active(root)) {
            count += 1;
        }

        root = root->next;
    }

    return count;
}

int count_active_slot_bookings_for_book(struct slot_booking *root,
                                        int book_id)
{
    int count = 0;

    while (root) {
        if (root->book_id == book_id &&
            booking_is_active(root)) {
            count += 1;
        }

        root = root->next;
    }

    return count;
}

int remove_slot_booking(struct slot_booking **root,
                        int student_id,
                        int book_id)
{
    struct slot_booking *current;
    struct slot_booking *previous = NULL;

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

int view_student_slot_bookings(struct slot_booking *root,
                               int student_id,
                               struct treenode *book_root)
{
    int found = 0;

    while (root) {
        if (root->student_id == student_id) {
            print_slot_booking(root, book_root);
            found = 1;
        }

        root = root->next;
    }

    return found;
}

int view_admin_slot_bookings(struct slot_booking *root,
                             struct treenode *book_root,
                             const char *admin_lib)
{
    int found = 0;

    while (root) {
        struct treenode *book = search_id(book_root, root->book_id);

        if (book && case_insensitive_cmp(book->lib, admin_lib)) {
            print_slot_booking(root, book_root);
            found = 1;
        }

        root = root->next;
    }

    return found;
}

void free_slot_bookings(struct slot_booking *root)
{
    while (root) {
        struct slot_booking *next = root->next;
        free(root);
        root = next;
    }
}
