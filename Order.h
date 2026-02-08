#ifndef ORDER_H
#define ORDER_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct order{
    int student_id;
    char student_name[50];
    int  lib_id;
    char lib_name[50];
    char title[50];
    char author[50];
    int copies;
    int price;
    char status[3][25]={"Ordered-Placed","In-Transit","Out-For-Delivery"};
};

struct order *create_order(int student_id,const char *student_name,int lib_id,const char *lib_name,const char *title,const char *author,int copies);
struct order *insert_order(struct order *newnode,struct order *root);

#endif