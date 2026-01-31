#include<iostream>
#include "Book.h"
#include "Library_system.h"
#include<vector>
using namespace std;

void Library_system::Add_Book(const Book& b){
    books.push_back(b);
}

void Library_system::Display_All_Book() const {
    for (const Book& b : books) {
        b.show();
    }
}