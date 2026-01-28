#include<stdio.h>
#include<stdlib.h>
#include<string.h>
#include<ctype.h>
#include "Bst.h"

struct treenode * createnode(int book_id,const char *title,const char *author,int total_copies){
    struct treenode* newnode=(struct treenode *)malloc(sizeof(struct treenode));
    if (!newnode) {
        printf("Memory allocation failed\n");
        return NULL;
    }
    newnode->book_id=book_id;
    strncpy(newnode->title, title, sizeof(newnode->title) - 1);
    newnode->title[sizeof(newnode->title) - 1] = '\0';
    strncpy(newnode->author, author, sizeof(newnode->author) - 1);
    newnode->author[sizeof(newnode->author) - 1] = '\0';
    newnode->total_copies=total_copies;
    newnode->available_copies=total_copies;
    newnode->left=NULL;
    newnode->right=NULL;

    return newnode;
}

void view(struct treenode *root){
    if(root==NULL)return;
    printf("\nTitle : %s\nAuthor : %s\nAvailable copies : %d \n",root->title,root->author,root->available_copies);
    view(root->left);
    view(root->right);
}

struct treenode *insert(struct treenode *root,struct treenode *newnode){
    if(root==NULL){
        return newnode;
    }
     if(root->book_id == newnode->book_id){
        free(newnode);
        return root;
    }
    if(root->book_id>newnode->book_id){
        root->left=insert(root->left,newnode);
    }
    else{
        root->right=insert(root->right,newnode);
    }
    return root;
}

struct treenode *search_id(struct treenode *root,int book_id){
    if(root == NULL || root->book_id == book_id){
        return root;
    }
    if(root->book_id>book_id){
        return search_id(root->left,book_id);
    }
    else{
        return search_id(root->right,book_id);
    }
}


int case_insensitive_cmp(const char *a, const char *b) {
    while (*a && *b) {
        if (tolower((unsigned char)*a) !=tolower((unsigned char)*b)) {
            return 0;
        }
        a++;
        b++;
    }
    return *a == *b;
}

int search_string(struct treenode *root,const char *string){
    if (root == NULL){
        return 0;}
        int found_count=0;
    if (case_insensitive_cmp(root->title, string) || case_insensitive_cmp(root->author, string)){
                            printf("\n      Book Id     : %d\n",root->book_id);
                            printf("      Title       : %s\n",root->title);
                            printf("      Author      : %s\n",root->author);
                            printf(" Available Copies : %d\n",root->available_copies);
                            found_count=1;
    }
    found_count+=search_string(root->left, string);
    found_count+=search_string(root->right, string);
    return found_count;
}


struct treenode *findmin(struct treenode *root){
    struct treenode *temp=root;
    while(temp && temp->left!=NULL){
        temp=temp->left;
    }
    return temp;
}


struct treenode *deletenode(struct treenode *root,int book_id){
    if(root==NULL){
        return NULL;
    }
    if(root->book_id > book_id){
        root->left=deletenode(root->left,book_id);
    }
    else if(root->book_id < book_id){
        root->right=deletenode(root->right,book_id);
    }
    else{
        if(root->left == NULL){
            struct treenode *temp=root->right;
            free(root);
            return temp;
        }
        else if(root->right == NULL){
            struct treenode *temp=root->left;
            free(root);
            return temp;
        }
        else{
            struct treenode *temp=findmin(root->right);
            root->book_id=temp->book_id;
            strncpy(root->title, temp->title, sizeof(root->title) - 1);
            root->title[sizeof(root->title) - 1] = '\0';
            strncpy(root->author, temp->author, sizeof(root->author) - 1);
            root->author[sizeof(root->author) - 1] = '\0';
            root->total_copies=temp->total_copies;
            root->available_copies=temp->available_copies;
            root->right=deletenode(root->right, temp->book_id);
        }   
    }
    return root;
}

void visit(struct treenode *root){
    if(!root)return;
    printf("Book Id :%d\n",root->book_id);
    printf("Author Name :%s\n",root->author);
    printf("Book Title :%s\n",root->title);
    printf("Available Copies :%d\n\n",root->available_copies);
}

void inorder(struct treenode *root){
    if(root==NULL)return;
    inorder(root->left);
    visit(root);
    inorder(root->right);
}

void free_bst(struct treenode *root){
    if (!root) return;
    free_bst(root->left);
    free_bst(root->right);
    free(root);
}

