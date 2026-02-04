#ifndef STUDENT_H
#define STUDENT_H
#include<stdio.h>
#include<stdlib.h>
#include<string.h>
#include<time.h>
#include<curl/curl.h>


struct student{
    int id;
    char name[25];
    char email[50];
    char password[25];
    struct student *left;
    struct student *right;
};

int verify(int opt,int input);

void sent_otp_email(const char *email,int otp);

struct student * create_user(const char *name,const char *email,const char *password);

struct student *insert_user(struct student *root,struct student *newnode);

struct student *search_user_by_email(struct student *root,const char *email);

int authenticate_user(struct student *root,const char *email,const char *password);

#endif