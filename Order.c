#include "Order.h"


struct order *create_order(int student_id,const char *student_name,int lib_id,const char *lib_name,const char *title,const char *author,int copies){
 struct order *newnode=(struct order *)malloc(sizeof(struct order));
    if(newnode == NULL){
        return NULL;
    }
    strncpy(newnode->author,author,sizeof(newnode->author)-1);
    strncpy(newnode->lib_name,lib_name,sizeof(lib_name)-1);
    newnode->student_id=student_id;
    newnode->lib_id=lib_id;
    newnode->copies=copies;
}

struct order *insert_order(struct order *newnode,struct order *root){