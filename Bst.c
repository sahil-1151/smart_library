#include "Bst.h"

struct treenode * createnode(int book_id,const char *lib,const char *title,const char *author,int total_copies){
    struct treenode* newnode=(struct treenode *)malloc(sizeof(struct treenode));
    if (!newnode) {
        printf("Memory allocation failed\n");
        return NULL;
    }
    newnode->book_id=book_id;
    strncpy(newnode->title, title, sizeof(newnode->title) - 1);
    newnode->title[sizeof(newnode->title) - 1] = '\0';
    strncpy(newnode->lib,lib,sizeof(newnode->lib) -1);
    newnode->lib[sizeof(newnode->lib) - 1] = '\0';
    strncpy(newnode->author, author, sizeof(newnode->author) - 1);
    newnode->author[sizeof(newnode->author) - 1] = '\0';
    newnode->total_copies=total_copies;
    newnode->issue_total_copies=total_copies;
    newnode->available_copies=total_copies;
    newnode->slot_booking_copies=total_copies;
    newnode->left=NULL;
    newnode->right=NULL;

    return newnode;
}

void view(struct treenode *root){
    if(root==NULL)return;
    printf("\nBook Id :%d\nTitle : %s\nAuthor : %s\nIssue Available : %d\nIssue Pool : %d\nSlot Booking Pool : %d\n",root->book_id,root->title,root->author,root->available_copies,root->issue_total_copies,root->slot_booking_copies);
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

void edit(struct treenode *newnode,
          const char *author,
          const char *title,
          int available_copies,
          int issue_total_copies,
          int slot_booking_copies,
          int total_copies){
    char title_copy[sizeof(newnode->title)];
    char author_copy[sizeof(newnode->author)];

    if (!newnode || !author || !title) {
        return;
    }

    strncpy(title_copy, title, sizeof(title_copy) - 1);
    title_copy[sizeof(title_copy) - 1] = '\0';

    strncpy(author_copy, author, sizeof(author_copy) - 1);
    author_copy[sizeof(author_copy) - 1] = '\0';

    strncpy(newnode->title, title_copy, sizeof(newnode->title) - 1);
    newnode->title[sizeof(newnode->title) - 1] = '\0';

    strncpy(newnode->author, author_copy, sizeof(newnode->author) - 1);
    newnode->author[sizeof(newnode->author) - 1] = '\0';

    if (total_copies < 0) {
        total_copies = 0;
    }
    if (issue_total_copies < 0) {
        issue_total_copies = 0;
    }
    if (issue_total_copies > total_copies) {
        issue_total_copies = total_copies;
    }
    if (available_copies < 0) {
        available_copies = 0;
    }
    if (available_copies > issue_total_copies) {
        available_copies = issue_total_copies;
    }
    if (slot_booking_copies < 0) {
        slot_booking_copies = 0;
    }
    if (slot_booking_copies > total_copies) {
        slot_booking_copies = total_copies;
    }

    newnode->total_copies=total_copies;
    newnode->issue_total_copies=issue_total_copies;
    newnode->available_copies=available_copies;
    newnode->slot_booking_copies=slot_booking_copies;
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
                            printf("      Library     : %s\n",root->lib);
                            printf("      Title       : %s\n",root->title);
                            printf("      Author      : %s\n",root->author);
                            printf(" Issue Available  : %d\n",root->available_copies);
                            printf(" Issue Pool       : %d\n",root->issue_total_copies);
                            printf(" Slot Pool        : %d\n",root->slot_booking_copies);
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
            strncpy(root->lib,temp->lib, sizeof(root->lib) - 1);
            root->lib[sizeof(root->lib) - 1] = '\0';
            strncpy(root->title, temp->title, sizeof(root->title) - 1);
            root->title[sizeof(root->title) - 1] = '\0';
            strncpy(root->author, temp->author, sizeof(root->author) - 1);
            root->author[sizeof(root->author) - 1] = '\0';
            root->total_copies=temp->total_copies;
            root->issue_total_copies=temp->issue_total_copies;
            root->available_copies=temp->available_copies;
            root->slot_booking_copies=temp->slot_booking_copies;
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
    printf("Issue Available :%d\n",root->available_copies);
    printf("Issue Pool :%d\n",root->issue_total_copies);
    printf("Slot Pool :%d\n\n",root->slot_booking_copies);
}

void visit_lib(struct treenode *root,const char *lib){
    if(root == NULL){
        return;
    }
    if(case_insensitive_cmp(root->lib,lib)){
        printf("\n      Book Id     : %d\n",root->book_id);
        printf("      Library     : %s\n",root->lib);
        printf("      Title       : %s\n",root->title);
        printf("      Author      : %s\n",root->author);
        printf(" Issue Available  : %d\n",root->available_copies);
        printf(" Issue Pool       : %d\n",root->issue_total_copies);
        printf(" Slot Pool        : %d\n",root->slot_booking_copies);
    }
    visit_lib(root->left,lib);
    visit_lib(root->right,lib);
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
