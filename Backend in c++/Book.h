#ifndef BOOK_H
#define BOOK_H
#include<iostream>
#include<string>
using namespace std;

class Book{
    private:
    string isbn;
    string title;
    string author;
    string genre;
    int total_copies;
    int avail_copies;
    public:
    Book(string isbn,string title,string author,string genre,int total_copies);
    void show();
    bool match(const string& query);
};
#endif