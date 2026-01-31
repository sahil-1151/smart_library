#ifndef LIBRARY_SYSTEM_H
#define LIBRARY_SYSTEM_H
#include<iostream>
#include "Book.h"
#include<vector>

class Library_system{
    private:
    vector<Book> books;
    public:
    void Add_Book(const Book& b);
    void Display_All_Book() const;
    
};
#endif