#ifndef QUEUE_H
#define QUEUE_H

struct queue{
    int student_id;
    int book_id;
    struct queue*next;
};

struct queue *peek(struct queue *front);

void enqueue(struct queue **front,struct queue **rear,int student_id,int book_id);

void dequeue(struct queue **front,struct queue **rear);

#endif