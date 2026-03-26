#ifndef STORAGE_H
#define STORAGE_H
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "Bst.h"
#include "User.h"
#include "Linked.h"
#include "Queue.h"
#include "Admin.h"
#include "Request.h"
#include "Slot.h"

struct treenode;
struct student;
struct node;
struct queue;      

void save_books(struct treenode *root);
struct treenode *load_books(void);

void save_users(struct student *root);
struct student *load_users(void);

void save_issued_books(struct node *root);
struct node *load_issued_books(void);

void save_queue(struct queue *front);
struct queue *load_queue(struct queue **rear);

void save_admin(struct admin *root);
struct admin *load_admin(void);

void save_issue_requests(struct request *root);
struct request *load_issue_requests(void);

void save_slot_bookings(struct slot_booking *root);
struct slot_booking *load_slot_bookings(void);

#endif
