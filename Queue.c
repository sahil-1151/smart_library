#include<stdio.h>
#include<stdlib.h>
#include "Queue.h"

struct queue *peek(struct queue *front){
    return front;
}

void dequeue(struct queue **front,struct queue **rear){
    if(*front==NULL){
        return;
    }
    struct queue *temp=*front;
    *front=temp->next;

    if(*front==NULL){
        *rear=NULL;
    }

    free(temp);
}

void enqueue(struct queue **front,struct queue **rear,int student_id,int book_id){
    struct queue *newnode=(struct queue *)malloc(sizeof(struct queue));
    newnode->student_id=student_id;
    newnode->book_id=book_id;
    newnode->next=NULL;
    if(*front==NULL){
        *front=newnode;
        *rear=newnode;
        return;
    }
    (*rear)->next=newnode;
    *rear=newnode;
}