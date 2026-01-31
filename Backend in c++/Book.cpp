#include "Book.h"
#include<iostream>
using  namespace std;


    Book::Book(string isbn,string title,string author,string genre,int total_copies){
        this->isbn=isbn;
        this->title=title;
        this->author=author;
        this->genre=genre;
        this->total_copies=total_copies;
        this->avail_copies=total_copies;
    }
    void Book::show(){
        cout<<"isbn :"<<isbn;
        cout<<"title :"<<title;
        cout<<"author :"<<author;
        cout<<"total_copies :"<<total_copies;
        cout<<"avail_copies :"<<avail_copies;
    }
    bool Book::match(const string& query ){
        if(this->isbn==query||this->title==query||this->author==query||this->genre==query)return true;
        return false;
    }

