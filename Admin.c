#include<stdio.h>
#include<stdlib.h>
#include "Admin.h"


struct admin *create_admin(const char *name,const char *email,const char *password,const char *lib){
    static int admin_id=1;

    struct admin *newnode=(struct admin *)malloc(sizeof(struct admin));
    
    if (!newnode){
        return NULL;
        }

    newnode->id = admin_id++;

    strncpy(newnode->name, name,
            sizeof(newnode->name) - 1);
    strncpy(newnode->email, email,
            sizeof(newnode->email) - 1);
    strncpy(newnode->password, password,
            sizeof(newnode->password) - 1);
    strncpy(newnode->lib, lib,
            sizeof(newnode->lib) - 1);

    newnode->name[sizeof(newnode->name) - 1] = '\0';
    newnode->email[sizeof(newnode->email) - 1] = '\0';
    newnode->password[sizeof(newnode->password) - 1] = '\0';
    newnode->lib[sizeof(newnode->lib) - 1] = '\0';

    newnode->left = NULL;
    newnode->right = NULL;
    return newnode;
}

struct admin *insert_admin(struct admin *root,struct admin *newnode){
    if(root == NULL){
        return newnode;
    }
    int cmp = strcmp(newnode->email, root->email);
    if(cmp < 0){
        root->left=insert_admin(root->left,newnode);
        }
    else if(cmp > 0){
        root->right=insert_admin(root->right,newnode);
        }
    else{
        free(newnode);
    }
    return root;
}

struct admin *search_admin_by_email(struct admin *root,const char *email){
    if(root==NULL){
        return root;
    }
    int cmp=strcmp(email,root->email);
    if(cmp == 0){
        return root;
    }
    else if(cmp < 0){
        return search_admin_by_email(root->left, email);
    }
    else
        return search_admin_by_email(root->right, email);

}

int authenticate_admin(struct admin *root,const char *email,const char *password){

    struct admin *temp=search_admin_by_email(root,email);
    if(temp == NULL){
        return 0;
    }
    return strcmp(root->password,password) == 0;
}

void free_admin(struct admin *root){
    if(root == NULL){
        return;
    }
    free_admin(root->left);
    free_admin(root->right);
    free(root);
}
