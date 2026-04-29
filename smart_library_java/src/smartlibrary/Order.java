package smartlibrary;

public final class Order {
    public int studentId;
    public String studentName;
    public int libraryId;
    public String libraryName;
    public String title;
    public String author;
    public int copies;
    public int price;
    public final String[] status = {"Ordered-Placed", "In-Transit", "Out-For-Delivery"};

    public Order(int studentId, String studentName, int libraryId, String libraryName, String title, String author, int copies, int price) {
        this.studentId = studentId;
        this.studentName = studentName;
        this.libraryId = libraryId;
        this.libraryName = libraryName;
        this.title = title;
        this.author = author;
        this.copies = copies;
        this.price = price;
    }
}
