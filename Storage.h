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
#include "Admin.h"

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

#endif
