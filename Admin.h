#ifndef ADMIN_H
#define ADMIN_H
#include<string.h>

struct admin{
    int id;
    char lib[50];
    char name[50];
    char email[50];
    char password[50];
    struct admin *left;
    struct admin *right;
};

struct admin *create_admin(const char *name,const char *email,const char *password,const char *lib);

struct admin *insert_admin(struct admin *root,struct admin *newnode);

struct admin *search_admin_by_email(struct admin *root,const char *email);

int authenticate_admin(struct admin *root,const char *email,const char *password);

void free_admin(struct admin *root);
#endif