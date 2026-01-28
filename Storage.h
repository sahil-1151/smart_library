#ifndef STORAGE_H
#define STORAGE_H

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

#endif
