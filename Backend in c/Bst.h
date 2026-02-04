#ifndef BST_H
#define BST_H
#include<stdio.h>
#include<stdlib.h>
#include<string.h>
#include<ctype.h>


struct treenode {
int book_id;
    char title[50];
    char author[50];
    char lib[50];
    int total_copies;
    int available_copies;
    struct treenode *left;
    struct treenode *right;
};

void view(struct treenode *root);

int case_insensitive_cmp(const char *a, const char *b);

struct treenode *createnode(int book_id,const char *lib,const char *title,const char *author, int total_copies);

struct treenode *insert(struct treenode *root,struct treenode *newnode);

int search_string(struct treenode *root,const char *string);

struct treenode *search_id(struct treenode *root,int book_id);

struct treenode *deletenode(struct treenode *root,int book_id);

struct treenode *findmin(struct treenode *root);

void inorder(struct treenode *root);

void visit(struct treenode *node);

void visit_lib(struct treenode *node,const char *lib);

void free_bst(struct treenode *root);


#endif